import { describeError, streamText } from "./gemini";
import type { ChatMessage } from "./types";

const HISTORY_TURNS = 20;

/**
 * Streams a chat reply. An error before the first chunk is thrown and nothing is saved, so the question can be
 * asked again; a later error ends the reply with a note. The exchange is saved when the reply ends or is stopped.
 */
export async function* streamChatReply({
  history,
  message,
  system,
  save,
}: {
  history: ChatMessage[];
  message: string;
  system: string;
  save: (exchange: ChatMessage[]) => Promise<unknown>;
}): AsyncGenerator<string> {
  const contents = [
    ...history.slice(-HISTORY_TURNS).map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];
  const userMessage: ChatMessage = { role: "user", text: message, at: Date.now() };
  let reply = "";
  let failed = false;
  try {
    for await (const delta of streamText(contents, { config: { systemInstruction: system }, effort: "low" })) {
      reply += delta;
      yield delta;
    }
  } catch (err) {
    console.error("Chat reply failed:", err);
    if (!reply) {
      failed = true;
      throw new Error(describeError(err));
    }
    const note = `\n\n_⚠️ ${describeError(err)}_`;
    reply += note;
    yield note;
  } finally {
    if (!failed) {
      const text = reply.trim();
      await save(text ? [userMessage, { role: "model", text, at: Date.now() }] : [userMessage]);
    }
  }
}
