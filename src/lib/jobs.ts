import type { Part } from "@google/genai";
import { mapLimit } from "./async";
import { concatBytes } from "./bytes";
import { describeError, generateJson, generateText, streamText, synthesizeDialogue, uploadFile } from "./gemini";
import { withTabLock } from "./locks";
import {
  META_SCHEMA,
  NOTES_SYSTEM,
  PODCAST_HOSTS,
  PODCAST_SCHEMA,
  metaPrompt,
  notesPrompt,
  podcastPrompt,
  transcriptPrompt,
  type MetaResult,
} from "./prompts";
import { getSet, readFile, saveFile, updateSet } from "./store";
import type { PodcastLine, SourceInfo } from "./types";
import { pcmToWav } from "./wav";

// Jobs run in the browser tab that started them, even while the student moves around the app.
// Components follow their progress through the store.
const running = new Set<string>();

export const isRunning = (key: string) => running.has(key);

/**
 * Runs work under a cross-tab lock and counts it as running for the leave-page warning.
 * Resolves to undefined if another tab is already doing the same work.
 */
export async function tracked<T>(key: string, job: () => Promise<T>): Promise<T | undefined> {
  running.add(key);
  try {
    let result: T | undefined;
    await withTabLock(key, async () => {
      result = await job();
    });
    return result;
  } finally {
    running.delete(key);
  }
}

export function runOnce(key: string, job: () => Promise<void>) {
  if (running.has(key)) return false;
  void tracked(key, job).catch((err) => console.error(`Job ${key} failed:`, err));
  return true;
}

// Closing or reloading the tab stops its jobs, so the browser asks first while any are running.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    if (running.size) event.preventDefault();
  });
}

const UPLOADED_KINDS = new Set(["pdf", "audio", "video", "image"]);
const TEXT_KINDS = new Set(["text", "document"]);

/** True when the source's file has to be (re-)uploaded because Gemini's copy is missing or about to expire. */
const needsUpload = (source: SourceInfo) =>
  UPLOADED_KINDS.has(source.kind) && (!source.geminiFile || source.geminiFile.expiresAt - Date.now() < 3600_000);

/** The parts that show Gemini one source, uploading its file from this browser when Gemini doesn't have a copy. */
async function partsForSource(
  setId: string,
  source: SourceInfo,
  index: number,
  onProgress?: (fraction: number) => void,
): Promise<Part[]> {
  if (source.kind === "youtube") return [{ fileData: { fileUri: source.url } }];
  if (!UPLOADED_KINDS.has(source.kind)) return [{ text: source.text ?? "" }];
  let ref = source.geminiFile;
  if (needsUpload(source)) {
    const blob = source.localFile ? await readFile(source.localFile) : undefined;
    if (!blob) throw new Error(`“${source.name}” is no longer saved in this browser. Create the study set again.`);
    const uploaded = await uploadFile(blob, source.mimeType!, source.name, onProgress);
    await updateSet(setId, (s) => {
      if (s.sources[index]) s.sources[index].geminiFile = uploaded;
    });
    ref = uploaded;
  }
  if (!ref) throw new Error(`Couldn't upload “${source.name}” to Gemini.`);
  return [{ fileData: { fileUri: ref.uri, mimeType: ref.mimeType } }];
}

/** Joins per-source transcripts under a heading for each source. */
function combineSourceTexts(sources: SourceInfo[], texts: (string | undefined)[]) {
  if (sources.length === 1) return texts[0];
  const blocks = sources.flatMap((source, i) => {
    const text = texts[i]?.trim();
    return text ? [`## ${i + 1}. ${source.name}\n\n${text}`] : [];
  });
  return blocks.length ? blocks.join("\n\n---\n\n") : undefined;
}

/** Models sometimes wrap the whole answer in a ```markdown fence. */
function unwrapMarkdown(text: string) {
  const match = /^\s*```(?:markdown|md)\s*\n([\s\S]*?)\n```\s*$/.exec(text);
  return (match ? match[1] : text).trim();
}

/**
 * Streams notes into the set as they arrive. Long answers from large materials sometimes break off partway,
 * so the notes start over, up to three tries in all. The model that failed rests briefly, so the next try uses another.
 */
async function writeNotes(id: string, parts: Part[], prompt: string) {
  for (let attempt = 1; ; attempt++) {
    let notes = "";
    let lastSave = 0;
    try {
      const stream = streamText([{ role: "user", parts: [...parts, { text: prompt }] }], {
        config: { systemInstruction: NOTES_SYSTEM },
        effort: "low",
      });
      for await (const delta of stream) {
        notes += delta;
        if (Date.now() - lastSave > 400) {
          lastSave = Date.now();
          const partial = notes;
          await updateSet(id, (s) => void (s.notes = partial));
        }
      }
      return unwrapMarkdown(notes);
    } catch (err) {
      if (attempt >= 3 || !notes) throw err;
      console.warn(`Notes stream for set ${id} failed partway; starting over.`, err);
      await updateSet(id, (s) => void (s.notes = ""));
    }
  }
}

export function startProcessing(id: string) {
  return runOnce(`process:${id}`, () => processSet(id));
}

async function processSet(id: string) {
  try {
    const set = await getSet(id);
    if (!set) return;
    const { sources } = set;

    // Files go straight from this browser to Gemini; the stage shows how far along the upload is.
    const uploadBytes = sources.map((source) => (needsUpload(source) ? Math.max(source.size ?? 1, 1) : 0));
    const totalUpload = uploadBytes.reduce((sum, n) => sum + n, 0);
    const sent = sources.map(() => 0);
    let shownPercent = -1;
    const reportUpload = (index: number, fraction: number) => {
      sent[index] = fraction * uploadBytes[index];
      const percent = Math.floor((sent.reduce((sum, n) => sum + n, 0) / totalUpload) * 100);
      if (percent === shownPercent) return;
      shownPercent = percent;
      void updateSet(id, (s) => void (s.stage = `Uploading to Gemini · ${percent}%`));
    };
    await updateSet(id, (s) => void (s.stage = totalUpload ? "Uploading to Gemini" : "Reading your materials"));

    const perSource = await mapLimit(sources, 3, (source, i) =>
      partsForSource(id, source, i, (fraction) => reportUpload(i, fraction)),
    );
    // With several sources, each is wrapped in a labelled block so the notes can tell them apart.
    const parts: Part[] =
      sources.length === 1
        ? perSource[0]
        : sources.flatMap((source, i) => [
            { text: `<source number="${i + 1}" name="${source.name.replace(/"/g, "'")}">` },
            ...perSource[i],
            { text: "</source>" },
          ]);
    await updateSet(id, (s) => void (s.stage = "Writing notes"));

    // Transcripts ground chat and study tools later, so they're written alongside the notes.
    const transcripts = mapLimit(sources, 2, (source, i) =>
      TEXT_KINDS.has(source.kind)
        ? Promise.resolve(source.text)
        : generateText([{ role: "user", parts: [...perSource[i], { text: transcriptPrompt(source.kind) }] }], {
            config: { maxOutputTokens: 65536 },
            tier: "fast",
            effort: "low",
          }).catch((err) => {
            console.error(`Transcript failed for source ${i + 1} of set ${id}:`, err);
            return undefined;
          }),
    );

    const notes = await writeNotes(id, parts, notesPrompt(sources.map((s) => s.kind)));
    if (!notes) throw new Error("Gemini returned empty notes. Please try again.");
    await updateSet(id, (s) => {
      s.notes = notes;
      s.stage = "Finishing up";
    });

    const [texts, meta] = await Promise.all([
      transcripts,
      generateJson<MetaResult>(metaPrompt(notes), META_SCHEMA, { tier: "fast", effort: "low" }).catch(() => undefined),
    ]);
    await updateSet(id, (s) => {
      s.sourceText = combineSourceTexts(sources, texts);
      if (meta?.title?.trim()) s.title = meta.title.trim();
      if (meta?.emoji?.trim()) s.emoji = meta.emoji.trim();
      if (meta?.summary?.trim()) s.summary = meta.summary.trim();
      s.status = "ready";
      s.stage = undefined;
      s.error = undefined;
    });
  } catch (err) {
    console.error(`Processing failed for set ${id}:`, err);
    await updateSet(id, (s) => {
      s.status = "error";
      s.stage = undefined;
      s.error = describeError(err);
    });
  }
}

export function startPodcast(id: string) {
  return runOnce(`podcast:${id}`, () => makePodcast(id));
}

/** Splits the script into chunks of roughly `budget` characters without breaking a line. */
function chunkLines(lines: PodcastLine[], budget: number) {
  const chunks: PodcastLine[][] = [[]];
  let size = 0;
  for (const line of lines) {
    if (size > 0 && size + line.text.length > budget) {
      chunks.push([]);
      size = 0;
    }
    chunks[chunks.length - 1].push(line);
    size += line.text.length;
  }
  return chunks;
}

async function makePodcast(id: string) {
  try {
    const set = await getSet(id);
    if (!set) return;
    await updateSet(id, (s) => void (s.podcast = { status: "scripting" }));

    const script = await generateJson<{ title: string; lines: PodcastLine[] }>(podcastPrompt(set), PODCAST_SCHEMA);
    const lines = script.lines.filter((l) => l.text?.trim());
    if (!lines.length) throw new Error("Gemini returned an empty podcast script.");
    await updateSet(id, (s) => void (s.podcast = { status: "voicing", title: script.title, lines }));

    // Speech quality drifts on long inputs, so the script is voiced in chunks and stitched together.
    const [alex, sam] = PODCAST_HOSTS;
    const clips = await mapLimit(chunkLines(lines, 1800), 3, (chunk) =>
      synthesizeDialogue(
        `TTS the following conversation between ${alex.name} and ${sam.name} in a warm, upbeat podcast style:\n\n${chunk
          .map((l) => `${l.speaker}: ${l.text}`)
          .join("\n")}`,
        [alex, sam],
      ),
    );
    const sampleRate = clips[0].sampleRate;
    const pcm = concatBytes(clips.map((c) => c.pcm));

    if (!(await getSet(id))) return;
    await saveFile(`audio/${id}.wav`, pcmToWav(pcm, sampleRate));
    await updateSet(id, (s) => {
      s.podcast = {
        status: "ready",
        title: script.title,
        lines,
        audioFile: `audio/${id}.wav`,
        durationSec: Math.round(pcm.length / 2 / sampleRate),
      };
    });
  } catch (err) {
    console.error(`Podcast failed for set ${id}:`, err);
    await updateSet(id, (s) => void (s.podcast = { ...s.podcast, status: "error", error: describeError(err) }));
  }
}
