"use client";

import clsx from "clsx";
import {
  BookOpenText,
  Check,
  CirclePlay,
  Compass,
  ExternalLink,
  FileText,
  GraduationCap,
  Library,
  LoaderCircle,
  MonitorPlay,
  Newspaper,
  PenLine,
  Play,
  RefreshCw,
  School,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { hideResource, searchResources } from "@/lib/actions";
import type {
  Resource,
  ResourceLanguageMode,
  ResourceSearch,
  ResourceType,
  SearchProvider,
} from "@/lib/types";
import { EmptyPanel, ErrorNote, btn, selectClass, type TabProps } from "./ui";

const TYPE_META: Record<ResourceType, { label: string; plural: string; icon: LucideIcon }> = {
  video: { label: "Video", plural: "Videos", icon: CirclePlay },
  exercises: { label: "Exercises", plural: "Exercises", icon: PenLine },
  book: { label: "Book", plural: "Books", icon: BookOpenText },
  course: { label: "Course", plural: "Courses", icon: School },
  article: { label: "Article", plural: "Articles", icon: Newspaper },
};

const TYPE_ORDER: ResourceType[] = ["video", "exercises", "book", "course", "article"];

const PROVIDER_META: Record<SearchProvider, { label: string; icon: LucideIcon }> = {
  youtube: { label: "YouTube", icon: MonitorPlay },
  google: { label: "Google", icon: Search },
  google_pdf: { label: "PDFs on Google", icon: FileText },
  khan: { label: "Khan Academy", icon: GraduationCap },
  archive: { label: "Internet Archive", icon: Library },
};

const STEPS = [
  { status: "planning", label: "Reading your notes" },
  { status: "checking", label: "Searching and checking links" },
  { status: "curating", label: "Picking the best materials" },
] as const;

function SearchOptions({
  languageMode,
  setLanguageMode,
  focus,
  setFocus,
}: {
  languageMode: ResourceLanguageMode;
  setLanguageMode: (mode: ResourceLanguageMode) => void;
  focus: string;
  setFocus: (focus: string) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row">
      <select
        value={languageMode}
        onChange={(e) => setLanguageMode(e.target.value as ResourceLanguageMode)}
        className={selectClass}
        aria-label="Language"
      >
        <option value="mixed">My notes&apos; language + English</option>
        <option value="native">Only my notes&apos; language</option>
      </select>
      <input
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        placeholder="Focus on… (optional)"
        className={clsx(selectClass, "flex-1 px-4")}
      />
    </div>
  );
}

export function ResourcesTab({ set, patch }: TabProps) {
  const resources = set.resources;
  const [languageMode, setLanguageMode] = useState<ResourceLanguageMode>(resources?.languageMode ?? "mixed");
  const [focus, setFocus] = useState(resources?.focus ?? "");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResourceType | "all">("all");
  const [playing, setPlaying] = useState<string | null>(null);

  async function search() {
    setStarting(true);
    setError(null);
    try {
      const next = await searchResources(set.id, { languageMode, focus });
      patch({ resources: next });
      setFilter("all");
      setPlaying(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the search.");
    } finally {
      setStarting(false);
    }
  }

  function hide(item: Resource) {
    patch((s) => (s.resources ? { resources: { ...s.resources, items: s.resources.items.filter((i) => i.id !== item.id) } } : {}));
    hideResource(set.id, item.id).catch(() => {});
  }

  const searchButton = (label: string) => (
    <button type="button" onClick={search} disabled={starting} className={btn.primary}>
      {starting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {label}
    </button>
  );

  if (!resources || resources.status === "error") {
    return (
      <EmptyPanel
        icon={Compass}
        title="Online resources"
        body="Find free videos, exercise sheets, books and courses that match your notes. Every link is checked before it's shown."
      >
        {resources?.error && <ErrorNote>{resources.error}</ErrorNote>}
        <SearchOptions languageMode={languageMode} setLanguageMode={setLanguageMode} focus={focus} setFocus={setFocus} />
        {searchButton(resources ? "Try again" : "Find resources")}
        {error && <ErrorNote>{error}</ErrorNote>}
      </EmptyPanel>
    );
  }

  if (resources.status !== "ready") {
    const current = STEPS.findIndex((step) => step.status === resources.status);
    return (
      <EmptyPanel icon={Compass} title="Finding resources" body="This usually takes under a minute.">
        <ol className="flex w-full max-w-xs flex-col gap-3 text-left">
          {STEPS.map((step, i) => (
            <li key={step.status} className="flex items-center gap-3">
              <span
                className={clsx(
                  "grid size-7 place-items-center rounded-full text-sm",
                  i < current ? "bg-good text-white" : i === current ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
                )}
              >
                {i < current ? <Check className="size-4" /> : i === current ? <LoaderCircle className="size-4 animate-spin" /> : i + 1}
              </span>
              <span className={clsx(i > current && "text-muted")}>{step.label}</span>
            </li>
          ))}
        </ol>
      </EmptyPanel>
    );
  }

  const counts = new Map<ResourceType, number>();
  for (const item of resources.items) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  const visible = resources.items.filter((item) => filter === "all" || item.type === filter);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by type">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={resources.items.length} />
          {TYPE_ORDER.filter((type) => counts.has(type)).map((type) => (
            <FilterChip
              key={type}
              active={filter === type}
              onClick={() => setFilter(type)}
              label={TYPE_META[type].plural}
              count={counts.get(type)!}
              icon={TYPE_META[type].icon}
            />
          ))}
        </div>
        <details className="group relative">
          <summary className={clsx(btn.secondary, "cursor-pointer list-none")}>
            <RefreshCw className="size-4" /> Search again
          </summary>
          <div className="absolute right-0 z-10 mt-2 flex w-[min(28rem,calc(100vw-2.5rem))] flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lg">
            <SearchOptions languageMode={languageMode} setLanguageMode={setLanguageMode} focus={focus} setFocus={setFocus} />
            <div className="self-end">{searchButton("Find new resources")}</div>
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
        </details>
      </div>

      {visible.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <li key={item.id}>
              <ResourceCard
                item={item}
                notesLanguage={resources.language}
                playing={playing === item.id}
                onPlay={() => setPlaying(item.id)}
                onHide={() => hide(item)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-muted">
          {resources.items.length
            ? "Nothing of this type. Pick another filter."
            : "No checked links turned up this time. Try the searches below, or search again with a focus."}
        </p>
      )}

      {resources.searches.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold">Keep exploring</h2>
          <p className="mt-1 text-sm text-muted">Ready-made searches that open on other sites.</p>
          {resources.videoSource === "suggested" && !counts.has("video") && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
              <MonitorPlay className="mt-0.5 size-4 shrink-0" />
              <span>
                Want specific videos in the list above? Add a free <code className="font-mono">YOUTUBE_API_KEY</code> to{" "}
                <code className="font-mono">.env.local</code> (see the README). Until then, use the YouTube searches below.
              </span>
            </p>
          )}
          <ul className="mt-4 flex flex-wrap gap-2">
            {resources.searches.map((s) => (
              <li key={s.url}>
                <SearchChip search={s} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted">
        Picked by Gemini from Wikibooks, Wikipedia, LibreTexts, the Internet Archive and well-known educational sites.
        Links were checked when this list was made.
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
        active ? "border-ink bg-ink text-bg" : "border-line bg-surface text-muted hover:text-ink",
      )}
    >
      {Icon && <Icon className="size-4" />}
      {label}
      <span className={clsx("text-xs", active ? "opacity-70" : "opacity-60")}>{count}</span>
    </button>
  );
}

function ResourceCard({
  item,
  notesLanguage,
  playing,
  onPlay,
  onHide,
}: {
  item: Resource;
  notesLanguage?: string;
  playing: boolean;
  onPlay: () => void;
  onHide: () => void;
}) {
  const meta = TYPE_META[item.type];
  const showLanguage = item.language && item.language !== notesLanguage;

  return (
    <article className="group/card relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:shadow-md">
      {item.videoId && (
        <div className="relative aspect-video bg-black">
          {playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1`}
              title={item.title}
              className="size-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button type="button" onClick={onPlay} className="group/play size-full" aria-label={`Play ${item.title}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.thumbnail} alt="" className="size-full object-cover" loading="lazy" />
              <span className="absolute inset-0 grid place-items-center bg-black/10 transition group-hover/play:bg-black/30">
                <span className="grid size-12 place-items-center rounded-full bg-white/90 text-[#17161b] shadow">
                  <Play className="ml-0.5 size-5 fill-current" />
                </span>
              </span>
            </button>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2 pr-6 text-xs font-medium text-muted">
          <meta.icon className="size-3.5 shrink-0" />
          <span className="truncate">{meta.label} · {item.source}</span>
          {showLanguage && (
            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 uppercase">{item.language}</span>
          )}
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 line-clamp-2 font-semibold hover:text-accent hover:underline"
        >
          {item.title}
        </a>
        {item.description && <p className="mt-2 line-clamp-3 text-sm text-muted">{item.description}</p>}
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-auto inline-flex items-center gap-1.5 self-start pt-4 text-sm font-medium text-accent hover:underline"
        >
          {item.videoId ? "Open on YouTube" : "Open"} <ExternalLink className="size-3.5" />
        </a>
      </div>

      <button
        type="button"
        onClick={onHide}
        className={clsx(
          "absolute right-2 grid size-7 place-items-center rounded-full text-muted opacity-0 transition hover:bg-surface-2 hover:text-ink focus:opacity-100 group-hover/card:opacity-100",
          item.videoId ? "top-[calc(56.25%+0.5rem)]" : "top-3",
        )}
        aria-label={`Hide ${item.title}`}
        title="Hide this suggestion"
      >
        <X className="size-4" />
      </button>
    </article>
  );
}

function SearchChip({ search }: { search: ResourceSearch }) {
  const { label, icon: Icon } = PROVIDER_META[search.provider];
  return (
    <a
      href={search.url}
      target="_blank"
      rel="noreferrer"
      title={search.query}
      className="flex max-w-full items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm transition hover:border-accent"
    >
      <Icon className="size-4 shrink-0 text-muted" />
      <span className="truncate">{search.label}</span>
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <ExternalLink className="size-3.5 shrink-0 text-muted" />
    </a>
  );
}
