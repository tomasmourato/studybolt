"use client";

import clsx from "clsx";
import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Mermaid } from "./Mermaid";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

function buildComponents(streaming: boolean): Components {
  return {
    pre({ node, children, ...props }) {
      const code = node?.children[0];
      const classes = code?.type === "element" ? code.properties.className : undefined;
      // While notes stream in, a diagram's code is usually incomplete, so it stays as text until done.
      if (!streaming && code?.type === "element" && Array.isArray(classes) && classes.includes("language-mermaid")) {
        const chart = code.children.map((child) => (child.type === "text" ? child.value : "")).join("");
        return <Mermaid chart={chart.trim()} />;
      }
      return <pre {...props}>{children}</pre>;
    },
    a({ node: _node, ...props }) {
      return <a {...props} target="_blank" rel="noreferrer" />;
    },
    table({ node: _node, ...props }) {
      return (
        <div className="table-wrap">
          <table {...props} />
        </div>
      );
    },
  };
}

export const Markdown = memo(function Markdown({
  children,
  className,
  streaming = false,
}: {
  children: string;
  className?: string;
  streaming?: boolean;
}) {
  const components = useMemo(() => buildComponents(streaming), [streaming]);
  return (
    <div className={clsx("prose notes-prose max-w-none", streaming && "streaming-caret", className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
