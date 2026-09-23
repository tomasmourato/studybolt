export type SourceKind =
  | "pdf"
  | "audio"
  | "video"
  | "youtube"
  | "image"
  | "document"
  | "text";

export type SetStatus = "processing" | "ready" | "error";

export interface GeminiFileRef {
  name: string;
  uri: string;
  mimeType: string;
  expiresAt: number;
}

export interface SourceInfo {
  kind: SourceKind;
  name: string;
  mimeType?: string;
  /** Public YouTube URL, for youtube sources. */
  url?: string;
  /** Path of the uploaded file, relative to the data directory. */
  localFile?: string;
  size?: number;
  /** True when the audio was recorded in the browser. */
  recorded?: boolean;
  geminiFile?: GeminiFileRef;
  /** The text itself, for pasted text, text files and Word documents. */
  text?: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  /** Leitner box, 0 (new / missed) through 5 (mastered). */
  box: number;
  dueAt: number;
  reviews: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface QuizAttempt {
  at: number;
  score: number;
  total: number;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
  at: number;
}

export type PodcastStatus = "idle" | "scripting" | "voicing" | "ready" | "error";

export interface PodcastLine {
  speaker: string;
  text: string;
}

export interface Podcast {
  status: PodcastStatus;
  title?: string;
  lines?: PodcastLine[];
  audioFile?: string;
  durationSec?: number;
  error?: string;
}

export interface LessonMedia {
  status: "generating" | "ready" | "failed";
  /** Path relative to the data directory. */
  file?: string;
  mimeType?: string;
  error?: string;
}

export interface LessonCheck {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  /** The option the student picked, once they've answered. */
  chosen?: number;
}

export interface LessonSection {
  id: string;
  heading: string;
  /** Markdown shown on screen. */
  body: string;
  /** The body rewritten for reading aloud. */
  narration: string;
  image?: { prompt: string; caption: string; media?: LessonMedia };
  check?: LessonCheck;
  audio?: LessonMedia;
}

export type LessonLevel = "beginner" | "intermediate" | "advanced";
export type LessonLength = "short" | "standard" | "deep";

export interface Lesson {
  status: "generating" | "ready" | "error";
  error?: string;
  level: LessonLevel;
  length: LessonLength;
  focus?: string;
  title?: string;
  objective?: string;
  sections: LessonSection[];
  /** Index of the furthest section the student has opened. */
  progress: number;
  chat: ChatMessage[];
  createdAt: number;
}

export type ResourceType = "video" | "exercises" | "book" | "course" | "article";
export type SearchProvider = "youtube" | "google" | "google_pdf" | "khan" | "archive";

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  url: string;
  /** Where it's from, e.g. "Wikibooks" or "YouTube · Khan Academy". */
  source: string;
  /** Why it helps, written for the student. */
  description: string;
  /** ISO 639-1 code, when known. */
  language?: string;
  thumbnail?: string;
  videoId?: string;
}

/** A ready-made search the student can run on another site. */
export interface ResourceSearch {
  type: ResourceType;
  provider: SearchProvider;
  label: string;
  query: string;
  url: string;
}

export type ResourcesStatus = "planning" | "checking" | "curating" | "ready" | "error";
export type ResourceLanguageMode = "mixed" | "native";

export interface Resources {
  status: ResourcesStatus;
  error?: string;
  languageMode: ResourceLanguageMode;
  focus?: string;
  /** ISO 639-1 code of the notes' language. */
  language?: string;
  items: Resource[];
  searches: ResourceSearch[];
  /** "youtube" when videos came from the YouTube search API, "suggested" when only model suggestions could be checked. */
  videoSource?: "youtube" | "suggested";
  createdAt: number;
}

export interface StudySet {
  id: string;
  title: string;
  emoji: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
  status: SetStatus;
  /** Human-readable progress label while processing. */
  stage?: string;
  error?: string;
  sources: SourceInfo[];
  /** Transcripts and extracted text of every source, used to ground chat and study tools. */
  sourceText?: string;
  notes: string;
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  quizAttempts: QuizAttempt[];
  chat: ChatMessage[];
  podcast: Podcast;
  lesson?: Lesson;
  resources?: Resources;
}

export interface StudySetSummary {
  id: string;
  title: string;
  emoji: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
  status: SetStatus;
  stage?: string;
  kind: SourceKind;
  sourceCount: number;
  flashcardCount: number;
  quizCount: number;
}
