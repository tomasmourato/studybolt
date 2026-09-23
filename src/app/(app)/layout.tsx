import type { ReactNode } from "react";
import { KeyGate } from "@/components/KeyGate";

// Everything past the landing page needs the student's own Gemini key, so it all sits behind the key gate.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <KeyGate>{children}</KeyGate>;
}
