export type Internship = {
  id: string;
  title: string;
  org: string;
  url: string;
  location: string;
  remote: boolean;
  deadline: string | null;
  tags: string[];
  description: string;
  source: string;
  updatedAt: string;
};

export type StudentProfile = {
  name: string;
  grade: string;
  city: string;
  remoteOk: boolean;
  interests: string[];
  skills: string[];
  bio: string;
  resumeText: string;
};

export type TrackerStatus = "saved" | "drafted" | "applied" | "rejected";

export type TrackerEntry = {
  internshipId: string;
  status: TrackerStatus;
  updatedAt: string;
  notes?: string;
};

export type MatchResult = {
  internship: Internship;
  score: number;
  reasons: string[];
};

export const EMPTY_PROFILE: StudentProfile = {
  name: "",
  grade: "11",
  city: "",
  remoteOk: true,
  interests: [],
  skills: [],
  bio: "",
  resumeText: "",
};

export const PROFILE_STORAGE_KEY = "hsif-profile-v1";
export const TRACKER_STORAGE_KEY = "hsif-tracker-v1";
