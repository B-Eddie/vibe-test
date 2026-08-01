import type { Internship, MatchResult, StudentProfile } from "./types";
import { daysUntilDeadline, isDeadlinePassed } from "./deadline";
import {
  expandInterestTokens,
  isUnderrepresentedFocused,
  isWomenFocused,
  listingHaystack,
} from "./tags";

const HS_SIGNALS = [
  "high school",
  "high-school",
  "highschool",
  "grades 9",
  "grades 10",
  "grades 11",
  "grades 12",
  "grade 9",
  "grade 10",
  "grade 11",
  "grade 12",
  "9th grade",
  "10th grade",
  "11th grade",
  "12th grade",
  "rising senior",
  "rising junior",
  "rising sophomore",
  "minors welcome",
  "student leaders",
  "pre-college",
  "precollege",
  "secondary school",
  "hs student",
  "hs internship",
  "teen ",
  "teens",
  "ages 14",
  "ages 15",
  "ages 16",
  "ages 17",
  "ages 18",
];

/** Phrases that usually mean college/university-only (infeasible for HS). */
const COLLEGE_ONLY_SIGNALS = [
  "undergraduate",
  "undergrad",
  "university student",
  "college student",
  "currently enrolled in a bachelor",
  "pursuing a bachelor",
  "pursuing a degree",
  "bachelor's degree",
  "bachelors degree",
  "enrolled in a university",
  "enrolled in college",
  "college sophomore",
  "college junior",
  "college senior",
  "university sophomore",
  "university junior",
  "university senior",
  "graduating senior",
  "masters student",
  "master's student",
  "mba student",
  "phd student",
  "graduate student",
  "must be 18+ and enrolled",
  "returning to university",
  "returning to college",
];

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((token) => token.length > 1);
}

function unique(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

function listingText(internship: Internship): string {
  return listingHaystack([
    internship.title,
    internship.org,
    internship.description,
    internship.location,
    ...internship.tags,
  ]);
}

function hasHsTag(internship: Internship): boolean {
  return internship.tags.some((tag) => {
    const t = tag.toLowerCase();
    return (
      t.includes("high-school") ||
      t.includes("high school") ||
      t === "hs" ||
      t.includes("pre-college") ||
      t.includes("precollege")
    );
  });
}

function hasHsSignal(text: string): boolean {
  return HS_SIGNALS.some((signal) => text.includes(signal));
}

function hasCollegeOnlySignal(text: string): boolean {
  return COLLEGE_ONLY_SIGNALS.some((signal) => text.includes(signal));
}

/**
 * True when a high school student could realistically apply / get in.
 * Prefers explicit HS / pre-college signals; rejects clear college-only roles
 * (e.g. typical undergrad SWE internships at Shopify-scale companies).
 */
export function isHighSchoolAccessible(internship: Internship): boolean {
  const text = listingText(internship);
  const hsTagged = hasHsTag(internship);
  const hsMentioned = hsTagged || hasHsSignal(text);
  const collegeOnly = hasCollegeOnlySignal(text);

  // Explicit HS + college language still counts as HS-accessible
  // (e.g. "high school and undergraduate students").
  if (hsMentioned) return true;

  if (collegeOnly) return false;

  // Ambiguous corporate internships without HS language are treated as
  // college-track when the strict filter is on.
  return false;
}

/** Affinity / identity-restricted programs the user likely cannot use. */
export function isAffinityRestricted(
  internship: Internship,
  profile: StudentProfile,
): boolean {
  const text = listingText(internship);
  const women = isWomenFocused(text, internship.tags);
  const underrep = isUnderrepresentedFocused(text, internship.tags);

  // Male applicants cannot use girls/women-only programs.
  if (women && profile.gender === "male") return true;

  // Unless opted in, hide affinity-restricted programs for everyone.
  if (!profile.includeAffinityPrograms && (women || underrep)) return true;

  return false;
}

export function scoreInternship(
  internship: Internship,
  profile: StudentProfile,
): MatchResult {
  const reasons: string[] = [];
  let score = 12;

  const haystack = unique(
    tokenize(
      [
        internship.title,
        internship.org,
        internship.description,
        internship.location,
        ...internship.tags,
      ].join(" "),
    ),
  );
  const haystackText = listingText(internship);

  const interestHits = profile.interests.filter((interest) => {
    const tokens = expandInterestTokens(interest);
    return tokens.some(
      (token) => haystack.includes(token) || haystackText.includes(token),
    );
  });
  if (interestHits.length) {
    score += interestHits.length * 18;
    reasons.push(`Matches interests: ${interestHits.slice(0, 3).join(", ")}`);
  }

  const skillHits = profile.skills.filter((skill) => {
    const tokens = expandInterestTokens(skill);
    return tokens.some(
      (token) => haystack.includes(token) || haystackText.includes(token),
    );
  });
  if (skillHits.length) {
    score += skillHits.length * 14;
    reasons.push(`Uses your skills: ${skillHits.slice(0, 3).join(", ")}`);
  }

  if (internship.remote && profile.remoteOk) {
    score += 16;
    reasons.push("Remote-friendly fits your preference");
  } else if (!internship.remote && profile.city) {
    const cityToken = tokenize(profile.city)[0];
    if (cityToken && internship.location.toLowerCase().includes(cityToken)) {
      score += 18;
      reasons.push(`Near ${profile.city}`);
    } else if (!profile.remoteOk) {
      score += 4;
      reasons.push("On-site opportunity");
    }
  } else if (internship.remote && !profile.remoteOk) {
    score -= 6;
  }

  if (isHighSchoolAccessible(internship)) {
    score += 22;
    reasons.push("Open to high school students");
  }

  // Soft penalty if affinity programs are still visible (opted in).
  if (
    profile.includeAffinityPrograms &&
    isWomenFocused(haystackText, internship.tags) &&
    profile.gender === "male"
  ) {
    score -= 40;
    reasons.push("Women/girls-focused — likely not eligible");
  } else if (
    profile.includeAffinityPrograms &&
    isUnderrepresentedFocused(haystackText, internship.tags) &&
    profile.gender === "male"
  ) {
    score -= 18;
  }

  const days = daysUntilDeadline(internship.deadline);
  if (days !== null) {
    if (days < 0) {
      score = 0;
      reasons.push("Deadline has passed");
    } else if (days <= 21) {
      score += 12;
      reasons.push("Deadline coming up soon");
    } else if (days <= 60) {
      score += 8;
      reasons.push("Upcoming deadline window");
    }
  }

  if (profile.grade && haystackText.includes(profile.grade)) {
    score += 8;
    reasons.push(`Mentions grade ${profile.grade}`);
  }

  if (!reasons.length) {
    reasons.push("General fit based on listing details");
  }

  return {
    internship,
    score: Math.max(0, Math.min(99, Math.round(score))),
    reasons: reasons.slice(0, 4),
  };
}

export function rankInternships(
  internships: Internship[],
  profile: StudentProfile,
  options?: { includePastDeadlines?: boolean },
): MatchResult[] {
  const includePast = Boolean(options?.includePastDeadlines);
  return internships
    .filter(
      (internship) => includePast || !isDeadlinePassed(internship.deadline),
    )
    .filter((internship) => !isAffinityRestricted(internship, profile))
    .map((internship) => scoreInternship(internship, profile))
    .sort((a, b) => b.score - a.score);
}
