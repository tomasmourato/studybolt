"use client";

import { useCallback, useEffect, useState } from "react";
import { openFileUrl } from "./files";
import { getSet, listSets, subscribe } from "./store";
import type { StudySet, StudySetSummary } from "./types";

type SetPatch = Partial<StudySet> | ((set: StudySet) => Partial<StudySet>);

/**
 * Follows one study set in the browser store. Components get a fresh copy on every change,
 * including progress from jobs running in this tab or another one.
 */
export function useStudySet(id: string) {
  const [state, setState] = useState<{ set: StudySet | null; error: string | null }>({ set: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getSet(id)
        .then((set) => {
          if (cancelled) return;
          setState(
            set
              ? { set: structuredClone(set), error: null }
              : { set: null, error: "This study set isn't in this browser. Sets are saved only in the browser that created them." },
          );
        })
        .catch((err: Error) => !cancelled && setState({ set: null, error: err.message }));
    void load();
    const unsubscribe = subscribe((changed) => changed === id && void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [id]);

  /** Merges changes into the local copy right away; the store's next update replaces it. */
  const patch = useCallback((changes: SetPatch) => {
    setState((current) =>
      current.set
        ? { ...current, set: { ...current.set, ...(typeof changes === "function" ? changes(current.set) : changes) } }
        : current,
    );
  }, []);

  return { ...state, patch };
}

/** Summaries of every study set in this browser, newest first. */
export function useSetList() {
  const [state, setState] = useState<{ sets: StudySetSummary[] | null; error: string | null }>({ sets: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listSets()
        .then((sets) => !cancelled && setState({ sets, error: null }))
        .catch((err: Error) => !cancelled && setState({ sets: null, error: err.message }));
    void load();
    const unsubscribe = subscribe(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}

/** A URL for a stored file, released when the path changes or the component unmounts. Pass `version` to reload it. */
export function useFileUrl(path: string | undefined, version?: string | number) {
  const [opened, setOpened] = useState<{ key: string; url: string } | null>(null);
  const key = path ? `${path}#${version ?? ""}` : "";

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let release = () => {};
    openFileUrl(path)
      .then((file) => {
        if (!file) return;
        if (cancelled) return file.release();
        release = file.release;
        setOpened({ key, url: file.url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      release();
    };
  }, [path, key]);

  // A URL left over from a previous path is never shown.
  return opened?.key === key ? opened.url : null;
}
