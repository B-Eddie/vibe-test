"use client";

import {
  EMPTY_PROFILE,
  PROFILE_STORAGE_KEY,
  TRACKER_STORAGE_KEY,
  type StudentProfile,
  type TrackerEntry,
  type TrackerStatus,
} from "./types";

export function loadProfile(): StudentProfile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return EMPTY_PROFILE;
    const parsed = JSON.parse(raw) as Partial<StudentProfile>;
    return {
      ...EMPTY_PROFILE,
      ...parsed,
      interests: parsed.interests ?? [],
      skills: parsed.skills ?? [],
      customFacts: parsed.customFacts ?? [],
      writingSamples: parsed.writingSamples ?? "",
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveProfile(profile: StudentProfile): void {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function profileCompleteness(profile: StudentProfile): number {
  const checks = [
    profile.name,
    profile.email,
    profile.grade,
    profile.school,
    profile.city,
    profile.bio,
    profile.resumeText,
    profile.interests.length > 0,
    profile.skills.length > 0,
    profile.activities,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export function loadTracker(): TrackerEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TRACKER_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TrackerEntry[];
  } catch {
    return [];
  }
}

export function saveTracker(entries: TrackerEntry[]): void {
  window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(entries));
}

export function upsertTrackerStatus(
  internshipId: string,
  status: TrackerStatus,
  extra?: Partial<TrackerEntry>,
): TrackerEntry[] {
  const current = loadTracker();
  const existing = current.find((entry) => entry.internshipId === internshipId);
  const next: TrackerEntry = {
    internshipId,
    status,
    updatedAt: new Date().toISOString(),
    title: extra?.title ?? existing?.title,
    url: extra?.url ?? existing?.url,
    kind: extra?.kind ?? existing?.kind ?? "internship",
    notes: extra?.notes ?? existing?.notes,
  };
  const filtered = current.filter(
    (entry) => entry.internshipId !== internshipId,
  );
  const updated = [next, ...filtered];
  saveTracker(updated);
  return updated;
}

export function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function profileToPromptContext(profile: StudentProfile): string {
  const facts = profile.customFacts
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
    `Interests: ${profile.interests.join(", ")}`,
    `Skills: ${profile.skills.join(", ")}`,
    `Activities: ${profile.activities}`,
    `Awards: ${profile.awards}`,
    `Links: ${profile.links}`,
    `Bio: ${profile.bio}`,
    `Resume: ${profile.resumeText}`,
    profile.writingSamples?.trim()
      ? `Writing style samples (match this voice in essays/short answers):\n${profile.writingSamples.trim()}`
      : "",
    `Parent/guardian: ${profile.parentName} <${profile.parentEmail}>`,
    facts ? `Extra facts:\n${facts}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
