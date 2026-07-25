import { createHash } from "crypto";
import type { Internship } from "../types";

export function slugId(parts: string[]): string {
  const raw = parts.join("|").toLowerCase();
  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 10);
  return `ext-${hash}`;
}

export function normalizeListing(
  input: Partial<Internship> &
    Pick<Internship, "title" | "org" | "url" | "source">,
): Internship {
  const now = new Date().toISOString();
  return {
    id: input.id ?? slugId([input.org, input.title, input.url]),
    title: input.title.trim(),
    org: input.org.trim(),
    url: input.url.trim(),
    location: (input.location ?? "Remote / unspecified").trim(),
    remote: Boolean(input.remote),
    deadline: input.deadline ?? null,
    tags: input.tags ?? [],
    description: (input.description ?? "").trim(),
    source: input.source,
    updatedAt: input.updatedAt ?? now,
  };
}

export function mergeListings(groups: Internship[][]): Internship[] {
  const map = new Map<string, Internship>();

  for (const group of groups) {
    for (const item of group) {
      const key = item.url.toLowerCase();
      const existing = map.get(key);
      if (!existing || existing.updatedAt < item.updatedAt) {
        map.set(key, item);
      }
    }
  }

  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}
