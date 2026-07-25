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
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as StudentProfile) };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveProfile(profile: StudentProfile): void {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
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
  notes?: string,
): TrackerEntry[] {
  const current = loadTracker();
  const next: TrackerEntry = {
    internshipId,
    status,
    updatedAt: new Date().toISOString(),
    notes,
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
