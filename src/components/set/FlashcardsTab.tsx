"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, Layers, LoaderCircle, Plus, RotateCcw, Shuffle, Sparkles, Trash } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { deleteFlashcards, generateFlashcards, reviewFlashcard } from "@/lib/actions";
import type { Flashcard } from "@/lib/types";
import { Markdown } from "../Markdown";
import { EmptyPanel, ErrorNote, btn, selectClass, type TabProps } from "./ui";

type Mode = "study" | "browse";

const dueQueue = (cards: Flashcard[]) =>
  cards
    .filter((c) => c.dueAt <= Date.now())
    .sort((a, b) => a.box - b.box || a.dueAt - b.dueAt)
    .map((c) => c.id);

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function FlashcardsTab({ set, patch }: TabProps) {
  const cards = set.flashcards;
  const [count, setCount] = useState(15);
  const [focus, setFocus] = useState("");
  const [generating, setGenerating] = useState<"new" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("study");
  const [queue, setQueue] = useState<string[]>(() => dueQueue(cards));
  const [order, setOrder] = useState<string[]>(() => cards.map((c) => c.id));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const byId = new Map(cards.map((c) => [c.id, c]));
  const current = mode === "study" ? byId.get(queue[0]) : byId.get(order[index]);
  const memoryScore = cards.length ? Math.round((cards.reduce((sum, c) => sum + c.box, 0) / (cards.length * 5)) * 100) : 0;
  const mastered = cards.filter((c) => c.box >= 4).length;

  function resetSession(next: Flashcard[]) {
    setQueue(dueQueue(next));
    setOrder(next.map((c) => c.id));
    setIndex(0);
    setFlipped(false);
    setReviewed(0);
  }

  async function generate(replace: boolean) {
    setGenerating(replace ? "new" : "more");
    setError(null);
    try {
      const next = await generateFlashcards(set.id, { count, focus, replace });
      patch({ flashcards: next });
      resetSession(next);
      setMode("study");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create flashcards.");
    } finally {
      setGenerating(null);
    }
  }

  const grade = useCallback(
    (result: "again" | "good") => {
      if (!current) return;
      setFlipped(false);
      setReviewed((n) => n + 1);
      // Missed cards go to the back of this session's queue; known cards leave it.
      setQueue((q) => (result === "again" ? [...q.slice(1), q[0]] : q.slice(1)));
      reviewFlashcard(set.id, current.id, result)
        .then((updated) => patch({ flashcards: set.flashcards.map((c) => (c.id === updated.id ? updated : c)) }))
        .catch((err: Error) => setError(err.message));
    },
    [current, patch, set.flashcards, set.id],
  );

  const step = useCallback(
    (delta: number) => {
      setFlipped(false);
      setIndex((i) => (i + delta + order.length) % order.length);
    },
    [order.length],
  );

  async function removeCard(cardId: string) {
    const next = await deleteFlashcards(set.id, cardId);
    patch({ flashcards: next });
    setQueue((q) => q.filter((id) => id !== cardId));
    setOrder((o) => o.filter((id) => id !== cardId));
    setIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
    setFlipped(false);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!current || (event.target as HTMLElement).closest("input, textarea, select")) return;
      if (event.key === " ") {
        event.preventDefault();
        setFlipped((f) => !f);
      } else if (mode === "study" && flipped && event.key === "1") grade("again");
      else if (mode === "study" && flipped && event.key === "2") grade("good");
      else if (mode === "browse" && event.key === "ArrowRight") step(1);
      else if (mode === "browse" && event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, flipped, grade, mode, step]);

  const options = (
    <div className="flex w-full flex-col gap-3 sm:flex-row">
      <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={selectClass} aria-label="Number of cards">
        {[10, 15, 25, 40].map((n) => (
          <option key={n} value={n}>
            {n} cards
          </option>
        ))}
      </select>
      <input
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        placeholder="Focus on… (optional)"
        className={clsx(selectClass, "flex-1 px-4")}
      />
    </div>
  );

  if (!cards.length) {
    return (
      <EmptyPanel icon={Layers} title="Flashcards" body="Generate a deck from your notes, then study with spaced repetition.">
        {options}
        <button type="button" onClick={() => generate(true)} disabled={!!generating} className={btn.primary}>
          {generating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {generating ? "Creating flashcards…" : "Generate flashcards"}
        </button>
        {error && <ErrorNote>{error}</ErrorNote>}
      </EmptyPanel>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-5 sm:col-span-1">
          <p className="text-sm text-muted">Memory score</p>
          <p className="mt-1 font-display text-4xl font-bold">{memoryScore}%</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-good transition-all" style={{ width: `${memoryScore}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 rounded-2xl border border-line bg-surface p-5 text-center sm:col-span-2">
          {[
            ["Cards", cards.length],
            ["To review", queue.length],
            ["Mastered", mastered],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="font-display text-3xl font-bold">{value}</p>
              <p className="text-sm text-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-line bg-surface p-1 text-sm font-medium">
          {(["study", "browse"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                resetSession(cards);
              }}
              className={clsx("rounded-full px-4 py-1.5 capitalize", mode === m ? "bg-ink text-bg" : "text-muted hover:text-ink")}
            >
              {m}
            </button>
          ))}
        </div>
        {mode === "browse" && (
          <button
            type="button"
            onClick={() => {
              setOrder(shuffled(cards.map((c) => c.id)));
              setIndex(0);
              setFlipped(false);
            }}
            className={btn.ghost}
          >
            <Shuffle className="size-4" /> Shuffle
          </button>
        )}
      </div>

      {current ? (
        <div className="flex flex-col items-center gap-5">
          <p className="text-sm text-muted">
            {mode === "study" ? `${queue.length} left in this session · ${reviewed} reviewed` : `Card ${index + 1} of ${order.length}`}
          </p>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="flip-scene h-80 w-full max-w-2xl text-left"
            aria-label={flipped ? "Show question" : "Show answer"}
          >
            <div className={clsx("flip-card relative size-full", flipped && "is-flipped")}>
              {[
                { label: "Question", text: current.front, className: "" },
                { label: "Answer", text: current.back, className: "flip-back" },
              ].map((face) => (
                <div
                  key={face.label}
                  className={clsx(
                    "flip-face absolute inset-0 flex flex-col rounded-3xl border border-line bg-surface p-8 shadow-sm",
                    face.className,
                  )}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">{face.label}</span>
                  <div className="flex flex-1 items-center justify-center overflow-auto text-center">
                    <Markdown className="prose-lg">{face.text}</Markdown>
                  </div>
                  {!flipped && face.label === "Question" && (
                    <span className="text-center text-xs text-muted">Click or press Space to flip</span>
                  )}
                </div>
              ))}
            </div>
          </button>

          {mode === "study" ? (
            <div className={clsx("flex gap-3 transition", !flipped && "pointer-events-none opacity-0")}>
              <button type="button" onClick={() => grade("again")} className="rounded-full bg-bad-soft px-6 py-3 font-semibold text-bad">
                Still learning <kbd className="ml-1 opacity-60">1</kbd>
              </button>
              <button type="button" onClick={() => grade("good")} className="rounded-full bg-good-soft px-6 py-3 font-semibold text-good">
                Got it <kbd className="ml-1 opacity-60">2</kbd>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => step(-1)} className={btn.secondary} aria-label="Previous card">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" onClick={() => removeCard(current.id)} className={btn.ghost}>
                <Trash className="size-4" /> Delete card
              </button>
              <button type="button" onClick={() => step(1)} className={btn.secondary} aria-label="Next card">
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <EmptyPanel
          icon={Sparkles}
          title="All caught up!"
          body={`You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"}. Cards you missed will come back sooner.`}
        >
          <button
            type="button"
            onClick={() => {
              setQueue(shuffled(cards.map((c) => c.id)));
              setReviewed(0);
            }}
            className={btn.dark}
          >
            <RotateCcw className="size-4" /> Review all cards anyway
          </button>
        </EmptyPanel>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <details className="rounded-2xl border border-line bg-surface p-5">
        <summary className="cursor-pointer font-semibold">Make more cards</summary>
        <div className="mt-4 flex flex-col gap-3">
          {options}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => generate(false)} disabled={!!generating} className={btn.dark}>
              {generating === "more" ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Add to deck
            </button>
            <button
              type="button"
              onClick={() => window.confirm("Replace the whole deck and reset your progress?") && generate(true)}
              disabled={!!generating}
              className={btn.secondary}
            >
              {generating === "new" ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Replace deck
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
