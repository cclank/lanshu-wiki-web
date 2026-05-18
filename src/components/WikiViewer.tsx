"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  BookOpen,
  Search,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Menu,
  X,
  Globe,
  Brain,
  BarChart3,
  LayoutGrid,
  BookA,
} from "lucide-react";
import type { WikiData } from "@/lib/github";
import Sidebar from "@/components/Sidebar";
import MarkdownContent from "@/components/MarkdownContent";
import TableOfContents from "@/components/TableOfContents";
import CosmosGraph from "@/components/CosmosGraph";
import MindMap from "@/components/MindMap";
import StatsView from "@/components/StatsView";
import GalleryView from "@/components/GalleryView";
import GlossaryView from "@/components/GlossaryView";
import SearchDialog from "@/components/SearchDialog";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";

type ViewMode = "read" | "cosmos" | "mindmap" | "stats" | "gallery" | "glossary";

const VIEW_MODES: { key: ViewMode; label: string; icon: typeof BookOpen; activeClass: string }[] = [
  { key: "read", label: "阅读", icon: BookOpen, activeClass: "bg-accent-vivid/10 text-accent-vivid" },
  { key: "gallery", label: "卡片", icon: LayoutGrid, activeClass: "bg-accent-vivid/10 text-accent-vivid" },
  { key: "cosmos", label: "关系图", icon: Globe, activeClass: "bg-accent-vivid/10 text-accent-vivid" },
  { key: "mindmap", label: "脑图", icon: Brain, activeClass: "bg-accent-vivid/10 text-accent-vivid" },
  { key: "glossary", label: "术语", icon: BookA, activeClass: "bg-accent-vivid/10 text-accent-vivid" },
  { key: "stats", label: "统计", icon: BarChart3, activeClass: "bg-accent-vivid/10 text-accent-vivid" },
];

interface WikiViewerProps {
  data: WikiData | null;
  loading: boolean;
  error: string;
  label: string;
  owner: string;
  repo: string;
}

function readSlugFromHash(): string {
  if (typeof window === "undefined") return "";
  const rawHash = window.location.hash.replace(/^#/, "");
  try {
    return decodeURIComponent(rawHash);
  } catch {
    return rawHash;
  }
}

function pushSlugToHistory(slug: string) {
  if (readSlugFromHash() === slug) return;
  history.pushState(null, "", `#${encodeURIComponent(slug)}`);
}

export default function WikiViewer({ data, loading, error, label, owner, repo }: WikiViewerProps) {
  const [initialHash] = useState(readSlugFromHash);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("read");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);

  const initialSlug = useMemo(() => {
    if (!data) return null;
    if (initialHash && data.pages.some((p) => p.slug === initialHash)) {
      return initialHash;
    }
    const readmePage = data.pages.find(
      (p) =>
        p.path.toLowerCase() === "readme.md" ||
        p.path.toLowerCase() === "index.md"
    );
    return readmePage?.slug ?? data.pages[0]?.slug ?? null;
  }, [data, initialHash]);

  const resolvedActiveSlug = useMemo(() => {
    if (!data || !activeSlug) return initialSlug;
    return data.pages.some((p) => p.slug === activeSlug)
      ? activeSlug
      : initialSlug;
  }, [activeSlug, data, initialSlug]);

  useEffect(() => {
    if (!data) return;

    function syncSlugFromHistory() {
      const nextSlug = readSlugFromHash();
      setActiveSlug(
        nextSlug && data?.pages.some((p) => p.slug === nextSlug)
          ? nextSlug
          : null
      );
      setSearchOpen(false);
      setSidebarOpen(false);
      setReadingProgress(0);
      document
        .getElementById("wiki-content-area")
        ?.scrollTo({ top: 0, behavior: "auto" });
    }

    window.addEventListener("popstate", syncSlugFromHistory);
    window.addEventListener("hashchange", syncSlugFromHistory);
    return () => {
      window.removeEventListener("popstate", syncSlugFromHistory);
      window.removeEventListener("hashchange", syncSlugFromHistory);
    };
  }, [data]);

  // Reading progress
  useEffect(() => {
    function handleScroll() {
      const contentEl = document.getElementById("wiki-content-area");
      if (!contentEl) return;
      const { scrollTop, scrollHeight, clientHeight } = contentEl;
      const maxScrollTop = scrollHeight - clientHeight;
      const nextProgress =
        maxScrollTop > 0 ? Math.min(Math.max(scrollTop / maxScrollTop, 0), 1) : 0;
      setReadingProgress((current) =>
        Math.abs(current - nextProgress) < 0.001 ? current : nextProgress
      );
    }
    const el = document.getElementById("wiki-content-area");
    el?.addEventListener("scroll", handleScroll);
    return () => el?.removeEventListener("scroll", handleScroll);
  }, [resolvedActiveSlug]);

  // Keyboard shortcut for search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const activePage = useMemo(
    () => data?.pages.find((p) => p.slug === resolvedActiveSlug) ?? null,
    [data, resolvedActiveSlug]
  );

  const slugByName = useMemo(() => {
    const map = new Map<string, string>();
    if (data) {
      for (const p of data.pages) {
        const name = p.path.split("/").pop()!.replace(/\.md$/, "").toLowerCase();
        const path = p.path.toLowerCase();
        const pathWithoutExtension = path.replace(/\.md$/, "");
        map.set(name, p.slug);
        map.set(path, p.slug);
        map.set(pathWithoutExtension, p.slug);
      }
    }
    return map;
  }, [data]);

  // Backlinks: pages that link TO the active page
  const backlinks = useMemo(() => {
    if (!data || !resolvedActiveSlug) return [];
    const result: { slug: string; title: string }[] = [];
    for (const link of data.graph.links) {
      if (link.target === resolvedActiveSlug && link.source !== resolvedActiveSlug) {
        const page = data.pages.find((p) => p.slug === link.source);
        if (page) result.push({ slug: page.slug, title: page.title });
      }
    }
    // Deduplicate
    const seen = new Set<string>();
    return result.filter((b) => {
      if (seen.has(b.slug)) return false;
      seen.add(b.slug);
      return true;
    });
  }, [data, resolvedActiveSlug]);

  const handleNavigate = useCallback((slug: string) => {
    setActiveSlug(slug);
    setViewMode("read");
    setSidebarOpen(false);
    setReadingProgress(0);
    document
      .getElementById("wiki-content-area")
      ?.scrollTo({ top: 0, behavior: "auto" });
    pushSlugToHistory(slug);
  }, []);

  const handleGraphSelect = useCallback((slug: string) => {
    setActiveSlug(slug);
    pushSlugToHistory(slug);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <Loader2 className="w-8 h-8 text-accent-vivid animate-spin" />
        <p className="text-text-secondary text-sm">
          {"正在加载 " + label + " ..."}
        </p>
        <div className="flex gap-2 mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="skeleton w-24 h-3"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <AlertCircle className="w-10 h-10 text-accent-rose" />
        <p className="text-text-primary font-medium">加载失败</p>
        <p className="text-text-secondary text-sm max-w-md text-center">
          {error}
        </p>
        <Link
          href="/"
          className="mt-4 px-4 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          返回首页
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const showSidebar = viewMode === "read" || viewMode === "mindmap";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {viewMode === "read" && (
        <div
          className="reading-progress"
          style={{ width: `${readingProgress * 100}%` }}
        />
      )}

      <header className="shrink-0 h-14 bg-bg-secondary/80 backdrop-blur-md border-b border-border-primary flex items-center px-4 gap-3 z-20">
        {showSidebar && (
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-bg-hover text-text-secondary transition-colors cursor-pointer"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        )}

        <Link
          href="/"
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent-vivid" />
          <span className="text-sm font-medium text-text-primary truncate max-w-[200px]">
            {label}
          </span>
          <span className="text-xs text-text-tertiary hidden sm:inline">
            {"· " + data.pages.length + " 页"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-lg text-sm text-text-tertiary hover:text-text-secondary hover:border-border-secondary transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">搜索</span>
            <kbd className="hidden sm:inline px-1.5 py-0.5 bg-bg-hover rounded text-[10px] font-mono">
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center bg-bg-tertiary border border-border-primary rounded-lg overflow-hidden">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.key}
                type="button"
                onClick={() => setViewMode(mode.key)}
                className={`px-2.5 py-1.5 text-sm flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === mode.key
                    ? mode.activeClass
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
                title={mode.label}
              >
                <mode.icon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline text-xs">{mode.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {showSidebar && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {showSidebar && (
          <div
            className={`${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            } lg:translate-x-0 fixed lg:relative z-40 lg:z-auto h-[calc(100vh-3.5rem)] transition-transform duration-200`}
          >
            <Sidebar
              categories={data.categories}
              activeSlug={resolvedActiveSlug}
              onSelect={viewMode === "read" ? handleNavigate : handleGraphSelect}
            />
          </div>
        )}

        {viewMode === "read" && (
          <div className="flex flex-1 overflow-hidden">
            <div
              id="wiki-content-area"
              className="flex-1 overflow-y-auto px-6 sm:px-10 py-8"
            >
              {activePage ? (
                <div className="max-w-3xl mx-auto">
                  <MarkdownContent
                    page={activePage}
                    owner={owner}
                    repo={repo}
                    onNavigate={handleNavigate}
                    slugByName={slugByName}
                    backlinks={backlinks}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-3">
                  <BookOpen className="w-10 h-10 opacity-30" />
                  <p className="text-sm">选择左侧页面开始阅读</p>
                </div>
              )}
            </div>
            {activePage && (
              <div className="pr-6 pt-8 hidden xl:block">
                <TableOfContents content={activePage.content} />
              </div>
            )}
          </div>
        )}

        {viewMode === "cosmos" && (
          <div className="flex-1">
            <CosmosGraph
              nodes={data.graph.nodes}
              links={data.graph.links}
              activeSlug={resolvedActiveSlug}
              onSelect={handleNavigate}
            />
          </div>
        )}

        {viewMode === "mindmap" && (
          <div className="flex-1 p-4">
            <MindMap
              nodes={data.graph.nodes}
              links={data.graph.links}
              pages={data.pages}
              activeSlug={resolvedActiveSlug}
              onSelect={handleGraphSelect}
              onNavigate={handleNavigate}
            />
          </div>
        )}

        {viewMode === "gallery" && (
          <div className="flex-1 overflow-hidden">
            <GalleryView data={data} onSelect={handleNavigate} />
          </div>
        )}

        {viewMode === "glossary" && (
          <div className="flex-1 overflow-hidden">
            <GlossaryView data={data} onSelect={handleNavigate} />
          </div>
        )}

        {viewMode === "stats" && (
          <div className="flex-1 overflow-hidden">
            <StatsView data={data} onSelect={handleNavigate} />
          </div>
        )}
      </div>

      {searchOpen && (
        <SearchDialog
          pages={data.pages}
          onClose={() => setSearchOpen(false)}
          onSelect={handleNavigate}
        />
      )}
    </div>
  );
}
