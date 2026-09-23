"use client";

import { chatWithSet, clearChat } from "@/lib/actions";
import { ChatPanel } from "./ChatPanel";
import type { TabProps } from "./ui";

const SUGGESTIONS = [
  "Summarize the key ideas in 5 bullet points",
  "Explain the hardest concept like I'm 12",
  "Quiz me with 3 quick questions",
  "What's most likely to show up on an exam?",
];

export function ChatTab({ set, patch }: TabProps) {
  return (
    <ChatPanel
      send={(message) => chatWithSet(set.id, message)}
      onClear={() => clearChat(set.id)}
      messages={set.chat}
      onMessages={(chat) => patch({ chat })}
      suggestions={SUGGESTIONS}
      emptyTitle="Ask anything about this set"
      emptyBody="Answers are grounded in your notes and the original sources."
      placeholder="Ask a question about your notes…"
      className="mx-auto h-[calc(100vh-17rem)] min-h-[26rem] max-w-3xl"
    />
  );
}
