"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  Compass,
  FileText,
  GraduationCap,
  Headphones,
  Layers,
  ListChecks,
  LoaderCircle,
  MessageCircle,
  NotebookPen,
  Trash,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteStudySet, renameStudySet } from "@/lib/actions";
import { APP_NAME } from "@/lib/brand";
import { timeAgo } from "@/lib/client";
import { useStudySet } from "@/lib/hooks";
import { AppHeader } from "../AppHeader";
import { KIND_META } from "../kinds";
import { ChatTab } from "./ChatTab";
import { FlashcardsTab } from "./FlashcardsTab";
import { LessonTab } from "./LessonTab";
import { NotesTab } from "./NotesTab";
import { PodcastTab } from "./PodcastTab";
import { QuizTab } from "./QuizTab";
import { ResourcesTab } from "./ResourcesTab";
import { SourceTab } from "./SourceTab";
import { EmptyPanel, btn } from "./ui";

const TABS = [
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "lesson", label: "Lesson", icon: GraduationCap },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "quiz", label: "Quiz", icon: ListChecks },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "podcast", label: "Podcast", icon: Headphones },
  { id: "resources", label: "Resources", icon: Compass },
  { id: "source", label: "Source", icon: FileText },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function SetWorkspace({ id }: { id: string }) {
  const router = useRouter();
  // The set follows the browser store, so progress from background jobs shows up without polling.
  const { set, error: loadError, patch } = useStudySet(id);
  const [tab, setTab] = useState<TabId>("notes");
  const [editingTitle, setEditingTitle] = useState(false);

  const title = set?.title;
  useEffect(() => {
    if (title) document.title = `${title} · ${APP_NAME}`;
  }, [title]);

  async function saveTitle(title: string) {
    setEditingTitle(false);
    if (!set || !title.trim() || title.trim() === set.title) return;
    patch({ title: title.trim() });
    await renameStudySet(id, title);
  }

  async function remove() {
    if (!set || !window.confirm(`Delete “${set.title}”? This can't be undone.`)) return;
    await deleteStudySet(id);
    router.push("/library");
  }

  if (!set) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader />
        <main className="grid flex-1 place-items-center px-5 text-center">
          {loadError ? (
            <div>
              <p className="text-4xl">🔍</p>
              <p className="mt-3 font-semibold">{loadError}</p>
              <Link href="/library" className={clsx(btn.secondary, "mt-5")}>
                Back to library
              </Link>
            </div>
          ) : (
            <LoaderCircle className="size-8 animate-spin text-muted" />
          )}
        </main>
      </div>
    );
  }

  const [primary] = set.sources;
  const kind = KIND_META[primary.kind];
  const needsNotes = set.status !== "ready" && tab !== "notes" && tab !== "source";
  const width = tab === "lesson" ? "max-w-7xl" : "max-w-5xl";

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader>
        <Link href="/library" className={btn.ghost}>
          <ArrowLeft className="size-4" /> Library
        </Link>
      </AppHeader>

      <div className={clsx("mx-auto w-full px-5 pt-8", width)}>
        <div className="flex items-start gap-4">
          <span className="text-5xl leading-none">{set.emoji}</span>
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input
                autoFocus
                defaultValue={set.title}
                onBlur={(event) => saveTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setEditingTitle(false);
                }}
                className="w-full rounded-lg border border-accent bg-surface px-2 py-1 font-display text-3xl font-bold outline-none"
              />
            ) : (
              <h1
                onClick={() => set.status !== "processing" && setEditingTitle(true)}
                title="Click to rename"
                className="cursor-text font-display text-3xl font-bold tracking-tight sm:text-4xl"
              >
                {set.title}
              </h1>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <kind.icon className="size-4" />
              <span className="max-w-[40ch] truncate" title={set.sources.map((s) => s.name).join(", ")}>
                {set.sources.length > 1 ? `${set.sources.length} sources` : primary.name}
              </span>
              <span>·</span>
              <span>{timeAgo(set.createdAt)}</span>
            </p>
          </div>
          <button type="button" onClick={remove} className={btn.ghost} aria-label="Delete study set">
            <Trash className="size-4" />
          </button>
        </div>

        <nav className="sticky top-14 z-20 -mx-5 mt-6 overflow-x-auto border-b border-line bg-bg/90 px-5 backdrop-blur" role="tablist">
          <div className="flex min-w-max gap-1">
            {TABS.map(({ id: tabId, label, icon: Icon }) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={tab === tabId}
                onClick={() => setTab(tabId)}
                className={clsx(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition",
                  tab === tabId ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                <Icon className="size-4" />
                {label}
                {tabId === "flashcards" && set.flashcards.length > 0 && (
                  <span className="rounded-full bg-surface-2 px-1.5 text-xs">{set.flashcards.length}</span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <main className={clsx("mx-auto w-full flex-1 px-5 py-8", width)}>
        {needsNotes ? (
          <EmptyPanel
            icon={set.status === "error" ? NotebookPen : LoaderCircle}
            title={set.status === "error" ? "Notes need to be created first" : "Hang tight"}
            body={
              set.status === "error"
                ? "Something went wrong creating the notes. Retry from the Notes tab."
                : "This unlocks as soon as your notes are ready."
            }
          />
        ) : (
          <>
            {tab === "notes" && <NotesTab set={set} patch={patch} />}
            {tab === "lesson" && <LessonTab set={set} patch={patch} />}
            {tab === "flashcards" && <FlashcardsTab set={set} patch={patch} />}
            {tab === "quiz" && <QuizTab set={set} patch={patch} />}
            {tab === "chat" && <ChatTab set={set} patch={patch} />}
            {tab === "podcast" && <PodcastTab set={set} patch={patch} />}
            {tab === "resources" && <ResourcesTab set={set} patch={patch} />}
            {tab === "source" && <SourceTab set={set} patch={patch} />}
          </>
        )}
      </main>
    </div>
  );
}
