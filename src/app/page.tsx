import {
  ArrowRight,
  Brain,
  Check,
  FileText,
  HardDrive,
  Headphones,
  Image as ImageIcon,
  KeyRound,
  Layers,
  ListChecks,
  MessageCircle,
  Mic,
  MonitorPlay,
  NotebookPen,
  Sparkles,
  Type,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { GitHubMark } from "@/components/GitHubMark";
import { Logo } from "@/components/Logo";
import { APP_NAME, REPO_URL } from "@/lib/brand";

const INPUTS = [
  { icon: Mic, label: "Lecture recordings" },
  { icon: FileText, label: "PDFs & slides" },
  { icon: MonitorPlay, label: "YouTube videos" },
  { icon: NotebookPen, label: "Word docs" },
  { icon: ImageIcon, label: "Photos of notes" },
  { icon: Type, label: "Pasted text" },
];

const FEATURES = [
  {
    icon: NotebookPen,
    title: "Notes that actually teach",
    body: "Structured notes with summaries, tables, equations and diagrams, written the way a great tutor would explain it.",
  },
  {
    icon: Layers,
    title: "Flashcards with spaced repetition",
    body: "Decks generated in one click. Cards you miss come back sooner, and your memory score shows what's sticking.",
  },
  {
    icon: ListChecks,
    title: "Practice quizzes",
    body: "Multiple-choice questions at the difficulty you pick, with an explanation for every answer.",
  },
  {
    icon: MessageCircle,
    title: "Chat with your material",
    body: "Ask follow-ups, get concepts re-explained, or have it quiz you. Answers stay grounded in your notes.",
  },
  {
    icon: Headphones,
    title: "Podcast mode",
    body: "Turn any set into a two-host audio episode and review on your commute, walk or workout.",
  },
  {
    icon: Mic,
    title: "Record class live",
    body: "Hit record in lecture and get notes and a full transcript the moment class ends.",
  },
];

const STEPS = [
  { icon: KeyRound, title: "Connect your free Gemini key", body: "A short guide shows you how to get one from Google AI Studio in about a minute." },
  { icon: Upload, title: "Add your material", body: "Upload a file, paste a YouTube link, record a lecture, or paste text." },
  { icon: Sparkles, title: "Gemini does the heavy lifting", body: "Notes stream in within seconds, along with a full transcript." },
  { icon: Brain, title: "Study your way", body: "Flip flashcards, take quizzes, chat, or listen to the podcast." },
];

const PRIVACY = [
  {
    icon: KeyRound,
    title: "Your key, never ours",
    body: "You bring your own Gemini API key. It stays in your browser and goes straight to Google. Our server never receives it.",
  },
  {
    icon: HardDrive,
    title: "No database, no accounts",
    body: "Study sets, uploads and audio are saved in your browser on your device. There's nothing of yours on our servers.",
  },
  {
    icon: GitHubMark,
    title: "Open source",
    body: "Every line of code is public on GitHub, so anyone can check what the app does with your key and your files.",
  },
];

const FAQS = [
  {
    q: "What does it cost?",
    a: `${APP_NAME} is free and open source. It runs on your own Google Gemini API key, which you can create for free in Google AI Studio. Gemini's free tier covers plenty of studying; if you enable billing, Google bills you directly.`,
  },
  {
    q: "Is my API key safe?",
    a: "Your key is kept only in your browser: for the current tab, or on your device if you tick “Remember”. It is sent only to Google's Gemini API, never to StudyBolt's server, and it's never written to a database. The code is open source on GitHub, so you can check this yourself. You can remove the key from the app or delete it in AI Studio at any time.",
  },
  {
    q: "What can I upload?",
    a: "PDFs, Word documents, audio (MP3, M4A, WAV and more), video, images, plain text, and public YouTube links. Recordings can run for hours.",
  },
  {
    q: "Where is my data stored?",
    a: "In your browser, on your device. Files are sent from your browser to the Gemini API for processing, and Google deletes uploaded files after 48 hours. The only thing our server sees is the search keywords the Resources tab uses to check links. Clearing your browser's site data deletes your study sets, and they don't sync between devices.",
  },
  {
    q: "Does Google use what I upload?",
    a: "On Gemini's free tier, Google may use what you send to improve its products, and people may review it. Avoid uploading anything confidential, or enable billing in Google AI Studio, which turns that off.",
  },
  {
    q: "How accurate are the notes?",
    a: "The notes stick closely to your source and include the full transcript for reference, but AI can make mistakes. Double-check anything critical against the original.",
  },
];

function ProductPreview() {
  return (
    <div className="relative mx-auto mt-16 max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(20,20,40,0.35)]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="size-3 rounded-full bg-line" />
          <span className="size-3 rounded-full bg-line" />
          <span className="size-3 rounded-full bg-line" />
          <div className="ml-4 flex gap-1 text-xs font-medium">
            {["Notes", "Flashcards", "Quiz", "Chat", "Podcast"].map((tab, i) => (
              <span key={tab} className={i === 0 ? "rounded-md bg-ink px-2.5 py-1 text-bg" : "px-2.5 py-1 text-muted"}>
                {tab}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-8 p-6 text-left sm:p-10 md:grid-cols-[1fr_260px]">
          <div>
            <p className="text-sm text-muted">🌿 Biology 101 · Lecture 7</p>
            <h3 className="mt-1 font-display text-2xl font-bold sm:text-3xl">Photosynthesis, explained</h3>
            <div className="mt-5 rounded-r-xl border-l-4 border-accent bg-accent-soft px-4 py-3 text-sm">
              <strong>TL;DR:</strong> Plants capture light energy to turn water and CO₂ into glucose, releasing oxygen along the way.
            </div>
            <h4 className="mt-6 font-display text-lg font-semibold">☀️ Light-dependent reactions</h4>
            <ul className="mt-2 space-y-1.5 text-sm text-muted">
              <li>• Happen in the <strong className="text-ink">thylakoid membranes</strong></li>
              <li>• Split water, releasing O₂ as a by-product</li>
              <li>• Produce ATP and NADPH to power the Calvin cycle</li>
            </ul>
            <div className="mt-5 overflow-hidden rounded-xl border border-line text-sm">
              <div className="grid grid-cols-3 bg-surface-2 px-3 py-2 font-semibold">
                <span>Stage</span>
                <span>Location</span>
                <span>Output</span>
              </div>
              <div className="grid grid-cols-3 border-t border-line px-3 py-2 text-muted">
                <span>Light</span>
                <span>Thylakoid</span>
                <span>ATP, NADPH</span>
              </div>
              <div className="grid grid-cols-3 border-t border-line px-3 py-2 text-muted">
                <span>Calvin</span>
                <span>Stroma</span>
                <span>Glucose</span>
              </div>
            </div>
          </div>
          <div className="hidden flex-col gap-4 md:flex">
            <div className="rounded-xl border border-line bg-bg p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Flashcard</p>
              <p className="mt-2 font-medium">Where does the Calvin cycle take place?</p>
              <div className="mt-4 flex gap-2 text-xs font-semibold">
                <span className="flex-1 rounded-lg bg-bad-soft py-2 text-center text-bad">Still learning</span>
                <span className="flex-1 rounded-lg bg-good-soft py-2 text-center text-good">Got it</span>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-bg p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Quiz · 8 / 10</p>
              <p className="mt-2 text-sm font-medium">Which molecule is split to release oxygen?</p>
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-sm text-good">
                <Check className="size-4" /> Water (H₂O)
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-ink p-4 text-bg">
              <span className="grid size-9 place-items-center rounded-full bg-bolt text-ink">
                <Headphones className="size-4" />
              </span>
              <div className="text-sm">
                <p className="font-semibold">Podcast ready</p>
                <p className="opacity-70">4:12 · Alex &amp; Sam</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <div className="hidden items-center gap-8 text-sm text-muted md:flex">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#privacy" className="hover:text-ink">Privacy</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-ink">
              <GitHubMark className="size-4" /> GitHub
            </a>
          </div>
          <Link href="/library" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90">
            Open app
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="px-5 pb-24 pt-16 text-center sm:pt-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted">
            <Sparkles className="size-4 text-accent" /> Free, open source and powered by Google Gemini
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
            Learn anything at{" "}
            <span className="relative whitespace-nowrap">
              <span className="absolute inset-x-0 bottom-1 -z-10 h-[0.38em] -rotate-1 rounded bg-bolt sm:bottom-2" />
              lightning speed
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted sm:text-xl">
            Drop in a lecture recording, PDF, YouTube video or your own notes. {APP_NAME} turns it into clear notes,
            flashcards, quizzes and a podcast in seconds.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/library"
              className="group flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-base font-semibold text-accent-ink shadow-sm transition hover:opacity-90"
            >
              Start studying free <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </Link>
            <a href="#how" className="rounded-full px-6 py-3.5 font-semibold text-ink hover:bg-surface-2">
              See how it works
            </a>
          </div>
          <ul className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2">
            {INPUTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm">
                <Icon className="size-4 text-muted" /> {label}
              </li>
            ))}
          </ul>
          <ProductPreview />
        </section>

        <section id="features" className="border-t border-line bg-surface px-5 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Everything you need to go from lecture to A.
            </h2>
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="bg-surface p-7">
                  <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="px-5 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Four steps. Zero busywork.</h2>
            <ol className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="rounded-2xl border border-line bg-surface p-7">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-5xl font-extrabold text-line">{i + 1}</span>
                    <Icon className="size-6 text-accent" />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="privacy" className="border-t border-line px-5 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Your key and your notes stay yours.
            </h2>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {PRIVACY.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-2xl border border-line bg-surface p-7">
                  <span className="grid size-10 place-items-center rounded-xl bg-good-soft text-good">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-muted">{body}</p>
                </div>
              ))}
            </div>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold transition hover:bg-surface-2"
            >
              <GitHubMark className="size-4" /> Read the code on GitHub
            </a>
          </div>
        </section>

        <section id="faq" className="border-t border-line bg-surface px-5 py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-4xl font-bold tracking-tight">Questions, answered</h2>
            <div className="mt-10 divide-y divide-line border-y border-line">
              {FAQS.map(({ q, a }) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold">
                    {q}
                    <span className="text-2xl text-muted transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-24">
          <div className="mx-auto flex max-w-6xl flex-col items-center rounded-3xl bg-ink px-6 py-16 text-center text-bg">
            <h2 className="max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Your next exam is coming. Be ready.
            </h2>
            <Link
              href="/library"
              className="mt-8 flex items-center gap-2 rounded-full bg-bolt px-7 py-3.5 font-semibold text-[#17161b] transition hover:opacity-90"
            >
              Create your first study set <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-muted sm:flex-row">
          <Logo />
          <p className="flex items-center gap-1.5">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-ink">
              <GitHubMark className="size-4" /> Open source
            </a>
            · Built with Next.js and Google Gemini.
          </p>
        </div>
      </footer>
    </div>
  );
}
