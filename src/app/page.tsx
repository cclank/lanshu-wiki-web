"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GitBranch } from "lucide-react";
import { parseGitHubUrl } from "@/lib/github";
import ThemeToggle from "@/components/ThemeToggle";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function isLocalPath(input: string): boolean {
  const trimmed = input.trim();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  );
}

const EXAMPLES = [
  { label: "Hermes Wiki", url: "cclank/Hermes-Wiki" },
  { label: "TiDB Docs", url: "pingcap/docs" },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();

    // Local path
    if (isLocalPath(trimmed)) {
      setError("");
      router.push(`/wiki/local?path=${encodeURIComponent(trimmed)}`);
      return;
    }

    // GitHub repo
    const parsed = parseGitHubUrl(trimmed);
    if (!parsed) {
      setError("请输入 GitHub 仓库地址（owner/repo）或本地路径（/path/to/wiki）");
      return;
    }
    setError("");
    router.push(`/wiki/${parsed.owner}/${parsed.repo}`);
  }

  function handleExample(repoUrl: string) {
    const parsed = parseGitHubUrl(repoUrl);
    if (parsed) router.push(`/wiki/${parsed.owner}/${parsed.repo}`);
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center relative">
      {/* Top-right: social icons + theme toggle */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
        <a
          href="https://github.com/cclank/lanshu-wiki-web"
          target="_blank"
          rel="noopener noreferrer"
          className="icon-shine p-2 rounded-lg hover:bg-bg-hover text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <GitHubIcon className="w-4 h-4" />
        </a>
        <a
          href="https://x.com/LufzzLiz"
          target="_blank"
          rel="noopener noreferrer"
          className="icon-shine p-2 rounded-lg hover:bg-bg-hover text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <XIcon className="w-4 h-4" />
        </a>
        <ThemeToggle />
      </div>

      {/* Subtle Morandi glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(194,168,130,0.03)_0%,transparent_70%)]" />
      </div>

      <main className="relative z-10 flex flex-col items-center gap-16 px-6 py-24 max-w-md w-full">
        {/* Brand */}
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="w-10 h-10 rounded-full border border-border-secondary flex items-center justify-center">
            <span className="text-accent-vivid text-lg font-light">W</span>
          </div>
          <h1 className="text-3xl font-medium tracking-tight text-text-primary">
            LanShu WikiView
          </h1>
          <p className="text-sm text-text-tertiary leading-relaxed">
            将 GitHub 仓库或本地目录转化为可视化阅读体验
          </p>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="w-full">
          <div className="flex items-center bg-bg-secondary border border-border-primary rounded-lg overflow-hidden focus-within:border-border-secondary transition-colors">
            <GitBranch className="w-4 h-4 text-text-tertiary ml-4 shrink-0" />
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(""); }}
              placeholder="owner/repo 或 /本地路径"
              className="flex-1 bg-transparent px-3 py-3.5 text-text-primary placeholder:text-text-tertiary outline-none text-sm"
            />
            <button
              type="submit"
              className="mr-1.5 px-4 py-2 bg-accent-vivid text-white rounded-md text-sm font-medium flex items-center gap-1.5 hover:brightness-110 transition cursor-pointer shrink-0"
            >
              打开
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && (
            <p className="mt-3 text-xs text-accent-rose text-center">{error}</p>
          )}
        </form>

        {/* Examples */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-text-tertiary">试试</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.url}
              onClick={() => handleExample(ex.url)}
              className="px-3 py-1.5 border border-border-primary rounded-md text-xs text-text-tertiary hover:text-text-secondary hover:border-border-secondary transition-colors cursor-pointer"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Features */}
        <div className="w-full border-t border-border-primary pt-8">
          <div className="flex justify-between text-center text-[11px] text-text-tertiary">
            <div className="flex flex-col gap-1">
              <span className="text-text-secondary text-xs">全文搜索</span>
              <span>⌘K 快速检索</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-text-secondary text-xs">知识图谱</span>
              <span>关系可视化</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-text-secondary text-xs">脑图</span>
              <span>层级结构</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-text-secondary text-xs">统计</span>
              <span>数据洞察</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
