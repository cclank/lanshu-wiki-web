"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as d3 from "d3";
import type { GraphNode, GraphLink } from "@/lib/github";

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
}

// Morandi-inspired but with more color distinction for graph readability
const CAT_COLORS: Record<string, string> = {
  root: "#d4a96a",
  concepts: "#7ba3c4",
  entities: "#b48ec4",
  changelog: "#72b886",
  guides: "#c9985e",
  docs: "#c9985e",
  api: "#d48a8a",
};

interface SNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  category: string;
  linkCount: number;
}
interface SLink extends d3.SimulationLinkDatum<SNode> {
  source: SNode | string;
  target: SNode | string;
}

// Simple AABB overlap test for label placement
interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function isLightTheme(): boolean {
  return document.documentElement.getAttribute("data-theme") === "light";
}

// Graph labels are for orientation, not reading. Long titles (e.g. changelog
// entries that pack a date + commit range + feature list) get clipped so they
// don't render as screen-wide pills. Hovered/active nodes get a longer clip.
function truncateLabel(title: string, max: number): string {
  return title.length > max ? title.slice(0, max - 1) + "…" : title;
}

export default function ObsidianGraph({ nodes, links, activeSlug, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const activeRef = useRef<string | null>(activeSlug);
  const nodesRef = useRef<SNode[]>([]);
  const linksRef = useRef<SLink[]>([]);
  const simRef = useRef<d3.Simulation<SNode, SLink> | null>(null);
  const transformRef = useRef(d3.zoomIdentity);
  const rafRef = useRef(0);
  const dragNodeRef = useRef<SNode | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const didFocusMountRef = useRef(false);

  useEffect(() => {
    activeRef.current = activeSlug;
  }, [activeSlug]);

  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  // Continuous draw loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const t = transformRef.current;
    // Only dim non-neighbors during hover.
    const hl = hoveredRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    const sNodes = nodesRef.current;
    const sLinks = linksRef.current;

    // Build neighbor set
    const nb = new Set<string>();
    const hlLinks = new Set<number>();
    if (hl) {
      nb.add(hl);
      sLinks.forEach((l, i) => {
        const s = (l.source as SNode).id;
        const tg = (l.target as SNode).id;
        if (s === hl || tg === hl) { nb.add(s); nb.add(tg); hlLinks.add(i); }
      });
    }

    const light = isLightTheme();

    // --- Links ---
    sLinks.forEach((l, i) => {
      const s = l.source as SNode;
      const tg = l.target as SNode;
      if (s.x == null || tg.x == null) return;
      const lit = hlLinks.has(i);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y!);
      ctx.lineTo(tg.x, tg.y!);
      if (lit) {
        ctx.strokeStyle = light ? "rgba(60, 50, 40, 0.7)" : "rgba(180, 200, 220, 0.9)";
        ctx.lineWidth = 2.5 / t.k;
      } else {
        ctx.strokeStyle = hl
          ? (light ? "rgba(60, 50, 40, 0.06)" : "rgba(80, 95, 115, 0.08)")
          : (light ? "rgba(60, 50, 40, 0.25)" : "rgba(140, 160, 185, 0.4)");
        ctx.lineWidth = 1.2 / t.k;
      }
      ctx.stroke();
    });

    // --- Nodes ---
    // Sort by linkCount so important nodes render on top
    const sortedNodes = [...sNodes].sort((a, b) => a.linkCount - b.linkCount);

    // First pass: draw all node dots with glow
    sortedNodes.forEach((n) => {
      if (n.x == null || n.y == null) return;
      const color = CAT_COLORS[n.category] || "#7c8eff";
      const isActive = n.id === activeRef.current;
      const isHover = n.id === hoveredRef.current;
      const inNb = nb.has(n.id);
      const dim = hl && !inNb;
      const r = (5 + Math.min(n.linkCount * 1.8, 12)) / t.k;

      // Ambient glow for every node (subtle bloom)
      if (!dim) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 2, 0, Math.PI * 2);
        ctx.fillStyle = color + "18";
        ctx.fill();
      }

      // Stronger glow for hover/active
      if (isHover || isActive) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = color + "35";
        ctx.fill();
      }

      // Node dot, bright and saturated.
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = dim ? color + "20" : color;
      ctx.fill();

      // Bright border ring on every node for visibility
      if (!dim) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = color + "60";
        ctx.lineWidth = 1.2 / t.k;
        ctx.stroke();
      }

      // Active ring
      if (isActive) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3 / t.k, 0, Math.PI * 2);
        ctx.strokeStyle = light ? "#2c2825dd" : "#ffffffdd";
        ctx.lineWidth = 2 / t.k;
        ctx.stroke();
      }
    });

    // Second pass: draw labels with overlap prevention
    // Sort by priority: hovered > active > high linkCount > rest
    const labelCandidates = sortedNodes
      .filter((n) => n.x != null && n.y != null)
      .map((n) => {
        let priority = n.linkCount;
        if (n.id === hoveredRef.current) priority = 10000;
        else if (n.id === activeRef.current) priority = 9000;
        else if (nb.has(n.id) && hl) priority += 500;
        return { node: n, priority };
      })
      .sort((a, b) => b.priority - a.priority);

    const placedLabels: LabelRect[] = [];
    const minFontScreenPx = 7;

    labelCandidates.forEach(({ node: n }) => {
      if (n.x == null || n.y == null) return;
      const color = CAT_COLORS[n.category] || "#7c8eff";
      const isActive = n.id === activeRef.current;
      const isHover = n.id === hoveredRef.current;
      const inNb = nb.has(n.id);
      const dim = hl && !inNb;
      const r = (5 + Math.min(n.linkCount * 1.8, 12)) / t.k;

      const fs = (isHover || isActive ? 14 : 12.5) / t.k;
      const screenFs = fs * t.k;
      if (screenFs < minFontScreenPx) return;

      ctx.font = `${isHover || isActive ? 700 : 600} ${fs}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const label = truncateLabel(n.title, isHover || isActive ? 40 : 20);
      const tw = ctx.measureText(label).width;
      const px = 6 / t.k;
      const py = 3 / t.k;
      const ly = n.y + r + 6 / t.k;

      const labelRect: LabelRect = {
        x: n.x - tw / 2 - px,
        y: ly - py,
        w: tw + px * 2,
        h: fs + py * 2,
      };

      // Check overlap with already placed labels.
      const forceShow = isHover || isActive;
      if (!forceShow) {
        const hasOverlap = placedLabels.some((placed) => rectsOverlap(labelRect, placed));
        if (hasOverlap) return;
      }

      placedLabels.push(labelRect);

      // Text bg pill
      if (!dim) {
        ctx.fillStyle = light ? "rgba(245, 240, 235, 0.92)" : "rgba(20, 24, 36, 0.92)";
        ctx.beginPath();
        ctx.roundRect(labelRect.x, labelRect.y, labelRect.w, labelRect.h, 4 / t.k);
        ctx.fill();
        ctx.strokeStyle = color + "50";
        ctx.lineWidth = 1 / t.k;
        ctx.stroke();
      }

      ctx.fillStyle = dim ? (light ? "rgba(60, 50, 40, 0.06)" : "rgba(148, 163, 184, 0.06)") :
                       (isHover || isActive) ? (light ? "#2c2825" : "#ffffff") : color;
      ctx.fillText(label, n.x, ly);
    });

    ctx.restore();
  }, []);

  // Animation loop
  useEffect(() => {
    let running = true;
    function loop() {
      if (!running) return;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }
    loop();
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // When the active node changes (e.g. picked from the sidebar), pan it to the
  // centre so "activating" a node is visually obvious — the active ring/glow
  // alone is easy to miss among many nodes. Skips the first run so the initial
  // view stays fit-to-all.
  useEffect(() => {
    if (!didFocusMountRef.current) {
      didFocusMountRef.current = true;
      return;
    }
    const canvas = canvasRef.current;
    const zoom = zoomRef.current;
    if (!canvas || !zoom || !activeSlug) return;
    const n = nodesRef.current.find((x) => x.id === activeSlug);
    if (!n || n.x == null || n.y == null) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const k = Math.max(transformRef.current.k, 0.9);
    const target = d3.zoomIdentity
      .translate(W / 2 - k * n.x, H / 2 - k * n.y)
      .scale(k);

    (d3.select(canvas) as d3.Selection<HTMLCanvasElement, unknown, null, undefined>)
      .transition()
      .duration(500)
      .call(
        (zoom as unknown as d3.ZoomBehavior<HTMLCanvasElement, unknown>).transform,
        target
      );
  }, [activeSlug]);

  // Simulation setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const canvasEl = canvas;

    const container = canvasEl.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = container.clientHeight;
    canvasEl.width = W * dpr;
    canvasEl.height = H * dpr;
    canvasEl.style.width = `${W}px`;
    canvasEl.style.height = `${H}px`;

    const sNodes: SNode[] = nodes.map((n) => ({ ...n }));
    const sLinks: SLink[] = links.map((l) => ({ source: l.source, target: l.target }));
    nodesRef.current = sNodes;
    linksRef.current = sLinks;

    // Spread physics adapted to node count.
    const nodeCount = sNodes.length;
    const chargeStrength = nodeCount > 30 ? -500 : -300;
    const linkDist = nodeCount > 30 ? 200 : 140;
    const collisionR = nodeCount > 30 ? 45 : 30;

    const sim = d3.forceSimulation(sNodes)
      .force("link", d3.forceLink<SNode, SLink>(sLinks).id(d => d.id).distance(linkDist).strength(0.18))
      .force("charge", d3.forceManyBody().strength(chargeStrength).distanceMax(700))
      .force("center", d3.forceCenter(W / 2, H / 2).strength(0.05))
      .force("collision", d3.forceCollide().radius((d) => collisionR + Math.min((d as SNode).linkCount * 3, 20)).iterations(2))
      .force("x", d3.forceX(W / 2).strength(0.03))
      .force("y", d3.forceY(H / 2).strength(0.03))
      .alphaDecay(0.015)
      .velocityDecay(0.45)
      .alphaMin(0.005);

    // Pre-compute 300 ticks so layout is stable on first render
    sim.stop();
    for (let i = 0; i < 300; i++) sim.tick();

    simRef.current = sim;
    sim.restart();

    // Zoom + pan
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 6])
      .on("zoom", (e) => { transformRef.current = e.transform; });
    zoomRef.current = zoom;

    const sel = d3.select(canvasEl);
    (sel as d3.Selection<HTMLCanvasElement, unknown, null, undefined>).call(
      zoom as unknown as (s: d3.Selection<HTMLCanvasElement, unknown, null, undefined>) => void
    );

    // Immediate auto-fit since layout is pre-computed
    {
      const pad = 60;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of sNodes) {
        if (n.x != null && n.y != null) {
          x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
          x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
        }
      }
      if (x0 < Infinity) {
        const gw = x1 - x0 + pad * 2;
        const gh = y1 - y0 + pad * 2;
        const s = Math.min(W / gw, H / gh, 2.0);
        const tx = d3.zoomIdentity
          .translate(W / 2, H / 2).scale(s).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
        transformRef.current = tx;
        // Also set on the selection so zoom state stays in sync
        (sel as d3.Selection<HTMLCanvasElement, unknown, null, undefined>)
          .call((zoom as unknown as d3.ZoomBehavior<HTMLCanvasElement, unknown>).transform, tx);
      }
    }

    // Hit test
    function nodeAt(mx: number, my: number): SNode | null {
      const t = transformRef.current;
      const x = (mx - t.x) / t.k;
      const y = (my - t.y) / t.k;
      for (let i = sNodes.length - 1; i >= 0; i--) {
        const n = sNodes[i];
        if (n.x == null || n.y == null) continue;
        const r = (4 + Math.min(n.linkCount * 1.5, 10)) / t.k + 10 / t.k;
        if ((n.x - x) ** 2 + (n.y! - y) ** 2 < r * r) return n;
      }
      return null;
    }

    // Hover
    function handleHoverMove(e: MouseEvent) {
      if (dragNodeRef.current) return;
      const rect = canvasEl.getBoundingClientRect();
      const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
      setHovered(n?.id ?? null);
      canvasEl.style.cursor = n ? "pointer" : "default";
    }
    canvasEl.addEventListener("mousemove", handleHoverMove);

    // Click
    function handleClick(e: MouseEvent) {
      if (dragNodeRef.current) return;
      const rect = canvasEl.getBoundingClientRect();
      const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (n) onSelect(n.id);
    }
    canvasEl.addEventListener("click", handleClick);

    // Drag nodes
    let dragStarted = false;
    function handleMouseDown(e: MouseEvent) {
      const rect = canvasEl.getBoundingClientRect();
      const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (n) {
        dragNodeRef.current = n;
        dragStarted = false;
        n.fx = n.x;
        n.fy = n.y;
        sim.alphaTarget(0.08).restart();
        e.stopPropagation();
      }
    }
    canvasEl.addEventListener("mousedown", handleMouseDown);

    function handleDragMove(e: MouseEvent) {
      const n = dragNodeRef.current;
      if (!n) return;
      dragStarted = true;
      const t = transformRef.current;
      const rect = canvasEl.getBoundingClientRect();
      n.fx = (e.clientX - rect.left - t.x) / t.k;
      n.fy = (e.clientY - rect.top - t.y) / t.k;
      canvasEl.style.cursor = "grabbing";
    }
    canvasEl.addEventListener("mousemove", handleDragMove);

    function endDrag() {
      const n = dragNodeRef.current;
      if (n) {
        n.fx = null;
        n.fy = null;
        sim.alphaTarget(0);
        dragNodeRef.current = null;
      }
    }

    function handleMouseUp(e: MouseEvent) {
      if (dragStarted) {
        e.stopPropagation();
        e.preventDefault();
      }
      endDrag();
    }
    canvasEl.addEventListener("mouseup", handleMouseUp);
    canvasEl.addEventListener("mouseleave", endDrag);

    // Resize
    function onResize() {
      const nextDpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvasEl.width = w * nextDpr;
      canvasEl.height = h * nextDpr;
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;
    }
    window.addEventListener("resize", onResize);

    return () => {
      sim.stop();
      cancelAnimationFrame(rafRef.current);
      canvasEl.removeEventListener("mousemove", handleHoverMove);
      canvasEl.removeEventListener("click", handleClick);
      canvasEl.removeEventListener("mousedown", handleMouseDown);
      canvasEl.removeEventListener("mousemove", handleDragMove);
      canvasEl.removeEventListener("mouseup", handleMouseUp);
      canvasEl.removeEventListener("mouseleave", endDrag);
      window.removeEventListener("resize", onResize);
    };
  }, [nodes, links, onSelect, draw]);

  return (
    <div className="relative w-full h-full min-h-[500px] bg-bg-primary overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-bg-primary/70 backdrop-blur border border-border-primary rounded-lg p-2.5 space-y-1">
        {Object.entries(CAT_COLORS)
          .filter(([c]) => nodes.some((n) => n.category === c))
          .map(([c, color]) => (
            <div key={c} className="flex items-center gap-2 text-[11px]">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-text-tertiary">{c}</span>
            </div>
          ))}
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 right-4 text-[11px] text-text-tertiary bg-bg-primary/60 backdrop-blur border border-border-primary rounded-lg px-3 py-2">
        滚轮缩放 · 拖拽节点 · 悬停高亮
      </div>
    </div>
  );
}
