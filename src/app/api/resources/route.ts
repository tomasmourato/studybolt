import { gatherCandidates, sanitizePlan } from "@/lib/resource-search";

// The only server route. It receives a search plan (no Gemini key, no notes), searches free
// catalogs and checks that each link works. Nothing is stored.
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { plan?: unknown; videoLanguage?: unknown } | null;
  const plan = sanitizePlan(body?.plan);
  if (!plan) return Response.json({ error: "Expected a search plan." }, { status: 400 });
  const videoLanguage =
    typeof body?.videoLanguage === "string" && /^[a-z]{2,3}$/.test(body.videoLanguage) ? body.videoLanguage : undefined;
  return Response.json(await gatherCandidates(plan, videoLanguage), { headers: { "Cache-Control": "no-store" } });
}
