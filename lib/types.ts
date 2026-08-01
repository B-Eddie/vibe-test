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

export type StudentGender =
  | ""
  | "male"
  | "female"
  | "nonbinary"
  | "prefer-not";

export type StudentProfile = {
  name: string;
  email: string;
  phone: string;
  grade: string;
  school: string;
  city: string;
  /** Used to hide girls/women-only programs when male. */
  gender: StudentGender;
  remoteOk: boolean;
  /**
   * When false (default), hide women-focused and underrepresented-only
   * affinity programs that most applicants cannot use.
   */
  includeAffinityPrograms: boolean;
  interests: string[];
  skills: string[];
  activities: string;
  awards: string;
  links: string;
  bio: string;
  resumeText: string;
  /** Pasted essays / emails so drafts can match the student's voice */
  writingSamples: string;
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

export type ApplicationKind =
  | "internship"
  | "google-form"
  | "html-form"
  | "web";

export type FillMode = "auto-submit" | "page-fill";

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

/** Show this question only when another question matches one of these values. */
export type FormVisibilityRule = {
  entryId: string;
  values: string[];
  /** Default "is" / "any": answer must match one of values. */
  comparison?: "is" | "any" | "equals" | "not_equals" | "contains";
};

export type FormQuestion = {
  id: string;
  entryId: string;
  title: string;
  type: FormQuestionType;
  required: boolean;
  options: string[];
  manualOnly?: boolean;
  /** Hints used by the in-page autofiller to find the live field */
  matchHints?: string[];
  name?: string;
  selector?: string;
  /** Zero-based section/page index when the form is multi-section */
  sectionIndex?: number;
  /** Option → next section (null = submit / end) for branching questions */
  optionBranches?: FormOptionBranch[];
  /** When set, question stays hidden until every rule matches current answers. */
  visibleWhen?: FormVisibilityRule[];
  /** True when the source form starts this field collapsed / gated. */
  initiallyHidden?: boolean;
};

export type FormOptionBranch = {
  option: string;
  nextSectionIndex: number | null;
};

export type FormSection = {
  id: string;
  index: number;
  title: string;
  description?: string;
  questionEntryIds: string[];
  /** Default next section when no branching answer applies; null ends the form */
  defaultNextSectionIndex: number | null;
};

export type ParsedApplication = {
  kind: ApplicationKind;
  url: string;
  submitUrl: string | null;
  title: string;
  description: string;
  questions: FormQuestion[];
  sections?: FormSection[];
  hasBranching?: boolean;
  fbzx: string | null;
  collectEmail: boolean;
  supportsAutoSubmit: boolean;
  fillMode: FillMode;
  platform: string;
  pageTextPreview?: string;
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
  matchHints?: string[];
  name?: string;
  selector?: string;
};

export const EMPTY_PROFILE: StudentProfile = {
  name: "",
  email: "",
  phone: "",
  grade: "11",
  school: "",
  city: "",
  gender: "",
  remoteOk: true,
  includeAffinityPrograms: false,
  interests: [],
  skills: [],
  activities: "",
  awards: "",
  links: "",
  bio: "",
  resumeText: "",
  writingSamples: "",
  parentName: "",
  parentEmail: "",
  customFacts: [],
};

export const PROFILE_STORAGE_KEY = "hsif-profile-v1";
export const TRACKER_STORAGE_KEY = "hsif-tracker-v1";
export const APPLY_DRAFT_KEY = "hsif-apply-draft-v1";
