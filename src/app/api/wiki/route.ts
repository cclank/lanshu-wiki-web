import { NextRequest } from "next/server";
import { fetchRepoMarkdown, buildWikiData } from "@/lib/github";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return Response.json({ error: "Missing owner or repo" }, { status: 400 });
  }

  try {
    // Download the repo as a single tarball and extract every Markdown file
    // from it. This replaces the old "one fetch per file" loop, which exceeded
    // Cloudflare Workers' subrequest limit on wikis with many files and then
    // silently dropped everything past the limit.
    const files = await fetchRepoMarkdown(owner, repo);

    if (files.length === 0) {
      return Response.json(
        { error: `No Markdown files found in ${owner}/${repo}` },
        { status: 404 }
      );
    }

    const wikiData = buildWikiData(owner, repo, files);

    return Response.json(wikiData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
