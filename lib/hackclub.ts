import OpenAI from "openai";
import type { Internship } from "./types";
import { normalizeListing, mergeListings } from "./ingest/normalize";
import { getSeedInternships } from "./seed";

export const HACKCLUB_BASE_URL = "https://ai.hackclub.com/proxy/v1";
export const HACKCLUB_MODEL = "qwen/qwen3-32b";

export function getApiKey(): string | undefined {
  return process.env.HACKCLUB_API_KEY?.trim() || undefined;
}

export function getHackClubClient(): OpenAI | null {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: HACKCLUB_BASE_URL,
  });
}

type ExaResult = {
  title?: string;
  url?: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  summary?: string;
};

type ExaSearchResponse = {
  results?: ExaResult[];
};

function buildSearchQuery(interests: string[], city: string): string {
  const focus = interests.length
    ? interests.slice(0, 4).join(" ")
    : "STEM computer science research";
  const place = city ? ` near ${city}` : "";
  return `high school student internship programs ${focus}${place} 2026 apply`;
}

function listingFromExa(result: ExaResult): Internship | null {
  if (!result.url || !result.title) return null;
  const text = (result.text || result.summary || "").replace(/\s+/g, " ").trim();
  const org =
    result.author?.trim() ||
    (() => {
      try {
        return new URL(result.url).hostname.replace(/^www\./, "");
      } catch {
        return "Unknown org";
      }
    })();

  const lower = `${result.title} ${text}`.toLowerCase();
  const remote = lower.includes("remote") || lower.includes("virtual");

  return normalizeListing({
    title: result.title.trim(),
    org,
    url: result.url,
    location: remote ? "Remote / see posting" : "See posting",
    remote,
    deadline: null,
    tags: ["high-school", "ai-search"],
    description: text.slice(0, 700) || result.title,
    source: "hackclub-exa",
    updatedAt: result.publishedDate
      ? new Date(result.publishedDate).toISOString()
      : new Date().toISOString(),
  });
}

export async function searchInternshipsWithExa(options: {
  interests?: string[];
  city?: string;
}): Promise<Internship[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const query = buildSearchQuery(options.interests ?? [], options.city ?? "");

  try {
    const res = await fetch(`${HACKCLUB_BASE_URL}/exa/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        numResults: 12,
        type: "auto",
        contents: {
          text: { maxCharacters: 600 },
        },
      }),
      cache: "no-store",
    });

    if (!res.ok) return [];

    const data = (await res.json()) as ExaSearchResponse;
    return (data.results ?? [])
      .map(listingFromExa)
      .filter((item): item is Internship => Boolean(item));
  } catch {
    return [];
  }
}

export async function loadInternships(options: {
  interests?: string[];
  city?: string;
}): Promise<{ listings: Internship[]; liveSearch: boolean }> {
  const discovered = await searchInternshipsWithExa(options);
  const listings = mergeListings([getSeedInternships(), discovered]);
  return { listings, liveSearch: discovered.length > 0 };
}
