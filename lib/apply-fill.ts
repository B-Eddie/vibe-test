import { geminiGenerate, extractJsonArray, getApiKey } from "./gemini";
import {
  isOptionalQuestion,
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

function blankOptionalAnswer(_question?: FormQuestion): {
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
    const optional = isOptionalQuestion(question);
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
      if (profile.email.trim()) {
        value = profile.email.trim();
        confidence = "high";
        rationale = "From your email";
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer(question));
      } else {
        value = "";
        confidence = "low";
        rationale = "Add your email before submitting";
      }
    } else if (title.includes("phone") || title.includes("mobile")) {
      if (profile.phone.trim()) {
        value = profile.phone.trim();
        confidence = "high";
        rationale = "From your phone";
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer(question));
      } else {
        value = "";
        confidence = "low";
        rationale = "Add your phone before submitting";
      }
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
        rationale = "From your name";
      } else if (title.includes("last name") && profile.name) {
        const parts = profile.name.trim().split(/\s+/);
        value = parts.length > 1 ? parts.slice(1).join(" ") : profile.name;
        confidence = parts.length > 1 ? "high" : "low";
        rationale = "From your name";
      } else if (profile.name.trim()) {
        value = profile.name.trim();
        confidence = "high";
        rationale = "From your name";
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer(question));
      } else {
        value = "";
        confidence = "low";
        rationale = "Add your name before submitting";
      }
    } else if (title.includes("school") || title.includes("high school")) {
      if (profile.school.trim()) {
        value = profile.school.trim();
        confidence = "high";
        rationale = "From your school";
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer(question));
      } else {
        value = draftNarrative(profile, question, opportunity);
        confidence = "low";
        rationale = "Drafted school answer — edit me";
      }
    } else if (
      (title.includes("grade") || title.includes("year")) &&
      !title.includes("gradua")
    ) {
      if (profile.grade.trim()) {
        value = profile.grade.trim();
        confidence = "high";
        rationale = "From your grade";
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer(question));
      } else {
        value = draftNarrative(profile, question, opportunity);
        confidence = "low";
        rationale = "Drafted grade answer — edit me";
      }
    } else if (title.includes("city") || title.includes("location")) {
      if (profile.city.trim()) {
        value = profile.city.trim();
        confidence = "high";
        rationale = "From your city";
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer(question));
      } else {
        value = draftNarrative(profile, question, opportunity);
        confidence = "low";
        rationale = "Drafted location answer — edit me";
      }
    } else if (title.includes("parent") || title.includes("guardian")) {
      value = firstNonEmpty(profile.parentName, profile.parentEmail);
      if (value) {
        confidence = "medium";
        rationale = "From parent/guardian fields";
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer(question));
      } else {
        value = "";
        confidence = "low";
        rationale = "Add parent/guardian info before submitting";
      }
    } else if (title.includes("skill") && question.options.length === 0) {
      if (profile.skills.length) {
        value = profile.skills.join(", ");
        confidence = "high";
        rationale = "From skills";
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer(question));
      } else {
        value = draftNarrative(profile, question, opportunity);
        confidence = "low";
        rationale = "Drafted from interests";
      }
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
      } else if (optional) {
        // Optional choice fields: only select when profile clearly matches.
        const drafted = draftNarrative(profile, question, opportunity);
        const coerced = coerceOptionValue(question, drafted, profile);
        if (coerced.confidence === "high" || coerced.confidence === "medium") {
          value = coerced.value;
          confidence = coerced.confidence;
          rationale = "Best-fit option from your background";
        } else {
          ({ value, confidence, rationale } = blankOptionalAnswer(question));
        }
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
      } else if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer(question));
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
      question.options.length &&
      value.trim()
    ) {
      const coerced = coerceOptionValue(question, value, profile);
      value = coerced.value;
      if (confidence === "high" && coerced.confidence !== "high") {
        confidence = coerced.confidence;
      }
    }

    if (!value.trim()) {
      if (optional) {
        ({ value, confidence, rationale } = blankOptionalAnswer(question));
      } else if (
        question.type === "multiple_choice" ||
        question.type === "dropdown" ||
        question.type === "checkboxes"
      ) {
        value =
          preferredNavigationOption(question) ||
          question.options.find((option) => !looksLikeSubmitOption(option)) ||
          question.options[0] ||
          "";
        confidence = "low";
        rationale = "Best-effort option — confirm before submitting";
      } else {
        value = draftNarrative(profile, question, opportunity);
        confidence = "low";
        rationale = "Best-effort draft — edit before submitting";
      }
    }

    if (optional && isFakePlaceholderValue(value)) {
      ({ value, confidence, rationale } = blankOptionalAnswer(question));
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
- Prefer exact facts from the student profile (name, email, phone, school, skills, bio, resume, activities, custom facts).
- Optional fields (required=false, or title contains "optional"): if the profile has no real value, set value to "" and explain that it was left blank. Do NOT invent fake phone numbers, emails, names, or placeholder text like "(555) 000-0000".
- Required non-file questions should have a real draft when possible. Never invent fake contact details (no placeholder phone/email). If a required contact field is missing from the profile, use "" and say it must be added.
- When writing style samples are provided, match that student's tone, sentence length, vocabulary, and first-person voice in essays and short answers. Do not copy the samples verbatim into unrelated questions.
- When the profile is thin or a required field is not directly answered, WRITE a plausible draft grounded in their grade, school, interests, skills, bio/resume, and the opportunity. Mark confidence "low" (or "medium" if partly grounded).
- Tailor essay/short-answer text to EACH question. Do not paste the identical bio into every field.
- Do not invent specific awards, GPAs, employers, or credentials that are not in the profile. General sincere interest and motivation statements are OK when details are missing.
- For multiple_choice/dropdown: value MUST be exactly one of the provided options, or "" when the question is optional and no option fits.
- For navigation / section questions with options like "Submit form" vs "Proceed to next section" (or Continue / Next section): ALWAYS choose the option that continues to the next section so the full application can be completed. Only choose "Submit form" / end-form if there is no continue option.
- For checkboxes: join selected options with || (each must be an provided option), or "" if optional and nothing fits.
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
        "Fill fields from the student profile. Leave optional fields blank when the profile has no real value. Never invent fake phone numbers or emails.",
      student: profileToPromptContext(options.profile),
      opportunity,
      formTitle: options.application.title,
      formDescription: options.application.description,
      questions: options.application.questions.map((q) => ({
        entryId: q.entryId,
        title: q.title,
        type: q.type,
        required: q.required,
        optional: isOptionalQuestion(q),
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
    const optional = question ? isOptionalQuestion(question) : false;
    const aiProvided = typeof ai?.value === "string";
    let value = aiProvided ? String(ai?.value ?? "").trim() : base.value;
    let confidence: FilledAnswer["confidence"] =
      ai?.confidence === "high" ||
      ai?.confidence === "medium" ||
      ai?.confidence === "low"
        ? ai.confidence
        : base.confidence;
    let rationale = ai?.rationale || base.rationale;

    if (optional && (value === "" || isFakePlaceholderValue(value))) {
      return {
        ...base,
        value: "",
        confidence: "high" as const,
        rationale:
          ai?.rationale?.trim() ||
          "Left blank (optional — nothing in your background to use)",
      };
    }

    if (question?.options.length && value.trim()) {
      const coerced = coerceOptionValue(question, value, options.profile);
      value = coerced.value;
      if (confidence === "high" && coerced.confidence !== "high") {
        confidence = coerced.confidence;
      }
    }

    if (!value.trim()) {
      if (optional) {
        value = "";
        confidence = "high";
        rationale =
          "Left blank (optional — nothing in your background to use)";
      } else if (base.value.trim() && !isFakePlaceholderValue(base.value)) {
        value = base.value;
        confidence = "low";
        rationale =
          base.rationale || "Best-effort draft — edit before submitting";
      } else {
        value = "";
        confidence = "low";
        rationale = base.rationale || "Add this before submitting";
      }
    }

    if (isFakePlaceholderValue(value)) {
      value =
        optional || !base.value.trim() || isFakePlaceholderValue(base.value)
          ? ""
          : base.value;
      confidence = optional ? "high" : "low";
      rationale = optional
        ? "Left blank (optional — nothing in your background to use)"
        : "Add a real value before submitting";
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
