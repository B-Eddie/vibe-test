import { geminiGenerate, extractJsonArray, getApiKey } from "./gemini";
import {
  looksLikeContinueOption,
  looksLikeSubmitOption,
  preferredNavigationOption,
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

/** Build a short essay/short-answer draft from whatever profile context exists. */
function draftNarrative(
  profile: StudentProfile,
  question: FormQuestion,
  opportunity?: string,
): string {
  const name = profile.name || "I";
  const grade = profile.grade ? `a grade ${profile.grade} student` : "a high school student";
  const school = profile.school ? ` at ${profile.school}` : "";
  const city = profile.city ? ` in ${profile.city}` : "";
  const interests =
    profile.interests.slice(0, 3).join(", ") || "learning new skills";
  const skills =
    profile.skills.slice(0, 4).join(", ") || "curiosity, initiative, and teamwork";
  const activities = firstNonEmpty(profile.activities, profile.bio);
  const resumeBit = firstNonEmpty(
    profile.resumeText.split("\n").map((l) => l.trim()).find(Boolean),
    profile.awards,
  );
  const target = opportunity || "this opportunity";
  const title = question.title.toLowerCase();

  if (title.includes("why") || title.includes("interest") || title.includes("motivate")) {
    return firstNonEmpty(
      profile.bio &&
        `I am ${grade}${school}${city}. I'm especially interested in ${interests}, and ${target} stands out because it connects to that focus. ${profile.bio}`,
      `I am ${grade}${school}${city}. I'm interested in ${interests} and want to join ${target} to learn by doing real work, contribute carefully, and grow my skills in ${skills}.`,
    );
  }

  if (
    title.includes("about yourself") ||
    title.includes("tell us about") ||
    title.includes("introduce") ||
    title.includes("bio") ||
    title.includes("background")
  ) {
    return firstNonEmpty(
      profile.bio,
      [
        `My name is ${profile.name || "a high school student"}. I am ${grade}${school}${city}.`,
        `My interests include ${interests}.`,
        activities ? `Outside class, ${activities}` : "",
        resumeBit ? `Recent experience: ${resumeBit}` : "",
        `I'm excited to contribute to ${target}.`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  if (title.includes("experience") || title.includes("project") || title.includes("activit")) {
    return firstNonEmpty(
      activities,
      resumeBit,
      profile.bio,
      `Through school and personal projects related to ${interests}, I've practiced ${skills}. I'm ready to take on structured work for ${target} and learn quickly.`,
    );
  }

  if (title.includes("skill") || title.includes("strength")) {
    return firstNonEmpty(
      profile.skills.length ? profile.skills.join(", ") : "",
      `My strongest skills are ${skills}, and I apply them through work related to ${interests}.`,
    );
  }

  if (title.includes("goal") || title.includes("hope") || title.includes("learn")) {
    return `Through ${target}, I hope to deepen my skills in ${interests}, contribute useful work, and learn from mentors while representing ${name === "I" ? "myself" : "my school"} well.`;
  }

  // Generic short/long answer: always return something editable.
  const longForm =
    question.type === "paragraph" ||
    question.title.length > 40 ||
    /essay|describe|explain|statement/i.test(question.title);

  if (longForm) {
    return firstNonEmpty(
      profile.bio,
      activities,
      `As ${grade}${school}${city}, I'm drawn to ${interests}. I can bring ${skills} to ${target}, and I'm eager to learn, ask good questions, and follow through on assigned work.`,
    );
  }

  return firstNonEmpty(
    pickProfileFact(profile, title),
    profile.interests[0],
    profile.skills[0],
    city.replace(/^ in /, "") || school.replace(/^ at /, "") || grade || "Yes — happy to share more detail",
  );
}

function pickProfileFact(profile: StudentProfile, title: string): string {
  const fact = profile.customFacts.find((item) =>
    title.includes(item.label.toLowerCase()),
  );
  return fact?.value?.trim() || "";
}

function coerceOptionValue(
  question: FormQuestion,
  value: string,
  profile: StudentProfile,
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
    const guessed =
      pickOption(question.options, [
        ...profile.interests,
        ...profile.skills,
        profile.grade,
        profile.city,
      ]) || question.options[0];
    return { value: guessed, confidence: "low" };
  }

  if (value && question.options.includes(value)) {
    // Navigation questions: never keep an accidental "Submit form" when a
    // continue/next option exists — applications should complete the form.
    const navPreferred = preferredNavigationOption(question);
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
    const navPreferred = preferredNavigationOption(question);
    if (
      looksLikeSubmitOption(match) &&
      navPreferred &&
      navPreferred !== match
    ) {
      return { value: navPreferred, confidence: "medium" };
    }
    return { value: match, confidence: "medium" };
  }

  const navPreferred = preferredNavigationOption(question);
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
    question.options[0];
  return { value: guessed, confidence: "low" };
}

function heuristicFill(
  profile: StudentProfile,
  questions: FormQuestion[],
  opportunity?: string,
): FilledAnswer[] {
  return questions.map((question) => {
    const title = question.title.toLowerCase();
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

    if (
      question.type === "email" ||
      title.includes("email") ||
      question.entryId === "emailAddress"
    ) {
      value = profile.email || "student@example.com";
      confidence = profile.email ? "high" : "low";
      rationale = profile.email
        ? "From your email"
        : "Placeholder email — replace with yours";
    } else if (title.includes("phone") || title.includes("mobile")) {
      value = profile.phone || "(555) 000-0000";
      confidence = profile.phone ? "high" : "low";
      rationale = profile.phone
        ? "From your phone"
        : "Placeholder phone — replace with yours";
    } else if (
      (title.includes("full name") ||
        title === "name" ||
        title.startsWith("name ") ||
        title.includes("your name") ||
        title.includes("legal name") ||
        title.includes("first name") ||
        title.includes("last name")) &&
      !title.includes("school") &&
      !title.includes("parent") &&
      !title.includes("org")
    ) {
      if (title.includes("first name") && profile.name) {
        value = profile.name.split(/\s+/)[0] || profile.name;
        confidence = "high";
      } else if (title.includes("last name") && profile.name) {
        const parts = profile.name.trim().split(/\s+/);
        value = parts.length > 1 ? parts.slice(1).join(" ") : profile.name;
        confidence = parts.length > 1 ? "high" : "low";
      } else {
        value = profile.name || "High School Applicant";
        confidence = profile.name ? "high" : "low";
      }
      rationale = profile.name ? "From your name" : "Placeholder name — edit me";
    } else if (title.includes("school") || title.includes("high school")) {
      value = profile.school || "My High School";
      confidence = profile.school ? "high" : "low";
      rationale = profile.school
        ? "From your school"
        : "Placeholder school — edit me";
    } else if (
      (title.includes("grade") || title.includes("year")) &&
      !title.includes("gradua")
    ) {
      value = profile.grade || "11";
      confidence = profile.grade ? "high" : "low";
      rationale = profile.grade ? "From your grade" : "Assumed grade 11 — edit me";
    } else if (title.includes("city") || title.includes("location")) {
      value = profile.city || "Near opportunity location";
      confidence = profile.city ? "high" : "low";
      rationale = profile.city ? "From your city" : "Placeholder city — edit me";
    } else if (title.includes("parent") || title.includes("guardian")) {
      value = firstNonEmpty(profile.parentName, profile.parentEmail, profile.name);
      confidence = profile.parentName || profile.parentEmail ? "medium" : "low";
      rationale = "From parent/guardian fields (edit if needed)";
    } else if (title.includes("skill") && question.options.length === 0) {
      value =
        profile.skills.join(", ") ||
        draftNarrative(profile, question, opportunity);
      confidence = profile.skills.length ? "high" : "low";
      rationale = profile.skills.length ? "From skills" : "Drafted from interests";
    } else if (question.options.length) {
      const navPreferred = preferredNavigationOption(question);
      if (
        navPreferred &&
        (question.optionBranches?.length ||
          question.options.some(
            (option) =>
              looksLikeSubmitOption(option) || looksLikeContinueOption(option),
          ))
      ) {
        value = navPreferred;
        confidence = "medium";
        rationale = "Continue to the next section so the full application is drafted";
      } else {
        const drafted = draftNarrative(profile, question, opportunity);
        const coerced = coerceOptionValue(question, drafted, profile);
        value = coerced.value;
        confidence = coerced.confidence;
        rationale = "Best-fit option from your background — confirm before submit";
      }
    } else {
      const fact = pickProfileFact(profile, title);
      if (fact) {
        value = fact;
        confidence = "high";
        rationale = "From a custom background fact";
      } else {
        value = draftNarrative(profile, question, opportunity);
        confidence = firstNonEmpty(profile.bio, profile.activities, profile.resumeText)
          ? "medium"
          : "low";
        rationale =
          confidence === "medium"
            ? "Drafted from your background — edit to fit"
            : "Best-effort draft from limited background — rewrite as needed";
      }
    }

    if (
      (question.type === "multiple_choice" ||
        question.type === "dropdown" ||
        question.type === "checkboxes") &&
      question.options.length
    ) {
      const coerced = coerceOptionValue(question, value, profile);
      value = coerced.value;
      if (!value) {
        value =
          preferredNavigationOption(question) ||
          question.options.find((option) => !looksLikeSubmitOption(option)) ||
          question.options[0]!;
        confidence = "low";
      } else if (confidence === "high" && coerced.confidence !== "high") {
        confidence = coerced.confidence;
      }
    }

    // Final guarantee: never ship an empty non-file answer.
    if (!value.trim()) {
      value = draftNarrative(profile, question, opportunity);
      confidence = "low";
      rationale = "Best-effort draft — edit before submitting";
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

Rules:
- EVERY non-file question MUST have a non-empty value. Never leave blanks for the student to stare at.
- Prefer exact facts from the student profile (name, email, school, skills, bio, resume, activities, custom facts).
- When writing style samples are provided, match that student's tone, sentence length, vocabulary, and first-person voice in essays and short answers. Do not copy the samples verbatim into unrelated questions.
- When the profile is thin or a field is not directly answered, still WRITE a plausible draft the student would say — grounded in their grade, school, interests, skills, bio/resume, and the opportunity. Mark confidence "low" (or "medium" if partly grounded).
- Tailor essay/short-answer text to EACH question. Do not paste the identical bio into every field.
- Do not invent specific awards, GPAs, employers, or credentials that are not in the profile. General sincere interest and motivation statements are OK when details are missing.
- For multiple_choice/dropdown: value MUST be exactly one of the provided options.
- For navigation / section questions with options like "Submit form" vs "Proceed to next section" (or Continue / Next section): ALWAYS choose the option that continues to the next section so the full application can be completed. Only choose "Submit form" / end-form if there is no continue option.
- For checkboxes: join selected options with || (each must be an provided option).
- For file/manualOnly questions: value must be "".
- Keep answers concise and first-person where appropriate.`;

export async function fillApplicationAnswers(options: {
  profile: StudentProfile;
  application: ParsedApplication;
  opportunityContext?: string;
}): Promise<{
  answers: FilledAnswer[];
  provider: "gemini" | "local-fallback";
  geminiError: string | null;
  geminiModel: string | null;
}> {
  const opportunity =
    options.opportunityContext ?? options.application.title;
  const fallback = heuristicFill(
    options.profile,
    options.application.questions,
    opportunity,
  );

  if (!getApiKey()) {
    return {
      answers: fallback,
      provider: "local-fallback",
      geminiError: "GEMINI_API_KEY is not set on this deployment",
      geminiModel: null,
    };
  }

  const result = await geminiGenerate({
    json: true,
    system: FILL_SYSTEM_PROMPT,
    user: JSON.stringify({
      instruction:
        "Fill every field with a real draft answer. Empty values are not allowed except for file uploads.",
      student: profileToPromptContext(options.profile),
      opportunity,
      formTitle: options.application.title,
      formDescription: options.application.description,
      questions: options.application.questions.map((q) => ({
        entryId: q.entryId,
        title: q.title,
        type: q.type,
        required: q.required,
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
        "Gemini returned text that was not valid JSON answer array",
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

  const answers = fallback.map((base) => {
    if (base.manualOnly) return base;

    const ai = byEntry.get(base.entryId);
    const question = options.application.questions.find(
      (q) => q.entryId === base.entryId,
    );
    let value =
      typeof ai?.value === "string" && ai.value.trim()
        ? ai.value.trim()
        : base.value;
    let confidence: FilledAnswer["confidence"] =
      ai?.confidence === "high" ||
      ai?.confidence === "medium" ||
      ai?.confidence === "low"
        ? ai.confidence
        : base.confidence;
    let rationale = ai?.rationale || base.rationale;

    if (question?.options.length) {
      const coerced = coerceOptionValue(question, value, options.profile);
      value = coerced.value;
      if (confidence === "high" && coerced.confidence !== "high") {
        confidence = coerced.confidence;
      }
    }

    if (!value.trim()) {
      value = base.value;
      confidence = "low";
      rationale = base.rationale || "Best-effort draft — edit before submitting";
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
    provider: "gemini",
    geminiError: null,
    geminiModel: result.model,
  };
}
