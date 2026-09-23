"use client";

import clsx from "clsx";
import {
  FileText,
  FileUp,
  Image as ImageIcon,
  LoaderCircle,
  Mic,
  MonitorPlay,
  Plus,
  Type,
  Video,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createStudySet, type MaterialInput } from "@/lib/actions";
import { Recorder } from "./Recorder";

export type NewSetTab = "upload" | "record" | "youtube" | "text";

const TABS: { id: NewSetTab; label: string; icon: typeof FileUp }[] = [
  { id: "upload", label: "Upload", icon: FileUp },
  { id: "record", label: "Record", icon: Mic },
  { id: "youtube", label: "YouTube", icon: MonitorPlay },
  { id: "text", label: "Paste text", icon: Type },
];

const ACCEPT =
  ".pdf,.docx,.txt,.md,.csv,audio/*,video/*,.m4a,.mp3,.wav,.ogg,.flac,.aac,.opus,.webm,.mov,.mp4,image/png,image/jpeg,image/webp,.heic,.heif";

const MAX_MATERIALS = 10;

type Material = MaterialInput & { id: number };

let nextMaterialId = 1;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describeMaterial(material: Material) {
  if (material.type === "youtube") return { icon: MonitorPlay, label: material.url, meta: "YouTube" };
  if (material.type === "text") {
    return { icon: Type, label: material.text.slice(0, 80), meta: `${material.text.length.toLocaleString()} chars` };
  }
  const { file } = material;
  const icon =
    material.type === "recording" || file.type.startsWith("audio/")
      ? Mic
      : file.type.startsWith("video/")
        ? Video
        : file.type.startsWith("image/")
          ? ImageIcon
          : FileText;
  return { icon, label: file.name, meta: formatBytes(file.size) };
}

export function NewSetDialog({
  open,
  initialTab = "upload",
  onClose,
}: {
  open: boolean;
  initialTab?: NewSetTab;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<NewSetTab>(initialTab);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTab(initialTab);
      setError(null);
      setMaterials([]);
      setUrl("");
      setText("");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialTab]);

  const requestClose = useCallback(() => {
    if (busy) return;
    if (recording && !window.confirm("Stop and discard this recording?")) return;
    if (!recording && materials.length > 0 && !window.confirm("Discard the materials you added?")) return;
    onClose();
  }, [busy, recording, materials.length, onClose]);

  function add(items: MaterialInput[]) {
    const room = MAX_MATERIALS - materials.length;
    setError(items.length > room ? `You can combine up to ${MAX_MATERIALS} materials in one study set.` : null);
    const added = items.slice(0, Math.max(room, 0)).map((item) => ({ ...item, id: nextMaterialId++ }) as Material);
    if (added.length) setMaterials((prev) => [...prev, ...added]);
  }

  function addFiles(files: FileList | null | undefined) {
    add(Array.from(files ?? []).map((file) => ({ type: "file" as const, file })));
  }

  function addLink(event: { preventDefault(): void }) {
    event.preventDefault();
    const value = url.trim();
    if (!/^(https?:\/\/)?([\w-]+\.)?(youtube\.com|youtu\.be)\//i.test(value)) {
      setError("That doesn't look like a YouTube video link.");
      return;
    }
    add([{ type: "youtube", url: value }]);
    setUrl("");
  }

  function addText(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (value.length < 40) {
      setError("Paste at least a few sentences so there's something to learn from.");
      return;
    }
    add([{ type: "text", text: value }]);
    setText("");
  }

  async function create() {
    if (!materials.length) return;
    setBusy(true);
    setError(null);
    try {
      // Files are saved in this browser; they're uploaded to Gemini as the set is processed.
      const set = await createStudySet(materials);
      router.push(`/sets/${set.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
      className="m-auto w-[min(680px,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div>
          <h2 className="font-display text-xl font-bold">New study set</h2>
          <p className="text-sm text-muted">Add one or more materials. They&apos;re combined into a single set of notes.</p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-line px-4 pt-2" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            disabled={busy || recording}
            onClick={() => setTab(id)}
            className={clsx(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition disabled:opacity-50",
              tab === id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      <div className="relative">
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {tab === "upload" && (
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                addFiles(event.dataTransfer.files);
              }}
              className={clsx(
                "flex h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition",
                dragging ? "border-accent bg-accent-soft" : "border-line hover:border-muted hover:bg-surface-2",
              )}
            >
              <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
                <FileUp className="size-5" />
              </span>
              <span className="font-semibold">Drop files here or click to browse</span>
              <span className="max-w-sm text-sm text-muted">
                Select several at once: PDF, Word, audio, video, images or text · up to 500 MB total
              </span>
              <input
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          )}

          {tab === "record" && (
            <Recorder
              onComplete={(file) => add([{ type: "recording", file }])}
              onActiveChange={setRecording}
            />
          )}

          {tab === "youtube" && (
            <form onSubmit={addLink} className="flex flex-col gap-3">
              <p className="text-sm text-muted">Add links to public YouTube videos, one at a time.</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  autoFocus
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => {
                    // Handled here because implicit form submission isn't reliable inside the dialog.
                    if (event.key === "Enter") addLink(event);
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2.5 outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 font-semibold transition hover:bg-surface-2 disabled:opacity-50"
                >
                  <Plus className="size-4" /> Add
                </button>
              </div>
            </form>
          )}

          {tab === "text" && (
            <form onSubmit={addText} className="flex flex-col gap-3">
              <textarea
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste lecture notes, an article, a textbook chapter…"
                className="h-40 resize-none rounded-xl border border-line bg-bg px-4 py-3 outline-none focus:border-accent"
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">{text.length.toLocaleString()} characters</span>
                <button
                  type="submit"
                  disabled={text.trim().length < 40}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 font-semibold transition hover:bg-surface-2 disabled:opacity-50"
                >
                  <Plus className="size-4" /> Add text
                </button>
              </div>
            </form>
          )}

          {error && <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

          {materials.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">
                Materials ({materials.length}/{MAX_MATERIALS})
              </p>
              <ul className="flex flex-col gap-2">
                {materials.map((material) => {
                  const { icon: Icon, label, meta } = describeMaterial(material);
                  return (
                    <li key={material.id} className="flex items-center gap-3 rounded-xl border border-line bg-bg px-3 py-2">
                      <Icon className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                      <span className="shrink-0 text-xs text-muted">{meta}</span>
                      <button
                        type="button"
                        onClick={() => setMaterials((prev) => prev.filter((m) => m.id !== material.id))}
                        className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
                        aria-label={`Remove ${label}`}
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <p className="text-sm text-muted">
            {materials.length ? "Add more, or create the set when you're ready." : "Add at least one material to start."}
          </p>
          <button
            type="button"
            onClick={create}
            disabled={!materials.length || busy || recording}
            className="shrink-0 rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:opacity-50"
          >
            Create study set
          </button>
        </div>

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/90">
            <LoaderCircle className="size-8 animate-spin text-accent" />
            <p className="font-semibold">Getting started…</p>
          </div>
        )}
      </div>
    </dialog>
  );
}
