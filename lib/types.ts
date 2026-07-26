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

export type CustomFact = {
  id: string;
  label: string;
  value: string;
};

export type StudentProfile = {
  name: string;
  email: string;
  phone: string;
  grade: string;
  school: string;
  city: string;
  remoteOk: boolean;
  interests: string[];
  skills: string[];
  activities: string;
  awards: string;
  links: string;
  bio: string;
  resumeText: string;
  parentName: string;
  parentEmail: string;
  customFacts: CustomFact[];
};

export type TrackerStatus =
  | "saved"
  | "drafted"
  | "ready"
  | "applied"
  | "rejected";

export type ApplicationKind = "internship" | "google-form" | "web";

export type TrackerEntry = {
  internshipId: string;
  status: TrackerStatus;
  updatedAt: string;
  notes?: string;
  title?: string;
  url?: string;
  kind?: ApplicationKind;
};

export type MatchResult = {
  internship: Internship;
  score: number;
  reasons: string[];
};

export type FormQuestionType =
  | "short"
  | "paragraph"
  | "multiple_choice"
  | "dropdown"
  | "checkboxes"
  | "scale"
  | "date"
  | "time"
  | "file"
  | "email"
  | "unknown";

export type FormQuestion = {
  id: string;
  entryId: string;
  title: string;
  type: FormQuestionType;
  required: boolean;
  options: string[];
  manualOnly?: boolean;
};

export type ParsedApplication = {
  kind: ApplicationKind;
  url: string;
  submitUrl: string | null;
  title: string;
  description: string;
  questions: FormQuestion[];
  fbzx: string | null;
  collectEmail: boolean;
  supportsAutoSubmit: boolean;
};

export type FilledAnswer = {
  entryId: string;
  questionId: string;
  title: string;
  type: FormQuestionType;
  value: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
  manualOnly?: boolean;
};

export const EMPTY_PROFILE: StudentProfile = {
  name: "",
  email: "",
  phone: "",
  grade: "11",
  school: "",
  city: "",
  remoteOk: true,
  interests: [],
  skills: [],
  activities: "",
  awards: "",
  links: "",
  bio: "",
  resumeText: "",
  parentName: "",
  parentEmail: "",
  customFacts: [],
};

export const PROFILE_STORAGE_KEY = "hsif-profile-v1";
export const TRACKER_STORAGE_KEY = "hsif-tracker-v1";
export const APPLY_DRAFT_KEY = "hsif-apply-draft-v1";
