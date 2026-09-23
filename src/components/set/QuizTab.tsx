"use client";

import clsx from "clsx";
import { ArrowRight, Check, ListChecks, LoaderCircle, RotateCcw, Sparkles, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { generateQuiz, recordQuizAttempt } from "@/lib/actions";
import { timeAgo } from "@/lib/client";
import { Markdown } from "../Markdown";
import { EmptyPanel, ErrorNote, btn, selectClass, type TabProps } from "./ui";

type Phase = "setup" | "taking" | "done";
const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function QuizTab({ set, patch }: TabProps) {
  const questions = set.quiz;
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState("medium");
  const [focus, setFocus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);

  const question = questions[index];
  const selected = answers[index] ?? null;
  const score = answers.filter((a, i) => a === questions[i]?.answerIndex).length;

  function start() {
    setAnswers(questions.map(() => null));
    setIndex(0);
    setPhase("taking");
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const quiz = await generateQuiz(set.id, { count, difficulty, focus });
      patch({ quiz });
      setAnswers(quiz.map(() => null));
      setIndex(0);
      setPhase("taking");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a quiz.");
    } finally {
      setGenerating(false);
    }
  }

  const choose = useCallback(
    (option: number) => {
      if (selected !== null) return;
      setAnswers((prev) => prev.map((a, i) => (i === index ? option : a)));
    },
    [index, selected],
  );

  const next = useCallback(() => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }
    setPhase("done");
    const finalScore = answers.filter((a, i) => a === questions[i].answerIndex).length;
    recordQuizAttempt(set.id, finalScore, questions.length)
      .then((quizAttempts) => patch({ quizAttempts }))
      .catch(() => {});
  }, [answers, index, patch, questions, set.id]);

  useEffect(() => {
    if (phase !== "taking") return;
    const onKey = (event: KeyboardEvent) => {
      const n = Number(event.key);
      if (n >= 1 && n <= (question?.options.length ?? 0)) choose(n - 1);
      else if (event.key === "Enter" && selected !== null) next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, question, selected, choose, next]);

  const options = (
    <div className="flex w-full flex-col gap-3 sm:flex-row">
      <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={selectClass} aria-label="Number of questions">
        {[5, 10, 15, 20].map((n) => (
          <option key={n} value={n}>
            {n} questions
          </option>
        ))}
      </select>
      <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={selectClass} aria-label="Difficulty">
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>
      <input
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        placeholder="Focus on… (optional)"
        className={clsx(selectClass, "flex-1 px-4")}
      />
    </div>
  );

  const generateButton = (label: string) => (
    <button type="button" onClick={generate} disabled={generating} className={btn.primary}>
      {generating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {generating ? "Writing questions…" : label}
    </button>
  );

  if (phase === "setup" || !question) {
    const attempts = [...set.quizAttempts].reverse();
    return (
      <EmptyPanel
        icon={ListChecks}
        title="Practice quiz"
        body={
          questions.length
            ? `You have a ${questions.length}-question quiz ready. Take it again or make a fresh one.`
            : "Test yourself with multiple-choice questions and instant explanations."
        }
      >
        {questions.length > 0 && (
          <button type="button" onClick={start} className={btn.dark}>
            Start quiz <ArrowRight className="size-4" />
          </button>
        )}
        <div className="mt-2 flex w-full flex-col items-center gap-3 border-t border-line pt-6">
          {options}
          {generateButton(questions.length ? "Generate new quiz" : "Generate quiz")}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        {attempts.length > 0 && (
          <ul className="w-full divide-y divide-line rounded-2xl border border-line bg-surface text-left text-sm">
            {attempts.slice(0, 5).map((attempt) => (
              <li key={attempt.at} className="flex justify-between px-4 py-2.5">
                <span className="text-muted">{timeAgo(attempt.at)}</span>
                <span className="font-semibold">
                  {attempt.score}/{attempt.total} · {Math.round((attempt.score / attempt.total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </EmptyPanel>
    );
  }

  if (phase === "done") {
    const percent = Math.round((score / questions.length) * 100);
    const missed = questions.map((q, i) => ({ q, answer: answers[i] })).filter(({ q, answer }) => answer !== q.answerIndex);
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <div className="rounded-3xl border border-line bg-surface p-8 text-center">
          <Trophy className="mx-auto size-10 text-bolt" />
          <p className="mt-3 font-display text-6xl font-extrabold">{percent}%</p>
          <p className="mt-2 text-muted">
            {score} of {questions.length} correct ·{" "}
            {percent >= 90 ? "Outstanding!" : percent >= 70 ? "Solid work." : percent >= 50 ? "Getting there." : "Keep practicing."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={start} className={btn.dark}>
              <RotateCcw className="size-4" /> Retake
            </button>
            <button type="button" onClick={() => setPhase("setup")} className={btn.secondary}>
              New quiz
            </button>
          </div>
        </div>
        {missed.length > 0 && (
          <section>
            <h2 className="mb-4 font-display text-xl font-bold">Review what you missed</h2>
            <ul className="flex flex-col gap-4">
              {missed.map(({ q }) => (
                <li key={q.id} className="rounded-2xl border border-line bg-surface p-5">
                  <Markdown>{q.question}</Markdown>
                  <p className="mt-3 flex items-start gap-2 text-sm font-medium text-good">
                    <Check className="mt-0.5 size-4 shrink-0" />
                    <span>{q.options[q.answerIndex]}</span>
                  </p>
                  {q.explanation && <p className="mt-2 text-sm text-muted">{q.explanation}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <div className="flex justify-between text-sm text-muted">
          <span>
            Question {index + 1} of {questions.length}
          </span>
          <span>{score} correct</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
        </div>
      </div>

      <div className="text-xl font-semibold">
        <Markdown className="prose-lg">{question.question}</Markdown>
      </div>

      <div className="flex flex-col gap-3">
        {question.options.map((option, i) => {
          const isAnswer = i === question.answerIndex;
          const isChosen = i === selected;
          return (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              disabled={selected !== null}
              className={clsx(
                "flex items-center gap-3 rounded-2xl border-2 bg-surface px-4 py-3.5 text-left transition",
                selected === null && "border-line hover:border-accent",
                selected !== null && isAnswer && "border-good bg-good-soft",
                selected !== null && isChosen && !isAnswer && "border-bad bg-bad-soft",
                selected !== null && !isAnswer && !isChosen && "border-line opacity-60",
              )}
            >
              <span
                className={clsx(
                  "grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold",
                  selected !== null && isAnswer ? "bg-good text-white" : selected !== null && isChosen ? "bg-bad text-white" : "bg-surface-2",
                )}
              >
                {selected !== null && isAnswer ? <Check className="size-4" /> : selected !== null && isChosen ? <X className="size-4" /> : LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1">
                <Markdown className="prose-p:my-0">{option}</Markdown>
              </span>
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <div className="flex flex-col gap-4 rounded-2xl bg-surface-2 p-5">
          <p className="font-semibold">{selected === question.answerIndex ? "✅ Correct!" : "❌ Not quite."}</p>
          {question.explanation && <Markdown>{question.explanation}</Markdown>}
          <button type="button" onClick={next} className={clsx(btn.dark, "self-end")}>
            {index + 1 < questions.length ? "Next question" : "See results"} <ArrowRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
