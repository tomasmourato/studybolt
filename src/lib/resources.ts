import { nanoid } from "nanoid";
import { describeError, generateJson } from "./gemini";
import { runOnce } from "./jobs";
import {
  RESOURCE_CURATE_SCHEMA,
  RESOURCE_PLAN_SCHEMA,
  RESOURCE_TYPES,
  SEARCH_PROVIDERS,
  resourceCuratePrompt,
  resourcePlanPrompt,
  type ResourcePlan,
} from "./prompts";
import type { Candidate } from "./resource-search";
import { getSet, updateSet } from "./store";
import type { Resource, ResourceLanguageMode, ResourceSearch, ResourceType, SearchProvider } from "./types";

export interface ResourceOptions {
  languageMode: ResourceLanguageMode;
  focus?: string;
}

const MAX_PICKS = 18;

const isLangCode = (lang: string) => /^[a-z]{2,3}$/.test(lang);

// ---------- Ready-made searches on other sites ----------

const SEARCH_URL: Record<SearchProvider, (query: string, lang: string) => string> = {
  youtube: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  google_pdf: (q) => `https://www.google.com/search?q=${encodeURIComponent(`${q} filetype:pdf`)}`,
  khan: (q, lang) =>
    `https://${lang === "en" ? "www" : lang}.khanacademy.org/search?page_search_query=${encodeURIComponent(q)}`,
  archive: (q) => `https://archive.org/search?query=${encodeURIComponent(q)}`,
};

// Khan Academy has localized sites for these languages; others use the English site.
const KHAN_LANGUAGES = new Set(["pt", "es", "fr", "de", "it", "pl", "tr", "ja", "ko", "zh"]);

/** Search operators are added by the providers themselves, so any the model wrote are removed. */
const cleanQuery = (query: string) =>
  query
    .replace(/\b(?:file(?:type)?|site|ext|inurl|intitle):\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

function buildSearches(plan: ResourcePlan): ResourceSearch[] {
  const lang = isLangCode(plan.language) ? plan.language : "en";
  const planned = plan.searches.filter((s) => SEARCH_PROVIDERS.includes(s.provider) && RESOURCE_TYPES.includes(s.type));
  // Video searches always appear, since checked videos can't be guaranteed without the YouTube API.
  const videoSearches = (plan.videoQueries ?? []).slice(0, 3).map((query) => ({
    type: "video" as const,
    provider: "youtube" as const,
    query,
    label: query,
  }));

  const seen = new Set<string>();
  const searches: ResourceSearch[] = [];
  for (const s of [...videoSearches, ...planned]) {
    const query = cleanQuery(s.query ?? "");
    if (!query) continue;
    const url = SEARCH_URL[s.provider](query, s.provider === "khan" && !KHAN_LANGUAGES.has(lang) ? "en" : lang);
    if (seen.has(url)) continue;
    seen.add(url);
    searches.push({ type: s.type, provider: s.provider, query, label: s.label?.trim() || query, url });
  }
  return searches.slice(0, 8);
}

// ---------- Catalog searches and link checks, run by the server ----------

/** Sends only the search plan (never the key or the notes) to the server, which searches catalogs and checks links. */
async function gatherCandidates(plan: ResourcePlan, videoLanguage?: string) {
  const res = await fetch("/api/resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, videoLanguage }),
  });
  if (!res.ok) throw new Error(`The link checker failed (${res.status}). Try again in a moment.`);
  return (await res.json()) as { candidates: Candidate[]; videoSource: "youtube" | "suggested" };
}

// ---------- The job ----------

export function startResources(setId: string, options: ResourceOptions) {
  return runOnce(`resources:${setId}`, () => findResources(setId, options));
}

async function findResources(setId: string, { languageMode, focus }: ResourceOptions) {
  const setStatus = (status: "checking" | "curating") =>
    updateSet(setId, (s) => {
      if (s.resources) s.resources.status = status;
    });
  try {
    const set = await getSet(setId);
    if (!set) return;

    const plan = await generateJson<ResourcePlan>(resourcePlanPrompt(set, languageMode, focus), RESOURCE_PLAN_SCHEMA, {
      effort: "low",
    });
    const language = isLangCode(plan.language ?? "") ? plan.language : "en";
    await setStatus("checking");

    const { candidates, videoSource } = await gatherCandidates(plan, languageMode === "native" ? language : undefined);
    const searches = buildSearches(plan);
    let items: Resource[] = [];

    if (candidates.length) {
      await setStatus("curating");
      const { picks } = await generateJson<{ picks: { id: string; type: ResourceType; description: string }[] }>(
        resourceCuratePrompt(plan.topics ?? [], language, languageMode, candidates, focus),
        RESOURCE_CURATE_SCHEMA,
        { tier: "fast", effort: "low" },
      );
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const used = new Set<string>();
      for (const pick of picks) {
        const candidate = byId.get(pick.id);
        if (!candidate || used.has(pick.id)) continue;
        used.add(pick.id);
        items.push({
          id: nanoid(8),
          type: candidate.videoId ? "video" : RESOURCE_TYPES.includes(pick.type) ? pick.type : candidate.type,
          title: candidate.title,
          url: candidate.url,
          source: candidate.source,
          description: pick.description?.trim() ?? "",
          language: candidate.language,
          thumbnail: candidate.thumbnail,
          videoId: candidate.videoId,
        });
      }
      items = items.slice(0, MAX_PICKS);
    }

    if (!items.length && !searches.length) {
      throw new Error("Couldn't find online materials for these notes. Try again or add a focus.");
    }
    await updateSet(setId, (s) => {
      if (!s.resources) return;
      s.resources = {
        ...s.resources,
        status: "ready",
        error: undefined,
        language,
        items,
        searches,
        videoSource,
      };
    });
  } catch (err) {
    console.error(`Resource search failed for set ${setId}:`, err);
    await updateSet(setId, (s) => {
      if (s.resources) s.resources = { ...s.resources, status: "error", error: describeError(err) };
    });
  }
}
