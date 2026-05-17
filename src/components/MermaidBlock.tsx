"use client";

import { useEffect, useState } from "react";

interface MermaidBlockProps {
  code: string;
}

type MermaidTheme = "dark" | "light";

function getCurrentTheme(): MermaidTheme {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function getMermaidConfig(theme: MermaidTheme) {
  const isLight = theme === "light";

  return {
    startOnLoad: false,
    theme: "base" as const,
    securityLevel: "strict" as const,
    themeVariables: {
      darkMode: !isLight,
      background: isLight ? "#ece7e1" : "#161617",
      primaryColor: isLight ? "#f5f0eb" : "#232326",
      primaryTextColor: isLight ? "#1a1714" : "#eae5df",
      primaryBorderColor: isLight ? "#9e4535" : "#e07a5f",
      secondaryColor: isLight ? "#efe7dd" : "#1c1c1e",
      tertiaryColor: isLight ? "#e3ded8" : "#232326",
      lineColor: isLight ? "#6e675f" : "#7d776f",
      textColor: isLight ? "#1a1714" : "#eae5df",
      mainBkg: isLight ? "#f5f0eb" : "#232326",
      nodeBorder: isLight ? "#9e4535" : "#e07a5f",
      clusterBkg: isLight ? "#ece7e1" : "#1c1c1e",
      clusterBorder: isLight ? "#ccc5bd" : "#38383d",
      titleColor: isLight ? "#1a1714" : "#eae5df",
      edgeLabelBackground: isLight ? "#f5f0eb" : "#1c1c1e",
      nodeTextColor: isLight ? "#1a1714" : "#eae5df",
      fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      fontSize: "14px",
    },
    flowchart: { curve: "basis" as const, padding: 15 },
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    fontSize: 14,
  };
}

export default function MermaidBlock({ code }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    let renderId = 0;

    async function render(themeMode: MermaidTheme) {
      const currentRenderId = ++renderId;
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize(getMermaidConfig(themeMode));

        const id = `mermaid-${themeMode}-${Math.random().toString(36).slice(2, 9)}`;
        const { svg: result } = await mermaid.render(id, code.trim());
        if (!cancelled && currentRenderId === renderId) {
          setSvg(result);
          setError("");
        }
      } catch (e) {
        if (!cancelled && currentRenderId === renderId) {
          setError(e instanceof Error ? e.message : "Mermaid render error");
        }
      }
    }

    function renderCurrentTheme() {
      const currentTheme = getCurrentTheme();
      void render(currentTheme);
    }

    renderCurrentTheme();

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.attributeName === "data-theme")) {
        renderCurrentTheme();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [code]);

  if (error) {
    // Fallback to plain code block
    return (
      <pre className="diagram-block">
        <code>{code}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="diagram-block flex items-center justify-center py-8">
        <div className="skeleton w-48 h-4" />
      </div>
    );
  }

  return (
    <div
      className="diagram-block mermaid-rendered"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
