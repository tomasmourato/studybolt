import type { SourceKind } from "./types";

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MAX_SOURCES = 10;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: DOCX_MIME,
  mp3: "audio/mp3",
  wav: "audio/wav",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
  m4a: "audio/m4a",
  weba: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/mov",
  avi: "video/avi",
  mpeg: "video/mpeg",
  mpg: "video/mpg",
  webm: "video/webm",
  wmv: "video/wmv",
  flv: "video/x-flv",
  "3gp": "video/3gpp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
};

// Browsers report some formats under names that Gemini's supported-type list spells differently.
const GEMINI_ALIASES: Record<string, string> = {
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/x-m4a": "audio/m4a",
  "audio/mp4": "audio/m4a",
  "audio/x-flac": "audio/flac",
  "audio/x-aiff": "audio/aiff",
  "video/quicktime": "video/mov",
  "video/x-msvideo": "video/avi",
  "video/x-ms-wmv": "video/wmv",
};

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);

export function classifyFile(name: string, reportedType: string): { kind: SourceKind; mimeType: string } | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  let mime = reportedType.split(";")[0].trim().toLowerCase();
  if (!mime || mime === "application/octet-stream") mime = EXTENSION_MIME[extension] ?? "";
  mime = GEMINI_ALIASES[mime] ?? mime;

  if (mime === "application/pdf") return { kind: "pdf", mimeType: mime };
  if (mime === DOCX_MIME) return { kind: "document", mimeType: mime };
  if (mime.startsWith("audio/")) return { kind: "audio", mimeType: mime };
  if (mime.startsWith("video/")) return { kind: "video", mimeType: mime };
  if (IMAGE_TYPES.has(mime)) return { kind: "image", mimeType: mime };
  if (mime.startsWith("text/")) return { kind: "text", mimeType: "text/plain" };
  return null;
}

/** Gemini doesn't read Word files, so their text is extracted in the browser up front. */
export async function extractDocxText(arrayBuffer: ArrayBuffer) {
  // mammoth is large, so it's only loaded when someone adds a Word file.
  const { default: mammoth } = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value.trim();
}

/** Returns a canonical watch URL for any common YouTube link format, or null. */
export function parseYouTubeUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : (/^\/(?:shorts|live|embed)\/([^/]+)/.exec(url.pathname)?.[1] ?? null);
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

/** Content types browsers expect when playing the original upload back. */
export function playbackType(mimeType: string) {
  const map: Record<string, string> = {
    "audio/m4a": "audio/mp4",
    "audio/mp3": "audio/mpeg",
    "video/mov": "video/quicktime",
    "video/avi": "video/x-msvideo",
  };
  return map[mimeType] ?? mimeType;
}
