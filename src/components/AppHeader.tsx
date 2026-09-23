import type { ReactNode } from "react";
import { KeyMenu } from "./KeyMenu";
import { Logo } from "./Logo";

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
        <Logo href="/library" />
        <div className="flex items-center gap-2">
          <KeyMenu />
          {children}
        </div>
      </div>
    </header>
  );
}
