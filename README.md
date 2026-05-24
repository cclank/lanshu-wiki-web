# LanShu WikiView

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?style=for-the-badge&logo=tailwindcss" alt="Tailwind" />
  <a href="https://lansu-wiki-web.lank.workers.dev/">
    <img src="https://img.shields.io/badge/Live-Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
  </a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <strong>Transform any GitHub wiki repository into a beautiful, visual reading experience.</strong>
</p>

<p align="center">
  Input a GitHub repo URL &rarr; Instantly render a premium wiki reader with knowledge graphs, search, and enhanced navigation.
</p>

---

## Features

- **Universal GitHub Support** — Works with any public GitHub repository containing Markdown files
- **Knowledge Graph** — Interactive D3 force-directed graph visualizing page relationships
- **Full-Text Search** — `Cmd+K` instant search across all page titles, tags, and content
- **Mermaid Diagrams** — Auto-renders `mermaid` code blocks into interactive charts
- **ASCII Diagram Detection** — Detects ASCII art flowcharts/architecture diagrams and enhances them with special styling
- **Frontmatter Badges** — Displays type, dates, and tags from YAML frontmatter as colored badges
- **Wiki Link Navigation** — `[[double-bracket]]` links are clickable and navigate within the viewer
- **Table of Contents** — Auto-generated right-side TOC with scroll-tracking highlights
- **Reading Progress** — Top gradient progress bar tracks scroll position
- **Responsive Design** — Mobile-first with collapsible sidebar drawer
- **Relative Path Resolution** — Images and internal links resolve correctly for any repo structure

## Quick Start

```bash
# Clone
git clone https://github.com/cclank/lanshu-wiki-web.git
cd lanshu-wiki-web

# Install
pnpm install

# Dev
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and enter any GitHub repo URL.

## Deploy to Cloudflare Workers

Production URL: https://lansu-wiki-web.lank.workers.dev/

This project uses OpenNext for Cloudflare Workers. Optionally add `GITHUB_TOKEN` as a Worker secret to increase GitHub API rate limits.

```bash
pnpm deploy
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Diagrams | Mermaid 11 + D3.js 7 |
| Icons | Lucide React |
| Deployment | Cloudflare Workers |

## Project Structure

```
src/
  app/
    page.tsx                    # Landing page with URL input
    api/wiki/route.ts           # GitHub API proxy
    wiki/[owner]/[repo]/page.tsx # Wiki viewer
  components/
    Sidebar.tsx                 # Category navigation
    MarkdownContent.tsx         # Markdown renderer + diagram detection
    MermaidBlock.tsx             # Mermaid diagram renderer
    TableOfContents.tsx         # Scroll-tracking TOC
    KnowledgeGraph.tsx          # D3 force graph
    SearchDialog.tsx            # Full-text search modal
  lib/
    github.ts                   # GitHub API + wiki data builder
```

## Supported Repo Formats

Works out-of-the-box with:

- Wiki-style knowledge bases (Obsidian, GitBook, etc.)
- Awesome lists (awesome-python, awesome-go, etc.)
- Documentation repos (system-design-primer, etc.)
- Any repo with `.md` files in any directory structure

## License

MIT
