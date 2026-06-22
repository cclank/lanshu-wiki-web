import matter from "gray-matter";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface GitHubFile {
  path: string;
  name: string;
  type: "file" | "dir";
  sha: string;
  size: number;
  download_url: string | null;
}

export interface WikiPage {
  path: string;
  slug: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  category: string;
  links: string[]; // outgoing wiki links
}

export interface WikiData {
  owner: string;
  repo: string;
  pages: WikiPage[];
  readme: string;
  categories: Record<string, WikiPage[]>;
  graph: { nodes: GraphNode[]; links: GraphLink[] };
}

export interface GraphNode {
  id: string;
  title: string;
  category: string;
  linkCount: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Handle various formats:
  // https://github.com/owner/repo
  // github.com/owner/repo
  // owner/repo
  const cleaned = url.trim().replace(/\/+$/, "");
  // Strip a trailing ".git" (clone URLs) and ignore any path/query/hash that
  // follows owner/repo (e.g. ".../tree/main/docs", "?tab=readme").
  const stripRepo = (repo: string) => repo.replace(/\.git$/i, "");

  const fullMatch = cleaned.match(
    /(?:https?:\/\/)?github\.com\/([^/?#]+)\/([^/?#]+)/
  );
  if (fullMatch) return { owner: fullMatch[1], repo: stripRepo(fullMatch[2]) };

  const shortMatch = cleaned.match(/^([^/?#]+)\/([^/?#]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: stripRepo(shortMatch[2]) };

  return null;
}

export { parseGitHubUrl };

function getGitHubToken(): string | undefined {
  try {
    const token = (getCloudflareContext().env as Record<string, unknown>)
      .GITHUB_TOKEN;
    if (typeof token === "string" && token) return token;
  } catch {
    // getCloudflareContext 在非 Worker 环境不可用,回退到 process.env
  }
  return process.env.GITHUB_TOKEN;
}

const TAR_NUL = String.fromCharCode(0);
const EMPTY = new Uint8Array(0);

// Safety caps. The viewer loads every page into a single payload + graph, so a
// truly massive repo can't be rendered anyway. These bound memory/response size
// and let oversized repos fail with a clear message instead of OOM-ing.
const MAX_MD_FILES = 5000;
const MAX_MD_BYTES = 25 * 1024 * 1024; // 25 MB of Markdown

class RepoTooLargeError extends Error {
  constructor() {
    super("仓库的 Markdown 内容过大,暂不支持在线渲染(请尝试体量更小的仓库)。");
    this.name = "RepoTooLargeError";
  }
}

function readTarField(buf: Uint8Array, start: number, len: number): string {
  let end = start;
  const max = start + len;
  while (end < max && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(start, end));
}

// Streaming tar reader. Walks the 512-byte block structure as bytes arrive,
// keeping ONLY `.md` file bodies and discarding everything else (images, code,
// etc.) without buffering it — so peak memory stays bounded to the largest
// single Markdown file regardless of how big the overall archive is. Handles
// GitHub's git-archive output: PAX (`x`) / GNU (`L`) long-name headers, the
// global header (`g`), and the leading `repo-HEAD/` directory wrapping entries.
async function extractMarkdownFromTarStream(
  stream: ReadableStream<Uint8Array>
): Promise<{ path: string; content: string }[]> {
  const files: { path: string; content: string }[] = [];
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  const header = new Uint8Array(512);
  let headerLen = 0;
  let phase: "header" | "body" = "header";
  let bodyRemaining = 0; // bytes left in the current entry (incl. padding)
  let bodySize = 0; // real content size (excl. padding)
  let bodyKeep = false; // is this an entry we collect (md / x / L)?
  let bodyType = "";
  let bodyName = "";
  let collected: Uint8Array | null = null;
  let collectedLen = 0;
  let overrideName: string | null = null; // long name from a preceding x/L
  let totalBytes = 0;
  let ended = false;

  const finalizeEntry = () => {
    const data = collected ? collected.subarray(0, collectedLen) : EMPTY;
    if (bodyType === "x") {
      // PAX extended header: pull the real path from "<len> path=<value>\n".
      const match = decoder.decode(data).match(/\d+ path=(.*)\n/);
      if (match) overrideName = match[1];
    } else if (bodyType === "L") {
      // GNU long name: full path lives in this entry's data block.
      overrideName = decoder.decode(data).replace(new RegExp(TAR_NUL + "+$"), "");
    } else if (bodyType === "0" || bodyType === TAR_NUL) {
      const fullName = overrideName ?? bodyName;
      overrideName = null;
      if (fullName.endsWith(".md")) {
        // Strip the wrapper dir: "repo-HEAD/concepts/x.md" -> "concepts/x.md".
        const slash = fullName.indexOf("/");
        const path = slash >= 0 ? fullName.slice(slash + 1) : fullName;
        if (path) {
          files.push({ path, content: decoder.decode(data) });
          totalBytes += bodySize;
          if (files.length > MAX_MD_FILES || totalBytes > MAX_MD_BYTES) {
            throw new RepoTooLargeError();
          }
        }
      }
    } else {
      // Directory or other type — clears any pending long name.
      overrideName = null;
    }
    collected = null;
    collectedLen = 0;
  };

  try {
    while (!ended) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value;
      let pos = 0;
      while (pos < chunk.length) {
        if (phase === "header") {
          const take = Math.min(512 - headerLen, chunk.length - pos);
          header.set(chunk.subarray(pos, pos + take), headerLen);
          headerLen += take;
          pos += take;
          if (headerLen < 512) break; // need more bytes for a full header
          headerLen = 0;

          // A zero-filled block marks the end of the archive.
          let allZero = true;
          for (let i = 0; i < 512; i++) {
            if (header[i] !== 0) {
              allZero = false;
              break;
            }
          }
          if (allZero) {
            ended = true;
            break;
          }

          bodyName = readTarField(header, 0, 100);
          bodySize = parseInt(readTarField(header, 124, 12).trim(), 8) || 0;
          bodyType = String.fromCharCode(header[156]);
          bodyRemaining = Math.ceil(bodySize / 512) * 512;
          const candidate = overrideName ?? bodyName;
          bodyKeep =
            bodyType === "x" ||
            bodyType === "L" ||
            ((bodyType === "0" || bodyType === TAR_NUL) &&
              candidate.endsWith(".md"));
          if (bodyKeep) {
            collected = new Uint8Array(bodySize);
            collectedLen = 0;
          }
          if (bodyRemaining === 0) {
            finalizeEntry();
          } else {
            phase = "body";
          }
        } else {
          const take = Math.min(bodyRemaining, chunk.length - pos);
          if (bodyKeep && collected) {
            // Copy content bytes only, never the trailing 512-byte padding.
            const keepNow = Math.min(take, bodySize - collectedLen);
            if (keepNow > 0) {
              collected.set(chunk.subarray(pos, pos + keepNow), collectedLen);
              collectedLen += keepNow;
            }
          }
          pos += take;
          bodyRemaining -= take;
          if (bodyRemaining === 0) {
            finalizeEntry();
            phase = "header";
          }
        }
      }
    }
  } finally {
    // Stop the download early on cap-hit / completion.
    try {
      await reader.cancel();
    } catch {
      // ignore — stream already closed
    }
  }

  return files;
}

export async function fetchRepoMarkdown(
  owner: string,
  repo: string
): Promise<{ path: string; content: string }[]> {
  const token = getGitHubToken();
  // Download the entire repo as ONE gzipped tarball instead of one request per
  // file. The previous "fetch per file" approach cost N+1 subrequests, which
  // blew past Cloudflare Workers' per-request subrequest limit (50 on the free
  // plan) for any sizeable wiki — silently dropping every file past the limit.
  // One streamed tarball = one subrequest, and never truncates.
  const res = await fetch(
    `https://codeload.github.com/${owner}/${repo}/tar.gz/HEAD`,
    {
      headers: {
        "User-Agent": "lanshu-wiki-web",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: 300 }, // cache for 5 mins
    }
  );

  if (res.status === 404) {
    throw new Error(
      `未找到仓库 ${owner}/${repo}(请确认它存在且为公开仓库)。`
    );
  }
  if (!res.ok || !res.body) {
    throw new Error(`GitHub archive error: ${res.status} ${res.statusText}`);
  }

  const decompressed = res.body.pipeThrough(new DecompressionStream("gzip"));
  return extractMarkdownFromTarStream(decompressed);
}

function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  try {
    const parsed = matter(content);
    return {
      frontmatter: parsed.data as Record<string, unknown>,
      body: parsed.content,
    };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

function normalizeWikiLinkTarget(rawLink: string): string {
  return rawLink
    .split("|")[0]
    .split("#")[0]
    .trim()
    .replace(/\.md$/i, "")
    .toLowerCase();
}

function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const target = normalizeWikiLinkTarget(match[1]);
    if (target) links.push(target);
  }
  return [...new Set(links)];
}

function inferCategory(path: string): string {
  const parts = path.split("/");
  if (parts.length > 1) {
    return parts[parts.length - 2];
  }
  return "root";
}

function slugFromPath(path: string): string {
  return path.replace(/\.md$/, "").replace(/\//g, "__");
}

export function buildWikiData(
  owner: string,
  repo: string,
  files: { path: string; content: string }[]
): WikiData {
  const pages: WikiPage[] = [];
  let readme = "";

  for (const file of files) {
    const { frontmatter, body } = parseFrontmatter(file.content);
    const links = extractWikiLinks(file.content);
    const slug = slugFromPath(file.path);
    const category = inferCategory(file.path);

    const title =
      (frontmatter.title as string) ||
      file.path
        .split("/")
        .pop()!
        .replace(/\.md$/, "")
        .replace(/-/g, " ");

    if (
      file.path.toLowerCase() === "readme.md" ||
      file.path.toLowerCase() === "index.md"
    ) {
      readme = body;
    }

    pages.push({
      path: file.path,
      slug,
      title,
      content: body,
      frontmatter,
      category,
      links,
    });
  }

  // Build categories
  const categories: Record<string, WikiPage[]> = {};
  for (const page of pages) {
    if (!categories[page.category]) {
      categories[page.category] = [];
    }
    categories[page.category].push(page);
  }
  // Sort pages within each category
  for (const cat of Object.keys(categories)) {
    categories[cat].sort((a, b) => a.title.localeCompare(b.title));
  }

  // Build knowledge graph
  const slugSet = new Set(pages.map((p) => p.slug));
  const slugByName = new Map<string, string>();
  for (const p of pages) {
    const name = p.path.split("/").pop()!.replace(/\.md$/, "").toLowerCase();
    const path = p.path.toLowerCase();
    const pathWithoutExtension = path.replace(/\.md$/, "");
    slugByName.set(name, p.slug);
    slugByName.set(path, p.slug);
    slugByName.set(pathWithoutExtension, p.slug);
  }

  const nodes: GraphNode[] = pages.map((p) => ({
    id: p.slug,
    title: p.title,
    category: p.category,
    linkCount: p.links.length,
  }));

  const links: GraphLink[] = [];
  for (const page of pages) {
    for (const link of page.links) {
      const targetSlug = slugByName.get(link);
      if (targetSlug && slugSet.has(targetSlug)) {
        links.push({ source: page.slug, target: targetSlug });
      }
    }
  }

  return { owner, repo, pages, readme, categories, graph: { nodes, links } };
}
