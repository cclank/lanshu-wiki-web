"use client";

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import * as d3 from "d3";
import { Search, ChevronRight, X } from "lucide-react";
import type { GraphNode, GraphLink, WikiPage } from "@/lib/github";

interface MindMapProps {
  nodes: GraphNode[];
  links: GraphLink[];
  pages: WikiPage[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
  onNavigate: (slug: string) => void;
}

interface TreeNode {
  id: string;
  title: string;
  category: string;
  children: TreeNode[];
  depth: number;
  totalDescendants: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  root: "#d4a96a",
  concepts: "#7ba3c4",
  entities: "#b48ec4",
  changelog: "#72b886",
  guides: "#c9985e",
  docs: "#c9985e",
  api: "#d48a8a",
};

const CATEGORY_LABELS: Record<string, string> = {
  root: "根目录",
  concepts: "概念",
  entities: "实体",
  changelog: "更新日志",
  guides: "指南",
  docs: "文档",
  api: "API",
};

function isLightTheme(): boolean {
  return document.documentElement.getAttribute("data-theme") === "light";
}

function countDescendants(node: TreeNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  node.totalDescendants = count;
  return count;
}

function extractSummary(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("---") &&
      !trimmed.startsWith("|") &&
      !trimmed.startsWith("```") &&
      !trimmed.startsWith("![") &&
      !trimmed.startsWith(">")
    ) {
      const clean = trimmed
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/[*_`~]/g, "");
      if (clean.length > 10) {
        return clean.length > 120 ? clean.slice(0, 117) + "…" : clean;
      }
    }
  }
  return "";
}

export default function MindMap({
  nodes,
  links,
  pages,
  activeSlug,
  onSelect,
  onNavigate,
}: MindMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [maxDepth, setMaxDepth] = useState(3);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  // --- Tier 2: Search ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Set<string>>(new Set());

  // --- Tier 2: Breadcrumb history ---
  const [history, setHistory] = useState<{ slug: string; title: string }[]>([]);
  const prevSlugRef = useRef<string | null>(null);

  // Track center node history
  useEffect(() => {
    if (!activeSlug || activeSlug === prevSlugRef.current) return;
    prevSlugRef.current = activeSlug;
    const node = nodes.find((n) => n.id === activeSlug);
    if (!node) return;
    setHistory((prev) => {
      // Don't duplicate if going back to same node
      if (prev.length > 0 && prev[prev.length - 1].slug === activeSlug) return prev;
      // Keep max 10
      const next = [...prev, { slug: activeSlug, title: node.title }];
      return next.length > 10 ? next.slice(-10) : next;
    });
  }, [activeSlug, nodes]);

  // --- Tier 2: Category filter ---
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());

  // Available categories from current nodes
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const n of nodes) cats.add(n.category);
    return [...cats].sort();
  }, [nodes]);

  function toggleCategory(cat: string) {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  // Search logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchMatches(new Set());
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = new Set<string>();
    for (const n of nodes) {
      if (n.title.toLowerCase().includes(q)) {
        matches.add(n.id);
      }
    }
    // Also search page content
    for (const p of pages) {
      if (
        p.content.toLowerCase().includes(q) ||
        (Array.isArray(p.frontmatter.tags) &&
          (p.frontmatter.tags as string[]).some((t) =>
            t.toLowerCase().includes(q)
          ))
      ) {
        matches.add(p.slug);
      }
    }
    setSearchMatches(matches);
  }, [searchQuery, nodes, pages]);

  // Build adjacency map
  const adj = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of nodes) map.set(n.id, new Set());
    for (const l of links) {
      const src = typeof l.source === "string" ? l.source : l.source;
      const tgt = typeof l.target === "string" ? l.target : l.target;
      map.get(src)?.add(tgt);
      map.get(tgt)?.add(src);
    }
    return map;
  }, [nodes, links]);

  // Build tree from active node (with category filtering)
  const treeData = useMemo(() => {
    const centerSlug = activeSlug || (nodes.length > 0 ? nodes[0].id : null);
    if (!centerSlug) return null;

    const centerNode = nodes.find((n) => n.id === centerSlug);
    if (!centerNode) return null;

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();

    function buildTree(id: string, depth: number): TreeNode {
      visited.add(id);
      const node = nodeMap.get(id)!;
      const children: TreeNode[] = [];

      if (depth < maxDepth) {
        const neighbors = adj.get(id) || new Set();
        for (const neighbor of neighbors) {
          if (visited.has(neighbor)) continue;
          const neighborNode = nodeMap.get(neighbor);
          // Skip hidden categories (but never skip center node)
          if (neighborNode && hiddenCategories.has(neighborNode.category)) continue;
          children.push(buildTree(neighbor, depth + 1));
        }
        children.sort((a, b) => b.children.length - a.children.length);
      }

      return {
        id,
        title: node.title,
        category: node.category,
        children,
        depth,
        totalDescendants: 0,
      };
    }

    const tree = buildTree(centerSlug, 0);
    countDescendants(tree);
    return tree;
  }, [nodes, adj, activeSlug, maxDepth, hiddenCategories]);

  // Page lookup for hover preview
  const pageMap = useMemo(() => {
    const map = new Map<string, WikiPage>();
    for (const p of pages) map.set(p.slug, p);
    return map;
  }, [pages]);

  // Hovered page info
  const hoveredPage = useMemo(() => {
    if (!hoveredNode) return null;
    const page = pageMap.get(hoveredNode);
    if (!page) return null;
    const connectionCount = adj.get(hoveredNode)?.size || 0;
    const summary = extractSummary(page.content);
    const tags = Array.isArray(page.frontmatter.tags)
      ? (page.frontmatter.tags as string[])
      : [];
    return { title: page.title, category: page.category, summary, tags, connectionCount };
  }, [hoveredNode, pageMap, adj]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        onNavigate(nodeId);
      } else {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          onSelect(nodeId);
        }, 250);
      }
    },
    [onSelect, onNavigate]
  );

  // Collect all tree node IDs for search match checking
  const treeNodeIds = useMemo(() => {
    if (!treeData) return new Set<string>();
    const ids = new Set<string>();
    function collect(node: TreeNode) {
      ids.add(node.id);
      for (const child of node.children) collect(child);
    }
    collect(treeData);
    return ids;
  }, [treeData]);

  const render = useCallback(() => {
    if (!svgRef.current || !treeData) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    svg.attr("width", width).attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr(
          "transform",
          `translate(${width / 2 + event.transform.x},${height / 2 + event.transform.y}) scale(${event.transform.k})`
        );
      });
    (svg as d3.Selection<SVGSVGElement, unknown, null, undefined>).call(
      zoom as unknown as (
        sel: d3.Selection<SVGSVGElement, unknown, null, undefined>
      ) => void
    );

    const root = d3.hierarchy(treeData);
    const treeLayout = d3
      .tree<TreeNode>()
      .size([2 * Math.PI, Math.min(width, height) * 0.35])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);

    treeLayout(root);

    const linkGen = d3
      .linkRadial<
        d3.HierarchyPointLink<TreeNode>,
        d3.HierarchyPointNode<TreeNode>
      >()
      .angle((d) => d.x)
      .radius((d) => d.y);

    // Draw links
    const linkGroup = g.append("g");
    root.links().forEach((link, i) => {
      const sourceColor =
        CATEGORY_COLORS[link.source.data.category] || "#3b82f6";

      const gradientId = `mindmap-grad-${i}`;
      svg
        .append("defs")
        .append("linearGradient")
        .attr("id", gradientId)
        .attr("gradientUnits", "userSpaceOnUse")
        .selectAll("stop")
        .data([
          { offset: "0%", color: sourceColor, opacity: 0.6 },
          { offset: "100%", color: sourceColor, opacity: 0.1 },
        ])
        .join("stop")
        .attr("offset", (d) => d.offset)
        .attr("stop-color", (d) => d.color)
        .attr("stop-opacity", (d) => d.opacity);

      linkGroup
        .append("path")
        .attr("d", linkGen(link as unknown as d3.HierarchyPointLink<TreeNode>))
        .attr("fill", "none")
        .attr("stroke", `url(#${gradientId})`)
        .attr("stroke-width", 2)
        .attr("opacity", 0)
        .transition()
        .delay(i * 30)
        .duration(600)
        .attr("opacity", 1);
    });

    const light = isLightTheme();
    const hasSearch = searchMatches.size > 0;

    // Draw nodes
    const nodeGroup = g
      .append("g")
      .selectAll("g")
      .data(root.descendants())
      .join("g")
      .attr("transform", (d) => {
        const angle = (d.x ?? 0) - Math.PI / 2;
        const r = d.y ?? 0;
        return `translate(${r * Math.cos(angle)},${r * Math.sin(angle)})`;
      })
      .style("cursor", "pointer")
      .on("click", (_, d) => handleNodeClick(d.data.id))
      .on("mouseenter", (_, d) => setHoveredNode(d.data.id))
      .on("mouseleave", () => setHoveredNode(null));

    // Node glow
    nodeGroup
      .append("circle")
      .attr("r", (d) => {
        const isMatch = searchMatches.has(d.data.id);
        const base = d.depth === 0 ? 24 : 16 - d.depth * 3;
        return isMatch ? base * 1.5 : base;
      })
      .attr("fill", (d) => CATEGORY_COLORS[d.data.category] || "#3b82f6")
      .attr("opacity", (d) => {
        if (hasSearch) return searchMatches.has(d.data.id) ? 0.3 : 0.05;
        return 0.12;
      })
      .attr("filter", "blur(4px)");

    // Node core
    nodeGroup
      .append("circle")
      .attr("r", (d) => {
        const isMatch = searchMatches.has(d.data.id);
        const base = d.depth === 0 ? 14 : 8 - d.depth;
        return isMatch ? base * 1.3 : base;
      })
      .attr("fill", (d) => CATEGORY_COLORS[d.data.category] || "#3b82f6")
      .attr("stroke", (d) => {
        if (searchMatches.has(d.data.id)) return "#e07a5f";
        return d.data.id === activeSlug
          ? light ? "#2c2825" : "#fff"
          : "transparent";
      })
      .attr("stroke-width", (d) => searchMatches.has(d.data.id) ? 3 : 2)
      .attr("opacity", (d) => {
        if (hasSearch) return searchMatches.has(d.data.id) ? 1 : 0.2;
        return 0;
      })
      .transition()
      .delay((_, i) => i * 40)
      .duration(400)
      .attr("opacity", (d) => {
        if (hasSearch) return searchMatches.has(d.data.id) ? 1 : 0.2;
        return 1;
      });

    // Pulse animation for center node
    nodeGroup
      .filter((d) => d.depth === 0)
      .append("circle")
      .attr("r", 14)
      .attr("fill", "none")
      .attr("stroke", (d) => CATEGORY_COLORS[d.data.category] || "#3b82f6")
      .attr("stroke-width", 1)
      .attr("opacity", 0.6)
      .each(function pulse() {
        d3.select(this)
          .transition()
          .duration(2000)
          .attr("r", 28)
          .attr("opacity", 0)
          .transition()
          .duration(0)
          .attr("r", 14)
          .attr("opacity", 0.6)
          .on("end", pulse);
      });

    // Labels
    nodeGroup
      .append("text")
      .attr("dy", (d) => (d.depth === 0 ? -22 : -14))
      .attr("text-anchor", "middle")
      .attr("font-size", (d) =>
        d.depth === 0 ? "13px" : `${12 - d.depth}px`
      )
      .attr("fill", (d) => {
        if (hasSearch && !searchMatches.has(d.data.id)) {
          return light ? "rgba(44,40,37,0.2)" : "rgba(232,234,237,0.2)";
        }
        return d.depth === 0
          ? light ? "#2c2825" : "#e8eaed"
          : light ? "#5c5550" : "#9aa0b0";
      })
      .attr("font-weight", (d) => {
        if (searchMatches.has(d.data.id)) return "700";
        return d.depth === 0 ? "600" : "400";
      })
      .text((d) => {
        const t = d.data.title;
        const maxLen = d.depth === 0 ? 30 : 20 - d.depth * 4;
        return t.length > maxLen ? t.slice(0, maxLen - 1) + "…" : t;
      })
      .attr("opacity", 0)
      .transition()
      .delay((_, i) => i * 40 + 200)
      .duration(400)
      .attr("opacity", 1);

    // Connection count badges
    nodeGroup
      .filter((d) => {
        const neighborCount = adj.get(d.data.id)?.size || 0;
        return neighborCount > 1 && d.depth > 0;
      })
      .append("text")
      .attr("dx", (d) => {
        const r = 8 - d.depth;
        return r + 4;
      })
      .attr("dy", 4)
      .attr("font-size", "9px")
      .attr("fill", light ? "#8a837c" : "#6e6963")
      .attr("font-weight", "500")
      .text((d) => {
        const count = adj.get(d.data.id)?.size || 0;
        return `·${count}`;
      })
      .attr("opacity", 0)
      .transition()
      .delay((_, i) => i * 40 + 300)
      .duration(400)
      .attr("opacity", (d) => {
        if (hasSearch && !searchMatches.has(d.data.id)) return 0.15;
        return 1;
      });
  }, [treeData, activeSlug, handleNodeClick, adj, searchMatches]);

  useEffect(() => {
    render();
    const handleResize = () => render();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [render]);

  // Search match count in current tree
  const treeMatchCount = useMemo(() => {
    if (searchMatches.size === 0) return 0;
    let count = 0;
    for (const id of searchMatches) {
      if (treeNodeIds.has(id)) count++;
    }
    return count;
  }, [searchMatches, treeNodeIds]);

  if (!treeData) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        选择一个页面作为脑图中心
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[500px] bg-bg-primary rounded-xl border border-border-primary overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" />

      {/* Center node info + breadcrumb */}
      <div className="absolute top-4 left-4 bg-bg-primary/80 backdrop-blur-md border border-border-primary rounded-xl px-4 py-3 max-w-[320px]">
        <div className="text-xs text-text-tertiary mb-1">脑图中心</div>
        <div className="text-sm font-medium text-text-primary">
          {treeData.title}
        </div>
        <div className="text-xs text-text-tertiary mt-1">
          {treeData.children.length} 个直接关联 · {treeData.totalDescendants} 个节点
        </div>

        {/* Breadcrumb history */}
        {history.length > 1 && (
          <div className="flex items-center gap-0.5 mt-2 pt-2 border-t border-border-primary overflow-x-auto">
            {history.slice(-5).map((item, idx, arr) => (
              <div key={`${item.slug}-${idx}`} className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => onSelect(item.slug)}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors cursor-pointer truncate max-w-[80px] ${
                    item.slug === activeSlug
                      ? "text-accent-vivid bg-accent-vivid/10"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                  title={item.title}
                >
                  {item.title.length > 10 ? item.title.slice(0, 9) + "…" : item.title}
                </button>
                {idx < arr.length - 1 && (
                  <ChevronRight className="w-2.5 h-2.5 text-text-tertiary/40 shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right controls: depth + search + category filter */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
        {/* Depth control */}
        <div className="bg-bg-primary/80 backdrop-blur-md border border-border-primary rounded-xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs text-text-tertiary">层深</span>
          <input
            type="range"
            min={1}
            max={5}
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
            className="w-20 h-1 accent-accent-vivid cursor-pointer"
          />
          <span className="text-xs text-text-primary font-mono w-3 text-center">
            {maxDepth}
          </span>
        </div>

        {/* Search */}
        <div className="bg-bg-primary/80 backdrop-blur-md border border-border-primary rounded-xl px-3 py-2 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索节点..."
            className="bg-transparent text-xs text-text-primary placeholder:text-text-tertiary outline-none w-28"
          />
          {searchQuery && (
            <>
              <span className="text-[10px] text-text-tertiary shrink-0">
                {treeMatchCount}/{searchMatches.size}
              </span>
              <button
                onClick={() => setSearchQuery("")}
                className="text-text-tertiary hover:text-text-secondary cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

        {/* Category filter */}
        <div className="bg-bg-primary/80 backdrop-blur-md border border-border-primary rounded-xl px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {availableCategories.map((cat) => {
              const color = CATEGORY_COLORS[cat] || "#3b82f6";
              const hidden = hiddenCategories.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] transition-all cursor-pointer border ${
                    hidden
                      ? "opacity-30 border-transparent"
                      : "opacity-100 border-border-primary"
                  }`}
                  title={hidden ? `显示 ${cat}` : `隐藏 ${cat}`}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="text-text-tertiary">
                    {CATEGORY_LABELS[cat] || cat}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hover preview card */}
      {hoveredPage && (
        <div className="absolute bottom-4 left-4 bg-bg-primary/90 backdrop-blur-md border border-border-primary rounded-xl px-4 py-3 max-w-sm animate-fade-in">
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background: CATEGORY_COLORS[hoveredPage.category] || "#3b82f6",
              }}
            />
            <span className="text-sm font-medium text-text-primary truncate">
              {hoveredPage.title}
            </span>
            <span className="text-xs text-text-tertiary shrink-0">
              {hoveredPage.connectionCount} 关联
            </span>
          </div>
          {hoveredPage.summary && (
            <p className="text-xs text-text-secondary leading-relaxed mb-1.5">
              {hoveredPage.summary}
            </p>
          )}
          {hoveredPage.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {hoveredPage.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div className="text-[10px] text-text-tertiary mt-2 opacity-60">
            单击切换中心 · 双击打开阅读
          </div>
        </div>
      )}

      {/* Help */}
      {!hoveredPage && (
        <div className="absolute bottom-4 right-4 text-xs text-text-tertiary bg-bg-primary/80 backdrop-blur-md border border-border-primary rounded-xl px-3 py-2">
          单击切换中心 · 双击阅读 · 滚轮缩放
        </div>
      )}
    </div>
  );
}
