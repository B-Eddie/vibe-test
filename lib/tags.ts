/**
 * Canonical field tags + eligibility helpers for Find personalization.
 */

/** Map noisy synonyms → one display/filter tag. */
const TAG_SYNONYMS: Record<string, string> = {
  programming: "programming",
  coding: "programming",
  "computer-science": "programming",
  "computer science": "programming",
  cs: "programming",
  software: "programming",
  "software-engineering": "programming",
  tech: "programming",
  technology: "programming",
  ai: "programming",
  "artificial-intelligence": "programming",
  "machine-learning": "programming",
  ml: "programming",
  "web-development": "programming",
  "web-dev": "programming",
  "data-science": "programming",
  "data science": "programming",
  cybersecurity: "programming",
  "cyber-security": "programming",

  research: "research",
  engineering: "engineering",
  robotics: "engineering",
  aerospace: "engineering",
  aviation: "engineering",
  "materials-science": "engineering",
  "materials science": "engineering",

  medicine: "medicine",
  healthcare: "medicine",
  health: "medicine",
  genomics: "medicine",
  biochemistry: "medicine",
  biomedical: "medicine",

  biology: "biology",
  bio: "biology",

  math: "math",
  mathematics: "math",

  science: "science",
  stem: "science",
  physics: "science",
  chemistry: "science",
  "earth-science": "science",
  "earth science": "science",
  astronomy: "science",
  climate: "science",
  space: "science",
  environment: "science",

  business: "business",
  entrepreneurship: "business",
  finance: "business",
  startup: "business",
  startups: "business",

  arts: "arts",
  design: "arts",
  museum: "arts",
  history: "arts",

  leadership: "leadership",
  mentorship: "leadership",

  policy: "policy",
  government: "policy",

  community: "community",
  nonprofit: "community",
  volunteer: "community",

  paid: "paid",
  scholarship: "paid",

  remote: "remote",
  summer: "summer",
  competitive: "competitive",
  "high-school": "high-school",
  "high school": "high-school",
  "pre-college": "high-school",
  precollege: "high-school",

  "women-focused": "women-focused",
  "girls-only": "women-focused",
  "women-only": "women-focused",
  underrepresented: "underrepresented",
  "underrepresented-stem": "underrepresented",
};

/** Tags shown in the Find "Field" filter (exclude meta / eligibility). */
const FILTER_HIDDEN = new Set([
  "high-school",
  "gemini-search",
  "hackclub-search",
  "women-focused",
  "underrepresented",
  "paid",
  "remote",
  "summer",
  "scholarship",
  "competitive",
]);

const WOMEN_SIGNALS = [
  "girls who code",
  "kode with klossy",
  "for girls",
  "for young women",
  "high school girls",
  "high-school girls",
  "women in stem",
  "girls-only",
  "women-only",
  "women focused",
  "women-focused",
  "young women and gender-expansive",
  "for high school girls",
  "girls and non-binary",
  "girls and nonbinary",
];

const UNDERREP_SIGNALS = [
  "underrepresented backgrounds",
  "underrepresented groups",
  "underrepresented and underserved",
  "underserved backgrounds",
  "students from underrepresented",
  "underrepresented students",
  "diversity in stem",
  "historically underrepresented",
];

function keyOf(tag: string): string {
  return tag.toLowerCase().trim().replace(/[_\s]+/g, "-");
}

export function canonicalizeTag(tag: string): string | null {
  const key = keyOf(tag);
  if (!key) return null;
  if (key === "gemini-search" || key === "hackclub-search") return null;
  return TAG_SYNONYMS[key] || TAG_SYNONYMS[key.replace(/-/g, " ")] || key;
}

export function normalizeTags(tags: string[]): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    const canonical = canonicalizeTag(tag);
    if (canonical) out.add(canonical);
  }
  return [...out];
}

/** Interest/skill phrases → tokens useful for matching canonical tags. */
export function expandInterestTokens(value: string): string[] {
  const lower = value.toLowerCase().trim();
  const canonical = canonicalizeTag(lower);
  const tokens = lower
    .split(/[^a-z0-9+#]+/)
    .filter((token) => token.length > 1);
  const extras: string[] = [];
  if (canonical === "programming") {
    extras.push(
      "programming",
      "coding",
      "computer",
      "software",
      "python",
      "java",
      "javascript",
    );
  }
  return [...new Set([...(canonical ? [canonical] : []), ...tokens, ...extras])];
}

export function listingHaystack(parts: string[]): string {
  return parts.join(" ").toLowerCase();
}

export function isWomenFocused(text: string, tags: string[] = []): boolean {
  if (tags.some((tag) => canonicalizeTag(tag) === "women-focused")) return true;
  return WOMEN_SIGNALS.some((signal) => text.includes(signal));
}

export function isUnderrepresentedFocused(
  text: string,
  tags: string[] = [],
): boolean {
  if (tags.some((tag) => canonicalizeTag(tag) === "underrepresented")) {
    return true;
  }
  return UNDERREP_SIGNALS.some((signal) => text.includes(signal));
}

/** Auto-tag eligibility from listing text; keep field tags canonical. */
export function enrichListingTags(options: {
  title: string;
  org: string;
  description: string;
  tags: string[];
}): string[] {
  const text = listingHaystack([
    options.title,
    options.org,
    options.description,
    ...options.tags,
  ]);
  const tags = normalizeTags(options.tags);
  if (isWomenFocused(text, tags) && !tags.includes("women-focused")) {
    tags.push("women-focused");
  }
  if (
    isUnderrepresentedFocused(text, tags) &&
    !tags.includes("underrepresented")
  ) {
    tags.push("underrepresented");
  }
  if (!tags.includes("high-school")) tags.push("high-school");
  return tags;
}

export function isFilterTag(tag: string): boolean {
  return !FILTER_HIDDEN.has(tag);
}

/** Compact allowlist for AI search prompts. */
export const SEARCH_TAG_ALLOWLIST = [
  "programming",
  "research",
  "engineering",
  "medicine",
  "biology",
  "math",
  "science",
  "business",
  "arts",
  "leadership",
  "policy",
  "community",
  "paid",
  "remote",
  "women-focused",
  "underrepresented",
  "high-school",
];
