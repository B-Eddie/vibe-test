import type { Internship, StudentGender } from "./types";
import { normalizeListing, mergeListings } from "./ingest/normalize";
import { getSeedInternships } from "./seed";
import { isDeadlinePassed } from "./deadline";
import { SEARCH_TAG_ALLOWLIST } from "./tags";
import {
  aiGenerate,
  getGeminiKey,
  getHackClubKey,
  hasAiCredentials,
  type AiResult,
} from "./ai";

/**
 * Prefer Gemini 3.5 Flash. Older 2.x flash / flash-lite IDs are shut down
 * for many new keys — never fall back to them.
 * GEMINI_MODEL overrides the first choice when set (unless it is a retired ID).
 */
const RETIRED_MODELS = new Set([
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
]);

function preferredModels(): string[] {
  const override = process.env.GEMINI_MODEL?.trim();
  const models = [
    override && !RETIRED_MODELS.has(override) ? override : null,
    "gemini-3.5-flash",
    "gemini-3.5-flash-preview",
    "gemini-flash-latest",
    "gemini-3.6-flash",
  ].filter((value): value is string => Boolean(value));
  return [...new Set(models)];
}

const DEFAULT_MODELS = preferredModels();

export const GEMINI_MODEL = DEFAULT_MODELS[0] || "gemini-3.5-flash";

/** True when Hack Club or Gemini credentials exist. */
export function getApiKey(): string | undefined {
  return getHackClubKey() || getGeminiKey();
}

type GeminiPart = { text?: string };
type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string; code?: number };
};

export type GeminiResult = AiResult;

function extractText(data: GeminiResponse): string | null {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text || "")
    .join("")
    .trim();
  return text || null;
}

async function callGeminiModel(
  model: string,
  apiKey: string,
  options: {
    system: string;
    user: string;
    json?: boolean;
    search?: boolean;
  },
): Promise<AiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // JSON mime type cannot be combined with google_search tool.
  const useSearch = Boolean(options.search);
  const useJson = Boolean(options.json) && !useSearch;

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: useSearch
              ? `${options.system}\n\n${options.user}`
              : options.user,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: options.json ? 0.55 : 0.3,
      maxOutputTokens: 8192,
      ...(useJson ? { responseMimeType: "application/json" } : {}),
    },
  };

  if (!useSearch) {
    body.systemInstruction = {
      parts: [{ text: options.system }],
    };
  }

  if (useSearch) {
    body.tools = [{ google_search: {} }];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    const message =
      data.error?.message ||
      `Gemini HTTP ${res.status}${data.error?.status ? ` (${data.error.status})` : ""}`;
    return { text: null, error: message, model, provider: "gemini" };
  }

  const text = extractText(data);
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason;
    return {
      text: null,
      error: reason
        ? `Gemini returned no text (finishReason=${reason})`
        : "Gemini returned an empty response",
      model,
      provider: "gemini",
    };
  }

  return { text, error: null, model, provider: "gemini" };
}

/** Gemini-only path (used as fallback from the unified AI layer). */
async function geminiOnlyGenerate(options: {
  system: string;
  user: string;
  json?: boolean;
  search?: boolean;
}): Promise<AiResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    return {
      text: null,
      error: "GEMINI_API_KEY is not set in this deployment",
      model: null,
      provider: null,
    };
  }

  let lastError: string | null = null;
  let lastModel: string | null = null;
  const tried = new Set<string>();

  for (const model of DEFAULT_MODELS) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      const result = await callGeminiModel(model, apiKey, options);
      if (result.text) return result;
      lastError = result.error;
      lastModel = result.model;
      if (
        lastError &&
        /API key|PERMISSION_DENIED|UNAUTHENTICATED|invalid.?api.?key/i.test(
          lastError,
        )
      ) {
        return result;
      }
      if (
        lastError &&
        /not found|not supported|invalid model|NOT_FOUND|quota|rate.?limit|RESOURCE_EXHAUSTED|billing|exceeded|no longer available/i.test(
          lastError,
        )
      ) {
        continue;
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Gemini request failed";
      lastModel = model;
    }
  }

  return {
    text: null,
    error: lastError || "Gemini request failed",
    model: lastModel,
    provider: "gemini",
  };
}

/**
 * Hack Club AI first, then Gemini. Returns text + error so the UI can show
 * when credentials are missing/invalid instead of silently falling back.
 */
export async function geminiGenerate(options: {
  system: string;
  user: string;
  json?: boolean;
  search?: boolean;
}): Promise<GeminiResult> {
  return aiGenerate(options, geminiOnlyGenerate);
}

/** Back-compat helper used by existing call sites. */
export async function geminiText(options: {
  system: string;
  user: string;
  json?: boolean;
  search?: boolean;
}): Promise<string | null> {
  const result = await geminiGenerate(options);
  if (result.error) {
    console.error("AI:", result.error, result.provider, result.model);
  }
  return result.text;
}

export function extractJsonArray(content: string): unknown[] | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || content.trim();
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildSearchSystem(options: {
  gender?: StudentGender;
  includeAffinity?: boolean;
}): string {
  const allow = SEARCH_TAG_ALLOWLIST.join(", ");
  const affinity =
    options.includeAffinity
      ? `- You may include women-focused or underrepresented-focused programs when clearly labeled; tag them "women-focused" or "underrepresented".`
      : options.gender === "male"
        ? `- Do NOT return girls/women-only programs (e.g. Girls Who Code, Kode With Klossy) or programs whose primary eligibility is underrepresented/minority students only. Prefer open-to-all high school programs.`
        : `- Prefer open-to-all high school programs. Skip girls/women-only and underrepresented-only affinity programs unless the posting is clearly open to all students.`;

  return `You find real, currently open high school internship, research, and pre-college programs that a high school student (grades 9–12) can apply to and get into.

Rules:
- Exclude undergraduate/college-only roles (bachelor enrollment required, typical university SWE internships at Shopify/Google/Meta, etc.).
- Prefer official program or application pages.
- Skip programs whose application deadline has already passed (unless clearly rolling).
${affinity}
- Use ONLY these tags (pick 1–3 field tags): ${allow}.
- Collapse CS/AI/coding/web/data tags to "programming". Always include "high-school".
- Return ONLY a JSON array of objects with keys: title, org, url, location, remote (boolean), deadline (YYYY-MM-DD or null for rolling), tags (string[]), description.
- Do not invent URLs — only include links you are confident exist from search.
- Aim for 10–18 distinct items. No markdown.`;
}

function parseInternshipRows(
  parsed: unknown[],
  now: string,
  source: string,
): Internship[] {
  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as {
        title?: string;
        org?: string;
        url?: string;
        location?: string;
        remote?: boolean;
        deadline?: string | null;
        tags?: string[];
        description?: string;
      };
      if (!row.title || !row.url) return null;
      try {
        new URL(row.url);
      } catch {
        return null;
      }
      if (isDeadlinePassed(row.deadline || null)) return null;
      return normalizeListing({
        title: row.title,
        org: row.org || "Unknown org",
        url: row.url,
        location: row.location || "See posting",
        remote: Boolean(row.remote),
        deadline: row.deadline || null,
        tags: [
          ...(Array.isArray(row.tags) ? row.tags.slice(0, 6) : []),
          "high-school",
        ],
        description: (row.description || row.title).slice(0, 700),
        source,
        updatedAt: now,
      });
    })
    .filter((item): item is Internship => Boolean(item));
}

export async function searchInternshipsWithGemini(options: {
  interests?: string[];
  city?: string;
  gender?: StudentGender;
  includeAffinity?: boolean;
}): Promise<{
  listings: Internship[];
  error: string | null;
  queries: number;
}> {
  const interests = options.interests ?? [];
  const city = options.city ?? "";
  const includeAffinity = Boolean(options.includeAffinity);
  const focus = interests.length
    ? interests.slice(0, 4).join(" ")
    : "programming research STEM";
  const place = city ? ` near ${city}` : "";
  const openOnlyHint = includeAffinity
    ? ""
    : " open to all students (not girls-only or underrepresented-only)";

  const queries = [
    `high school student internship programs ${focus}${place}${openOnlyHint} 2026 2027 apply`,
    `high school summer research internship programs STEM medicine biology engineering${openOnlyHint} 2026 2027 apply`,
    `paid high school internship technology programming nonprofit government${openOnlyHint} 2026 2027 apply`,
    `pre-college STEM programs high school students RSI COSMOS SIMR SSP${openOnlyHint} apply`,
    city
      ? `high school internships and research programs in ${city}${openOnlyHint} 2026 2027 apply`
      : `remote virtual high school internship programs programming research${openOnlyHint} 2026 2027 apply`,
  ];

  const searchSystem = buildSearchSystem({
    gender: options.gender,
    includeAffinity,
  });

  if (!hasAiCredentials()) {
    return {
      listings: [],
      error: "Neither HC_API_KEY nor GEMINI_API_KEY is set",
      queries: 0,
    };
  }

  const now = new Date().toISOString();
  const settled = await Promise.allSettled(
    queries.map((query) =>
      geminiGenerate({
        search: true,
        system: searchSystem,
        user: query,
      }),
    ),
  );

  const batches: Internship[][] = [];
  const errors: string[] = [];
  let successQueries = 0;

  for (const result of settled) {
    if (result.status === "rejected") {
      errors.push(
        result.reason instanceof Error
          ? result.reason.message
          : "Search request failed",
      );
      continue;
    }
    const payload = result.value;
    if (!payload.text) {
      if (payload.error) errors.push(payload.error);
      continue;
    }
    const parsed = extractJsonArray(payload.text);
    if (!parsed?.length) {
      errors.push("AI returned no parseable internship list");
      continue;
    }
    successQueries += 1;
    const source =
      payload.provider === "hackclub" ? "hackclub-search" : "gemini-search";
    batches.push(parseInternshipRows(parsed, now, source));
  }

  return {
    listings: mergeListings(batches),
    error: successQueries ? null : errors[0] || "Live search returned no results",
    queries: successQueries,
  };
}

export async function loadInternships(options: {
  interests?: string[];
  city?: string;
  gender?: StudentGender;
  includeAffinity?: boolean;
}): Promise<{
  listings: Internship[];
  liveSearch: boolean;
  liveCount: number;
  error: string | null;
}> {
  const discovered = await searchInternshipsWithGemini(options);
  const listings = mergeListings([
    getSeedInternships(),
    discovered.listings,
  ]);
  return {
    listings,
    liveSearch: discovered.listings.length > 0,
    liveCount: discovered.listings.length,
    error: discovered.error,
  };
}

export async function probeGemini(): Promise<{
  configured: boolean;
  ok: boolean;
  model: string | null;
  error: string | null;
  provider: string | null;
}> {
  if (!hasAiCredentials()) {
    return {
      configured: false,
      ok: false,
      model: null,
      error: "Neither HC_API_KEY nor GEMINI_API_KEY is set",
      provider: null,
    };
  }
  const result = await geminiGenerate({
    system: "Reply with exactly the word pong.",
    user: "ping",
  });
  return {
    configured: true,
    ok: Boolean(result.text),
    model: result.model,
    error: result.error,
    provider: result.provider,
  };
}
