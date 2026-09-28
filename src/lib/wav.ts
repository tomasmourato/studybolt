export const TTS_SAMPLE_RATE = 24000;

/** Wraps raw 16-bit little-endian PCM in a WAV container so browsers can play it. */
export function pcmToWav(pcm: Uint8Array<ArrayBuffer>, sampleRate = TTS_SAMPLE_RATE, channels = 1): Blob {
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  header.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, channels, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * blockAlign, true);
  header.setUint16(32, blockAlign, true);
  header.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  header.setUint32(40, pcm.length, true);
  return new Blob([header.buffer, pcm], { type: "audio/wav" });
}

/**
 * Reads the 16-bit PCM samples out of a WAV file. Newer TTS models return WAV with extra chunks
 * (such as provenance metadata) after the samples, so the chunks are walked rather than assumed.
 */
export function wavToPcm(bytes: Uint8Array<ArrayBuffer>): { pcm: Uint8Array<ArrayBuffer>; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Gemini returned audio in an unexpected format.");
  let sampleRate = TTS_SAMPLE_RATE;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      const pcm16Mono = view.getUint16(body, true) === 1 && view.getUint16(body + 2, true) === 1 && view.getUint16(body + 14, true) === 16;
      if (!pcm16Mono) throw new Error("Gemini returned audio in an unexpected format.");
      sampleRate = view.getUint32(body + 4, true);
    } else if (id === "data") {
      return { pcm: bytes.slice(body, Math.min(body + size, bytes.length)), sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("Gemini returned audio without any sound.");
}
