import { APP_NAME } from "./brand";
import type {
  Lesson,
  LessonLength,
  LessonLevel,
  ResourceLanguageMode,
  ResourceType,
  SearchProvider,
  SourceKind,
  StudySet,
} from "./types";

const KIND_LABEL: Record<SourceKind, string> = {
  pdf: "PDF document",
  audio: "audio recording",
  video: "video",
  youtube: "YouTube video",
  image: "image",
  document: "document",
  text: "text",
};

export const NOTES_SYSTEM = `You are ${APP_NAME}, an expert tutor who turns raw study material into clear, beautiful, exam-ready notes.

Write the notes in GitHub-flavored Markdown:
- Open with a TL;DR blockquote of 2-3 sentences, formatted as: > **TL;DR:** ...
- Organize the content with "##" section headings (and "###" subsections). Start each "##" heading with one fitting emoji. Do not write a "#" document title.
- Teach concepts in the order a student should learn them. Prefer short paragraphs and bullet points, and **bold** key terms the first time they appear.
- Use Markdown tables to compare things, list properties, or summarize data.
- Write all math in LaTeX: inline as $...$ and display equations as $$...$$ on their own lines.
- When a process, cycle, hierarchy, or relationship is central to the material, add a Mermaid diagram in a \`\`\`mermaid code block. Use only "flowchart TD" or "flowchart LR", give each node a short alphanumeric id with a quoted label (for example A["Light reactions"] --> B["Calvin cycle"]), and keep labels free of quotes and brackets. Use at most 2 diagrams, and only when they genuinely help.
- Include a worked example for every problem-solving technique.
- If the material defines terminology, add a "## 📖 Glossary" table (Term | Definition) near the end.
- Finish with "## 🧠 Key takeaways" listing 5-8 bullets.
- Stay faithful to the source and never invent facts. For recordings, skip filler, small talk and class logistics unless they matter (such as exam dates or assignments).
- Write in the same language as the source material.`;

export function notesPrompt(kinds: SourceKind[]) {
  if (kinds.length === 1) return `Create comprehensive study notes from this ${KIND_LABEL[kinds[0]]}.`;
  return `Create one comprehensive, unified set of study notes from these ${kinds.length} sources (${kinds
    .map((k) => KIND_LABEL[k])
    .join(", ")}). Merge overlapping content instead of repeating it, organize by topic rather than by source, and point out where the sources disagree.`;
}

export function transcriptPrompt(kind: SourceKind) {
  if (kind === "audio" || kind === "video" || kind === "youtube") {
    return `Transcribe this ${KIND_LABEL[kind]} in full. Write clean verbatim text (drop filler words like "um"), grouped into paragraphs, and start each paragraph with a [mm:ss] timestamp. If there are several speakers, label them by name when stated, otherwise "Speaker 1", "Speaker 2". For video, note important on-screen content such as slides or equations as [On screen: ...]. Output only the transcript as plain text.`;
  }
  return `Extract all of the text in this ${KIND_LABEL[kind]} in reading order as plain text. Keep headings and lists, write math in LaTeX, and describe each figure, chart or diagram in one or two sentences as [Figure: ...]. Output only the extracted content.`;
}

export const META_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Specific title for the study set, at most 8 words." },
    emoji: { type: "string", description: "A single emoji that represents the topic." },
    summary: { type: "string", description: "One sentence describing what the material covers." },
  },
  required: ["title", "emoji", "summary"],
};

export interface MetaResult {
  title: string;
  emoji: string;
  summary: string;
}

export function metaPrompt(notes: string) {
  return `Give these study notes a title, an emoji and a one-sentence summary.\n\n${notes.slice(0, 20_000)}`;
}

// Structured answers are JSON, where a single backslash starts an escape sequence (\t, \n, \u...).
const JSON_LATEX =
  'Your answer is JSON, so write every LaTeX backslash doubled in the JSON source: for example, the JSON string "$x \\\\in \\\\mathbb{R}$, $\\\\frac{a}{b}$" displays as $x \\in \\mathbb{R}$, $\\frac{a}{b}$.';

/** The study material every downstream tool (chat, flashcards, quizzes, podcast, lessons) is grounded in. */
export function studyMaterial(set: StudySet) {
  const source = set.sourceText?.trim();
  return [
    `<notes title="${set.title}">\n${set.notes}\n</notes>`,
    source ? `<source_material>\n${source.slice(0, 300_000)}\n</source_material>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const FLASHCARDS_SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string", description: "A concise question, term or prompt." },
          back: { type: "string", description: "The precise answer." },
        },
        required: ["front", "back"],
      },
    },
  },
  required: ["cards"],
};

export function flashcardsPrompt(set: StudySet, count: number, focus?: string) {
  return `Create ${count} flashcards from the study material below.
- Each card tests exactly one idea: a definition, key fact, formula, cause and effect, comparison, or step in a process.
- Front: a concise question or term (at most 20 words). Back: a precise answer (at most 40 words). Both may use Markdown and LaTeX ($...$).
- Cover the material broadly, prioritizing what is most likely to appear on an exam. No duplicates.${
    focus ? `\n- Focus especially on: ${focus}` : ""
  }
- ${JSON_LATEX}

${studyMaterial(set)}`;
}

const MULTIPLE_CHOICE = {
  type: "object",
  properties: {
    question: { type: "string" },
    options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
    answerIndex: { type: "integer", minimum: 0, maximum: 3, description: "0-based index of the correct option." },
    explanation: { type: "string", description: "Why the correct answer is right and the tempting wrong answers are wrong." },
  },
  required: ["question", "options", "answerIndex", "explanation"],
};

export const QUIZ_SCHEMA = {
  type: "object",
  properties: {
    questions: { type: "array", items: MULTIPLE_CHOICE },
  },
  required: ["questions"],
};

export type QuizDifficulty = "easy" | "medium" | "hard";

export function quizPrompt(set: StudySet, count: number, difficulty: QuizDifficulty, focus?: string) {
  return `Write ${count} ${difficulty} multiple-choice questions that test understanding of the study material below.
- Each question has exactly 4 options with one correct answer and plausible distractors.
- Mix recall, application and analysis questions${difficulty === "hard" ? ", leaning toward application and analysis" : ""}.
- Never use "All of the above" or "None of the above".
- Questions, options and explanations may use Markdown and LaTeX ($...$).
- Keep explanations to 1-3 sentences.${focus ? `\n- Focus especially on: ${focus}` : ""}
- ${JSON_LATEX}

${studyMaterial(set)}`;
}

export const PODCAST_HOSTS = [
  { name: "Alex", voice: "Puck" },
  { name: "Sam", voice: "Kore" },
] as const;

export const PODCAST_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Catchy episode title." },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string", enum: PODCAST_HOSTS.map((h) => h.name) },
          text: { type: "string" },
        },
        required: ["speaker", "text"],
      },
    },
  },
  required: ["title", "lines"],
};

export function podcastPrompt(set: StudySet) {
  return `Write the script for a lively, educational two-host podcast episode (about 4 minutes, roughly 600 words) that teaches the study material below.
- Alex is curious, asks the questions a student would ask, and occasionally sums things up.
- Sam is the expert who explains with vivid analogies and concrete examples.
- Keep turns short (1-4 sentences) and conversational. No sound effects, stage directions, Markdown or emoji.
- Say math out loud in words instead of writing symbols.
- Open with a hook, cover the key ideas in a logical order, and close with a quick recap.

${studyMaterial(set)}`;
}

export function chatSystem(set: StudySet) {
  return `You are ${APP_NAME}'s study assistant for the study set "${set.title}". Help the student understand and remember the material: answer questions, explain concepts simply, give examples, and quiz them when asked.

Base your answers on the study material below. If the material doesn't cover something, say so briefly, then answer from general knowledge. Format with Markdown and write math in LaTeX ($...$). Keep answers focused unless the student asks for more depth.

${studyMaterial(set)}`;
}

export const LESSON_SECTION_COUNT: Record<LessonLength, number> = { short: 4, standard: 6, deep: 9 };

export const LESSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Engaging lesson title, at most 8 words." },
    objective: { type: "string", description: "One sentence: what the student will be able to do after the lesson." },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          body: { type: "string", description: "2-4 short paragraphs of Markdown." },
          narration: {
            type: "string",
            description: "The body rewritten to be read aloud: plain sentences, no Markdown or symbols, math in words.",
          },
          imagePrompt: {
            type: "string",
            description: "Concrete description of an educational illustration for this section, or an empty string for none.",
          },
          imageCaption: { type: "string", description: "One-sentence caption for the illustration, or an empty string." },
          check: { ...MULTIPLE_CHOICE, description: "Checkpoint question about this section." },
        },
        required: ["heading", "body", "narration"],
      },
    },
  },
  required: ["title", "objective", "sections"],
};

export interface LessonDraft {
  title: string;
  objective: string;
  sections: {
    heading: string;
    body: string;
    narration?: string;
    imagePrompt?: string;
    imageCaption?: string;
    check?: { question: string; options: string[]; answerIndex: number; explanation: string };
  }[];
}

const LEVEL_GUIDANCE: Record<LessonLevel, string> = {
  beginner: "Assume no prior knowledge: define every term and build intuition before details.",
  intermediate: "Assume some background: define specialized terms and connect ideas to each other.",
  advanced: "Assume solid background: go deeper into nuance, edge cases, derivations and applications.",
};

export function lessonPrompt(set: StudySet, level: LessonLevel, length: LessonLength, focus?: string) {
  return `Design an interactive, step-by-step lesson with exactly ${LESSON_SECTION_COUNT[length]} sections that teaches the study material below to a ${level} learner. The student reads one section at a time and continues when ready.
- Sections build on each other: open with a hook that shows why the topic matters, teach the core ideas in a logical order, and end with a recap section.
- heading: short and specific. body: 2-4 short, conversational paragraphs of Markdown with **bold** key terms, concrete examples or analogies, and LaTeX for math ($...$). No headings inside the body.
- narration: the same content as the body, rewritten for a teacher to read aloud: plain sentences with no Markdown, symbols or emoji, and math said in words.
- Give about half of the sections an illustration where a visual genuinely helps (a diagram, process, structure, scene or object). imagePrompt describes it concretely for an illustrator: the subject, the composition and a clean educational style. If labels help, list the exact short labels to draw, written in the lesson's language, with math as Unicode symbols (ℝ, ∈, ≤, ∪, ∞, x²) and never LaTeX. Leave imagePrompt and imageCaption empty for the other sections and for the recap.
- Give every section except the first a check question with exactly 4 options, one correct answer and plausible distractors, testing understanding of that section. Keep the explanation to 1-2 sentences.
- ${LEVEL_GUIDANCE[level]}
- Stay faithful to the material and write in its language.${focus ? `\n- Focus especially on: ${focus}` : ""}
- ${JSON_LATEX}

${studyMaterial(set)}`;
}

export function svgIllustrationPrompt(description: string, section: { heading: string; caption: string }) {
  return `Draw this educational illustration as a single SVG image: ${description}

It illustrates a lesson section titled "${section.heading}"${section.caption ? `, with the caption "${section.caption}"` : ""}. Write every label in the language of that title${section.caption ? " and caption" : ""}, even when the description above is in another language.

Rules: output only the <svg> element, with no Markdown fence or commentary. Use viewBox="0 0 800 450", a light background, flat shapes, a soft and friendly color palette, and a clear composition that fills the frame. Use at most a few short text labels. SVG can't render LaTeX: write math with Unicode symbols (ℝ, ∈, ≤, ∪, ∞, x²) and never use dollar signs or backslash commands. No scripts, external images, fonts or links.`;
}

export const NARRATOR_VOICE = "Kore";

export function narrationPrompt(section: { heading: string; narration: string }) {
  return `Read this lesson section aloud in a warm, clear and encouraging teacher's voice, at a relaxed pace:\n\n${section.heading}.\n\n${section.narration}`;
}

export function lessonChatSystem(set: StudySet, lesson: Lesson, sectionIndex: number) {
  const current = lesson.sections[sectionIndex];
  const outline = lesson.sections
    .map((s, i) => {
      const check = s.check
        ? `\n\nCheck question: ${s.check.question}\nOptions: ${s.check.options.join(" | ")}\nCorrect answer: ${
            s.check.options[s.check.answerIndex]
          }${s.check.chosen === undefined ? " (the student hasn't answered yet)" : ""}`
        : "";
      return `## Part ${i + 1}: ${s.heading}\n${s.body}${check}`;
    })
    .join("\n\n");

  return `You are ${APP_NAME}'s tutor, sitting beside a student who is working through the lesson "${lesson.title}". They are on part ${
    sectionIndex + 1
  } of ${lesson.sections.length}: "${current?.heading}".

Answer questions about the lesson and the underlying material, re-explain ideas in new ways, and give extra examples. You're in a narrow side panel, so keep answers short (a few sentences or a short list) unless the student asks for more. Format with Markdown and write math in LaTeX ($...$). Don't reveal the answer to a check question the student hasn't answered yet; give a hint instead unless they insist.

<lesson>
${outline}
</lesson>

${studyMaterial(set)}`;
}

export const RESOURCE_TYPES: ResourceType[] = ["video", "exercises", "book", "course", "article"];
export const SEARCH_PROVIDERS: SearchProvider[] = ["youtube", "google", "google_pdf", "khan", "archive"];
export const LIBRETEXTS_LIBRARIES = [
  "chem",
  "phys",
  "math",
  "bio",
  "eng",
  "stats",
  "med",
  "geo",
  "human",
  "socialsci",
  "biz",
  "k12",
  "espanol",
];

const keywordQuery = { type: "string", description: "2-5 keywords, written the way a page title would be. No quotes or operators." };

export const RESOURCE_PLAN_SCHEMA = {
  type: "object",
  properties: {
    language: { type: "string", description: "ISO 639-1 code of the notes' language, for example en or pt." },
    topics: { type: "array", items: { type: "string" }, description: "The 3-6 key topics a student would look up." },
    wiki: {
      type: "array",
      items: {
        type: "object",
        properties: {
          project: { type: "string", enum: ["wikibooks", "wikipedia"] },
          lang: { type: "string", description: "ISO 639-1 code of the wiki to search." },
          query: keywordQuery,
        },
        required: ["project", "lang", "query"],
      },
    },
    libretexts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          library: { type: "string", enum: LIBRETEXTS_LIBRARIES },
          query: { ...keywordQuery, description: "2-5 English keywords." },
        },
        required: ["library", "query"],
      },
    },
    archive: { type: "array", items: keywordQuery },
    videoQueries: {
      type: "array",
      items: { type: "string", description: "A YouTube search query, 3-7 words, in the language of the videos wanted." },
    },
    videos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          channel: { type: "string" },
          url: { type: "string", description: "Exact YouTube watch URL." },
        },
        required: ["title", "channel", "url"],
      },
    },
    sites: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          type: { type: "string", enum: RESOURCE_TYPES },
        },
        required: ["title", "url", "type"],
      },
    },
    searches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: RESOURCE_TYPES },
          provider: { type: "string", enum: SEARCH_PROVIDERS },
          query: { type: "string" },
          label: { type: "string", description: "Short button label in the notes' language, at most 6 words." },
        },
        required: ["type", "provider", "query", "label"],
      },
    },
  },
  required: ["language", "topics", "wiki", "videoQueries", "videos", "searches"],
};

export interface ResourcePlan {
  language: string;
  topics: string[];
  wiki: { project: "wikibooks" | "wikipedia"; lang: string; query: string }[];
  libretexts?: { library: string; query: string }[];
  archive?: string[];
  videoQueries: string[];
  videos: { title: string; channel: string; url: string }[];
  sites?: { title: string; url: string; type: ResourceType }[];
  searches: { type: ResourceType; provider: SearchProvider; query: string; label: string }[];
}

const LANGUAGE_RULES: Record<ResourceLanguageMode, string> = {
  mixed:
    "Use the notes' language for most searches, and add English searches (and English videos) where the best free material is in English.",
  native:
    "Use only the notes' language for every search, video and site. Skip LibreTexts unless the notes are in English.",
};

export function resourcePlanPrompt(set: StudySet, languageMode: ResourceLanguageMode, focus?: string) {
  return `Plan a search for free online materials that complement a student's notes: videos, exercise sheets and problem sets, free books, courses and articles.

Return:
- language and topics.
- wiki: 4-8 searches on Wikibooks (free textbooks, including exercise and answer pages) and Wikipedia.
- libretexts: 0-3 searches on LibreTexts (free English textbooks with exercise pages), only when the subject fits one of its libraries. Put "exercises" in one query when practice fits.
- archive: 0-2 searches for free, openly licensed or public-domain books on the Internet Archive (matched against book titles).
- videoQueries: 2-4 YouTube searches that would find good lecture or explainer videos on the most important topics.
- videos: 4-8 specific YouTube videos from well-known educational channels, with exact watch URLs. Only include videos you are confident exist; every link is checked and wrong ones are discarded.
- sites: 0-6 specific pages on well-known free educational sites (open courses, lecture notes, problem sets with solutions, interactive tools), with exact URLs. Every link is checked and wrong ones are discarded.
- searches: 4-6 ready-made searches the student can run themselves. Providers: youtube (videos), google, google_pdf (finds PDF files, ideal for exercise sheets and past exams), khan (Khan Academy), archive (Internet Archive). Include at least one google_pdf search for exercises. Write plain keywords; never add search operators such as filetype: or site:.

Language: ${LANGUAGE_RULES[languageMode]}${focus ? `\nFocus especially on: ${focus}` : ""}

<notes title="${set.title}">
${set.notes.slice(0, 15_000)}
</notes>`;
}

export const RESOURCE_CURATE_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: RESOURCE_TYPES },
          description: { type: "string", description: "One sentence, at most 25 words." },
        },
        required: ["id", "type", "description"],
      },
    },
  },
  required: ["picks"],
};

export interface ResourceCandidateView {
  id: string;
  type: ResourceType;
  source: string;
  language?: string;
  title: string;
  snippet?: string;
}

export function resourceCuratePrompt(
  topics: string[],
  language: string,
  languageMode: ResourceLanguageMode,
  candidates: ResourceCandidateView[],
  focus?: string,
) {
  const allowed = languageMode === "mixed" && language !== "en" ? `${language} or en` : language;
  return `A student's notes cover: ${topics.join("; ")}.${focus ? ` They want to focus on: ${focus}.` : ""}

Below are free online materials whose links were checked, with their real titles. Pick the ones that will genuinely help this student.
- Pick at most 18. Skip anything off-topic, only loosely related, duplicated, or clearly aimed at a very different level.
- Only pick materials in these languages: ${allowed}. Materials with an unknown language are fine if the title matches.
- Never pick what looks like an unauthorized copy of a copyrighted commercial book (for example a modern textbook uploaded by a third party). Openly licensed, public-domain and author-published materials are fine.
- Aim for variety across videos, exercises, books, courses and articles when the candidates allow it, but never add a weak pick just for variety.
- type: the correct type of each pick. Use "exercises" for problem sets, exercise sheets, worked problems and answer pages.
- description: one sentence (at most 25 words) in the language with ISO code "${language}", saying what it covers and why it helps.
- Order the picks from most to least useful. Use the ids exactly as given.

Candidates (id | type | source | language | title | snippet):
${candidates
  .map((c) => [c.id, c.type, c.source, c.language ?? "?", c.title, c.snippet?.slice(0, 160) ?? ""].join(" | "))
  .join("\n")}`;
}
