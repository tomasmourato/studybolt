import {
  ApiError,
  FileState,
  GoogleGenAI,
  ThinkingLevel,
  type ContentListUnion,
  type File as GeminiFile,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type SpeechConfig,
} from "@google/genai";
import { getApiKey } from "./api-key";
import { base64ToBytes, concatBytes } from "./bytes";
import { hasMangledLatex, restoreEscapes } from "./json-latex";
import type { GeminiFileRef } from "./types";

export class MissingApiKeyError extends Error {
  constructor() {
    super("Add your Gemini API key to continue.");
  }
}

/** A model accepted the request but stopped responding. */
export class GeminiTimeoutError extends Error {
  model: string;
  constructor(model: string, seconds: number) {
    super(`Gemini ${model} didn't respond within ${seconds}s.`);
    this.model = model;
  }
}

// Every request goes straight from the browser to Google with the student's own key.
const API_ORIGIN = "https://generativelanguage.googleapis.com";

let current: { key: string; client: GoogleGenAI } | undefined;

function requireKey() {
  const key = getApiKey();
  if (!key) throw new MissingApiKeyError();
  return key;
}

function client(): GoogleGenAI {
  const key = requireKey();
  // A new key gets a fresh client and a clean slate of model cooldowns (quotas belong to the old key's project).
  if (current?.key !== key) {
    current = { key, client: new GoogleGenAI({ apiKey: key }) };
    cooldowns.clear();
  }
  return current.client;
}

const unique = (models: (string | undefined)[]) => [...new Set(models.filter((m): m is string => !!m))];

// Free-tier quotas are per model (some allow only ~20 requests a day), so each tier falls back
// through several models. "smart" writes what students read; "fast" handles titles, transcripts and drawings.
const MODELS = {
  smart: unique([
    process.env.NEXT_PUBLIC_GEMINI_MODEL,
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
  ]),
  fast: unique([
    process.env.NEXT_PUBLIC_GEMINI_FAST_MODEL,
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
  ]),
  image: unique([
    process.env.NEXT_PUBLIC_GEMINI_IMAGE_MODEL,
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image",
    "gemini-2.5-flash-image",
  ]),
  tts: unique([process.env.NEXT_PUBLIC_GEMINI_TTS_MODEL, "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]),
};
type ModelKind = keyof typeof MODELS;
export type ModelTier = "smart" | "fast";

// Models occasionally accept a request and never answer, so every call has deadlines.
const FIRST_CHUNK_TIMEOUT_MS = 90_000;
const IDLE_TIMEOUT_MS = 45_000;
const MEDIA_TIMEOUT_MS = 120_000;

// Models that recently failed for model-specific reasons are skipped until this timestamp.
const cooldowns = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ErrorInfo {
  status: number;
  message: string;
  quotas: { id: string; value?: string }[];
  retryDelaySec?: number;
}

/** The SDK puts the raw JSON error body in the message; this pulls out the useful parts. */
function errorInfo(err: unknown): ErrorInfo | null {
  if (!(err instanceof ApiError)) return null;
  const info: ErrorInfo = { status: err.status, message: err.message, quotas: [] };
  try {
    type Body = { error?: { message?: string; details?: Record<string, unknown>[] } };
    let body = JSON.parse(err.message) as Body;
    // When a streamed request fails, the SDK wraps Google's JSON error in a second error as text.
    const inner = body.error?.message?.trim();
    if (inner?.startsWith("{")) {
      try {
        body = JSON.parse(inner) as Body;
      } catch {}
    }
    info.message = body.error?.message ?? err.message;
    for (const detail of body.error?.details ?? []) {
      const type = String(detail["@type"] ?? "");
      if (type.endsWith("QuotaFailure")) {
        const violations = (detail.violations as { quotaId?: string; quotaValue?: string }[] | undefined) ?? [];
        info.quotas = violations.map((v) => ({ id: v.quotaId ?? "", value: v.quotaValue }));
      } else if (type.endsWith("RetryInfo")) {
        info.retryDelaySec = parseFloat(String(detail.retryDelay)) || undefined;
      }
    }
  } catch {
    // Not a JSON body; keep the raw message.
  }
  return info;
}

/** A quota of zero means the model isn't part of the key's plan at all (e.g. image models on the free tier). */
const notInPlan = (info: ErrorInfo) => info.quotas.length > 0 && info.quotas.every((q) => !Number(q.value));
const dailyQuota = (info: ErrorInfo) => info.quotas.some((q) => q.id.includes("PerDay"));

/** How long to avoid a model after this error, or null when the error isn't the model's fault. */
function cooldownFor(err: unknown): number | null {
  if (err instanceof GeminiTimeoutError) return 5 * 60_000;
  const info = errorInfo(err);
  if (!info) return null;
  if (info.status === 404 || (info.status === 400 && /model.*not (found|supported)/i.test(info.message))) {
    return Infinity;
  }
  if (info.status === 429) {
    if (notInPlan(info)) return Infinity;
    if (dailyQuota(info)) return 60 * 60_000;
    return Math.max(info.retryDelaySec ?? 60, 10) * 1000;
  }
  if (info.status >= 500) return 30_000;
  return null;
}

function markCooldown(model: string, ms: number) {
  cooldowns.set(model, ms === Infinity ? Infinity : Date.now() + ms);
}

const OVERLOAD_STATUSES = new Set([500, 502, 503, 504]);

async function retrying<T>(run: () => Promise<T>, attempts = 2): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const overloaded = err instanceof ApiError && OVERLOAD_STATUSES.has(err.status);
      if (!overloaded || attempt >= attempts) throw err;
      await sleep(1500 * attempt);
    }
  }
}

/** Runs a request against the best available model of a kind, falling back on quota, overload, timeout or not-found errors. */
async function withModel<T>(kind: ModelKind, run: (model: string) => Promise<T>): Promise<T> {
  const usable = MODELS[kind].filter((m) => cooldowns.get(m) !== Infinity);
  const ready = usable.filter((m) => (cooldowns.get(m) ?? 0) <= Date.now());
  // If everything is cooling down, try anyway: a stale cooldown shouldn't block the student.
  const candidates = ready.length ? ready : usable;

  let lastError: unknown = new Error("None of the configured Gemini models are available for this API key.");
  for (const model of candidates) {
    try {
      return await retrying(() => run(model));
    } catch (err) {
      const cooldown = cooldownFor(err);
      if (cooldown === null) throw err;
      markCooldown(model, cooldown);
      const reason = err instanceof GeminiTimeoutError ? "timed out" : `status ${errorInfo(err)?.status}`;
      console.warn(`Gemini ${model} failed (${reason}); trying the next model.`);
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * A resettable deadline. `race` rejects with a GeminiTimeoutError once the timer fires,
 * and the abort signal cancels the underlying HTTP request.
 */
function deadline(model: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expire: (err: Error) => void = () => {};
  const expired = new Promise<never>((_, reject) => (expire = reject));
  expired.catch(() => {});
  return {
    signal: controller.signal,
    arm(ms: number) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        expire(new GeminiTimeoutError(model, Math.round(ms / 1000)));
        controller.abort();
      }, ms);
    },
    clear: () => clearTimeout(timer),
    race: <R>(promise: Promise<R>) => Promise.race([promise, expired]),
  };
}

/** Opens a response stream that fails if the first chunk, or any gap between chunks, takes too long. */
async function openStream(model: string, contents: ContentListUnion, config: GenerateContentConfig) {
  const limit = deadline(model);
  limit.arm(FIRST_CHUNK_TIMEOUT_MS);
  let stream: AsyncGenerator<GenerateContentResponse>;
  try {
    stream = await limit.race(
      client().models.generateContentStream({ model, contents, config: { ...config, abortSignal: limit.signal } }),
    );
  } catch (err) {
    limit.clear();
    throw err;
  }
  return {
    async next() {
      const result = await limit.race(stream.next());
      if (result.done) limit.clear();
      else limit.arm(IDLE_TIMEOUT_MS);
      return result;
    },
    close() {
      limit.clear();
      stream.return(undefined).catch(() => {});
    },
  };
}

/** Runs a single non-streaming request with a deadline. */
async function withDeadline<T>(model: string, ms: number, run: (signal: AbortSignal) => Promise<T>) {
  const limit = deadline(model);
  limit.arm(ms);
  try {
    return await limit.race(run(limit.signal));
  } finally {
    limit.clear();
  }
}

export type Effort = "low" | "default";

export interface GenerateOptions {
  config?: GenerateContentConfig;
  tier?: ModelTier;
  effort?: Effort;
}

/** Gemini 3 models take a thinking level, 2.5 models a token budget. */
function withThinking(model: string, { config, effort = "default" }: GenerateOptions): GenerateContentConfig {
  if (effort === "default" || config?.thinkingConfig) return { ...config };
  if (model.startsWith("gemini-3")) return { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
  if (model.startsWith("gemini-2.5-flash")) return { ...config, thinkingConfig: { thinkingBudget: 1024 } };
  return { ...config };
}

/** Generates a complete text response. It streams internally so a stalled model is detected and replaced. */
export function generateText(contents: ContentListUnion, options: GenerateOptions = {}): Promise<string> {
  return withModel(options.tier ?? "smart", async (model) => {
    const stream = await openStream(model, contents, withThinking(model, options));
    let text = "";
    try {
      for (let result = await stream.next(); !result.done; result = await stream.next()) {
        text += result.value.text ?? "";
      }
    } finally {
      stream.close();
    }
    return text;
  });
}

/** Parses a structured answer, generating it again once if its LaTeX was mangled by JSON escaping. */
export async function generateJson<T>(
  contents: ContentListUnion,
  schema: object,
  options: GenerateOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const text = await generateText(contents, {
      ...options,
      config: { ...options.config, responseMimeType: "application/json", responseJsonSchema: schema },
    });
    let value: T;
    try {
      value = JSON.parse(text) as T;
    } catch {
      throw new Error("Gemini returned an unexpected response. Please try again.");
    }
    if (!hasMangledLatex(value)) return value;
    if (attempt >= 2) {
      console.warn("Gemini returned mangled LaTeX twice; keeping a repaired copy.");
      return restoreEscapes(value);
    }
    console.warn("Gemini returned mangled LaTeX; generating again.");
  }
}

/**
 * Streams text deltas. Errors before the first chunk fall back to another model;
 * errors after that are thrown to the caller, since part of the answer was already shown.
 */
export async function* streamText(contents: ContentListUnion, options: GenerateOptions = {}): AsyncGenerator<string> {
  let activeModel = "";
  const { stream, first } = await withModel(options.tier ?? "smart", async (model) => {
    const stream = await openStream(model, contents, withThinking(model, options));
    try {
      const first = await stream.next();
      activeModel = model;
      return { stream, first };
    } catch (err) {
      stream.close();
      throw err;
    }
  });
  try {
    for (let result = first; !result.done; result = await stream.next()) {
      if (result.value.text) yield result.value.text;
    }
  } catch (err) {
    const cooldown = cooldownFor(err);
    if (cooldown !== null) markCooldown(activeModel, cooldown);
    throw err;
  } finally {
    stream.close();
  }
}

/** Generates an image with Gemini's image models. Throws when none are available to the key. */
export function generateImage(prompt: string): Promise<Blob> {
  return withModel("image", async (model) => {
    const response = await withDeadline(model, MEDIA_TIMEOUT_MS, (abortSignal) =>
      client().models.generateContent({ model, contents: prompt, config: { responseModalities: ["IMAGE"], abortSignal } }),
    );
    const image = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!image?.data) throw new Error("Gemini did not return an image.");
    return new Blob([base64ToBytes(image.data)], { type: image.mimeType ?? "image/png" });
  });
}

async function errorFromResponse(res: Response) {
  const body = await res.text().catch(() => "");
  return new ApiError({ message: body || res.statusText, status: res.status });
}

const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

/** Sends a file with the Files API's resumable protocol, in chunks, so progress can be shown. */
async function sendResumable(blob: Blob, mimeType: string, displayName: string, onProgress?: (fraction: number) => void) {
  const key = requireKey();
  const start = await fetch(`${API_ORIGIN}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(blob.size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
    },
    body: JSON.stringify({ file: { displayName } }),
  });
  if (!start.ok) throw await errorFromResponse(start);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini didn't accept the upload. Please try again.");

  for (let offset = 0; ; ) {
    const chunk = blob.slice(offset, offset + UPLOAD_CHUNK_BYTES);
    const last = offset + chunk.size >= blob.size;
    let res: Response | undefined;
    for (let attempt = 1; !res; attempt++) {
      try {
        const reply = await fetch(uploadUrl, {
          method: "POST",
          headers: { "X-Goog-Upload-Command": last ? "upload, finalize" : "upload", "X-Goog-Upload-Offset": String(offset) },
          body: chunk,
        });
        if (!reply.ok) throw await errorFromResponse(reply);
        res = reply;
      } catch (err) {
        // Dropped connections (TypeError) and server hiccups are retried; the offset makes it safe to resend.
        const transient = err instanceof TypeError || (err instanceof ApiError && OVERLOAD_STATUSES.has(err.status));
        if (!transient || attempt >= 4) throw err;
        await sleep(1500 * attempt);
      }
    }
    offset += chunk.size;
    onProgress?.(offset / blob.size);
    if (last) {
      const body = (await res.json()) as { file?: GeminiFile };
      if (!body.file?.name) throw new Error("Gemini didn't confirm the upload. Please try again.");
      return body.file;
    }
  }
}

/** Uploads a file from the browser to the Gemini Files API and waits until it can be used in prompts. */
export async function uploadFile(
  blob: Blob,
  mimeType: string,
  displayName: string,
  onProgress?: (fraction: number) => void,
): Promise<GeminiFileRef> {
  const ai = client();
  let file = await sendResumable(blob, mimeType, displayName, onProgress);
  const deadlineAt = Date.now() + 15 * 60_000;
  while (file.state === FileState.PROCESSING) {
    if (Date.now() > deadlineAt) throw new Error("Gemini took too long to process this file.");
    await sleep(2500);
    const name = file.name!;
    file = await retrying(() => ai.files.get({ name }), 3);
  }
  if (file.state === FileState.FAILED || !file.uri || !file.name) {
    throw new Error("Gemini could not process this file. It may be corrupted or in an unsupported format.");
  }
  return {
    name: file.name,
    uri: file.uri,
    mimeType: file.mimeType ?? mimeType,
    expiresAt: file.expirationTime ? Date.parse(file.expirationTime) : Date.now() + 47 * 3600_000,
  };
}

/** Renders speech to raw 16-bit PCM. */
function synthesize(prompt: string, speechConfig: SpeechConfig): Promise<{ pcm: Uint8Array<ArrayBuffer>; sampleRate: number }> {
  return withModel("tts", async (model) => {
    const response = await withDeadline(model, MEDIA_TIMEOUT_MS, (abortSignal) =>
      client().models.generateContent({
        model,
        contents: prompt,
        config: { responseModalities: ["AUDIO"], speechConfig, abortSignal },
      }),
    );
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const audio = parts.flatMap((p) => (p.inlineData?.data ? [p.inlineData] : []));
    if (!audio.length) throw new Error("Gemini did not return any audio.");
    const rate = Number(/rate=(\d+)/.exec(audio[0].mimeType ?? "")?.[1]) || 24000;
    return { pcm: concatBytes(audio.map((a) => base64ToBytes(a.data!))), sampleRate: rate };
  });
}

export interface Speaker {
  name: string;
  voice: string;
}

/** Renders a two-speaker script ("Name: line" per line). */
export function synthesizeDialogue(script: string, speakers: [Speaker, Speaker]) {
  return synthesize(script, {
    multiSpeakerVoiceConfig: {
      speakerVoiceConfigs: speakers.map((s) => ({
        speaker: s.name,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } },
      })),
    },
  });
}

/** Renders a single narrator's voice. */
export function synthesizeSpeech(prompt: string, voice: string) {
  return synthesize(prompt, { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } });
}

/** Turns SDK and network errors into a message that is safe and useful to show in the UI. */
export function describeError(err: unknown): string {
  if (err instanceof GeminiTimeoutError) return "Gemini took too long to respond. Try again in a moment.";
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return "Couldn't reach Google's Gemini API. Check your internet connection and try again.";
  }
  const info = errorInfo(err);
  if (!info) return err instanceof Error ? err.message : "Something went wrong.";
  if (info.status === 401 || /api key|authentication credentials/i.test(info.message)) {
    return "Google rejected your Gemini API key. Use the “Gemini key” button at the top of the page to enter a new one.";
  }
  if (info.status === 429) {
    if (notInPlan(info)) {
      return "This Gemini feature isn't included in your API key's plan. Enable billing in Google AI Studio to use it.";
    }
    return dailyQuota(info)
      ? "You've used today's free Gemini quota on every available model. It resets at midnight Pacific time, or enable billing in Google AI Studio for higher limits."
      : "Gemini's rate limit was hit. Wait a minute and try again.";
  }
  if (info.status === 403) return "This API key doesn't have access to that Gemini feature.";
  if (info.status === 404) return "None of the configured Gemini models are available for this API key.";
  if (info.status >= 500) return `Gemini is overloaded or temporarily unavailable (${info.status}). Try again in a moment.`;
  return `Gemini error: ${info.message.slice(0, 300)}`;
}

/**
 * Checks a key with a free request (listing models uses no generation quota).
 * Returns null when Google accepts it, otherwise a message for the student.
 */
export async function checkApiKey(key: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${API_ORIGIN}/v1beta/models?pageSize=1`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return "Couldn't reach Google to check the key. Check your internet connection and try again.";
  }
  // A rate-limited key is still a valid key.
  if (res.ok || res.status === 429) return null;
  const info = errorInfo(await errorFromResponse(res));
  if (res.status === 400 || res.status === 401) return "Google says this key isn't valid. Make sure you copied the whole key.";
  if (res.status === 403) {
    return `This key can't use the Gemini API${info?.message ? `: ${info.message.slice(0, 200)}` : "."} Try a key created in Google AI Studio.`;
  }
  return `Google couldn't check the key right now (error ${res.status}). Try again in a moment.`;
}
