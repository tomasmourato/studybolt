"use client";

import clsx from "clsx";
import { Eraser, LoaderCircle, MessageCircle, SendHorizontal, Square, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { Markdown } from "../Markdown";
import { ErrorNote, btn } from "./ui";

function Bubble({
  role,
  text,
  streaming,
  compact,
}: {
  role: ChatMessage["role"];
  text: string;
  streaming?: boolean;
  compact?: boolean;
}) {
  if (role === "user") {
    return (
      <li
        className={clsx(
          "max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink text-bg",
          compact ? "px-3 py-2 text-sm" : "px-4 py-2.5",
        )}
      >
        {text}
      </li>
    );
  }
  return (
    <li className={clsx("flex", compact ? "gap-2" : "gap-3")}>
      <span
        className={clsx(
          "grid shrink-0 place-items-center rounded-full bg-bolt text-[#17161b]",
          compact ? "size-6" : "size-8",
        )}
      >
        <Zap className={clsx("fill-current", compact ? "size-3" : "size-4")} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {text ? (
          <Markdown streaming={streaming} className={compact ? "prose-sm" : undefined}>
            {text}
          </Markdown>
        ) : (
          <LoaderCircle className="mt-1 size-4 animate-spin text-muted" />
        )}
      </div>
    </li>
  );
}

export interface ChatPanelProps {
  /** Streams the reply to a message and saves the exchange when it ends. */
  send: (message: string) => AsyncGenerator<string>;
  /** Clears the saved conversation. */
  onClear: () => Promise<void>;
  messages: ChatMessage[];
  onMessages: (messages: ChatMessage[]) => void;
  suggestions: string[];
  emptyTitle: string;
  emptyBody: string;
  placeholder: string;
  compact?: boolean;
  className?: string;
}

/** A streaming chat that fills its container: the messages scroll and the input stays at the bottom. */
export function ChatPanel({
  send: sendMessage,
  onClear,
  messages,
  onMessages,
  suggestions,
  emptyTitle,
  emptyBody,
  placeholder,
  compact,
  className,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<{ question: string; reply: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const list = scrollRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, pending?.reply]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;
    setInput("");
    setError(null);
    const history = messages;
    setPending({ question, reply: "" });
    const controller = new AbortController();
    abortRef.current = controller;

    let reply = "";
    const replies = sendMessage(question);
    // Stop answers right away; the reply then ends and whatever arrived is saved.
    const stopped = new Promise<IteratorResult<string>>((resolve) =>
      controller.signal.addEventListener("abort", () => resolve({ done: true, value: undefined })),
    );
    try {
      for (;;) {
        const next = replies.next();
        const { value, done } = await Promise.race([next, stopped]);
        if (controller.signal.aborted) {
          next.catch(() => {});
          replies.return(undefined).catch(() => {});
          break;
        }
        if (done) break;
        reply += value;
        setPending({ question, reply });
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (!aborted) {
        setError(err instanceof Error ? err.message : "Chat failed.");
        if (!reply) {
          // Nothing was saved, so give the question back for another try.
          setInput(question);
          setPending(null);
          abortRef.current = null;
          return;
        }
      }
    }

    const now = Date.now();
    const next: ChatMessage[] = [...history, { role: "user", text: question, at: now }];
    if (reply.trim()) next.push({ role: "model", text: reply.trim(), at: now });
    onMessages(next);
    setPending(null);
    abortRef.current = null;
  }

  async function clear() {
    if (!window.confirm("Clear this conversation?")) return;
    await onClear();
    onMessages([]);
  }

  const empty = messages.length === 0 && !pending;

  return (
    <div className={clsx("flex min-h-0 flex-col", className)}>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className={clsx("flex flex-col items-center text-center", compact ? "px-1 py-6" : "py-10")}>
            <span
              className={clsx(
                "grid place-items-center rounded-2xl bg-accent-soft text-accent",
                compact ? "size-10" : "size-14",
              )}
            >
              <MessageCircle className={compact ? "size-5" : "size-7"} />
            </span>
            <h2 className={clsx("mt-4 font-display font-bold", compact ? "text-lg" : "text-2xl")}>{emptyTitle}</h2>
            <p className={clsx("mt-1 max-w-md text-muted", compact && "text-sm")}>{emptyBody}</p>
            <div className={clsx("mt-6 grid w-full gap-2", !compact && "sm:grid-cols-2")}>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm transition hover:border-accent"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className={clsx("flex flex-col pb-4", compact ? "gap-4" : "gap-6")}>
            {messages.map((message, i) => (
              <Bubble key={`${message.at}-${i}`} role={message.role} text={message.text} compact={compact} />
            ))}
            {pending && (
              <>
                <Bubble role="user" text={pending.question} compact={compact} />
                <Bubble role="model" text={pending.reply} streaming compact={compact} />
              </>
            )}
          </ol>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="mt-3 flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm"
      >
        <textarea
          rows={1}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder={placeholder}
          className={clsx(
            "field-sizing-content max-h-40 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 outline-none",
            compact ? "min-h-10 text-sm" : "min-h-11",
          )}
        />
        {pending ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-bg"
            aria-label="Stop generating"
          >
            <Square className="size-4 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink transition disabled:opacity-40"
            aria-label="Send"
          >
            <SendHorizontal className="size-4" />
          </button>
        )}
      </form>

      {messages.length > 0 && !pending && (
        <button type="button" onClick={clear} className={clsx(btn.ghost, "mt-2 self-center")}>
          <Eraser className="size-4" /> Clear conversation
        </button>
      )}
    </div>
  );
}
