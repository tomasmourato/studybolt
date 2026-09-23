"use client";

import clsx from "clsx";
import { Mic, Pause, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/client";

// Gemini accepts WebM, M4A and Ogg audio, so whatever the browser records can be uploaded as-is.
const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const BAR_COUNT = 28;

type RecorderState = "idle" | "recording" | "paused";

export function Recorder({
  onComplete,
  onActiveChange,
}: {
  onComplete: (file: File) => void;
  /** Called with true while a recording is in progress, so parents can avoid discarding it. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const clockRef = useRef({ accumulated: 0, resumedAt: 0 });

  useEffect(() => () => cleanupRef.current?.(), []);

  useEffect(() => {
    onActiveChange?.(state !== "idle");
  }, [state, onActiveChange]);

  useEffect(() => {
    if (state !== "recording") return;
    const tick = setInterval(() => {
      const clock = clockRef.current;
      setElapsedMs(clock.accumulated + Date.now() - clock.resumedAt);
    }, 250);
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(tick);
      window.removeEventListener("beforeunload", warn);
    };
  }, [state]);

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser's site settings and try again.");
      return;
    }

    const mimeType = RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
      const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      cleanupRef.current?.();
      setState("idle");
      onComplete(new File([new Blob(chunks, { type })], `Lecture recording.${extension}`, { type }));
    };

    // Live input meter
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let lastPush = 0;
    const meter = (now: number) => {
      frame = requestAnimationFrame(meter);
      if (now - lastPush < 90) return;
      lastPush = now;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += ((s - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
      setLevels((prev) => [...prev.slice(1), recorderRef.current?.state === "recording" ? level : 0]);
    };
    frame = requestAnimationFrame(meter);

    cleanupRef.current = () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      void audioContext.close();
      cleanupRef.current = null;
    };

    recorderRef.current = recorder;
    clockRef.current = { accumulated: 0, resumedAt: Date.now() };
    setElapsedMs(0);
    recorder.start(1000);
    setState("recording");
  }

  function pause() {
    const clock = clockRef.current;
    clock.accumulated += Date.now() - clock.resumedAt;
    setElapsedMs(clock.accumulated);
    recorderRef.current?.pause();
    setState("paused");
  }

  function resume() {
    clockRef.current.resumedAt = Date.now();
    recorderRef.current?.resume();
    setState("recording");
  }

  function stop() {
    recorderRef.current?.stop();
  }

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="flex h-16 items-center gap-[3px]" aria-hidden>
        {levels.map((level, i) => (
          <span
            key={i}
            className={clsx("w-1.5 rounded-full transition-[height] duration-100", state === "idle" ? "bg-line" : "bg-accent")}
            style={{ height: `${8 + level * 56}px` }}
          />
        ))}
      </div>
      <div className="font-mono text-3xl tabular-nums">{formatDuration(elapsedMs / 1000)}</div>

      {state === "idle" ? (
        <button
          type="button"
          onClick={start}
          className="flex items-center gap-2 rounded-full bg-bad px-6 py-3 font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <Mic className="size-5" /> Start recording
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={state === "recording" ? pause : resume}
            className="flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-3 font-semibold transition hover:bg-surface-2"
          >
            {state === "recording" ? <Pause className="size-5" /> : <Play className="size-5" />}
            {state === "recording" ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            onClick={stop}
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-3 font-semibold text-bg transition hover:opacity-90"
          >
            <Square className="size-4 fill-current" /> Stop &amp; create notes
          </button>
        </div>
      )}

      <p className="max-w-sm text-sm text-muted">
        {state === "paused"
          ? "Paused. Resume when class picks back up."
          : "Keep this tab open while you record. Notes are created when you stop."}
      </p>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
