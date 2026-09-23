import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Wikimedia and other public APIs ask clients to identify themselves.
const USER_AGENT = "StudyBolt/0.1 (open-source study app; link checker)";
const MAX_REDIRECTS = 5;

/** Accepts only http(s) URLs on public hostnames, so model-suggested links can't point the server at local services. */
export function publicUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") || isIP(host)) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|arpa|corp)$/.test(host)) return null;
  return url;
}

/** Loopback, private, link-local, carrier-grade NAT, benchmarking, multicast and reserved ranges. */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return isPrivateAddress(mapped[1]);
    return a === "::" || a === "::1" || /^(fc|fd|fe[89ab])/.test(a);
  }
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** A public hostname can still point at a private address, so the resolved addresses are checked too. */
async function resolvesPublicly(host: string) {
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
}

export interface CheckedPage {
  url: string;
  status: number;
  contentType: string;
  /** The start of the body, for HTML and other text responses. */
  text?: string;
}

async function readText(res: Response, maxBytes: number) {
  const charset = /charset=([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1] ?? "utf-8";
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder();
  }
  const reader = res.body?.getReader();
  if (!reader) return "";
  let text = "";
  let bytes = 0;
  while (bytes < maxBytes) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text;
}

/**
 * Fetches a public page, following redirects by hand so each hop is checked with publicUrl.
 * Returns null when the URL isn't allowed or the request fails.
 */
export async function fetchPage(raw: string, { timeoutMs = 10_000, maxBytes = 200_000 } = {}): Promise<CheckedPage | null> {
  let url = publicUrl(raw);
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (let hop = 0; url && hop <= MAX_REDIRECTS; hop++) {
      if (!(await resolvesPublicly(url.hostname))) return null;
      const res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/pdf;q=0.9,*/*;q=0.8" },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => {});
        url = publicUrl(new URL(location, url).toString());
        continue;
      }
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      const isText = /text\/|html|xml|json/.test(contentType);
      const text = isText ? await readText(res, maxBytes) : undefined;
      if (!isText) await res.body?.cancel().catch(() => {});
      return { url: url.toString(), status: res.status, contentType, text };
    }
  } catch {
    // Timeouts, DNS failures and TLS errors all mean the link can't be used.
  }
  return null;
}

/** Fetches JSON from a fixed, trusted API endpoint. */
export async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string) {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Plain text from an HTML fragment, such as a search snippet. */
export function stripTags(html: string) {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

export function htmlTitle(html: string) {
  const title =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  return title ? stripTags(title) : "";
}

// Titles of error pages, bot challenges and login walls: the link exists but isn't the promised material.
const UNUSABLE_TITLE =
  /\b(404|not found|page not found|n[ãa]o encontrad[ao]|no encontrad[ao]|introuvable|nicht gefunden|error|erro|client challenge|just a moment|attention required|access denied|acesso negado|forbidden|captcha|log ?in|sign ?in|iniciar sess[ãa]o)\b/i;

export const isUnusableTitle = (title: string) => !title || UNUSABLE_TITLE.test(title);
