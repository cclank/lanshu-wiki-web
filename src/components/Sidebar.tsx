"use client";

import { useLayoutEffect, useRef, useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Search,
} from "lucide-react";
import type { WikiPage } from "@/lib/github";

interface SidebarProps {
  categories: Record<string, WikiPage[]>;
  activeSlug: string | null;
  onSelect: (slug: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  root: "根目录",
  concepts: "概念",
  entities: "实体",
  changelog: "更新日志",
  guides: "指南",
  docs: "文档",
  api: "API",
};

const CATEGORY_COLORS: Record<string, string> = {
  root: "text-accent-gold",
  concepts: "text-accent-blue",
  entities: "text-accent-purple",
  changelog: "text-accent-emerald",
  guides: "text-accent-amber",
  docs: "text-accent-amber",
  api: "text-accent-rose",
};

export default function Sidebar({
  categories,
  activeSlug,
  onSelect,
}: SidebarProps) {
  const navRef = useRef<HTMLElement>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const restoreScrollTopRef = useRef<number | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(() => {
    return new Set(Object.keys(categories));
  });
  const [filter, setFilter] = useState("");

  const filteredCategories = useMemo(() => {
    if (!filter.trim()) return categories;
    const q = filter.toLowerCase();
    const result: Record<string, WikiPage[]> = {};
    for (const [cat, pages] of Object.entries(categories)) {
      const matched = pages.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.path.toLowerCase().includes(q)
      );
      if (matched.length > 0) result[cat] = matched;
    }
    return result;
  }, [categories, filter]);

  useLayoutEffect(() => {
    const restoreScrollTop = restoreScrollTopRef.current;
    if (restoreScrollTop == null || !navRef.current) return;

    const maxScrollTop =
      navRef.current.scrollHeight - navRef.current.clientHeight;
    navRef.current.scrollTop = Math.min(restoreScrollTop, maxScrollTop);
    restoreScrollTopRef.current = null;
  }, [expandedCats]);

  function rememberNavScroll() {
    pendingScrollTopRef.current = navRef.current?.scrollTop ?? 0;
  }

  function handleCategoryMouseDown(event: React.MouseEvent) {
    rememberNavScroll();
    event.preventDefault();
  }

  function toggleCategory(cat: string) {
    const currentScrollTop =
      pendingScrollTopRef.current ?? navRef.current?.scrollTop ?? 0;
    pendingScrollTopRef.current = null;
    restoreScrollTopRef.current = currentScrollTop;

    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const totalPages = Object.values(categories).reduce(
    (sum, pages) => sum + pages.length,
    0
  );

  return (
    <aside className="w-72 shrink-0 bg-bg-secondary border-r border-border-primary flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border-primary">
        <div className="flex items-center gap-2 text-xs text-text-tertiary mb-3">
          <FileText className="w-3.5 h-3.5" />
          <span>{totalPages} 个页面</span>
        </div>
        {/* Filter */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="筛选页面..."
            className="w-full bg-bg-tertiary border border-border-primary rounded-lg pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent-gold/30 transition-colors"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav ref={navRef} className="flex-1 overflow-y-auto sidebar-scroll p-2">
        {Object.entries(filteredCategories).map(([cat, pages]) => {
          const isExpanded = expandedCats.has(cat);
          const label = CATEGORY_LABELS[cat] || cat;
          const colorClass = CATEGORY_COLORS[cat] || "text-accent-blue";

          return (
            <div key={cat} className="mb-1">
              <button
                type="button"
                onMouseDown={handleCategoryMouseDown}
                onPointerDown={rememberNavScroll}
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                )}
                <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${colorClass}`} />
                <span className="truncate">{label}</span>
                <span className="ml-auto text-xs text-text-tertiary">
                  {pages.length}
                </span>
              </button>

              {isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {pages.map((page) => {
                    const isActive = page.slug === activeSlug;
                    return (
                      <button
                        type="button"
                        key={page.slug}
                        onClick={() => onSelect(page.slug)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors text-left cursor-pointer ${
                          isActive
                            ? "bg-accent-vivid/8 text-accent-vivid border border-accent-vivid/15"
                            : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover border border-transparent"
                        }`}
                      >
                        <FileText className="w-3 h-3 shrink-0 opacity-50" />
                        <span className="truncate">{page.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
