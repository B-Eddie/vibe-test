import type { Internship } from "./types";
import { normalizeListing, mergeListings } from "./ingest/normalize";
import { getSeedInternships } from "./seed";

export const GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

export function getApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    undefined
  );
}

type GeminiPart = { text?: string };
type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message?: string };
};

function extractText(data: GeminiResponse): string | null {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text || "")
    .join("")
    .trim();
  return text || null;
}

/**
 * Direct REST calls — avoids @google/generative-ai SDK tool/json quirks
 * that surface as minified "X is not a function" errors on Vercel.
 */
export async function geminiText(options: {
  system: string;
  user: string;
  json?: boolean;
  search?: boolean;
}): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const model = GEMINI_MODEL;
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
      temperature: 0.4,
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

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = (await res.json()) as GeminiResponse;
    if (!res.ok) {
      console.error("Gemini API error", res.status, data.error?.message || data);
      return null;
    }
    return extractText(data);
  } catch (error) {
    console.error("Gemini request failed", error);
    return null;
  }
}

function extractJsonArray(content: string): unknown[] | null {
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

function buildSearchQuery(interests: string[], city: string): string {
  const focus = interests.length
    ? interests.slice(0, 4).join(" ")
    : "STEM computer science research";
  const place = city ? ` near ${city}` : "";
  return `high school student internship programs ${focus}${place} 2026 apply`;
}

export async function searchInternshipsWithGemini(options: {
  interests?: string[];
  city?: string;
}): Promise<Internship[]> {
  const query = buildSearchQuery(options.interests ?? [], options.city ?? "");
  const text = await geminiText({
    search: true,
    system:
      "You find real, currently open or regularly recurring high school internship and pre-college programs. Prefer official program pages. Return ONLY a JSON array of objects with keys: title, org, url, location, remote (boolean), deadline (YYYY-MM-DD or null), tags (string[]), description. Do not invent URLs — only include links you are confident exist from search. Max 12 items. No markdown.",
    user: query,
  });

  if (!text) return [];
  const parsed = extractJsonArray(text);
  if (!parsed) return [];

  const now = new Date().toISOString();
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
          "gemini-search",
        ],
        description: (row.description || row.title).slice(0, 700),
        source: "gemini-search",
        updatedAt: now,
      });
    })
    .filter((item): item is Internship => Boolean(item));
}

export async function loadInternships(options: {
  interests?: string[];
  city?: string;
}): Promise<{ listings: Internship[]; liveSearch: boolean }> {
  const discovered = await searchInternshipsWithGemini(options);
  const listings = mergeListings([getSeedInternships(), discovered]);
  return { listings, liveSearch: discovered.length > 0 };
}
