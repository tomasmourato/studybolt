import { mapLimit } from "./async";
import { LIBRETEXTS_LIBRARIES, RESOURCE_TYPES, type ResourcePlan } from "./prompts";
import { parseYouTubeUrl } from "./sources";
import type { ResourceType } from "./types";
import { fetchJson, fetchPage, htmlTitle, isUnusableTitle, publicUrl, stripTags } from "./web";

/*
 * The server half of the Resources search. Browsers can't read other sites' pages or most catalog APIs
 * (CORS), so the server runs the searches the browser planned with Gemini and checks every link.
 * It never sees the student's Gemini key or notes, only the search plan.
 */

export interface Candidate {
  id: string;
  type: ResourceType;
  title: string;
  url: string;
  source: string;
  language?: string;
  snippet?: string;
  thumbnail?: string;
  videoId?: string;
}

type Draft = Omit<Candidate, "id">;

const EXERCISE_TITLE = /exerc|problem|answer|solu[çct]|homework|practice|quiz|pr[áa]tica|respostas|ficha/i;

const isLangCode = (lang: string) => /^[a-z]{2,3}$/.test(lang);

// ---------- Sources with real, searchable catalogs ----------

interface WikiSearchResponse {
  query?: { search?: { title: string; snippet: string }[] };
}

async function searchWiki({ project, lang, query }: ResourcePlan["wiki"][number]): Promise<Draft[]> {
  if (!isLangCode(lang) || (project !== "wikibooks" && project !== "wikipedia")) return [];
  const host = `${lang}.${project}.org`;
  const data = await fetchJson<WikiSearchResponse>(
    `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&srprop=snippet&format=json`,
  );
  return (data?.query?.search ?? []).map((hit) => ({
    type: project === "wikipedia" ? "article" : EXERCISE_TITLE.test(hit.title) ? "exercises" : "book",
    title: hit.title,
    // Wikibooks chapters are subpages ("Book/Chapter"), so slashes stay unescaped.
    url: `https://${host}/wiki/${hit.title.replace(/ /g, "_").split("/").map(encodeURIComponent).join("/")}`,
    source: project === "wikipedia" ? "Wikipedia" : "Wikibooks",
    language: lang,
    snippet: stripTags(hit.snippet),
  }));
}

interface LibreTextsHit {
  title?: string;
  uri?: string;
  preview?: string;
}

async function searchLibreTexts({ library, query }: { library: string; query: string }): Promise<Draft[]> {
  if (!LIBRETEXTS_LIBRARIES.includes(library)) return [];
  const data = await fetchJson<{ result?: LibreTextsHit | LibreTextsHit[] }>(
    `https://${library}.libretexts.org/@api/deki/site/query?q=${encodeURIComponent(query)}&limit=5&dream.out.format=json`,
  );
  // The API returns a bare object instead of an array when there's a single hit.
  const hits = ([] as LibreTextsHit[]).concat(data?.result ?? []);
  return hits.flatMap((hit) => {
    const url = hit.uri && publicUrl(hit.uri);
    if (!hit.title || !url || !url.hostname.endsWith("libretexts.org")) return [];
    return [
      {
        type: EXERCISE_TITLE.test(hit.title) ? "exercises" : "book",
        title: hit.title,
        url: url.toString(),
        source: "LibreTexts",
        language: library === "espanol" ? "es" : "en",
        snippet: hit.preview ? stripTags(hit.preview) : undefined,
      } satisfies Draft,
    ];
  });
}

interface ArchiveResponse {
  response?: {
    docs?: { identifier: string; title?: string | string[]; creator?: string | string[]; language?: string | string[] }[];
  };
}

const ARCHIVE_LANGUAGES: Record<string, string> = {
  eng: "en",
  english: "en",
  por: "pt",
  portuguese: "pt",
  spa: "es",
  spanish: "es",
  fre: "fr",
  fra: "fr",
  french: "fr",
  ger: "de",
  deu: "de",
  german: "de",
  ita: "it",
  italian: "it",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Uploads re-shared from shadow libraries are unauthorized copies.
const PIRATED_TITLE = /libgen|z-?lib|b-ok\b|pdfdrive|anna'?s archive|epdf\.pub/i;

async function searchArchive(query: string): Promise<Draft[]> {
  const words = query.replace(/[^\p{L}\p{N}\s-]/gu, " ").trim();
  if (!words) return [];
  // Anyone can upload to the Internet Archive, so only items that are openly licensed or marked
  // public domain are used, and borrow-only items are excluded so every book is free to read.
  const q = `title:(${words}) AND mediatype:texts AND NOT access-restricted-item:true AND (licenseurl:* OR possible-copyright-status:"NOT_IN_COPYRIGHT")`;
  const data = await fetchJson<ArchiveResponse>(
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=language&rows=5&output=json`,
  );
  return (data?.response?.docs ?? []).flatMap((doc) => {
    const title = first(doc.title);
    if (!title || PIRATED_TITLE.test(title) || PIRATED_TITLE.test(doc.identifier) || !/^[\w.-]+$/.test(doc.identifier)) {
      return [];
    }
    const creator = first(doc.creator);
    return [
      {
        type: "book",
        title: creator ? `${title} (${creator})` : title,
        url: `https://archive.org/details/${doc.identifier}`,
        source: "Internet Archive",
        language: ARCHIVE_LANGUAGES[first(doc.language)?.toLowerCase() ?? ""],
      } satisfies Draft,
    ];
  });
}

interface YouTubeSearchResponse {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      description?: string;
      thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
    };
  }[];
}

/** Real video search through the YouTube Data API. Needs its own key; Gemini API keys aren't accepted. */
async function searchYouTube(query: string, key: string, lang?: string): Promise<Draft[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "moderate",
    maxResults: "5",
    q: query,
    key,
  });
  if (lang) params.set("relevanceLanguage", lang);
  const data = await fetchJson<YouTubeSearchResponse>(`https://www.googleapis.com/youtube/v3/search?${params}`);
  return (data?.items ?? []).flatMap((item) => {
    const videoId = item.id?.videoId;
    const snippet = item.snippet;
    if (!videoId || !/^[\w-]{11}$/.test(videoId) || !snippet?.title) return [];
    return [
      {
        type: "video",
        title: stripTags(snippet.title),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        source: snippet.channelTitle ? `YouTube · ${stripTags(snippet.channelTitle)}` : "YouTube",
        language: lang,
        snippet: snippet.description ? stripTags(snippet.description) : undefined,
        thumbnail: snippet.thumbnails?.high?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        videoId,
      } satisfies Draft,
    ];
  });
}

// ---------- Links suggested by the model, kept only if they check out ----------

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

async function checkVideo(video: ResourcePlan["videos"][number]): Promise<Draft[]> {
  const watchUrl = parseYouTubeUrl(video.url ?? "");
  const videoId = watchUrl && new URL(watchUrl).searchParams.get("v");
  if (!watchUrl || !videoId) return [];
  // oEmbed only answers for real, public, embeddable videos, and returns the real title.
  const data = await fetchJson<OEmbed>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`);
  if (!data?.title) return [];
  return [
    {
      type: "video",
      title: data.title,
      url: watchUrl,
      source: data.author_name ? `YouTube · ${data.author_name}` : "YouTube",
      snippet: `Suggested as "${video.title}" by ${video.channel}`,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      videoId,
    },
  ];
}

async function checkSite(site: NonNullable<ResourcePlan["sites"]>[number]): Promise<Draft[]> {
  if (parseYouTubeUrl(site.url ?? "")) return [];
  const page = await fetchPage(site.url);
  if (!page || page.status < 200 || page.status >= 300) return [];
  const host = new URL(page.url).hostname.replace(/^www\./, "");
  const type = RESOURCE_TYPES.includes(site.type) ? site.type : "article";
  if (page.contentType.includes("pdf")) {
    return [{ type, title: `${site.title} (PDF)`, url: page.url, source: host }];
  }
  if (!page.contentType.includes("html")) return [];
  const title = htmlTitle(page.text ?? "");
  if (isUnusableTitle(title)) return [];
  return [{ type, title, url: page.url, source: host, snippet: `Suggested as "${site.title}"` }];
}

// ---------- Gathering ----------

const normalizeUrl = (url: string) => url.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();

const youtubeKey = () => process.env.YOUTUBE_API_KEY?.trim() || undefined;

export async function gatherCandidates(
  plan: ResourcePlan,
  videoLanguage?: string,
): Promise<{ candidates: Candidate[]; videoSource: "youtube" | "suggested" }> {
  const key = youtubeKey();
  const tasks: (() => Promise<Draft[]>)[] = [
    ...plan.wiki.slice(0, 8).map((w) => () => searchWiki(w)),
    ...(plan.libretexts ?? []).slice(0, 3).map((l) => () => searchLibreTexts(l)),
    ...(plan.archive ?? []).slice(0, 2).map((q) => () => searchArchive(q)),
    // Each YouTube search costs 100 of the API's 10,000 free daily units, so at most three run.
    ...(key ? (plan.videoQueries ?? []).slice(0, 3).map((q) => () => searchYouTube(q, key, videoLanguage)) : []),
    ...plan.videos.slice(0, 8).map((v) => () => checkVideo(v)),
    ...(plan.sites ?? []).slice(0, 6).map((s) => () => checkSite(s)),
  ];
  const results = await mapLimit(tasks, 6, (task) => task().catch(() => [] as Draft[]));

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const draft of results.flat()) {
    const key = normalizeUrl(draft.url);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ ...draft, id: `c${candidates.length + 1}` });
  }
  return { candidates, videoSource: key ? "youtube" : "suggested" };
}

// ---------- Validating plans sent by browsers ----------

const MAX_TEXT = 300;
const text = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "");
const list = (value: unknown, max: number) => (Array.isArray(value) ? value.slice(0, max) : []);
const record = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

/** Keeps only the parts of a plan the server acts on, with bounded sizes. The plan comes from a browser. */
export function sanitizePlan(raw: unknown): ResourcePlan | null {
  const plan = record(raw);
  if (!Object.keys(plan).length) return null;
  return {
    language: text(plan.language),
    topics: [],
    wiki: list(plan.wiki, 8).map((w) => {
      const item = record(w);
      return { project: item.project === "wikipedia" ? "wikipedia" : "wikibooks", lang: text(item.lang), query: text(item.query) };
    }),
    libretexts: list(plan.libretexts, 3).map((l) => ({ library: text(record(l).library), query: text(record(l).query) })),
    archive: list(plan.archive, 2).map(text),
    videoQueries: list(plan.videoQueries, 3).map(text),
    videos: list(plan.videos, 8).map((v) => ({ title: text(record(v).title), channel: text(record(v).channel), url: text(record(v).url) })),
    sites: list(plan.sites, 6).map((site) => {
      const item = record(site);
      const type = RESOURCE_TYPES.find((t) => t === item.type) ?? "article";
      return { title: text(item.title), url: typeof item.url === "string" ? item.url.slice(0, 2000) : "", type };
    }),
    searches: [],
  };
}
