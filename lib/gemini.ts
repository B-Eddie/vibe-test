import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from "@google/generative-ai";
import type { Internship } from "./types";
import { normalizeListing, mergeListings } from "./ingest/normalize";
import { getSeedInternships } from "./seed";

export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

export function getApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    undefined
  );
}

export function getGeminiClient(): GoogleGenerativeAI | null {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

export function getGeminiModel(options?: {
  json?: boolean;
  search?: boolean;
}): GenerativeModel | null {
  const client = getGeminiClient();
  if (!client) return null;

  // googleSearch is supported on Gemini 2.x; typings may lag behind.
  const tools = options?.search
    ? ([{ googleSearch: {} }] as unknown as [{ googleSearch: Record<string, never> }])
    : undefined;

  return client.getGenerativeModel(
    {
      model: GEMINI_MODEL,
      generationConfig: options?.json
        ? { responseMimeType: "application/json" }
        : undefined,
      ...(tools ? { tools: tools as never } : {}),
    },
    { apiVersion: "v1beta" },
  );
}

export async function geminiText(options: {
  system: string;
  user: string;
  json?: boolean;
  search?: boolean;
}): Promise<string | null> {
  const model = getGeminiModel({
    json: options.json,
    search: options.search,
  });
  if (!model) return null;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: options.user }] }],
      systemInstruction: options.system,
    });
    return result.response.text() || null;
  } catch {
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
      "You find real, currently open or regularly recurring high school internship and pre-college programs. Prefer official program pages. Return ONLY a JSON array of objects with keys: title, org, url, location, remote (boolean), deadline (YYYY-MM-DD or null), tags (string[]), description. Do not invent URLs — only include links you are confident exist from search. Max 12 items.",
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
        // Validate URL
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
