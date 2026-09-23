import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { StudySet } from "@/lib/types";

export interface TabProps {
  set: StudySet;
  /** Merges fields into the local copy of the set. Pass a function to build the change from the latest state. */
  patch: (changes: Partial<StudySet> | ((set: StudySet) => Partial<StudySet>)) => void;
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-50",
  dark: "inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-50",
};

export const selectClass = "rounded-full border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

export function EmptyPanel({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-14 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icon className="size-7" />
      </span>
      <h2 className="mt-5 font-display text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-muted">{body}</p>
      {children && <div className="mt-7 flex w-full flex-col items-center gap-4">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{children}</p>;
}
