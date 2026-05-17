"use client";

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ChangeEvent,
} from "react";
import { Search, X, FileText, ArrowRight } from "lucide-react";
import type { WikiPage } from "@/lib/github";

interface SearchDialogProps {
  pages: WikiPage[];
  onClose: () => void;
  onSelect: (slug: string) => void;
}

interface SearchResult {
  page: WikiPage;
  matches: { line: string; index: number }[];
  score: number;
}

export default function SearchDialog({
  pages,
  onClose,
  onSelect,
}: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setSelectedIndex(0);
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();

    return pages
      .map((page) => {
        let score = 0;
        const matches: { line: string; index: number }[] = [];

        // Title match (highest weight)
        if (page.title.toLowerCase().includes(q)) {
          score += 10;
        }

        // Tag match
        if (
          Array.isArray(page.frontmatter.tags) &&
          (page.frontmatter.tags as string[]).some((t) =>
            t.toLowerCase().includes(q)
          )
        ) {
          score += 5;
        }

        // Content match
        const lines = page.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(q)) {
            score += 1;
            if (matches.length < 3) {
              matches.push({ line: lines[i].trim(), index: i + 1 });
            }
          }
        }

        return { page, matches, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [query, pages]);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && results[selectedIndex]) {
        onSelect(results[selectedIndex].page.slug);
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, results, selectedIndex, onSelect]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-xl mx-4 bg-bg-secondary border border-border-primary rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 border-b border-border-primary">
          <Search className="w-5 h-5 text-text-tertiary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="搜索页面标题或内容..."
            className="flex-1 bg-transparent py-4 text-text-primary placeholder:text-text-tertiary outline-none text-base"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-hover text-text-tertiary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto sidebar-scroll">
          {query.trim() && results.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-text-tertiary">
              <Search className="w-8 h-8 opacity-30" />
              <p className="text-sm">未找到相关结果</p>
            </div>
          )}

          {results.map((result, idx) => (
            <button
              key={result.page.slug}
              type="button"
              onClick={() => {
                onSelect(result.page.slug);
                onClose();
              }}
              className={`w-full flex flex-col gap-1.5 px-4 py-3 text-left transition-colors cursor-pointer ${
                idx === selectedIndex
                  ? "bg-accent-vivid/10"
                  : "hover:bg-bg-hover"
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent-vivid shrink-0" />
                <span className="text-sm font-medium text-text-primary truncate">
                  {result.page.title}
                </span>
                <span className="text-xs text-text-tertiary ml-auto shrink-0">
                  {result.page.category}
                </span>
                <ArrowRight className="w-3 h-3 text-text-tertiary shrink-0" />
              </div>
              {result.matches.length > 0 && (
                <div className="ml-6 space-y-0.5">
                  {result.matches.map((m, mi) => (
                    <p
                      key={mi}
                      className="text-xs text-text-tertiary truncate"
                    >
                      <span className="text-text-tertiary opacity-50">
                        L{m.index}:
                      </span>{" "}
                      {highlightMatch(m.line, query)}
                    </p>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border-primary text-xs text-text-tertiary">
          <span>
            <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded text-[10px] font-mono">
              ↑↓
            </kbd>{" "}
            导航
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded text-[10px] font-mono">
              Enter
            </kbd>{" "}
            打开
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded text-[10px] font-mono">
              Esc
            </kbd>{" "}
            关闭
          </span>
        </div>
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <span className="text-accent-vivid font-medium">{match}</span>
      {after}
    </>
  );
}
