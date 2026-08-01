import { geminiGenerate, extractJsonArray, getApiKey } from "./gemini";
import {
  isOptionalQuestion,
  looksLikeContinueOption,
  looksLikeSubmitOption,
  preferredNavigationOption,
  preferredUnlockOption,
} from "./form-path";
import type {
  FilledAnswer,
  FormQuestion,
  ParsedApplication,
  StudentProfile,
} from "./types";
import { profileToPromptContext } from "./storage-server";

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Invented fillers we should never keep, especially on optional fields. */
function isFakePlaceholderValue(value: string): boolean {
  const t = value.trim().toLowerCase();
  if (!t) return false;
  return (
    t === "(555) 000-0000" ||
    t === "555-000-0000" ||
    t === "5550000000" ||
    t === "student@example.com" ||
    t === "you@school.edu" ||
    t === "high school applicant" ||
    t === "my high school" ||
    t === "near opportunity location" ||
    t === "yes — happy to share more detail"
  );
}

function blankOptionalAnswer(): {
  value: string;
  confidence: FilledAnswer["confidence"];
  rationale: string;
} {
  return {
    value: "",
    confidence: "high",
    rationale: "Left blank (optional — nothing in your background to use)",
  };
}

function blankMissingFact(label: string): {
  value: string;
  confidence: FilledAnswer["confidence"];
  rationale: string;
} {
  return {
    value: "",
    confidence: "low",
    rationale: `Add your ${label} before submitting — it is not in your background`,
  };
}

export function splitPersonName(fullName: string): {
  first: string;
  last: string;
  full: string;
} {
  const full = fullName.trim().replace(/\s+/g, " ");
  if (!full) return { first: "", last: "", full: "" };
  const parts = full.split(" ");
  if (parts.length === 1) return { first: parts[0]!, last: "", full };
  return {
    first: parts[0]!,
    last: parts.slice(1).join(" "),
    full,
  };
}

function titleOf(question: FormQuestion): string {
  return question.title.toLowerCase().replace(/\s+/g, " ").trim();
}

function isLastNameField(title: string): boolean {
  return /\b(last|family|sur)\s*name\b|\bsurname\b/.test(title);
}

function isFirstNameField(title: string): boolean {
  if (isLastNameField(title)) return false;
  if (/\b(first|given|preferred)\s*name\b/.test(title)) return true;
  return title === "first" || title === "given name";
}

function isFullNameField(title: string): boolean {
  if (isFirstNameField(title) || isLastNameField(title)) return false;
  return (
    title === "name" ||
    title.startsWith("name ") ||
    /\b(full|legal|complete)\s*name\b/.test(title) ||
    /\byour name\b/.test(title) ||
    title === "applicant name"
  );
}

type FieldKind =
  | "email"
  | "phone"
  | "first_name"
  | "last_name"
  | "full_name"
  | "school"
  | "grade"
  | "city"
  | "country"
  | "state"
  | "zip"
  | "sat"
  | "act"
  | "gpa"
  | "parent"
  | "skills"
  | "interests"
  | "essay"
  | "financial"
  | "short_fact"
  | "choice"
  | "other";

function wordCount(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Strip fill-path instructions that must never appear inside answers. */
export function cleanOpportunityLabel(raw?: string | null): string {
  if (!raw) return "";
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const usable: string[] = [];
  for (const line of lines) {
    if (looksLikeFillInstruction(line)) break;
    usable.push(line);
  }
  const joined = usable.join(" ").replace(/\s+/g, " ").trim();
  if (!joined || looksLikeFillInstruction(joined)) return "";
  return joined.slice(0, 160);
}

function looksLikeFillInstruction(value: string): boolean {
  const t = value.toLowerCase();
  return (
    t.includes("only fill these currently visible") ||
    t.includes("submit form vs proceed") ||
    t.includes("choose proceed/continue") ||
    t.includes("choose proceed") ||
    t.includes("later sections can be completed") ||
    t.includes("respect the selected path") ||
    t.includes("currently visible section question")
  );
}

function isFinancialQuestion(title: string): boolean {
  return /financial|family.?income|how much aid|need.?based|household income|socioeconomic|aid you need|tuition aid|scholarship need/.test(
    title,
  );
}

function isProjectChallengeEssay(title: string): boolean {
  return /worked on|hardest part|deal with that challenge|something you built|over several weeks|project you|challenge you faced|obstacle/.test(
    title,
  );
}

function classifyField(question: FormQuestion): FieldKind {
  const title = titleOf(question);
  if (
    question.type === "email" ||
    title.includes("email") ||
    question.entryId === "emailAddress"
  ) {
    return "email";
  }
  if (title.includes("phone") || title.includes("mobile") || title.includes("cell")) {
    return "phone";
  }
  if (isFirstNameField(title)) return "first_name";
  if (isLastNameField(title)) return "last_name";
  if (
    isFullNameField(title) &&
    !title.includes("school") &&
    !title.includes("parent") &&
    !title.includes("org")
  ) {
    return "full_name";
  }
  if (/\bcountry\b|\bnation\b|\bcitizenship\b/.test(title)) return "country";
  if (/\b(state|province|region)\b/.test(title) && !title.includes("statement")) {
    return "state";
  }
  if (/\b(zip|postal)\b/.test(title)) return "zip";
  if (/\bsat\b/.test(title)) return "sat";
  if (/\bact\b/.test(title)) return "act";
  if (/\bgpa\b|grade point/.test(title)) return "gpa";
  if (isFinancialQuestion(title)) return "financial";
  if (
    (title.includes("school") || title.includes("high school")) &&
    !title.includes("name") &&
    question.type !== "paragraph"
  ) {
    return "school";
  }
  if (
    (title.includes("grade") || title.includes("year")) &&
    !title.includes("gradua")
  ) {
    return "grade";
  }
  if (title.includes("city") || title.includes("town")) return "city";
  if (title.includes("parent") || title.includes("guardian")) return "parent";
  if (title.includes("skill") || title.includes("strength")) return "skills";
  if (
    title.includes("interest") &&
    !title.includes("why") &&
    question.type !== "paragraph"
  ) {
    return "interests";
  }
  if (
    question.type === "paragraph" ||
    /essay|describe|explain|statement|why |tell us|about yourself|introduce/.test(
      title,
    )
  ) {
    return "essay";
  }
  if (
    question.type === "multiple_choice" ||
    question.type === "dropdown" ||
    question.type === "checkboxes"
  ) {
    return "choice";
  }
  if (question.type === "short" || question.type === "unknown") return "short_fact";
  return "other";
}

function pickOption(
  options: string[],
  needles: string[],
): string | undefined {
  if (!options.length) return undefined;
  const lowered = needles.map((n) => n.toLowerCase()).filter(Boolean);
  for (const option of options) {
    const opt = option.toLowerCase();
    if (lowered.some((n) => opt === n || opt.includes(n) || n.includes(opt))) {
      return option;
    }
  }
  return undefined;
}

function pickProfileFact(profile: StudentProfile, title: string): string {
  const want = title.toLowerCase();
  const fact = profile.customFacts.find((item) => {
    const label = item.label.toLowerCase();
    return (
      want.includes(label) ||
      label.includes(want.replace(/\s*\(optional\)\s*/g, "").trim())
    );
  });
  return fact?.value?.trim() || "";
}

/** True when a short answer is just dumping a skill/interest into the wrong field. */
function isWrongFieldProfileDump(
  question: FormQuestion,
  value: string,
  profile: StudentProfile,
): boolean {
  const kind = classifyField(question);
  const v = value.trim().toLowerCase();
  if (!v) return false;

  if (kind === "skills" || kind === "interests" || kind === "essay") return false;

  const skills = profile.skills.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const interests = profile.interests
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (skills.includes(v) || interests.includes(v)) {
    // Exact skill/interest tokens never belong in country / scores / address / names.
    if (
      kind === "country" ||
      kind === "state" ||
      kind === "zip" ||
      kind === "sat" ||
      kind === "act" ||
      kind === "gpa" ||
      kind === "first_name" ||
      kind === "last_name" ||
      kind === "full_name" ||
      kind === "email" ||
      kind === "phone" ||
      kind === "school" ||
      kind === "grade" ||
      kind === "city" ||
      kind === "short_fact"
    ) {
      return true;
    }
  }

  // Verbatim paste of long bio/resume into a short field.
  if (
    (kind === "short_fact" ||
      kind === "country" ||
      kind === "sat" ||
      kind === "act" ||
      kind === "gpa") &&
    value.trim().length > 80
  ) {
    const bio = profile.bio.trim();
    const resume = profile.resumeText.trim();
    if (bio && value.trim() === bio) return true;
    if (resume && value.trim() === resume) return true;
  }

  return false;
}

/** Synthesize a tailored narrative — never return raw unrelated profile tokens. */
function draftNarrative(
  profile: StudentProfile,
  question: FormQuestion,
  opportunity?: string,
): string {
  const grade = profile.grade
    ? `a grade ${profile.grade} student`
    : "a high school student";
  const school = profile.school ? ` at ${profile.school}` : "";
  const city = profile.city ? ` based in ${profile.city}` : "";
  const interests =
    profile.interests.slice(0, 3).join(", ") || "learning new skills";
  const skills =
    profile.skills.slice(0, 4).join(", ") ||
    "curiosity, initiative, and teamwork";
  const activities = firstNonEmpty(profile.activities);
  const resumeBit = firstNonEmpty(
    profile.resumeText
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean),
    profile.awards,
  );
  const target =
    cleanOpportunityLabel(opportunity) || "this opportunity";
  const title = titleOf(question);
  const kind = classifyField(question);

  if (kind === "financial") {
    return "";
  }

  if (kind === "essay" || title.includes("why") || title.includes("motivate")) {
    if (isProjectChallengeEssay(title)) {
      const project =
        firstNonEmpty(activities, resumeBit, profile.bio) ||
        `projects related to ${interests}`;
      return [
        `Over several weeks I worked on ${project.replace(/^\s*i am\b/i, "being").replace(/\.$/, "")}.`,
        "The hardest part was staying consistent when progress slowed and scope kept growing.",
        `I dealt with that by breaking the work into smaller milestones, asking mentors/teammates for feedback, and focusing on one blocker at a time until I could ship something usable with ${skills}.`,
      ].join(" ");
    }

    const pieces = [
      `As ${grade}${school}${city}, I care about ${interests}.`,
      activities
        ? `Outside class I have been involved in ${activities}.`
        : "",
      resumeBit ? `Recently, ${resumeBit}.` : "",
      `I want to contribute to ${target} by bringing ${skills} and a willingness to learn quickly.`,
    ];
    if (profile.bio.trim() && !isProjectChallengeEssay(title)) {
      return [
        `As ${grade}${school}${city}, ${profile.bio.trim().replace(/^\s*i am\b/i, "I am").replace(/\.$/, "")}.`,
        `I am excited about ${target} and can contribute through ${skills} while growing in ${interests}.`,
      ].join(" ");
    }
    return pieces.filter(Boolean).join(" ");
  }

  if (kind === "skills") {
    return profile.skills.length
      ? profile.skills.join(", ")
      : `I am building skills in ${interests}, with strengths in communication, follow-through, and ${skills}.`;
  }

  if (kind === "interests") {
    return profile.interests.length
      ? profile.interests.join(", ")
      : `I am interested in ${interests} and related hands-on learning.`;
  }

  if (kind === "short_fact" || kind === "other") {
    const fact = pickProfileFact(profile, title);
    if (fact) return fact;
    // Do not fall back to a random skill/interest for unrelated short fields.
    return "";
  }

  return `As ${grade}${school}, I am excited about ${target} and can contribute through ${skills}.`;
}

/** Answers that are clearly the wrong shape for the question. */
function isBadGeneratedAnswer(
  question: FormQuestion,
  value: string,
  profile: StudentProfile,
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (looksLikeFillInstruction(trimmed)) return true;
  if (isFakePlaceholderValue(trimmed)) return true;

  const kind = classifyField(question);
  const school = profile.school.trim().toLowerCase();

  if (kind === "financial") {
    // Only keep if it actually discusses finances / aid — not a bio dump.
    if (wordCount(trimmed) > 40 && !/aid|income|financial|afford|tuition|need/i.test(trimmed)) {
      return true;
    }
    if (looksLikeFillInstruction(trimmed)) return true;
    if (school && trimmed.toLowerCase() === school) return true;
    // Generic "As a grade X student..." dumps are not financial answers.
    if (/^as a grade\b/i.test(trimmed) || /i can contribute through/i.test(trimmed)) {
      return true;
    }
  }

  if (kind === "essay") {
    if (school && trimmed.toLowerCase() === school) return true;
    if (wordCount(trimmed) < 20) return true;
    if (looksLikeFillInstruction(trimmed)) return true;
    // Single short profile token dumped into a long-form prompt.
    if (
      profile.skills.some((s) => s.trim().toLowerCase() === trimmed.toLowerCase()) ||
      profile.interests.some((s) => s.trim().toLowerCase() === trimmed.toLowerCase())
    ) {
      return true;
    }
  }

  return false;
}

function coerceOptionValue(
  question: FormQuestion,
  value: string,
  profile: StudentProfile,
  application?: ParsedApplication,
): { value: string; confidence: FilledAnswer["confidence"] } {
  if (!question.options.length) {
    return { value, confidence: value ? "medium" : "low" };
  }

  if (question.type === "checkboxes") {
    const parts = value
      .split(/\|\||,/)
      .map((part) => part.trim())
      .filter(Boolean);
    const matched = parts
      .map(
        (part) =>
          question.options.find(
            (option) =>
              option.toLowerCase() === part.toLowerCase() ||
              option.toLowerCase().includes(part.toLowerCase()) ||
              part.toLowerCase().includes(option.toLowerCase()),
          ) || "",
      )
      .filter(Boolean);
    if (matched.length) {
      return { value: [...new Set(matched)].join("||"), confidence: "medium" };
    }
    const guessed = pickOption(question.options, [
      ...profile.interests,
      ...profile.skills,
      profile.grade,
      profile.city,
    ]);
    return { value: guessed || "", confidence: guessed ? "low" : "low" };
  }

  if (value && question.options.includes(value)) {
    const navPreferred = preferredNavigationOption(question, application);
    if (
      looksLikeSubmitOption(value) &&
      navPreferred &&
      navPreferred !== value
    ) {
      return { value: navPreferred, confidence: "medium" };
    }
    return { value, confidence: "high" };
  }

  const match = question.options.find(
    (option) =>
      option.toLowerCase() === value.toLowerCase() ||
      option.toLowerCase().includes(value.toLowerCase()) ||
      value.toLowerCase().includes(option.toLowerCase()),
  );
  if (match) {
    const navPreferred = preferredNavigationOption(question, application);
    if (
      looksLikeSubmitOption(match) &&
      navPreferred &&
      navPreferred !== match
    ) {
      return { value: navPreferred, confidence: "medium" };
    }
    return { value: match, confidence: "medium" };
  }

  const navPreferred = preferredNavigationOption(question, application);
  if (navPreferred) {
    return { value: navPreferred, confidence: "medium" };
  }

  const guessed =
    pickOption(question.options, [
      ...profile.interests,
      ...profile.skills,
      profile.grade,
      profile.city,
      profile.remoteOk ? "remote" : "in-person",
    ]) ||
    question.options.find((option) => !looksLikeSubmitOption(option)) ||
    "";
  return { value: guessed, confidence: guessed ? "low" : "low" };
}

/** Force correct values for structured fields; drop wrong-field dumps. */
function sanitizeAnswer(
  question: FormQuestion,
  rawValue: string,
  profile: StudentProfile,
  optional: boolean,
): {
  value: string;
  confidence: FilledAnswer["confidence"];
  rationale: string;
  handled: boolean;
} {
  const kind = classifyField(question);
  const names = splitPersonName(profile.name);
  const value = rawValue.trim();

  if (kind === "first_name") {
    if (names.first) {
      return {
        value: names.first,
        confidence: "high",
        rationale: "First name from your full name",
        handled: true,
      };
    }
    return {
      ...(optional ? blankOptionalAnswer() : blankMissingFact("first name")),
      handled: true,
    };
  }

  if (kind === "last_name") {
    if (names.last) {
      return {
        value: names.last,
        confidence: "high",
        rationale: "Last name from your full name",
        handled: true,
      };
    }
    if (names.first && !names.last) {
      return {
        value: "",
        confidence: "low",
        rationale: "Add a last name in Background (only one name was saved)",
        handled: true,
      };
    }
    return {
      ...(optional ? blankOptionalAnswer() : blankMissingFact("last name")),
      handled: true,
    };
  }

  if (kind === "full_name" && names.full) {
    return {
      value: names.full,
      confidence: "high",
      rationale: "From your name",
      handled: true,
    };
  }

  if (kind === "email") {
    if (profile.email.trim()) {
      return {
        value: profile.email.trim(),
        confidence: "high",
        rationale: "From your email",
        handled: true,
      };
    }
    return {
      ...(optional ? blankOptionalAnswer() : blankMissingFact("email")),
      handled: true,
    };
  }

  if (kind === "phone") {
    if (profile.phone.trim()) {
      return {
        value: profile.phone.trim(),
        confidence: "high",
        rationale: "From your phone",
        handled: true,
      };
    }
    return {
      ...(optional ? blankOptionalAnswer() : blankMissingFact("phone")),
      handled: true,
    };
  }

  if (kind === "school") {
    if (profile.school.trim()) {
      return {
        value: profile.school.trim(),
        confidence: "high",
        rationale: "From your school",
        handled: true,
      };
    }
  }

  if (kind === "grade") {
    if (profile.grade.trim()) {
      return {
        value: profile.grade.trim(),
        confidence: "high",
        rationale: "From your grade",
        handled: true,
      };
    }
  }

  if (kind === "city") {
    if (profile.city.trim()) {
      return {
        value: profile.city.trim(),
        confidence: "high",
        rationale: "From your city",
        handled: true,
      };
    }
  }

  if (
    kind === "country" ||
    kind === "state" ||
    kind === "zip" ||
    kind === "sat" ||
    kind === "act" ||
    kind === "gpa"
  ) {
    const fact = pickProfileFact(profile, question.title);
    if (fact && !isWrongFieldProfileDump(question, fact, profile)) {
      return {
        value: fact,
        confidence: "high",
        rationale: "From a matching background fact",
        handled: true,
      };
    }
    // Never invent or reuse skills for these.
    return {
      ...(optional
        ? blankOptionalAnswer()
        : blankMissingFact(kind.replace("_", " "))),
      handled: true,
    };
  }

  if (value && isWrongFieldProfileDump(question, value, profile)) {
    return {
      ...(optional
        ? blankOptionalAnswer()
        : {
            value: "",
            confidence: "low" as const,
            rationale:
              "Left blank — a skill/interest was incorrectly suggested for this field",
          }),
      handled: true,
    };
  }

  if (value && isFakePlaceholderValue(value)) {
    return {
      ...(optional ? blankOptionalAnswer() : blankMissingFact(question.title)),
      handled: true,
    };
  }

  if (kind === "financial") {
    const fact = pickProfileFact(profile, question.title);
    if (
      fact &&
      !looksLikeFillInstruction(fact) &&
      !/^as a grade\b/i.test(fact) &&
      !/i can contribute through/i.test(fact)
    ) {
      return {
        value: fact,
        confidence: "high",
        rationale: "From a matching background fact",
        handled: true,
      };
    }
    // Never invent financial need from bio/skills/path context.
    return {
      ...(optional
        ? blankOptionalAnswer()
        : blankMissingFact("financial background")),
      handled: true,
    };
  }

  return {
    value,
    confidence: value ? "medium" : "low",
    rationale: "",
    handled: false,
  };
}

function heuristicFill(
  profile: StudentProfile,
  questions: FormQuestion[],
  opportunity?: string,
  application?: ParsedApplication,
): FilledAnswer[] {
  const opportunityLabel = cleanOpportunityLabel(opportunity);
  return questions.map((question) => {
    const optional = isOptionalQuestion(question);
    const kind = classifyField(question);
    let value = "";
    let confidence: FilledAnswer["confidence"] = "low";
    let rationale = "Drafted for you to edit";

    if (question.manualOnly) {
      return {
        entryId: question.entryId,
        questionId: question.id,
        title: question.title,
        type: question.type,
        value: "",
        confidence: "low",
        rationale: "File upload — complete this manually in the form",
        manualOnly: true,
        matchHints: question.matchHints,
        name: question.name,
        selector: question.selector,
      };
    }

    const structured = sanitizeAnswer(question, "", profile, optional);
    if (
      structured.handled &&
      (structured.value ||
        kind === "country" ||
        kind === "sat" ||
        kind === "act" ||
        kind === "gpa" ||
        kind === "first_name" ||
        kind === "last_name" ||
        kind === "email" ||
        kind === "phone" ||
        kind === "zip" ||
        kind === "state" ||
        kind === "financial")
    ) {
      value = structured.value;
      confidence = structured.confidence;
      rationale = structured.rationale;
    } else if (kind === "parent") {
      value = firstNonEmpty(profile.parentName, profile.parentEmail);
      if (value) {
        confidence = "medium";
        rationale = "From parent/guardian fields";
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer());
      } else {
        ({ value, confidence, rationale } = blankMissingFact("parent/guardian info"));
      }
    } else if (kind === "skills") {
      if (profile.skills.length) {
        value = profile.skills.join(", ");
        confidence = "high";
        rationale = "From skills";
      } else {
        value = draftNarrative(profile, question, opportunityLabel);
        confidence = "low";
        rationale = "Synthesized skills answer from your background";
      }
    } else if (kind === "interests") {
      if (profile.interests.length) {
        value = profile.interests.join(", ");
        confidence = "high";
        rationale = "From interests";
      } else {
        value = draftNarrative(profile, question, opportunityLabel);
        confidence = "low";
        rationale = "Synthesized interests answer from your background";
      }
    } else if (kind === "choice" || question.options.length) {
      const unlockPreferred = application
        ? preferredUnlockOption(application, question)
        : null;
      const navPreferred = preferredNavigationOption(question, application);
      if (unlockPreferred) {
        value = unlockPreferred;
        confidence = "medium";
        rationale =
          "Selected the option that reveals follow-up questions";
      } else if (
        navPreferred &&
        (question.optionBranches?.length ||
          question.options.some(
            (option) =>
              looksLikeSubmitOption(option) || looksLikeContinueOption(option),
          ))
      ) {
        value = navPreferred;
        confidence = "medium";
        rationale =
          "Continue to the next section so the full application is drafted";
      } else {
        const drafted = draftNarrative(profile, question, opportunityLabel);
        const coerced = coerceOptionValue(
          question,
          drafted,
          profile,
          application,
        );
        if (coerced.value) {
          value = coerced.value;
          confidence = coerced.confidence;
          rationale = "Best-fit option from your background — confirm before submit";
        } else if (optional) {
          ({ value, confidence, rationale } = blankOptionalAnswer());
        } else {
          value =
            question.options.find((option) => !looksLikeSubmitOption(option)) ||
            question.options[0] ||
            "";
          confidence = "low";
          rationale = "Best-effort option — confirm before submitting";
        }
      }
    } else if (kind === "essay") {
      value = draftNarrative(profile, question, opportunityLabel);
      confidence = firstNonEmpty(
        profile.bio,
        profile.activities,
        profile.resumeText,
        profile.interests[0],
      )
        ? "medium"
        : "low";
      rationale = isProjectChallengeEssay(titleOf(question))
        ? "Drafted a project/challenge story from your background — edit to match the real details"
        : "Synthesized from your background for this question";
    } else {
      const fact = pickProfileFact(profile, question.title);
      if (fact && !isWrongFieldProfileDump(question, fact, profile)) {
        value = fact;
        confidence = "high";
        rationale = "From a matching background fact";
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer());
      } else {
        value = draftNarrative(profile, question, opportunityLabel);
        if (!value) {
          ({ value, confidence, rationale } = blankMissingFact(
            question.title || "this field",
          ));
        } else {
          confidence = "low";
          rationale = "Synthesized draft — edit to fit this exact question";
        }
      }
    }

    if (
      (question.type === "multiple_choice" ||
        question.type === "dropdown" ||
        question.type === "checkboxes") &&
      question.options.length &&
      value.trim()
    ) {
      const coerced = coerceOptionValue(
        question,
        value,
        profile,
        application,
      );
      value = coerced.value;
      if (confidence === "high" && coerced.confidence !== "high") {
        confidence = coerced.confidence;
      }
    }

    const cleaned = sanitizeAnswer(question, value, profile, optional);
    if (cleaned.handled) {
      value = cleaned.value;
      confidence = cleaned.confidence;
      rationale = cleaned.rationale || rationale;
    } else if (cleaned.value !== value) {
      value = cleaned.value;
    }

    if (!value.trim()) {
      if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer());
      } else if (
        question.type === "multiple_choice" ||
        question.type === "dropdown" ||
        question.type === "checkboxes"
      ) {
        value =
          (application
            ? preferredUnlockOption(application, question)
            : null) ||
          preferredNavigationOption(question, application) ||
          question.options.find((option) => !looksLikeSubmitOption(option)) ||
          question.options[0] ||
          "";
        confidence = "low";
        rationale = "Best-effort option — confirm before submitting";
      }
    }

    if (
      optional &&
      (isFakePlaceholderValue(value) ||
        isWrongFieldProfileDump(question, value, profile) ||
        isBadGeneratedAnswer(question, value, profile))
    ) {
      ({ value, confidence, rationale } = blankOptionalAnswer());
    }

    return {
      entryId: question.entryId,
      questionId: question.id,
      title: question.title,
      type: question.type,
      value,
      confidence,
      rationale,
      manualOnly: question.manualOnly,
      matchHints: question.matchHints,
      name: question.name,
      selector: question.selector,
    };
  });
}

const FILL_SYSTEM_PROMPT = `You fill internship/program applications for a high school student.

Return ONLY a JSON array. Each item must be:
{ "entryId": string, "value": string, "confidence": "high"|"medium"|"low", "rationale": string }

Core rules:
- SYNTHESIZE answers for each question. Do NOT copy-paste the same bio, resume blurb, skills list, or interest token into unrelated fields.
- Read the question title carefully and answer THAT question only. Never put the school name alone as an essay answer.
- Full name in the profile must be split: first name field gets ONLY the first name; last name field gets ONLY the remaining name parts. Example: "Jeff Bezos" → first="Jeff", last="Bezos".
- Never put a skill or interest (e.g. "CS", "computer science") into country, SAT, ACT, GPA, ZIP, phone, email, or name fields.
- For factual fields (country, SAT, ACT, GPA, ZIP, state): use a value only if the profile/custom facts explicitly contain it. Otherwise value must be "".
- Optional fields (required=false or title contains "optional"): if the profile has no real value, set value to "". Do not invent fake phone/email/scores.
- Financial aid / family financial background (fieldKind=financial): ONLY answer if the profile/custom facts explicitly discuss finances or aid need. Otherwise value MUST be "". Never paste bio, skills, or drafting instructions into financial fields.
- Required essays / why-us / about-you: write a fresh answer tailored to the prompt, using profile details as ingredients, not as a verbatim paste. Project/challenge essays must describe a real effort over time, the hardest part, and how it was handled — at least a short paragraph, never a 1–4 word stub.
- NEVER include fillInstructions, path guidance, or phrases like "Only fill these currently visible section question(s)" inside any answer value.
- When writing style samples exist, match tone/voice without copying sample text into unrelated answers.
- Do not invent awards, GPAs, test scores, employers, or credentials absent from the profile.
- For multiple_choice/dropdown: value MUST be exactly one of the provided options, or "" when optional and nothing fits.
- Navigation choices like "Submit form" vs "Proceed to next section": ALWAYS choose the continue/next option when available.
- Yes/No questions that unlock follow-up fields: prefer Yes when the form uses that answer to reveal more questions, unless the profile clearly indicates otherwise.
- For checkboxes: join selected options with ||, or "" if optional and nothing fits.
- For file/manualOnly questions: value must be "".
- Keep answers concise and first-person where appropriate.`;

export async function fillApplicationAnswers(options: {
  profile: StudentProfile;
  application: ParsedApplication;
  opportunityContext?: string;
  /** Drafting guidance only — never used as answer content. */
  fillInstructions?: string;
}): Promise<{
  answers: FilledAnswer[];
  provider: "hackclub" | "gemini" | "local-fallback";
  geminiError: string | null;
  geminiModel: string | null;
}> {
  const opportunity = cleanOpportunityLabel(
    options.opportunityContext || options.application.title,
  ) || options.application.title;
  const fallback = heuristicFill(
    options.profile,
    options.application.questions,
    opportunity,
    options.application,
  );

  if (!getApiKey()) {
    return {
      answers: fallback,
      provider: "local-fallback",
      geminiError: "Neither HC_API_KEY nor GEMINI_API_KEY is set on this deployment",
      geminiModel: null,
    };
  }

  const names = splitPersonName(options.profile.name);

  const result = await geminiGenerate({
    json: true,
    system: FILL_SYSTEM_PROMPT,
    user: JSON.stringify({
      instruction:
        "Synthesize a distinct answer for each question from the student profile. Split first/last name correctly. Never reuse skills/interests as country or test scores. Leave unknown factual and financial fields blank. Never copy fillInstructions into answer values.",
      nameSplitHint: names.full
        ? {
            fullName: names.full,
            firstName: names.first,
            lastName: names.last || null,
          }
        : null,
      student: profileToPromptContext(options.profile),
      opportunity,
      fillInstructions: options.fillInstructions || null,
      formTitle: options.application.title,
      formDescription: options.application.description,
      questions: options.application.questions.map((q) => ({
        entryId: q.entryId,
        title: q.title,
        type: q.type,
        required: q.required,
        optional: isOptionalQuestion(q),
        fieldKind: classifyField(q),
        options: q.options,
        manualOnly: q.manualOnly,
        optionBranches: q.optionBranches,
        sectionIndex: q.sectionIndex,
      })),
    }),
  });

  const parsed = result.text ? extractJsonArray(result.text) : null;
  if (!parsed) {
    return {
      answers: fallback,
      provider: "local-fallback",
      geminiError:
        result.error ||
        "AI returned text that was not a valid JSON answer array",
      geminiModel: result.model,
    };
  }

  const byEntry = new Map<
    string,
    { value?: string; confidence?: string; rationale?: string }
  >();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      entryId?: string;
      value?: string;
      confidence?: string;
      rationale?: string;
    };
    if (!row.entryId) continue;
    byEntry.set(row.entryId, row);
  }

  const answers: FilledAnswer[] = fallback.map((base): FilledAnswer => {
    if (base.manualOnly) return base;

    const ai = byEntry.get(base.entryId);
    const question = options.application.questions.find(
      (q) => q.entryId === base.entryId,
    );
    if (!question) return base;

    const optional = isOptionalQuestion(question);
    const kind = classifyField(question);
    const aiProvided = typeof ai?.value === "string";
    let value = aiProvided ? String(ai?.value ?? "").trim() : base.value;
    const aiConfidence: FilledAnswer["confidence"] | null =
      ai?.confidence === "high" ||
      ai?.confidence === "medium" ||
      ai?.confidence === "low"
        ? ai.confidence
        : null;
    let confidence: FilledAnswer["confidence"] = aiConfidence ?? base.confidence;
    let rationale = ai?.rationale || base.rationale;

    // Structured fields always trust profile-derived sanitization over model dumps.
    const structured = sanitizeAnswer(question, value, options.profile, optional);
    if (structured.handled) {
      return {
        ...base,
        value: structured.value,
        confidence: structured.confidence,
        rationale: structured.rationale || rationale,
      };
    }

    if (question.options.length && value.trim()) {
      const coerced = coerceOptionValue(
        question,
        value,
        options.profile,
        options.application,
      );
      value = coerced.value;
      if (confidence === "high" && coerced.confidence !== "high") {
        confidence = coerced.confidence;
      }
    }

    if (
      value &&
      (isWrongFieldProfileDump(question, value, options.profile) ||
        isFakePlaceholderValue(value) ||
        isBadGeneratedAnswer(question, value, options.profile))
    ) {
      if (kind === "essay" && !optional) {
        const rewritten = draftNarrative(
          options.profile,
          question,
          opportunity,
        );
        if (
          rewritten &&
          !isBadGeneratedAnswer(question, rewritten, options.profile)
        ) {
          return {
            ...base,
            value: rewritten,
            confidence: "medium",
            rationale:
              "Rewrote a thin/leaked model answer into a real response for this question",
          };
        }
      }
      if (optional) {
        return { ...base, ...blankOptionalAnswer() };
      }
      if (
        base.value &&
        !isWrongFieldProfileDump(question, base.value, options.profile) &&
        !isBadGeneratedAnswer(question, base.value, options.profile)
      ) {
        return {
          ...base,
          confidence: "low",
          rationale: "Synthesized fallback — model answer looked like a copy-paste",
        };
      }
      value = "";
      confidence = "low";
      rationale = "Left blank — model answer did not fit this field";
    }

    // Reject verbatim bio/resume paste into essay if identical across fields later;
    // still allow bio-informed synthesis from heuristic when AI pasted raw bio.
    if (
      kind === "essay" &&
      value &&
      (value === options.profile.bio.trim() ||
        value === options.profile.resumeText.trim() ||
        isBadGeneratedAnswer(question, value, options.profile))
    ) {
      value = draftNarrative(options.profile, question, opportunity);
      confidence = "medium";
      rationale = "Rewrote profile details into an answer for this question";
    }

    if (!value.trim()) {
      if (optional) {
        return { ...base, ...blankOptionalAnswer() };
      }
      if (
        base.value.trim() &&
        !isFakePlaceholderValue(base.value) &&
        !isWrongFieldProfileDump(question, base.value, options.profile) &&
        !isBadGeneratedAnswer(question, base.value, options.profile)
      ) {
        return {
          ...base,
          confidence: "low",
          rationale: base.rationale || "Synthesized draft — edit before submitting",
        };
      }
      return {
        ...base,
        value: "",
        confidence: "low",
        rationale: base.rationale || "Add this before submitting",
      };
    }

    return {
      ...base,
      value,
      confidence,
      rationale,
    };
  });

  return {
    answers,
    provider: result.provider === "hackclub" ? "hackclub" : "gemini",
    geminiError: null,
    geminiModel: result.model,
  };
}
