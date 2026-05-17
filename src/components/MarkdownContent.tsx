"use client";

import { memo, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import type { WikiPage } from "@/lib/github";
import type { Components } from "react-markdown";
import MermaidBlock from "./MermaidBlock";

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return fallbackCopy(text);
}

function fallbackCopy(text: string): Promise<void> {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;left:-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

function CodeCopyButton({ preRef }: { preRef: React.RefObject<HTMLDivElement | null> }) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    const text = preRef.current?.querySelector("code")?.textContent || "";
    copyToClipboard(text).then(() => {
      if (!mountedRef.current) return;
      setCopied(true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [preRef]);
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-bg-tertiary/80 text-text-tertiary hover:text-text-primary border border-border-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm"
      title="复制代码"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeBlock({ children, className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className={`relative group ${className || ""}`} ref={ref} {...props}>
      <CodeCopyButton preRef={ref} />
      {children}
    </div>
  );
}

interface MarkdownContentProps {
  page: WikiPage;
  owner: string;
  repo: string;
  onNavigate: (slug: string) => void;
  slugByName: Map<string, string>;
  backlinks?: { slug: string; title: string }[];
}

function resolveRelativeUrl(
  href: string,
  pagePath: string,
  owner: string,
  repo: string
): string {
  // Already absolute
  if (/^https?:\/\//.test(href) || href.startsWith("//")) return href;
  // Anchor-only
  if (href.startsWith("#")) return href;

  // Resolve relative to current page's directory
  const pageDir = pagePath.includes("/")
    ? pagePath.slice(0, pagePath.lastIndexOf("/"))
    : "";

  let resolved = href;
  if (href.startsWith("./")) {
    resolved = pageDir ? `${pageDir}/${href.slice(2)}` : href.slice(2);
  } else if (href.startsWith("../")) {
    const parts = pageDir.split("/");
    let h = href;
    while (h.startsWith("../") && parts.length > 0) {
      parts.pop();
      h = h.slice(3);
    }
    resolved = parts.length > 0 ? `${parts.join("/")}/${h}` : h;
  } else if (!href.startsWith("/")) {
    resolved = pageDir ? `${pageDir}/${href}` : href;
  }

  return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${resolved}`;
}

function normalizeRelativePath(path: string): string {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

function resolveMarkdownPath(href: string, pagePath: string): string {
  const cleanHref = href.split("#")[0];
  if (cleanHref.startsWith("/")) return normalizeRelativePath(cleanHref.slice(1));

  const pageDir = pagePath.includes("/")
    ? pagePath.slice(0, pagePath.lastIndexOf("/"))
    : "";
  return normalizeRelativePath(pageDir ? `${pageDir}/${cleanHref}` : cleanHref);
}

function normalizeWikiLinkTarget(rawLink: string): string {
  return rawLink
    .split("|")[0]
    .split("#")[0]
    .trim()
    .replace(/\.md$/i, "")
    .toLowerCase();
}

function getWikiLinkLabel(rawLink: string): string {
  const parts = rawLink.split("|");
  return (parts[1] ?? parts[0]).trim();
}

// Detect ASCII diagram content (arrows, box-drawing characters)
const ASCII_DIAGRAM_CHARS = /[┌┐└┘├┤┬┴┼─│▼▲►◄↓↑→←╔╗╚╝║═]/;
const ARROW_PATTERN = /[→←↓↑▼▲│┌└├┤]/;

function isAsciiDiagram(code: string): boolean {
  const lines = code.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;
  // At least 20% of lines should contain diagram chars
  const diagramLines = lines.filter(
    (l) => ASCII_DIAGRAM_CHARS.test(l) || ARROW_PATTERN.test(l)
  );
  return diagramLines.length / lines.length >= 0.2;
}

function MarkdownContent({
  page,
  owner,
  repo,
  onNavigate,
  slugByName,
  backlinks = [],
}: MarkdownContentProps) {
  // Replace [[wiki-links]] with clickable links
  const processedContent = useMemo(
    () =>
      page.content.replace(
        /\[\[([^\]]+)\]\]/g,
        (_, rawLink: string) => {
          const target = normalizeWikiLinkTarget(rawLink);
          const label = getWikiLinkLabel(rawLink);
          const slug = slugByName.get(target);
          if (slug) {
            return `[${label}](#wiki:${slug})`;
          }
          return `\`${label}\``;
        }
      ),
    [page.content, slugByName]
  );

  const backlinksClassName =
    page.links.length > 0
      ? "mt-4"
      : "mt-10 pt-6 border-t border-border-primary";

  const components: Components = {
    script: () => null,
    a: ({ href, children }) => {
      if (href?.startsWith("#wiki:")) {
        const targetSlug = href.replace("#wiki:", "");
        return (
          <button
            type="button"
            onClick={() => onNavigate(targetSlug)}
            className="text-text-link hover:brightness-125 transition-colors cursor-pointer bg-transparent p-0 inline"
          >
            {children}
          </button>
        );
      }
      // Internal .md link inside the wiki.
      if (href && !href.startsWith("http") && !href.startsWith("#") && href.endsWith(".md")) {
        const resolvedPath = resolveMarkdownPath(href, page.path);
        const resolvedKey = resolvedPath.replace(/\.md$/i, "").toLowerCase();
        const basenameKey = resolvedKey.split("/").pop() ?? resolvedKey;
        const targetSlug =
          slugByName.get(resolvedPath.toLowerCase()) ??
          slugByName.get(resolvedKey) ??
          slugByName.get(basenameKey);

        if (targetSlug) {
          return (
            <button
              type="button"
              onClick={() => onNavigate(targetSlug)}
              className="text-text-link hover:brightness-125 transition-colors cursor-pointer bg-transparent p-0 inline"
            >
              {children}
            </button>
          );
        }

        const resolvedUrl = resolveRelativeUrl(href, page.path, owner, repo);
        return (
          <a href={resolvedUrl} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }
      // Anchor link
      if (href?.startsWith("#")) {
        return <a href={href}>{children}</a>;
      }
      return (
        <a href={href ?? undefined} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    img: ({ src, alt }) => {
      const resolved = typeof src === "string" ? resolveRelativeUrl(src, page.path, owner, repo) : "";
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolved} alt={alt || ""} loading="lazy" />
      );
    },
    pre: ({ children, ...props }) => {
      // Extract code element and its props
      const codeChild = children as React.ReactElement<{
        className?: string;
        children?: string;
      }>;
      const className = codeChild?.props?.className || "";
      const code =
        typeof codeChild?.props?.children === "string"
          ? codeChild.props.children
          : "";

      // Mermaid block
      if (className.includes("language-mermaid")) {
        return <MermaidBlock code={code} />;
      }

      // ASCII diagram detection for text/plain blocks
      if (
        (className.includes("language-text") ||
          className === "" ||
          !className) &&
        code &&
        isAsciiDiagram(code)
      ) {
        return (
          <CodeBlock className="diagram-block ascii-diagram">
            <div className="diagram-label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              Architecture Diagram
            </div>
            <pre className="ascii-diagram-pre">
              <code>{code}</code>
            </pre>
          </CodeBlock>
        );
      }

      return <CodeBlock><pre {...props}>{children}</pre></CodeBlock>;
    },
  };

  return (
    <div className="animate-fade-in">
      {/* Frontmatter badges */}
      {page.frontmatter && Object.keys(page.frontmatter).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {page.frontmatter.type != null && (
            <span className="px-2.5 py-1 bg-accent-purple/10 text-accent-purple border border-accent-purple/20 rounded-md text-xs font-medium">
              {String(page.frontmatter.type)}
            </span>
          )}
          {page.frontmatter.created != null && (
            <span className="px-2.5 py-1 bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20 rounded-md text-xs font-medium">
              {"创建: " + String(page.frontmatter.created)}
            </span>
          )}
          {page.frontmatter.updated != null && (
            <span className="px-2.5 py-1 bg-accent-amber/10 text-accent-amber border border-accent-amber/20 rounded-md text-xs font-medium">
              {"更新: " + String(page.frontmatter.updated)}
            </span>
          )}
          {Array.isArray(page.frontmatter.tags) &&
            (page.frontmatter.tags as string[]).map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 bg-bg-tertiary text-text-tertiary border border-border-primary rounded-md text-xs"
              >
                {"#" + tag}
              </span>
            ))}
        </div>
      )}

      {/* Markdown content */}
      <div className="wiki-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeSlug]}
          components={components}
        >
          {processedContent}
        </ReactMarkdown>
      </div>

      {/* Outgoing links */}
      {page.links.length > 0 && (
        <div className="mt-10 pt-6 border-t border-border-primary">
          <h4 className="text-sm font-medium text-text-tertiary mb-3">
            {"相关页面 (" + page.links.length + ")"}
          </h4>
          <div className="flex flex-wrap gap-2">
            {[...new Set(page.links)].map((link) => {
              const targetSlug = slugByName.get(link);
              return (
                <button
                  key={link}
                  type="button"
                  onClick={() => targetSlug && onNavigate(targetSlug)}
                  disabled={!targetSlug}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    targetSlug
                      ? "bg-accent-blue/5 text-accent-blue border-accent-blue/20 hover:bg-accent-blue/10 cursor-pointer"
                      : "bg-bg-tertiary text-text-tertiary border-border-primary cursor-default"
                  }`}
                >
                  {link}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Backlinks from pages that reference this page */}
      {backlinks.length > 0 && (
        <div className={backlinksClassName}>
          <h4 className="text-sm font-medium text-text-tertiary mb-3">
            {"被引用 (" + backlinks.length + ")"}
          </h4>
          <div className="flex flex-wrap gap-2">
            {backlinks.map((bl) => (
              <button
                key={bl.slug}
                type="button"
                onClick={() => onNavigate(bl.slug)}
                className="px-3 py-1.5 rounded-lg text-xs border transition-colors bg-accent-vivid/5 text-accent-vivid border-accent-vivid/20 hover:bg-accent-vivid/10 cursor-pointer"
              >
                {bl.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(MarkdownContent);
