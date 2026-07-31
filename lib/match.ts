import type { Internship, MatchResult, StudentProfile } from "./types";
import { daysUntilDeadline, isDeadlinePassed } from "./deadline";

const HS_SIGNALS = [
  "high school",
  "high-school",
  "grades 9",
  "grades 10",
  "grades 11",
  "grades 12",
  "rising senior",
  "rising junior",
  "minors welcome",
  "student leaders",
  "hs ",
  "teen",
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
  const haystackText = [
    internship.title,
    internship.org,
    internship.description,
    ...internship.tags,
  ]
    .join(" ")
    .toLowerCase();

  const interestHits = profile.interests.filter((interest) => {
    const tokens = tokenize(interest);
    return tokens.some((token) => haystack.includes(token));
  });
  if (interestHits.length) {
    score += interestHits.length * 18;
    reasons.push(`Matches interests: ${interestHits.slice(0, 3).join(", ")}`);
  }

  const skillHits = profile.skills.filter((skill) => {
    const tokens = tokenize(skill);
    return tokens.some((token) => haystack.includes(token));
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

  const hsBoost = HS_SIGNALS.some((signal) => haystackText.includes(signal));
  if (hsBoost || internship.tags.some((tag) => tag.includes("high-school"))) {
    score += 22;
    reasons.push("Explicitly open to high school students");
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
    .map((internship) => scoreInternship(internship, profile))
    .sort((a, b) => b.score - a.score);
}
