"use client";

import clsx from "clsx";
import { AudioLines, Check, Download, Headphones, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { createPodcast } from "@/lib/actions";
import { formatDuration } from "@/lib/client";
import { useFileUrl } from "@/lib/hooks";
import { EmptyPanel, ErrorNote, btn, type TabProps } from "./ui";

const SPEEDS = [1, 1.25, 1.5, 2];
const HOST_COLORS: Record<string, string> = { Alex: "text-accent", Sam: "text-good" };

export function PodcastTab({ set, patch }: TabProps) {
  const { podcast } = set;
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Regenerating reuses the same file, so the version makes the player load the new episode.
  const src = useFileUrl(
    podcast.status === "ready" ? podcast.audioFile : undefined,
    `${podcast.durationSec ?? 0}-${podcast.lines?.length ?? 0}`,
  );

  async function create() {
    setStarting(true);
    setError(null);
    try {
      patch({ podcast: await createPodcast(set.id) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the podcast.");
    } finally {
      setStarting(false);
    }
  }

  function changeSpeed(value: number) {
    setSpeed(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  }

  if (podcast.status === "scripting" || podcast.status === "voicing") {
    const steps = [
      { label: "Writing the script", done: podcast.status === "voicing" },
      { label: "Recording the hosts", done: false },
    ];
    return (
      <EmptyPanel
        icon={AudioLines}
        title="Producing your episode"
        body="This usually takes a minute or two. Keep studying in the other tabs, but leave this browser tab open."
      >
        <ol className="flex w-full max-w-xs flex-col gap-3 text-left">
          {steps.map((step, i) => {
            const active = !step.done && (i === 0 || steps[i - 1].done);
            return (
              <li key={step.label} className="flex items-center gap-3">
                <span
                  className={clsx(
                    "grid size-7 place-items-center rounded-full text-sm",
                    step.done ? "bg-good text-white" : active ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
                  )}
                >
                  {step.done ? <Check className="size-4" /> : active ? <LoaderCircle className="size-4 animate-spin" /> : i + 1}
                </span>
                <span className={clsx(!step.done && !active && "text-muted")}>{step.label}</span>
              </li>
            );
          })}
        </ol>
      </EmptyPanel>
    );
  }

  if (podcast.status !== "ready" || !podcast.audioFile) {
    return (
      <EmptyPanel
        icon={Headphones}
        title="Podcast"
        body="Turn this study set into a lively two-host audio episode you can listen to on the go."
      >
        {podcast.status === "error" && podcast.error && <ErrorNote>{podcast.error}</ErrorNote>}
        <button type="button" onClick={create} disabled={starting} className={btn.primary}>
          {starting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {podcast.status === "error" ? "Try again" : "Create podcast"}
        </button>
        {error && <ErrorNote>{error}</ErrorNote>}
      </EmptyPanel>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="rounded-3xl bg-ink p-6 text-bg sm:p-8">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-bolt text-[#17161b]">
            <Headphones className="size-7" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm opacity-70">
              {set.emoji} {set.title}
            </p>
            <h2 className="font-display text-2xl font-bold">{podcast.title ?? "Study podcast"}</h2>
            <p className="text-sm opacity-70">
              Alex &amp; Sam{podcast.durationSec ? ` · ${formatDuration(podcast.durationSec)}` : ""}
            </p>
          </div>
        </div>
        <audio
          ref={audioRef}
          controls
          src={src ?? undefined}
          preload="metadata"
          className="mt-6 w-full"
          onLoadedMetadata={(event) => (event.currentTarget.playbackRate = speed)}
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1" role="group" aria-label="Playback speed">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => changeSpeed(value)}
                className={clsx(
                  "rounded-full px-3 py-1 text-sm font-medium transition",
                  speed === value ? "bg-bg text-ink" : "opacity-70 hover:opacity-100",
                )}
              >
                {value}×
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <a
              href={src ?? undefined}
              download={`${set.title}.wav`}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm opacity-80 transition hover:opacity-100"
            >
              <Download className="size-4" /> Download
            </a>
            <button
              type="button"
              onClick={() => window.confirm("Replace this episode with a new one?") && create()}
              disabled={starting}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm opacity-80 transition hover:opacity-100"
            >
              <RotateCcw className="size-4" /> Regenerate
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {podcast.lines && (
        <section>
          <h3 className="mb-4 font-display text-xl font-bold">Transcript</h3>
          <ol className="flex flex-col gap-4">
            {podcast.lines.map((line, i) => (
              <li key={i} className="grid grid-cols-[3.5rem_1fr] gap-3">
                <span className={clsx("pt-0.5 text-sm font-semibold", HOST_COLORS[line.speaker] ?? "text-muted")}>
                  {line.speaker}
                </span>
                <p className="leading-relaxed">{line.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
