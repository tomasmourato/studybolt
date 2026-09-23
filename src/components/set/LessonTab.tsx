"use client";

import clsx from "clsx";
import {
  ArrowRight,
  Check,
  GraduationCap,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chatWithTutor,
  clearTutorChat,
  createLesson,
  makeSectionAudio,
  makeSectionImage,
  updateLessonProgress,
} from "@/lib/actions";
import { openFileUrl, type OpenedFile } from "@/lib/files";
import { useFileUrl } from "@/lib/hooks";
import type { Lesson, LessonCheck, LessonLength, LessonLevel, LessonMedia, LessonSection } from "@/lib/types";
import { Markdown } from "../Markdown";
import { ChatPanel } from "./ChatPanel";
import { EmptyPanel, ErrorNote, btn, selectClass, type TabProps } from "./ui";

const LEVELS: { id: LessonLevel; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

const LENGTHS: { id: LessonLength; label: string }[] = [
  { id: "short", label: "Short · 4 parts" },
  { id: "standard", label: "Standard · 6 parts" },
  { id: "deep", label: "Deep dive · 9 parts" },
];

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const READ_ALOUD_KEY = "studybolt:lesson-read-aloud";

export function LessonTab({ set, patch }: TabProps) {
  const lesson = set.lesson;
  const [level, setLevel] = useState<LessonLevel>(lesson?.level ?? "intermediate");
  const [length, setLength] = useState<LessonLength>(lesson?.length ?? "standard");
  const [focus, setFocus] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  async function generate() {
    setStarting(true);
    setError(null);
    try {
      const next = await createLesson(set.id, { level, length, focus });
      patch({ lesson: next });
      setSetupOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the lesson.");
    } finally {
      setStarting(false);
    }
  }

  if (lesson?.status === "generating") {
    return (
      <EmptyPanel
        icon={GraduationCap}
        title="Designing your lesson"
        body="Writing explanations, checkpoint questions and illustration ideas. This usually takes under a minute."
      >
        <LoaderCircle className="size-6 animate-spin text-accent" />
      </EmptyPanel>
    );
  }

  if (!lesson || lesson.status === "error" || !lesson.sections.length || setupOpen) {
    return (
      <EmptyPanel
        icon={GraduationCap}
        title={setupOpen ? "Create a new lesson" : "Interactive lesson"}
        body="Learn step by step with short explanations, illustrations and checkpoint questions, with an optional narrator and a tutor to ask along the way."
      >
        {lesson?.status === "error" && lesson.error && !setupOpen && <ErrorNote>{lesson.error}</ErrorNote>}
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as LessonLevel)}
            className={clsx(selectClass, "flex-1")}
            aria-label="Level"
          >
            {LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <select
            value={length}
            onChange={(e) => setLength(e.target.value as LessonLength)}
            className={clsx(selectClass, "flex-1")}
            aria-label="Length"
          >
            {LENGTHS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Focus on… (optional)"
          className={clsx(selectClass, "w-full px-4")}
        />
        <div className="flex gap-2">
          {setupOpen && (
            <button type="button" onClick={() => setSetupOpen(false)} className={btn.secondary}>
              Cancel
            </button>
          )}
          <button type="button" onClick={generate} disabled={starting} className={btn.primary}>
            {starting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {setupOpen ? "Create new lesson" : "Create lesson"}
          </button>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </EmptyPanel>
    );
  }

  return <LessonPlayer setId={set.id} lesson={lesson} patch={patch} onNewLesson={() => setSetupOpen(true)} />;
}

type AudioState = { sectionId: string; status: "loading" | "playing" | "paused" } | null;

function LessonPlayer({
  setId,
  lesson,
  patch,
  onNewLesson,
}: {
  setId: string;
  lesson: Lesson;
  patch: TabProps["patch"];
  onNewLesson: () => void;
}) {
  const { sections } = lesson;
  const current = Math.min(lesson.progress, sections.length - 1);
  const currentSection = sections[current];
  const canContinue = !currentSection.check || currentSection.check.chosen !== undefined;
  const finished = current === sections.length - 1 && canContinue;

  const [readAloud, setReadAloud] = useState(() => {
    try {
      return localStorage.getItem(READ_ALOUD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [audio, setAudio] = useState<AudioState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tutorHidden, setTutorHidden] = useState(false);
  const [mobileTutor, setMobileTutor] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playToken = useRef(0);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const lastCurrent = useRef(current);
  const imageBusy = useRef(false);
  const imageRequested = useRef(new Set<string>());
  const narration = useRef<OpenedFile | null>(null);

  const patchLesson = useCallback(
    (change: (lesson: Lesson) => Partial<Lesson>) =>
      patch((s) => (s.lesson ? { lesson: { ...s.lesson, ...change(s.lesson) } } : {})),
    [patch],
  );

  const patchSection = useCallback(
    (sectionId: string, change: (section: LessonSection) => Partial<LessonSection>) =>
      patchLesson((l) => ({ sections: l.sections.map((s) => (s.id === sectionId ? { ...s, ...change(s) } : s)) })),
    [patchLesson],
  );

  // Illustrations are created one at a time, only for parts the student has reached.
  useEffect(() => {
    if (imageBusy.current) return;
    const next = sections
      .slice(0, current + 1)
      .find((s) => s.image && s.image.media?.status !== "ready" && s.image.media?.status !== "failed" && !imageRequested.current.has(s.id));
    if (!next) return;
    imageBusy.current = true;
    imageRequested.current.add(next.id);
    const save = (media: LessonMedia) => {
      imageBusy.current = false;
      patchSection(next.id, (s) => ({ image: s.image && { ...s.image, media } }));
    };
    makeSectionImage(setId, next.id)
      .then(save)
      .catch((err: Error) => save({ status: "failed", error: err.message }));
  }, [current, sections, setId, patchSection]);

  // Bring a newly opened part into view.
  useEffect(() => {
    if (current > lastCurrent.current) {
      sectionRefs.current.get(sections[current].id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    lastCurrent.current = current;
  }, [current, sections]);

  useEffect(() => {
    const player = audioRef.current;
    return () => {
      player?.pause();
      narration.current?.release();
    };
  }, []);

  const play = useCallback(
    async (section: LessonSection) => {
      const player = audioRef.current;
      if (!player) return;
      const token = ++playToken.current;
      player.pause();
      setNotice(null);
      setAudio({ sectionId: section.id, status: "loading" });
      try {
        let media = section.audio;
        if (media?.status !== "ready") {
          media = await makeSectionAudio(setId, section.id);
          patchSection(section.id, () => ({ audio: media }));
          if (media.status !== "ready") throw new Error(media.error ?? "Couldn't create the narration.");
        }
        const opened = media.file ? await openFileUrl(media.file) : null;
        if (!opened) throw new Error("This narration is missing. Try again.");
        // Another part may have been started while this narration was being made.
        if (token !== playToken.current) return opened.release();
        narration.current?.release();
        narration.current = opened;
        player.src = opened.url;
        await player.play();
        setAudio({ sectionId: section.id, status: "playing" });
      } catch (err) {
        if (token !== playToken.current) return;
        setAudio(null);
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setNotice("Your browser blocked autoplay. Press Listen to hear this part.");
        } else if (!(err instanceof DOMException && err.name === "AbortError")) {
          setNotice(err instanceof Error ? err.message : "Couldn't play the narration.");
        }
      }
    },
    [patchSection, setId],
  );

  function stopAudio() {
    playToken.current++;
    audioRef.current?.pause();
    setAudio(null);
  }

  function toggleAudio(section: LessonSection) {
    const player = audioRef.current;
    if (player && audio?.sectionId === section.id) {
      if (audio.status === "playing") {
        player.pause();
        setAudio({ ...audio, status: "paused" });
      } else if (audio.status === "paused") {
        void player.play();
        setAudio({ ...audio, status: "playing" });
      }
      return;
    }
    void play(section);
  }

  function toggleReadAloud() {
    const next = !readAloud;
    setReadAloud(next);
    try {
      localStorage.setItem(READ_ALOUD_KEY, next ? "1" : "0");
    } catch {}
    if (next) void play(currentSection);
    else stopAudio();
  }

  function advance() {
    if (!canContinue || current >= sections.length - 1) return;
    const nextIndex = current + 1;
    patchLesson(() => ({ progress: nextIndex }));
    updateLessonProgress(setId, { progress: nextIndex }).catch(() => {});
    if (readAloud) void play(sections[nextIndex]);
    else stopAudio();
  }

  function answer(section: LessonSection, option: number) {
    if (!section.check || section.check.chosen !== undefined) return;
    patchSection(section.id, (s) => ({ check: s.check && { ...s.check, chosen: option } }));
    updateLessonProgress(setId, { answer: { sectionId: section.id, option } }).catch(() => {});
  }

  function restart() {
    stopAudio();
    lastCurrent.current = 0;
    patchLesson((l) => ({
      progress: 0,
      sections: l.sections.map((s) => (s.check ? { ...s, check: { ...s.check, chosen: undefined } } : s)),
    }));
    window.scrollTo({ top: 0, behavior: "smooth" });
    updateLessonProgress(setId, { reset: true }).catch(() => {});
  }

  function openTutor() {
    if (window.matchMedia("(min-width: 1024px)").matches) setTutorHidden(false);
    else setMobileTutor(true);
  }

  const checks = sections.filter((s) => s.check);
  const correct = checks.filter((s) => s.check!.chosen === s.check!.answerIndex).length;

  return (
    <div className={clsx("grid gap-8", !tutorHidden && "lg:grid-cols-[minmax(0,1fr)_22rem]")}>
      <div className="min-w-0">
        <header className="rounded-3xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                Lesson · {LEVELS.find((l) => l.id === lesson.level)?.label}
              </p>
              <h2 className="mt-1 font-display text-3xl font-bold tracking-tight">{lesson.title}</h2>
              {lesson.objective && <p className="mt-2 text-muted">{lesson.objective}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={toggleReadAloud}
                aria-pressed={readAloud}
                className={clsx(btn.secondary, readAloud && "border-accent bg-accent-soft text-accent")}
              >
                <Volume2 className="size-4" /> Read aloud: {readAloud ? "on" : "off"}
              </button>
              <button type="button" onClick={onNewLesson} className={btn.ghost}>
                <Sparkles className="size-4" /> New lesson
              </button>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${((current + (canContinue ? 1 : 0.5)) / sections.length) * 100}%` }}
              />
            </div>
            <span className="text-sm tabular-nums text-muted">
              Part {current + 1} of {sections.length}
            </span>
          </div>
        </header>

        <ol className="mt-8 flex flex-col gap-8">
          {sections.slice(0, current + 1).map((section, i) => (
            <li
              key={section.id}
              ref={(el) => {
                if (el) sectionRefs.current.set(section.id, el);
                else sectionRefs.current.delete(section.id);
              }}
              className="scroll-mt-32"
            >
              <SectionView
                section={section}
                index={i}
                audioStatus={audio?.sectionId === section.id ? audio.status : null}
                onToggleAudio={() => toggleAudio(section)}
                onAnswer={(option) => answer(section, option)}
              />
            </li>
          ))}
        </ol>

        {notice && (
          <div className="mt-4">
            <ErrorNote>{notice}</ErrorNote>
          </div>
        )}

        {finished ? (
          <div className="mt-10 rounded-3xl bg-ink p-8 text-center text-bg">
            <Trophy className="mx-auto size-10 text-bolt" />
            <h3 className="mt-3 font-display text-3xl font-bold">Lesson complete!</h3>
            {checks.length > 0 && (
              <p className="mt-2 opacity-80">
                You got {correct} of {checks.length} checkpoint questions right.
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={restart}
                className="inline-flex items-center gap-2 rounded-full bg-bg px-5 py-2.5 text-sm font-semibold text-ink"
              >
                <RotateCcw className="size-4" /> Restart lesson
              </button>
              <button
                type="button"
                onClick={onNewLesson}
                className="inline-flex items-center gap-2 rounded-full border border-bg/30 px-5 py-2.5 text-sm font-semibold"
              >
                <Sparkles className="size-4" /> New lesson
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-2">
            <button type="button" onClick={advance} disabled={!canContinue} className={btn.dark}>
              Continue to part {current + 2} <ArrowRight className="size-4" />
            </button>
            {!canContinue && <p className="text-sm text-muted">Answer the checkpoint to continue.</p>}
          </div>
        )}
      </div>

      <aside
        className={
          mobileTutor ? "fixed inset-0 z-50 flex flex-col bg-bg p-4" : tutorHidden ? "hidden" : "hidden lg:block"
        }
      >
        <div
          className={clsx(
            "flex flex-col rounded-2xl border border-line bg-surface p-4",
            mobileTutor ? "h-full" : "sticky top-32 h-[calc(100vh-9.5rem)]",
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold">
              <MessageCircle className="size-4 text-accent" /> Lesson tutor
            </p>
            <button
              type="button"
              onClick={() => (mobileTutor ? setMobileTutor(false) : setTutorHidden(true))}
              className={btn.ghost}
              aria-label="Hide tutor"
            >
              <X className="size-4" />
            </button>
          </div>
          <ChatPanel
            compact
            className="flex-1"
            send={(message) => chatWithTutor(setId, message, current)}
            onClear={() => clearTutorChat(setId)}
            messages={lesson.chat}
            onMessages={(chat) => patchLesson(() => ({ chat }))}
            suggestions={[
              `Explain part ${current + 1} another way`,
              "Give me a real-world example",
              "What should I remember from this part?",
            ]}
            emptyTitle="Stuck on something?"
            emptyBody="Ask the tutor anything about this lesson."
            placeholder="Ask the tutor…"
          />
        </div>
      </aside>

      {!mobileTutor && (
        <button
          type="button"
          onClick={openTutor}
          className={clsx(
            "fixed bottom-6 right-6 z-40 items-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-accent-ink shadow-lg",
            tutorHidden ? "flex" : "flex lg:hidden",
          )}
        >
          <MessageCircle className="size-4" /> Ask the tutor
        </button>
      )}

      <audio ref={audioRef} onEnded={() => setAudio(null)} className="hidden" />
    </div>
  );
}

function SectionView({
  section,
  index,
  audioStatus,
  onToggleAudio,
  onAnswer,
}: {
  section: LessonSection;
  index: number;
  audioStatus: "loading" | "playing" | "paused" | null;
  onToggleAudio: () => void;
  onAnswer: (option: number) => void;
}) {
  const media = section.image?.media;
  const imageUrl = useFileUrl(media?.status === "ready" ? media.file : undefined);
  return (
    <article className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Part {index + 1}</p>
          <h3 className="mt-1 font-display text-2xl font-bold">{section.heading}</h3>
        </div>
        <button type="button" onClick={onToggleAudio} disabled={audioStatus === "loading"} className={btn.secondary}>
          {audioStatus === "loading" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : audioStatus === "playing" ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
          {audioStatus === "loading" ? "Preparing…" : audioStatus === "playing" ? "Pause" : "Listen"}
        </button>
      </div>

      <Markdown className="mt-4">{section.body}</Markdown>

      {section.image && (
        <figure className="mt-6">
          <div className="grid aspect-video place-items-center overflow-hidden rounded-2xl border border-line bg-surface-2">
            {media?.status === "ready" && imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={section.image.caption || section.image.prompt}
                className="size-full object-contain"
              />
            ) : media?.status === "failed" ? (
              <p className="flex items-center gap-2 px-6 text-center text-sm text-muted">
                <ImageIcon className="size-4" /> Illustration unavailable
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <LoaderCircle className="size-4 animate-spin" /> Drawing an illustration…
              </p>
            )}
          </div>
          {section.image.caption && (
            <figcaption className="mt-2 text-center text-sm text-muted">{section.image.caption}</figcaption>
          )}
        </figure>
      )}

      {section.check && <CheckQuestion check={section.check} onAnswer={onAnswer} />}
    </article>
  );
}

function CheckQuestion({ check, onAnswer }: { check: LessonCheck; onAnswer: (option: number) => void }) {
  const answered = check.chosen !== undefined;
  return (
    <div className="mt-6 rounded-2xl bg-surface-2 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">Checkpoint</p>
      <div className="mt-2 font-semibold">
        <Markdown>{check.question}</Markdown>
      </div>
      <div className="mt-4 grid gap-2">
        {check.options.map((option, i) => {
          const isAnswer = i === check.answerIndex;
          const isChosen = i === check.chosen;
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => onAnswer(i)}
              className={clsx(
                "flex items-center gap-3 rounded-xl border-2 bg-surface px-4 py-3 text-left text-sm transition",
                !answered && "border-line hover:border-accent",
                answered && isAnswer && "border-good bg-good-soft",
                answered && isChosen && !isAnswer && "border-bad bg-bad-soft",
                answered && !isAnswer && !isChosen && "border-line opacity-60",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-bold">
                {answered && isAnswer ? (
                  <Check className="size-4 text-good" />
                ) : answered && isChosen ? (
                  <X className="size-4 text-bad" />
                ) : (
                  LETTERS[i]
                )}
              </span>
              <span className="min-w-0 flex-1">
                <Markdown className="prose-sm prose-p:my-0">{option}</Markdown>
              </span>
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-4 text-sm">
          <p className="font-semibold">{check.chosen === check.answerIndex ? "✅ Correct!" : "❌ Not quite."}</p>
          {check.explanation && <Markdown className="prose-sm mt-1">{check.explanation}</Markdown>}
        </div>
      )}
    </div>
  );
}
