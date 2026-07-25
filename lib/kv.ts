import { kv } from "@vercel/kv";
import type { Internship } from "./types";
import seed from "@/data/seed-internships.json";

export const LISTINGS_KEY = "hsif:internships";

function hasKvEnv(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  );
}

export function getSeedInternships(): Internship[] {
  return seed as Internship[];
}

export async function readListings(): Promise<Internship[]> {
  if (!hasKvEnv()) {
    return getSeedInternships();
  }

  try {
    const stored = await kv.get<Internship[]>(LISTINGS_KEY);
    if (stored && stored.length > 0) {
      return stored;
    }
  } catch {
    // Fall through to seed when KV is misconfigured locally.
  }

  return getSeedInternships();
}

export async function writeListings(listings: Internship[]): Promise<void> {
  if (!hasKvEnv()) {
    return;
  }

  await kv.set(LISTINGS_KEY, listings);
}
