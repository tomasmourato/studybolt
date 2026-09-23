/*
 * Everything the study-set screens can do. These used to be server routes; they now run in the browser,
 * talk to Gemini with the student's own key and save to the browser's storage.
 */

import { nanoid } from "nanoid";
import { streamChatReply } from "./chat";
import { describeError, generateJson } from "./gemini";
import { isRunning, startPodcast, startProcessing } from "./jobs";
import { ensureSectionAudio, ensureSectionImage, startLesson } from "./lesson";
import {
  FLASHCARDS_SCHEMA,
  QUIZ_SCHEMA,
  chatSystem,
  flashcardsPrompt,
  lessonChatSystem,
  quizPrompt,
  type QuizDifficulty,
} from "./prompts";
import { startResources } from "./resources";
import { shuffleOptions } from "./shuffle";
import { MAX_SOURCES, MAX_UPLOAD_BYTES, classifyFile, extractDocxText, parseYouTubeUrl, playbackType } from "./sources";
import { createSet, deleteFiles, deleteSet, getSet, saveFile, updateSet } from "./store";
import type {
  Flashcard,
  LessonLength,
  LessonLevel,
  QuizQuestion,
  ResourceLanguageMode,
  SourceInfo,
  SourceKind,
  StudySet,
} from "./types";

// Components keep what actions return in React state, so they get copies, never the store's own objects.
const copy = <T>(value: T): T => structuredClone(value);

async function requireSet(id: string) {
  const set = await getSet(id);
  if (!set) throw new Error("Study set not found.");
  return set;
}

async function requireReady(id: string) {
  const set = await requireSet(id);
  if (set.status !== "ready") throw new Error("Wait for the notes to finish first.");
  return set;
}

/** Runs a Gemini request, turning failures into a message worth showing. */
async function gemini<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`${label} failed:`, err);
    throw new Error(describeError(err));
  }
}

const focusText = (focus?: string) => focus?.trim().slice(0, 300) || undefined;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// ---------- Creating study sets ----------

export type MaterialInput =
  | { type: "file" | "recording"; file: File }
  | { type: "youtube"; url: string }
  | { type: "text"; text: string };

const DEFAULT_EMOJI: Record<SourceKind, string> = {
  pdf: "📄",
  audio: "🎙️",
  video: "🎬",
  youtube: "▶️",
  image: "🖼️",
  document: "📝",
  text: "✍️",
};

const MAX_TEXT_CHARS = 1_000_000;

/** Validates every material and saves uploaded files in this browser. */
async function readSources(materials: MaterialInput[], id: string): Promise<SourceInfo[]> {
  if (!materials.length) throw new Error("Add at least one file, YouTube link or piece of text.");
  if (materials.length > MAX_SOURCES) throw new Error(`You can combine up to ${MAX_SOURCES} materials in one study set.`);
  const totalBytes = materials.reduce((sum, m) => sum + (m.type === "file" || m.type === "recording" ? m.file.size : 0), 0);
  if (totalBytes > MAX_UPLOAD_BYTES) throw new Error("Uploads can add up to 500 MB per study set.");

  const textCount = materials.filter((m) => m.type === "text").length;
  let textIndex = 0;
  const sources: SourceInfo[] = [];
  for (const [i, material] of materials.entries()) {
    if (material.type === "youtube") {
      const url = parseYouTubeUrl(material.url);
      if (!url) throw new Error(`“${material.url.trim().slice(0, 80)}” doesn't look like a YouTube video link.`);
      sources.push({ kind: "youtube", name: "YouTube video", url });
      continue;
    }
    if (material.type === "text") {
      const text = material.text.trim();
      textIndex++;
      if (text.length < 40) throw new Error("Paste at least a few sentences of text so there's something to learn from.");
      if (text.length > MAX_TEXT_CHARS) throw new Error("That's more text than we can handle at once.");
      sources.push({ kind: "text", name: textCount > 1 ? `Pasted text ${textIndex}` : "Pasted text", text });
      continue;
    }

    const { file } = material;
    const name = file.name || "Upload";
    const classified = classifyFile(name, file.type);
    if (!file.size) throw new Error(`“${name}” is empty.`);
    if (!classified) {
      throw new Error(`“${name}” isn't a supported file type. Try PDF, Word, audio, video, image or text files.`);
    }
    if (classified.kind === "document" || classified.kind === "text") {
      const text =
        classified.kind === "document" ? await extractDocxText(await file.arrayBuffer()).catch(() => "") : (await file.text()).trim();
      if (!text) throw new Error(`Couldn't read any text from “${name}”.`);
      sources.push({ kind: classified.kind, name, mimeType: classified.mimeType, size: file.size, text: text.slice(0, MAX_TEXT_CHARS) });
      continue;
    }

    // The index prefix keeps two uploads with the same name apart.
    const safeName = name.replace(/[^\w.\- ]+/g, "_").replace(/^\.*$/, "upload").slice(-120);
    const localFile = `uploads/${id}/${i + 1}-${safeName}`;
    await saveFile(localFile, new Blob([file], { type: playbackType(classified.mimeType) }));
    sources.push({
      kind: classified.kind,
      name,
      mimeType: classified.mimeType,
      size: file.size,
      localFile,
      recorded: material.type === "recording",
    });
  }
  return sources;
}

export async function createStudySet(materials: MaterialInput[]): Promise<StudySet> {
  const id = nanoid(12);
  let sources: SourceInfo[];
  try {
    sources = await readSources(materials, id);
  } catch (err) {
    await deleteFiles(`uploads/${id}/`).catch(() => {});
    throw err;
  }

  const [first] = sources;
  const now = Date.now();
  const set: StudySet = {
    id,
    title:
      sources.length > 1
        ? `${sources.length} study materials`
        : first.recorded
          ? "Lecture recording"
          : first.name.replace(/\.[^.]+$/, ""),
    emoji: sources.length > 1 ? "📚" : DEFAULT_EMOJI[first.kind],
    createdAt: now,
    updatedAt: now,
    status: "processing",
    stage: "Starting",
    sources,
    notes: "",
    flashcards: [],
    quiz: [],
    quizAttempts: [],
    chat: [],
    podcast: { status: "idle" },
  };
  try {
    await createSet(set);
  } catch (err) {
    await deleteFiles(`uploads/${id}/`).catch(() => {});
    throw err;
  }
  startProcessing(id);
  return copy(set);
}

export async function retryStudySet(id: string) {
  const set = await requireSet(id);
  if (set.status !== "error") throw new Error("This study set isn't in a failed state.");
  await updateSet(id, (s) => {
    s.status = "processing";
    s.stage = "Starting";
    s.error = undefined;
    s.notes = "";
  });
  startProcessing(id);
}

export async function renameStudySet(id: string, title: string) {
  const clean = title.trim().slice(0, 120);
  if (clean) await updateSet(id, (s) => void (s.title = clean));
}

export async function saveNotes(id: string, notes: string) {
  const set = await requireSet(id);
  if (set.status === "processing") throw new Error("Wait for the notes to finish generating before editing them.");
  await updateSet(id, (s) => void (s.notes = notes));
}

export async function deleteStudySet(id: string) {
  if (!(await deleteSet(id))) throw new Error("Study set not found.");
}

// ---------- Chat ----------

export async function* chatWithSet(id: string, message: string): AsyncGenerator<string> {
  const set = await requireReady(id);
  const text = message.trim().slice(0, 4000);
  if (!text) return;
  yield* streamChatReply({
    history: set.chat,
    message: text,
    system: chatSystem(set),
    save: (exchange) => updateSet(id, (s) => void s.chat.push(...exchange)),
  });
}

export async function clearChat(id: string) {
  await updateSet(id, (s) => void (s.chat = []));
}

// ---------- Flashcards ----------

// Minutes until a card is due again after a correct answer, indexed by its new Leitner box.
const REVIEW_INTERVALS_MIN = [1, 10, 24 * 60, 3 * 24 * 60, 7 * 24 * 60, 21 * 24 * 60];

export async function generateFlashcards(
  id: string,
  options: { count?: number; focus?: string; replace?: boolean },
): Promise<Flashcard[]> {
  const set = await requireReady(id);
  const count = clamp(Math.round(Number(options.count) || 15), 5, 40);
  const result = await gemini(`Flashcard generation for set ${id}`, () =>
    generateJson<{ cards: { front: string; back: string }[] }>(
      flashcardsPrompt(set, count, focusText(options.focus)),
      FLASHCARDS_SCHEMA,
    ),
  );
  const now = Date.now();
  const cards: Flashcard[] = result.cards
    .filter((c) => c.front?.trim() && c.back?.trim())
    .map((c) => ({ id: nanoid(10), front: c.front.trim(), back: c.back.trim(), box: 0, dueAt: now, reviews: 0 }));
  if (!cards.length) throw new Error("Gemini didn't return any flashcards. Try again.");

  const updated = await updateSet(id, (s) => {
    s.flashcards = options.replace ? cards : [...s.flashcards, ...cards];
  });
  return copy(updated?.flashcards ?? []);
}

export async function reviewFlashcard(id: string, cardId: string, result: "again" | "good"): Promise<Flashcard> {
  let card: Flashcard | undefined;
  await updateSet(id, (s) => {
    card = s.flashcards.find((c) => c.id === cardId);
    if (!card) return;
    card.reviews += 1;
    card.box = result === "good" ? Math.min(card.box + 1, 5) : 0;
    card.dueAt = Date.now() + (result === "good" ? REVIEW_INTERVALS_MIN[card.box] : 1) * 60_000;
  });
  if (!card) throw new Error("Flashcard not found.");
  return copy(card);
}

/** Deletes one card, or the whole deck when no card is given. */
export async function deleteFlashcards(id: string, cardId?: string): Promise<Flashcard[]> {
  const updated = await updateSet(id, (s) => {
    s.flashcards = cardId ? s.flashcards.filter((c) => c.id !== cardId) : [];
  });
  if (!updated) throw new Error("Study set not found.");
  return copy(updated.flashcards);
}

// ---------- Quizzes ----------

const DIFFICULTIES: QuizDifficulty[] = ["easy", "medium", "hard"];

export async function generateQuiz(
  id: string,
  options: { count?: number; difficulty?: string; focus?: string },
): Promise<QuizQuestion[]> {
  const set = await requireReady(id);
  const count = clamp(Math.round(Number(options.count) || 10), 3, 25);
  const difficulty = DIFFICULTIES.find((d) => d === options.difficulty) ?? "medium";
  const result = await gemini(`Quiz generation for set ${id}`, () =>
    generateJson<{ questions: Omit<QuizQuestion, "id">[] }>(
      quizPrompt(set, count, difficulty, focusText(options.focus)),
      QUIZ_SCHEMA,
    ),
  );
  const questions: QuizQuestion[] = result.questions
    .filter((q) => q.question?.trim() && q.options?.length >= 2 && q.answerIndex >= 0 && q.answerIndex < q.options.length)
    .map((q) => ({
      id: nanoid(10),
      question: q.question.trim(),
      explanation: q.explanation?.trim() ?? "",
      ...shuffleOptions(q.options, q.answerIndex),
    }));
  if (!questions.length) throw new Error("Gemini didn't return any questions. Try again.");

  const updated = await updateSet(id, (s) => void (s.quiz = questions));
  return copy(updated?.quiz ?? []);
}

export async function recordQuizAttempt(id: string, score: number, total: number) {
  if (!Number.isInteger(score) || !Number.isInteger(total) || total <= 0 || score < 0 || score > total) {
    throw new Error("Expected an integer score and total.");
  }
  const updated = await updateSet(id, (s) => {
    s.quizAttempts = [...s.quizAttempts, { at: Date.now(), score, total }].slice(-20);
  });
  if (!updated) throw new Error("Study set not found.");
  return copy(updated.quizAttempts);
}

// ---------- Lessons ----------

const LEVELS: LessonLevel[] = ["beginner", "intermediate", "advanced"];
const LENGTHS: LessonLength[] = ["short", "standard", "deep"];

/** Starts generating a new lesson, replacing any existing one. */
export async function createLesson(id: string, options: { level?: string; length?: string; focus?: string }) {
  const set = await requireReady(id);
  if (set.lesson?.status === "generating" || isRunning(`lesson:${id}`)) throw new Error("A lesson is already being created.");
  const level = LEVELS.find((l) => l === options.level) ?? "intermediate";
  const length = LENGTHS.find((l) => l === options.length) ?? "standard";
  const focus = focusText(options.focus);

  const updated = await updateSet(id, (s) => {
    s.lesson = { status: "generating", level, length, focus, sections: [], progress: 0, chat: [], createdAt: Date.now() };
  });
  startLesson(id, { level, length, focus });
  return copy(updated?.lesson);
}

/** Records progress: { progress }, { answer: { sectionId, option } } or { reset: true }. */
export async function updateLessonProgress(
  id: string,
  change: { progress?: number; answer?: { sectionId: string; option: number }; reset?: boolean },
) {
  const set = await requireSet(id);
  if (!set.lesson || set.lesson.status !== "ready") throw new Error("Lesson not found.");
  await updateSet(id, (s) => {
    const lesson = s.lesson!;
    if (change.reset) {
      lesson.progress = 0;
      lesson.sections = lesson.sections.map((section) =>
        section.check ? { ...section, check: { ...section.check, chosen: undefined } } : section,
      );
    }
    if (Number.isInteger(change.progress)) {
      lesson.progress = clamp(change.progress!, 0, lesson.sections.length - 1);
    }
    const check = lesson.sections.find((section) => section.id === change.answer?.sectionId)?.check;
    const option = change.answer?.option;
    if (check && check.chosen === undefined && Number.isInteger(option) && option! >= 0 && option! < check.options.length) {
      check.chosen = option;
    }
  });
}

/** The lesson tutor, told which part the student is looking at. */
export async function* chatWithTutor(id: string, message: string, sectionIndex: number): AsyncGenerator<string> {
  const set = await requireSet(id);
  const lesson = set.lesson;
  if (!lesson || lesson.status !== "ready") throw new Error("Lesson not found.");
  const text = message.trim().slice(0, 4000);
  if (!text) return;
  const index = Number.isInteger(sectionIndex) ? clamp(sectionIndex, 0, lesson.progress) : lesson.progress;
  yield* streamChatReply({
    history: lesson.chat,
    message: text,
    system: lessonChatSystem(set, lesson, index),
    save: (exchange) => updateSet(id, (s) => void s.lesson?.chat.push(...exchange)),
  });
}

export async function clearTutorChat(id: string) {
  await updateSet(id, (s) => {
    if (s.lesson) s.lesson.chat = [];
  });
}

/** Creates the section's illustration if needed. */
export async function makeSectionImage(id: string, sectionId: string) {
  const media = await ensureSectionImage(id, sectionId);
  if (!media) throw new Error("This section has no illustration.");
  return copy(media);
}

/** Creates the section's narration if needed. */
export async function makeSectionAudio(id: string, sectionId: string) {
  const media = await ensureSectionAudio(id, sectionId);
  if (!media) throw new Error("Lesson section not found.");
  return copy(media);
}

// ---------- Podcast ----------

export async function createPodcast(id: string) {
  const set = await requireReady(id);
  if (set.podcast.status === "scripting" || set.podcast.status === "voicing") throw new Error("A podcast is already being made.");
  const updated = await updateSet(id, (s) => void (s.podcast = { status: "scripting" }));
  startPodcast(id);
  return copy(updated!.podcast);
}

// ---------- Resources ----------

const BUSY_RESOURCES = new Set(["planning", "checking", "curating"]);

/** Starts a new search for online materials, replacing the current list. */
export async function searchResources(id: string, options: { languageMode?: ResourceLanguageMode; focus?: string }) {
  const set = await requireReady(id);
  if (BUSY_RESOURCES.has(set.resources?.status ?? "") || isRunning(`resources:${id}`)) {
    throw new Error("A search is already running.");
  }
  const languageMode: ResourceLanguageMode = options.languageMode === "native" ? "native" : "mixed";
  const focus = focusText(options.focus);
  const updated = await updateSet(id, (s) => {
    s.resources = { status: "planning", languageMode, focus, items: [], searches: [], createdAt: Date.now() };
  });
  startResources(id, { languageMode, focus });
  return copy(updated?.resources);
}

export async function hideResource(id: string, itemId: string) {
  await updateSet(id, (s) => {
    if (s.resources) s.resources.items = s.resources.items.filter((item) => item.id !== itemId);
  });
}
