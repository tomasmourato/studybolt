"use client";

import {
  ArrowRight,
  Check,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  LoaderCircle,
  LogIn,
  MousePointer2,
  Plus,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useState, useSyncExternalStore, type ComponentType, type FormEvent, type ReactNode } from "react";
import { getApiKey, saveApiKey, subscribeApiKey } from "@/lib/api-key";
import { AI_STUDIO_KEYS_URL, APP_NAME, REPO_URL } from "@/lib/brand";
import { checkApiKey } from "@/lib/gemini";
import { GitHubMark } from "./GitHubMark";
import { Logo } from "./Logo";

/** Shows the app once the student has entered a Gemini key, and the key setup (with its tutorial) until then. */
export function KeyGate({ children }: { children: ReactNode }) {
  // The key only exists in the browser, so the server render shows a spinner.
  const key = useSyncExternalStore<string | null | undefined>(subscribeApiKey, getApiKey, () => undefined);
  if (key === undefined) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoaderCircle className="size-8 animate-spin text-muted" />
      </div>
    );
  }
  if (!key) return <KeySetup />;
  return children;
}

function StepMock({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="mt-3 rounded-xl border border-line bg-bg p-3 text-xs">
      {children}
    </div>
  );
}

const STEPS: { icon: LucideIcon; title: string; body: ReactNode; extra?: ReactNode }[] = [
  {
    icon: LogIn,
    title: "Open Google AI Studio",
    body: "Sign in with any Google account. Creating a key is free and doesn't need a credit card.",
    extra: (
      <a
        href={AI_STUDIO_KEYS_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
      >
        Open aistudio.google.com <ExternalLink className="size-3.5" />
      </a>
    ),
  },
  {
    icon: Plus,
    title: "Create a key",
    body: (
      <>
        First time there? Accept the terms and AI Studio makes a key for you. Otherwise click{" "}
        <strong className="text-ink">Create API key</strong> and pick a project, or let it create one.
      </>
    ),
    extra: (
      <StepMock>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">API keys</span>
          <span className="relative inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 font-semibold text-accent-ink">
            <Plus className="size-3" /> Create API key
            <MousePointer2 className="absolute -bottom-3 -right-2 size-4 fill-ink text-bg" />
          </span>
        </div>
      </StepMock>
    ),
  },
  {
    icon: Copy,
    title: "Copy the key",
    body: (
      <>
        Open the key from the list and copy it. It&apos;s a long string that usually starts with{" "}
        <code className="rounded bg-surface-2 px-1 font-mono text-ink">AQ.</code> or{" "}
        <code className="rounded bg-surface-2 px-1 font-mono text-ink">AIza</code>.
      </>
    ),
    extra: (
      <StepMock>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-muted">
            AQ.Ab8RN6I••••••••••••••••••••
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-semibold">
            <Copy className="size-3" /> Copy
          </span>
        </div>
      </StepMock>
    ),
  },
  {
    icon: ClipboardPaste,
    title: "Paste it here",
    body: `${APP_NAME} checks it with Google and you're in. You only do this once per device if you tick “Remember”.`,
  },
];

const PROMISES: { icon: ComponentType<{ className?: string }>; title: string; body: ReactNode }[] = [
  {
    icon: ShieldCheck,
    title: "Never stored on our servers",
    body: "Your key stays in this browser and is sent only to Google's Gemini API. There's no StudyBolt database.",
  },
  {
    icon: HardDrive,
    title: "Your study sets stay on this device",
    body: "Notes, uploads and audio are saved in your browser, not in the cloud.",
  },
  {
    icon: GitHubMark,
    title: "Open source",
    body: (
      <>
        Don&apos;t take our word for it:{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-semibold text-accent underline-offset-2 hover:underline">
          read the code on GitHub
        </a>
        .
      </>
    ),
  },
];

function KeySetup() {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Copying from a page sometimes brings along spaces or line breaks.
    const key = value.replace(/\s+/g, "");
    if (!key) return setError("Paste your Gemini API key first.");
    if (key.length < 20) return setError("That looks too short to be a Gemini API key. Make sure you copied all of it.");
    setChecking(true);
    setError(null);
    const problem = await checkApiKey(key);
    setChecking(false);
    if (problem) return setError(problem);
    saveApiKey(key, remember);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
          <Logo />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <GitHubMark className="size-4" /> Source code
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:py-14">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted">
          <KeyRound className="size-4 text-accent" /> One-time setup · about a minute
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Connect your free Gemini key
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          {APP_NAME} runs on Google Gemini with your own API key. That keeps the app free, and your key and study
          materials go straight from your browser to Google, never through our servers.
        </p>

        <div className="mt-10 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section aria-labelledby="key-tutorial">
            <h2 id="key-tutorial" className="font-display text-xl font-bold">
              How to get your key
            </h2>
            <ol className="mt-4 flex flex-col gap-3">
              {STEPS.map(({ icon: Icon, title, body, extra }, i) => (
                <li key={title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft font-display font-bold text-accent">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <Icon className="size-4 text-muted" /> {title}
                    </h3>
                    <p className="mt-1 text-sm text-muted">{body}</p>
                    {extra}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-col gap-4 lg:sticky lg:top-8">
            <form onSubmit={submit} className="rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-7">
              <h2 className="font-display text-xl font-bold">Paste your key</h2>
              <label htmlFor="gemini-key" className="mt-4 block text-sm font-medium">
                Gemini API key
              </label>
              <div className="mt-2 flex items-center gap-1 rounded-xl border border-line bg-bg pr-1 focus-within:border-accent">
                <input
                  id="gemini-key"
                  type={visible ? "text" : "password"}
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(null);
                  }}
                  placeholder="AQ.… or AIza…"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 font-mono text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"
                  aria-label={visible ? "Hide key" : "Show key"}
                >
                  {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="font-medium">Remember on this device</span>
                  <span className="block text-muted">
                    {remember
                      ? "The key stays in this browser until you remove it. Only use this on your own device."
                      : "The key is forgotten when you close this tab."}
                  </span>
                </span>
              </label>

              {error && <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

              <button
                type="submit"
                disabled={checking}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-60"
              >
                {checking ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" /> Checking with Google…
                  </>
                ) : (
                  <>
                    Check key and continue <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </form>

            <ul className="flex flex-col gap-4 rounded-3xl border border-line p-6">
              {PROMISES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-good-soft text-good">
                    <Icon className="size-4" />
                  </span>
                  <div className="text-sm">
                    <p className="font-semibold">{title}</p>
                    <p className="text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <section className="mt-12 max-w-3xl rounded-2xl bg-surface-2 p-6 text-sm">
          <h2 className="font-semibold">Good to know</h2>
          <ul className="mt-3 flex flex-col gap-2 text-muted">
            {[
              "The free tier has daily limits for each model. StudyBolt switches models when one runs out, and limits reset at midnight Pacific time.",
              "On the free tier, Google may use what you send to improve its products, and people may review it. Avoid uploading anything confidential, or enable billing in AI Studio.",
              "Google's terms require Gemini API users to be 18 or older.",
              "You can delete the key in AI Studio at any time, and remove it from StudyBolt with the key button at the top of the app.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-good" /> {item}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
