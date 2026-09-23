"use client";

import { ExternalLink, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { forgetApiKey, getApiKey, isApiKeyRemembered, maskApiKey, subscribeApiKey } from "@/lib/api-key";
import { AI_STUDIO_KEYS_URL } from "@/lib/brand";

/** Header button that shows which Gemini key is in use and lets the student remove it. */
export function KeyMenu() {
  const key = useSyncExternalStore(subscribeApiKey, getApiKey, () => null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!key) return null;

  function remove() {
    if (!window.confirm("Remove your Gemini key from this browser? You'll be asked for a key again.")) return;
    setOpen(false);
    forgetApiKey();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <KeyRound className="size-4" />
        <span className="hidden sm:inline">Gemini key</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl border border-line bg-surface p-4 text-sm shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your Gemini key</p>
          <p className="mt-1 font-mono">{maskApiKey(key)}</p>
          <p className="mt-1 text-muted">
            {isApiKeyRemembered() ? "Remembered on this device." : "Kept only until you close this tab."}
          </p>
          <p className="mt-3 flex gap-2 rounded-xl bg-good-soft px-3 py-2 text-good">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" /> Sent only to Google, never to our servers.
          </p>
          <div className="mt-3 flex flex-col gap-1">
            <button
              type="button"
              onClick={remove}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-bad hover:bg-bad-soft"
            >
              <Trash2 className="size-4" /> Remove or change key
            </button>
            <a
              href={AI_STUDIO_KEYS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <ExternalLink className="size-4" /> Manage keys in AI Studio
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
