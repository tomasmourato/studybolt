"use client";

import { FileUp, HardDrive, LoaderCircle, Mic, MonitorPlay, Plus, Search, TriangleAlert, Type } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { timeAgo } from "@/lib/client";
import { useSetList } from "@/lib/hooks";
import { AppHeader } from "./AppHeader";
import { KIND_META } from "./kinds";
import { NewSetDialog, type NewSetTab } from "./NewSetDialog";

const QUICK_ACTIONS: { tab: NewSetTab; title: string; body: string; icon: typeof Mic }[] = [
  { tab: "record", title: "Record lecture", body: "Capture class live", icon: Mic },
  { tab: "upload", title: "Upload file", body: "PDF, audio, video, docs", icon: FileUp },
  { tab: "youtube", title: "YouTube video", body: "Paste a link", icon: MonitorPlay },
  { tab: "text", title: "Paste text", body: "Notes or articles", icon: Type },
];

export function LibraryView() {
  const { sets, error } = useSetList();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; tab: NewSetTab }>({ open: false, tab: "upload" });

  const openDialog = (tab: NewSetTab) => setDialog({ open: true, tab });
  const needle = query.trim().toLowerCase();
  const visible = sets?.filter((s) => !needle || `${s.title} ${s.summary ?? ""}`.toLowerCase().includes(needle));

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader>
        <button
          type="button"
          onClick={() => openDialog("upload")}
          className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
        >
          <Plus className="size-4" /> New study set
        </button>
      </AppHeader>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
        <h1 className="font-display text-4xl font-bold tracking-tight">What are we learning today?</h1>

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map(({ tab, title, body, icon: Icon }) => (
            <button
              key={tab}
              type="button"
              onClick={() => openDialog(tab)}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-accent-ink">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted">{body}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">Your library</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <HardDrive className="size-3.5" /> Saved only in this browser
            </p>
          </div>
          {!!sets?.length && (
            <label className="flex w-full items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 sm:w-72">
              <Search className="size-4 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search study sets"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          )}
        </div>

        {error && <p className="mt-6 rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

        {!sets && !error && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface-2" />
            ))}
          </div>
        )}

        {sets?.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <p className="text-4xl">📚</p>
            <p className="mt-3 font-semibold">No study sets yet</p>
            <p className="mt-1 text-sm text-muted">Record a lecture or upload your first file to get started.</p>
          </div>
        )}

        {visible && visible.length > 0 && (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((set) => {
              const kind = KIND_META[set.kind];
              return (
                <li key={set.id}>
                  <Link
                    href={`/sets/${set.id}`}
                    className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-3xl leading-none">{set.emoji}</span>
                      {set.status === "processing" && (
                        <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                          <LoaderCircle className="size-3 animate-spin" /> {set.stage ?? "Processing"}
                        </span>
                      )}
                      {set.status === "error" && (
                        <span className="flex items-center gap-1.5 rounded-full bg-bad-soft px-2.5 py-1 text-xs font-medium text-bad">
                          <TriangleAlert className="size-3" /> Failed
                        </span>
                      )}
                    </div>
                    <h3 className="mt-4 line-clamp-2 font-semibold">{set.title}</h3>
                    {set.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{set.summary}</p>}
                    <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-muted">
                      <kind.icon className="size-3.5" />
                      <span>
                        {set.sourceCount > 1 ? `${set.sourceCount} sources` : kind.label}
                      </span>
                      <span>·</span>
                      <span>{timeAgo(set.createdAt)}</span>
                      {set.flashcardCount > 0 && (
                        <>
                          <span>·</span>
                          <span>{set.flashcardCount} cards</span>
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {visible?.length === 0 && !!sets?.length && (
          <p className="mt-6 text-sm text-muted">No study sets match “{query}”.</p>
        )}
      </main>

      <NewSetDialog
        open={dialog.open}
        initialTab={dialog.tab}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
      />
    </div>
  );
}
