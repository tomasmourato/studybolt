"use client";

import { Check, Copy, Download, LoaderCircle, Pencil, RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { retryStudySet, saveNotes } from "@/lib/actions";
import { Markdown } from "../Markdown";
import { EmptyPanel, ErrorNote, btn, type TabProps } from "./ui";

export function NotesTab({ set, patch }: TabProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setError(null);
    try {
      await retryStudySet(set.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed.");
    }
  }

  async function save() {
    if (draft === null) return;
    setSaving(true);
    setError(null);
    try {
      await saveNotes(set.id, draft);
      patch({ notes: draft });
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(set.notes);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([`# ${set.title}\n\n${set.notes}`], { type: "text/markdown" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${set.title.replace(/[\\/:*?"<>|]+/g, "") || "notes"}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (set.status === "error") {
    return (
      <EmptyPanel icon={TriangleAlert} title="We couldn't create these notes" body={set.error ?? "Something went wrong."}>
        <button type="button" onClick={retry} className={btn.primary}>
          <RotateCcw className="size-4" /> Try again
        </button>
        {error && <ErrorNote>{error}</ErrorNote>}
      </EmptyPanel>
    );
  }

  if (set.status === "processing") {
    return (
      <div>
        <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent">
          <LoaderCircle className="size-4 animate-spin" /> {set.stage ?? "Working"}…
        </p>
        {set.notes ? (
          <Markdown streaming>{set.notes}</Markdown>
        ) : (
          <div className="space-y-3" aria-hidden>
            {[90, 75, 82, 60, 70].map((width, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${width}%` }} />
            ))}
            <p className="pt-4 text-sm text-muted">
              Long recordings and videos can take a minute or two to upload and process. Keep this tab open until
              the notes are done.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (draft !== null) {
    return (
      <div className="flex flex-col gap-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-[65vh] w-full rounded-xl border border-line bg-surface p-4 font-mono text-sm leading-relaxed outline-none focus:border-accent"
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setDraft(null)} className={btn.secondary} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={save} className={btn.dark} disabled={saving}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Save notes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {set.summary && <p className="mb-6 text-lg text-muted">{set.summary}</p>}
      <div className="mb-4 flex justify-end gap-1">
        <button type="button" onClick={() => setDraft(set.notes)} className={btn.ghost}>
          <Pencil className="size-4" /> Edit
        </button>
        <button type="button" onClick={copy} className={btn.ghost}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={download} className={btn.ghost}>
          <Download className="size-4" /> Download
        </button>
      </div>
      <article className="rounded-2xl border border-line bg-surface px-6 py-8 sm:px-10">
        <Markdown>{set.notes}</Markdown>
      </article>
    </div>
  );
}
