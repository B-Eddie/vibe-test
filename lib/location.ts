import type { Internship, StudentProfile } from "./types";

const CA_CITY_HINTS = [
  "oakville",
  "toronto",
  "mississauga",
  "brampton",
  "hamilton",
  "ottawa",
  "london",
  "waterloo",
  "kitchener",
  "cambridge",
  "guelph",
  "burlington",
  "milton",
  "markham",
  "vaughan",
  "richmond hill",
  "scarborough",
  "etobicoke",
  "north york",
  "montreal",
  "vancouver",
  "calgary",
  "edmonton",
  "winnipeg",
  "halifax",
  "victoria",
  "saskatoon",
  "regina",
  "quebec",
  "gatineau",
  "laval",
  "surrey",
  "burnaby",
];

const CA_REGION_HINTS = [
  "canada",
  "canadian",
  "ontario",
  "quebec",
  "british columbia",
  "alberta",
  "manitoba",
  "saskatchewan",
  "nova scotia",
  "new brunswick",
  "newfoundland",
  "prince edward island",
  "yukon",
  "nunavut",
  "northwest territories",
  "gta",
  "greater toronto",
  "toronto area",
];

const CA_PROVINCE_ABBR = new Set([
  "on",
  "bc",
  "ab",
  "qc",
  "mb",
  "sk",
  "ns",
  "nb",
  "nl",
  "pe",
  "yt",
  "nt",
  "nu",
]);

const US_STATE_NAMES = [
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
  "district of columbia",
];

const US_STATE_ABBR = new Set([
  "al",
  "ak",
  "az",
  "ar",
  "ca",
  "co",
  "ct",
  "de",
  "fl",
  "ga",
  "hi",
  "id",
  "il",
  "in",
  "ia",
  "ks",
  "ky",
  "la",
  "me",
  "md",
  "ma",
  "mi",
  "mn",
  "ms",
  "mo",
  "mt",
  "ne",
  "nv",
  "nh",
  "nj",
  "nm",
  "ny",
  "nc",
  "nd",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "vt",
  "va",
  "wa",
  "wv",
  "wi",
  "wy",
  "dc",
]);

const GEO_RESTRICT_SIGNALS = [
  "within",
  "miles of",
  "mile radius",
  "km of",
  "kilometers of",
  "live and attend",
  "live within",
  "reside in",
  "must live",
  "must reside",
  "residents of",
  "resident of",
  "attend high school in",
  "attend high school within",
  "attend school in",
  "attend school within",
  "live in the",
  "living in the",
  "local students only",
  "only open to students who live",
  "students who live",
  "commutable distance",
  "must be located in",
  "based in",
];

const US_ONLY_SIGNALS = [
  "u.s. citizens only",
  "us citizens only",
  "united states citizens only",
  "u.s. residents only",
  "us residents only",
  "must be a u.s.",
  "must be a us ",
  "must be an american",
  "eligible to work in the united states",
  "authorized to work in the u.s",
  "authorized to work in the us",
  "us citizenship required",
  "u.s. citizenship required",
];

export type ProfileLocation = {
  raw: string;
  tokens: string[];
  country: "ca" | "us" | "unknown";
  regionHints: string[];
};

function tokenizeLocation(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

export function parseProfileLocation(city: string): ProfileLocation {
  const raw = city.trim();
  const lower = raw.toLowerCase();
  const tokens = tokenizeLocation(raw);
  const regionHints: string[] = [];

  for (const hint of [...CA_CITY_HINTS, ...CA_REGION_HINTS]) {
    if (lower.includes(hint)) regionHints.push(hint);
  }

  let country: ProfileLocation["country"] = "unknown";
  const hasCaCity = CA_CITY_HINTS.some((hint) => lower.includes(hint));
  const hasCaRegion = CA_REGION_HINTS.some((hint) => lower.includes(hint));
  const hasCaAbbr = tokens.some((token) => CA_PROVINCE_ABBR.has(token));
  const hasUsState = US_STATE_NAMES.some((state) => lower.includes(state));
  const hasUsAbbr = tokens.some((token) => US_STATE_ABBR.has(token));

  if (hasCaCity || hasCaRegion || (hasCaAbbr && !hasUsState)) {
    country = "ca";
    if (hasCaAbbr && tokens.includes("on") && !regionHints.includes("ontario")) {
      regionHints.push("ontario");
    }
  } else if (hasUsState || (hasUsAbbr && !hasCaAbbr)) {
    country = "us";
  }

  if (country === "ca" && !regionHints.includes("canada")) {
    regionHints.push("canada", "canadian");
  }

  return { raw, tokens, country, regionHints: [...new Set(regionHints)] };
}

function listingBlob(internship: Internship): string {
  return [
    internship.title,
    internship.org,
    internship.description,
    internship.location,
    ...internship.tags,
  ]
    .join(" ")
    .toLowerCase();
}

export function isGeoRestrictedText(text: string): boolean {
  return GEO_RESTRICT_SIGNALS.some((signal) => text.includes(signal));
}

export function isUsResidencyOnly(text: string): boolean {
  return US_ONLY_SIGNALS.some((signal) => text.includes(signal));
}

/** Pull place-like phrases after common residency cues. */
function extractRestrictedPlaces(text: string): string[] {
  const places: string[] = [];
  const patterns = [
    /(?:within\s+\d+\s*(?:miles?|km|kilometers?)\s+of|live(?:\s+and\s+attend(?:\s+high\s+school)?)?(?:\s+within)?|reside in|residents? of|attend(?:\s+high)?\s+school\s+(?:in|within)|located in|based in)\s+([a-z0-9 ,./()-]{3,80})/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const chunk = match[1]
        .split(/\bor\b|\band\b|;|\//i)
        .map((part) => part.trim())
        .filter((part) => part.length > 2);
      places.push(...chunk);
    }
  }

  return places;
}

function placeMatchesProfile(place: string, profile: ProfileLocation): boolean {
  const placeLower = place.toLowerCase();
  const placeTokens = tokenizeLocation(place);

  if (profile.tokens.some((token) => token.length > 2 && placeLower.includes(token))) {
    return true;
  }
  if (profile.regionHints.some((hint) => placeLower.includes(hint))) {
    return true;
  }

  // Canadian student vs US city/state place names.
  if (profile.country === "ca") {
    const mentionsUsState = US_STATE_NAMES.some((state) =>
      placeLower.includes(state),
    );
    const mentionsUsAbbr = placeTokens.some((token) => US_STATE_ABBR.has(token));
    if (mentionsUsState || mentionsUsAbbr) return false;
  }

  return false;
}

/**
 * True when the listing's residency / distance rules make the student
 * ineligible (e.g. "within 50 miles of Redmond, WA" for Oakville, ON).
 */
export function isLocationIneligible(
  internship: Internship,
  profile: StudentProfile,
): boolean {
  if (!profile.city?.trim()) return false;

  const profileLoc = parseProfileLocation(profile.city);
  const text = listingBlob(internship);

  if (profileLoc.country === "ca" && isUsResidencyOnly(text)) {
    return true;
  }

  if (!isGeoRestrictedText(text)) {
    // Soft: non-remote listing in a clearly different country with no
    // Canada/international openness — demote via score only, not hard hide.
    return false;
  }

  const places = extractRestrictedPlaces(text);
  if (!places.length) {
    // Restricted language but we couldn't parse places — if Canadian and
    // the restriction block is clearly US-local, hide.
    if (profileLoc.country === "ca") {
      const usLocal =
        US_STATE_NAMES.some((state) => text.includes(state)) &&
        !text.includes("canada") &&
        !text.includes("international") &&
        !text.includes("worldwide");
      if (usLocal && (text.includes("miles of") || text.includes("live and attend"))) {
        return true;
      }
    }
    return false;
  }

  // Eligible if any restricted place matches the student's area.
  const anyMatch = places.some((place) => placeMatchesProfile(place, profileLoc));
  if (anyMatch) return false;

  // Remote programs that also accept remote applicants despite local hubs.
  if (
    internship.remote &&
    (text.includes("remote applicants") ||
      text.includes("virtual") ||
      text.includes("online") ||
      text.includes("worldwide") ||
      text.includes("international"))
  ) {
    return false;
  }

  return true;
}

/** Extra search guidance based on the student's city. */
export function locationSearchGuidance(city: string): string {
  if (!city.trim()) {
    return "- Prefer remote/virtual programs or ones without strict local residency rules.";
  }
  const loc = parseProfileLocation(city);
  if (loc.country === "ca") {
    return `- Student location: ${city} (Canada). Prefer remote/virtual programs open to Canadian/international students, and Canada / Ontario / GTA programs.
- EXCLUDE programs that require living near a specific US city (e.g. "within 50 miles of Redmond, Washington" or Atlanta-only), or US citizens/residents only.`;
  }
  return `- Student location: ${city}. Prefer remote programs or ones the student can attend from this area.
- EXCLUDE programs with hard residency rules for other metros (e.g. "must live within X miles of [other city]") unless that area matches the student.`;
}
