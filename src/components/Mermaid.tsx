"use client";

import { useEffect, useId, useState } from "react";

type MermaidApi = (typeof import("mermaid"))["default"];
let mermaidReady: Promise<MermaidApi> | null = null;

function loadMermaid() {
  return (mermaidReady ??= import("mermaid").then(({ default: mermaid }) => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral" });
    return mermaid;
  }));
}

/** Renders a Mermaid diagram, falling back to the source when the model wrote invalid syntax. */
export function Mermaid({ chart }: { chart: string }) {
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [result, setResult] = useState<{ chart: string; svg: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = await loadMermaid();
      // Parsing first keeps mermaid from injecting its own error graphic into the page.
      if (!(await mermaid.parse(chart, { suppressErrors: true }))) return null;
      return (await mermaid.render(id, chart)).svg;
    })()
      .catch(() => null)
      .then((svg) => {
        if (!cancelled) setResult({ chart, svg });
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (!result || result.chart !== chart) {
    return <div className="mermaid-diagram text-sm text-muted">Drawing diagram…</div>;
  }
  if (!result.svg) {
    return (
      <pre>
        <code>{chart}</code>
      </pre>
    );
  }
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: result.svg }} />;
}
