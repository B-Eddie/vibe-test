import type { StudentProfile } from "./types";

/** Server-safe profile → prompt text (no window/localStorage). */
export function profileToPromptContext(profile: StudentProfile): string {
  const facts = (profile.customFacts ?? [])
    .filter((fact) => fact.label && fact.value)
    .map((fact) => `${fact.label}: ${fact.value}`)
    .join("\n");

  return [
    `Full name: ${profile.name}`,
    `Name split hint: use first token as first name and remaining tokens as last name when the form asks separately`,
    `Email: ${profile.email}`,
    `Phone: ${profile.phone}`,
    `Grade: ${profile.grade}`,
    `School: ${profile.school}`,
    `City: ${profile.city}`,
    `Remote OK: ${profile.remoteOk ? "yes" : "no"}`,
    `Interests (only for interest/skills-style questions, never for country/scores/address): ${(profile.interests ?? []).join(", ")}`,
    `Skills (only for skills-style questions, never for country/scores/address): ${(profile.skills ?? []).join(", ")}`,
    `Activities: ${profile.activities}`,
    `Awards: ${profile.awards}`,
    `Links: ${profile.links}`,
    `Bio (rewrite into question-specific answers; do not paste verbatim into every field): ${profile.bio}`,
    `Resume (use as source material; do not paste verbatim into unrelated fields): ${profile.resumeText}`,
    profile.writingSamples?.trim()
      ? `Writing style samples (match this voice in essays/short answers):\n${profile.writingSamples.trim()}`
      : "",
    `Parent/guardian: ${profile.parentName} <${profile.parentEmail}>`,
    facts ? `Extra facts:\n${facts}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
