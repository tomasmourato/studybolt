"use client";

import clsx from "clsx";
import { Check, Copy, LoaderCircle } from "lucide-react";
import { Fragment, useState } from "react";
import { youTubeId } from "@/lib/client";
import { useFileUrl } from "@/lib/hooks";
import { KIND_META } from "../kinds";
import { btn, type TabProps } from "./ui";

const MEDIA_KINDS = new Set(["audio", "video", "youtube"]);

export function SourceTab({ set }: TabProps) {
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, set.sources.length - 1);
  const source = set.sources[index];
  const fileUrl = useFileUrl(source.localFile);
  const videoId = youTubeId(source.url);
  const multiple = set.sources.length > 1;
  const sourceText = set.sourceText;

  async function copy() {
    if (!sourceText) return;
    await navigator.clipboard.writeText(sourceText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-8">
      {multiple && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sources">
          {set.sources.map((s, i) => {
            const Icon = KIND_META[s.kind].icon;
            return (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => setSelected(i)}
                className={clsx(
                  "flex max-w-72 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                  i === index ? "border-ink bg-ink text-bg" : "border-line bg-surface text-muted hover:text-ink",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{s.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <Fragment key={index}>
        {source.kind === "youtube" && videoId && (
          <div className="aspect-video overflow-hidden rounded-2xl border border-line bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title="YouTube video"
              className="size-full"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {source.localFile && !fileUrl && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" /> Loading the original file…
          </p>
        )}
        {source.kind === "audio" && fileUrl && <audio controls src={fileUrl} className="w-full" preload="metadata" />}
        {source.kind === "video" && fileUrl && (
          <video controls src={fileUrl} className="w-full rounded-2xl border border-line bg-black" preload="metadata" />
        )}
        {source.kind === "pdf" && fileUrl && (
          <iframe src={fileUrl} title={source.name} className="h-[75vh] w-full rounded-2xl border border-line bg-surface" />
        )}
        {source.kind === "image" && fileUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl} alt={source.name} className="mx-auto max-h-[75vh] rounded-2xl border border-line" />
        )}
        {multiple && (source.kind === "text" || source.kind === "document") && (
          <p className="text-sm text-muted">This source is text. Its full content is included below.</p>
        )}
      </Fragment>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">
            {multiple ? "Transcripts & source text" : MEDIA_KINDS.has(source.kind) ? "Transcript" : "Source text"}
          </h2>
          {sourceText && (
            <button type="button" onClick={copy} className={btn.ghost}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        {set.status === "processing" ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" /> The transcript appears once processing finishes.
          </p>
        ) : sourceText ? (
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-line bg-surface p-6 font-sans text-sm leading-relaxed">
            {sourceText}
          </pre>
        ) : (
          <p className="text-sm text-muted">No transcript is available for this study set.</p>
        )}
      </section>
    </div>
  );
}
