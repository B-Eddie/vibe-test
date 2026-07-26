import type { StudentProfile } from "./types";

/** Server-safe profile → prompt text (no window/localStorage). */
export function profileToPromptContext(profile: StudentProfile): string {
  const facts = (profile.customFacts ?? [])
    .filter((fact) => fact.label && fact.value)
    .map((fact) => `${fact.label}: ${fact.value}`)
    .join("\n");

  return [
    `Name: ${profile.name}`,
    `Email: ${profile.email}`,
    `Phone: ${profile.phone}`,
    `Grade: ${profile.grade}`,
    `School: ${profile.school}`,
    `City: ${profile.city}`,
    `Remote OK: ${profile.remoteOk ? "yes" : "no"}`,
    `Interests: ${(profile.interests ?? []).join(", ")}`,
    `Skills: ${(profile.skills ?? []).join(", ")}`,
    `Activities: ${profile.activities}`,
    `Awards: ${profile.awards}`,
    `Links: ${profile.links}`,
    `Bio: ${profile.bio}`,
    `Resume: ${profile.resumeText}`,
    `Parent/guardian: ${profile.parentName} <${profile.parentEmail}>`,
    facts ? `Extra facts:\n${facts}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
