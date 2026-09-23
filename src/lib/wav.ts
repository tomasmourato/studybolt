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
