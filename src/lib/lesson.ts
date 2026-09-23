import { nanoid } from "nanoid";
import { describeError, generateImage, generateJson, generateText, synthesizeSpeech } from "./gemini";
import { runOnce, tracked } from "./jobs";
import {
  LESSON_SCHEMA,
  NARRATOR_VOICE,
  lessonPrompt,
  narrationPrompt,
  svgIllustrationPrompt,
  type LessonDraft,
} from "./prompts";
import { shuffleOptions } from "./shuffle";
import { deleteFiles, getSet, saveFile, updateSet } from "./store";
import type { LessonLength, LessonLevel, LessonMedia, LessonSection } from "./types";
import { pcmToWav } from "./wav";

const lessonDir = (setId: string) => `lessons/${setId}`;

export interface LessonOptions {
  level: LessonLevel;
  length: LessonLength;
  focus?: string;
}

export function startLesson(setId: string, options: LessonOptions) {
  return runOnce(`lesson:${setId}`, () => buildLesson(setId, options));
}

async function buildLesson(setId: string, { level, length, focus }: LessonOptions) {
  try {
    const set = await getSet(setId);
    if (!set) return;
    await deleteFiles(`${lessonDir(setId)}/`);

    const draft = await generateJson<LessonDraft>(lessonPrompt(set, level, length, focus), LESSON_SCHEMA);
    const sections = draft.sections
      .filter((s) => s.heading?.trim() && s.body?.trim())
      .map((s): LessonSection => {
        const section: LessonSection = {
          id: nanoid(10),
          heading: s.heading.trim(),
          body: s.body.trim(),
          narration: s.narration?.trim() || s.body.trim(),
        };
        if (s.imagePrompt?.trim()) section.image = { prompt: s.imagePrompt.trim(), caption: s.imageCaption?.trim() ?? "" };
        const check = s.check;
        if (check?.question?.trim() && check.options?.length >= 2 && check.answerIndex >= 0 && check.answerIndex < check.options.length) {
          section.check = {
            question: check.question.trim(),
            explanation: check.explanation?.trim() ?? "",
            ...shuffleOptions(check.options, check.answerIndex),
          };
        }
        return section;
      });
    if (!sections.length) throw new Error("Gemini returned an empty lesson. Please try again.");

    await updateSet(setId, (s) => {
      if (!s.lesson) return;
      s.lesson = {
        ...s.lesson,
        status: "ready",
        error: undefined,
        title: draft.title?.trim() || s.title,
        objective: draft.objective?.trim(),
        sections,
        progress: 0,
      };
    });
  } catch (err) {
    console.error(`Lesson generation failed for set ${setId}:`, err);
    await updateSet(setId, (s) => {
      if (s.lesson) s.lesson = { ...s.lesson, status: "error", error: describeError(err) };
    });
  }
}

// Illustrations and narration are made on demand as the student reaches each section.
// Concurrent requests for the same file share one generation, and another tab making it counts too.
const inflight = new Map<string, Promise<LessonMedia | null>>();

function shared(key: string, make: () => Promise<LessonMedia | null>) {
  let promise = inflight.get(key);
  if (!promise) {
    promise = tracked(key, make)
      .then((media) => media ?? null)
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
  }
  return promise;
}

async function findSection(setId: string, sectionId: string) {
  const set = await getSet(setId);
  return set?.lesson?.sections.find((s) => s.id === sectionId);
}

function saveMedia(setId: string, sectionId: string, slot: "image" | "audio", media: LessonMedia) {
  return updateSet(setId, (s) => {
    const section = s.lesson?.sections.find((x) => x.id === sectionId);
    if (!section) return;
    if (slot === "audio") section.audio = media;
    else if (section.image) section.image.media = media;
  });
}

const LATEX_SYMBOLS: Record<string, string> = {
  in: "∈", notin: "∉", cup: "∪", cap: "∩", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", pm: "±",
  times: "×", cdot: "·", div: "÷", infty: "∞", to: "→", rightarrow: "→", leftarrow: "←",
  Rightarrow: "⇒", Leftrightarrow: "⇔", iff: "⇔", implies: "⇒", forall: "∀", exists: "∃", emptyset: "∅",
  sum: "Σ", prod: "Π", int: "∫", sqrt: "√", partial: "∂", nabla: "∇", circ: "∘", setminus: "∖",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", theta: "θ", lambda: "λ",
  mu: "μ", pi: "π", sigma: "σ", tau: "τ", phi: "φ", omega: "ω", Delta: "Δ", Sigma: "Σ", Omega: "Ω",
  lbrace: "{", rbrace: "}", ldots: "…", dots: "…", cdots: "⋯", quad: " ", ",": " ",
};
const BLACKBOARD: Record<string, string> = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ" };
const SUPERSCRIPTS: Record<string, string> = { "+": "⁺", "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "n": "ⁿ" };

/** SVG can't typeset LaTeX, so math the model wrote as LaTeX anyway is turned into Unicode text. */
function latexToUnicode(text: string) {
  return text
    .replace(/\\mathbb\{([A-Z])\}/g, (m, letter: string) => BLACKBOARD[letter] ?? letter)
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^}]*)\}/g, "$1")
    .replace(/\\([A-Za-z]+|,)/g, (m, name: string) => LATEX_SYMBOLS[name] ?? m)
    .replace(/\^\{?([+\-0-3n])\}?/g, (m, sup: string) => SUPERSCRIPTS[sup] ?? m)
    .replace(/\\([{}])/g, "$1")
    .replace(/\$/g, "");
}

/** Keeps only a single inline <svg> and strips anything that could run code or load external content. */
function sanitizeSvg(raw: string) {
  const match = /<svg[\s\S]*<\/svg>/i.exec(raw);
  if (!match) return null;
  let svg = match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "");
  if (!/\sxmlns=/.test(svg.slice(0, 200))) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  // Only text between tags is converted, so attributes and path data stay untouched.
  return svg.replace(/>([^<]+)</g, (m, text: string) => `>${latexToUnicode(text)}<`);
}

async function drawIllustration(setId: string, section: LessonSection): Promise<LessonMedia> {
  const image = section.image!;
  try {
    const picture = await generateImage(
      `${image.prompt}\n\nStyle: clean, modern educational illustration with flat shapes and soft colors. No text, letters or labels.`,
    );
    const extension = picture.type.includes("jpeg") ? "jpg" : picture.type.includes("webp") ? "webp" : "png";
    const file = `${lessonDir(setId)}/${section.id}.${extension}`;
    await saveFile(file, picture);
    return { status: "ready", file, mimeType: picture.type };
  } catch (err) {
    // Image models aren't included in every plan (including the free tier), so fall back to a drawn SVG.
    console.warn(`Image generation unavailable for set ${setId}; drawing an SVG instead. ${describeError(err)}`);
  }
  const svg = sanitizeSvg(
    await generateText(svgIllustrationPrompt(image.prompt, { heading: section.heading, caption: image.caption }), {
      tier: "fast",
      effort: "low",
    }),
  );
  if (!svg) throw new Error("Couldn't draw an illustration for this section.");
  const file = `${lessonDir(setId)}/${section.id}.svg`;
  await saveFile(file, new Blob([svg], { type: "image/svg+xml" }));
  return { status: "ready", file, mimeType: "image/svg+xml" };
}

/** Returns the section's illustration, creating it first if needed. Null when the section has no illustration. */
export function ensureSectionImage(setId: string, sectionId: string) {
  return shared(`image:${setId}:${sectionId}`, async () => {
    const section = await findSection(setId, sectionId);
    if (!section?.image) return null;
    if (section.image.media?.status === "ready") return section.image.media;

    await saveMedia(setId, sectionId, "image", { status: "generating" });
    let media: LessonMedia;
    try {
      media = await drawIllustration(setId, section);
    } catch (err) {
      console.error(`Illustration failed for section ${sectionId} of set ${setId}:`, err);
      media = { status: "failed", error: describeError(err) };
    }
    await saveMedia(setId, sectionId, "image", media);
    return media;
  });
}

/** Returns the section's narration audio, creating it first if needed. */
export function ensureSectionAudio(setId: string, sectionId: string) {
  return shared(`audio:${setId}:${sectionId}`, async () => {
    const section = await findSection(setId, sectionId);
    if (!section) return null;
    if (section.audio?.status === "ready") return section.audio;

    await saveMedia(setId, sectionId, "audio", { status: "generating" });
    let media: LessonMedia;
    try {
      const { pcm, sampleRate } = await synthesizeSpeech(narrationPrompt(section), NARRATOR_VOICE);
      const file = `${lessonDir(setId)}/${sectionId}.wav`;
      await saveFile(file, pcmToWav(pcm, sampleRate));
      media = { status: "ready", file, mimeType: "audio/wav" };
    } catch (err) {
      console.error(`Narration failed for section ${sectionId} of set ${setId}:`, err);
      media = { status: "failed", error: describeError(err) };
    }
    await saveMedia(setId, sectionId, "audio", media);
    return media;
  });
}
