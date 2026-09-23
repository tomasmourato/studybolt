import * as db from "./db";
import { heldLockNames } from "./locks";
import type { StudySet, StudySetSummary } from "./types";

// Study sets are cached in memory and saved to IndexedDB in this browser. Nothing is stored on a server.
const sets = new Map<string, StudySet>();
let ready: Promise<void> | null = null;
const writes = new Map<string, Promise<void>>();
const queued = new Set<string>();
const listeners = new Set<(id: string) => void>();
let channel: BroadcastChannel | null = null;

const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
export const isValidId = (id: string) => ID_RE.test(id);

const emit = (id: string) => listeners.forEach((listener) => listener(id));

/** Calls the listener with a set's id whenever that set changes, is created or is deleted. */
export function subscribe(listener: (id: string) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Clears work that was in flight when its tab closed. Work still running in another open tab holds a lock
 * named after it, so it's left alone. Returns true if anything changed.
 */
function normalize(set: StudySet, running: Set<string>) {
  let changed = false;
  const { id } = set;
  if (set.status === "processing" && !running.has(`process:${id}`)) {
    set.status = "error";
    set.stage = undefined;
    set.error = "Processing stopped because the tab was closed. Try again.";
    changed = true;
  }
  if ((set.podcast.status === "scripting" || set.podcast.status === "voicing") && !running.has(`podcast:${id}`)) {
    set.podcast = { ...set.podcast, status: "error", error: "Podcast generation stopped because the tab was closed." };
    changed = true;
  }
  const resourcesStatus = set.resources?.status;
  if (
    (resourcesStatus === "planning" || resourcesStatus === "checking" || resourcesStatus === "curating") &&
    !running.has(`resources:${id}`)
  ) {
    set.resources = { ...set.resources!, status: "error", error: "The search stopped because the tab was closed. Try again." };
    changed = true;
  }
  if (set.lesson?.status === "generating" && !running.has(`lesson:${id}`)) {
    set.lesson = { ...set.lesson, status: "error", error: "Lesson generation stopped because the tab was closed. Try again." };
    changed = true;
  }
  for (const section of set.lesson?.sections ?? []) {
    if (section.audio?.status === "generating" && !running.has(`audio:${id}:${section.id}`)) {
      section.audio = undefined;
      changed = true;
    }
    if (section.image?.media?.status === "generating" && !running.has(`image:${id}:${section.id}`)) {
      section.image.media = undefined;
      changed = true;
    }
  }
  return changed;
}

/** Keeps this tab's cache in step with changes saved by other open tabs. */
function followOtherTabs() {
  if (typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel("studybolt-sets");
  channel.onmessage = async (event: MessageEvent<{ id?: string }>) => {
    const id = event.data?.id;
    // A pending write from this tab is newer than whatever the other tab saved.
    if (!id || queued.has(id)) return;
    const fresh = await db.readSet(id).catch(() => undefined);
    if (fresh) sets.set(id, fresh);
    else sets.delete(id);
    emit(id);
  };
}

async function load() {
  const [stored, running] = await Promise.all([db.readAllSets(), heldLockNames()]);
  for (const set of stored) {
    const changed = normalize(set, running);
    sets.set(set.id, set);
    if (changed) void persist(set.id);
  }
  followOtherTabs();
}

export function ensureLoaded() {
  ready ??= load().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

async function writeSet(id: string) {
  const set = sets.get(id);
  if (set) await db.writeSet(set);
  else await db.removeSet(id);
  channel?.postMessage({ id });
}

/** Queues a write of the set's latest state. Writes that pile up while one is running collapse into one. */
function persist(id: string): Promise<void> {
  if (queued.has(id)) return writes.get(id)!;
  queued.add(id);
  const next = (writes.get(id) ?? Promise.resolve()).then(async () => {
    queued.delete(id);
    try {
      await writeSet(id);
    } catch (err) {
      console.error(`Failed to save set ${id}:`, err);
    }
  });
  writes.set(id, next);
  return next;
}

export function summarize(s: StudySet): StudySetSummary {
  return {
    id: s.id,
    title: s.title,
    emoji: s.emoji,
    summary: s.summary,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    status: s.status,
    stage: s.stage,
    kind: s.sources[0].kind,
    sourceCount: s.sources.length,
    flashcardCount: s.flashcards.length,
    quizCount: s.quiz.length,
  };
}

export async function listSets(): Promise<StudySetSummary[]> {
  await ensureLoaded();
  return [...sets.values()].sort((a, b) => b.createdAt - a.createdAt).map(summarize);
}

export async function getSet(id: string): Promise<StudySet | undefined> {
  if (!isValidId(id)) return undefined;
  await ensureLoaded();
  return sets.get(id);
}

export async function createSet(set: StudySet) {
  await ensureLoaded();
  // Written straight away (not queued) so a full disk is reported to the student.
  await db.writeSet(set);
  sets.set(set.id, set);
  channel?.postMessage({ id: set.id });
  emit(set.id);
  // Asks the browser not to clear StudyBolt's storage when space runs low. Browsers may say no.
  void navigator.storage?.persist?.().catch(() => {});
}

/** Applies a synchronous mutation to the cached set and saves it. */
export async function updateSet(id: string, mutate: (set: StudySet) => void): Promise<StudySet | undefined> {
  const set = await getSet(id);
  if (!set) return undefined;
  mutate(set);
  set.updatedAt = Date.now();
  emit(id);
  await persist(id);
  return set;
}

export async function deleteSet(id: string) {
  const set = await getSet(id);
  if (!set) return false;
  sets.delete(id);
  emit(id);
  await Promise.all([
    persist(id),
    db.removeFiles(`uploads/${id}/`),
    db.removeFiles(`audio/${id}.`),
    db.removeFiles(`lessons/${id}/`),
  ]);
  return true;
}

// ---------- Files: uploads, podcast audio, lesson illustrations and narration ----------

export const saveFile = (path: string, data: Blob) => db.writeFile(path, data);
export const readFile = (path: string) => db.readFile(path);
export const deleteFiles = (prefix: string) => db.removeFiles(prefix);
