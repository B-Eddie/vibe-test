import { geminiGenerate, extractJsonArray, getApiKey } from "./gemini";
import type {
  FilledAnswer,
  FormQuestion,
  ParsedApplication,
  StudentProfile,
} from "./types";
import { profileToPromptContext } from "./storage-server";

function heuristicFill(
  profile: StudentProfile,
  questions: FormQuestion[],
): FilledAnswer[] {
  return questions.map((question) => {
    const title = question.title.toLowerCase();
    let value = "";
    let confidence: FilledAnswer["confidence"] = "low";
    let rationale = "Needs your review";

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
      value = profile.email;
      confidence = profile.email ? "high" : "low";
      rationale = "From your email";
    } else if (title.includes("phone") || title.includes("mobile")) {
      value = profile.phone;
      confidence = profile.phone ? "high" : "low";
      rationale = "From your phone";
    } else if (
      (title.includes("full name") ||
        title === "name" ||
        title.startsWith("name ") ||
        title.includes("your name") ||
        title.includes("legal name")) &&
      !title.includes("school") &&
      !title.includes("parent") &&
      !title.includes("org")
    ) {
      value = profile.name;
      confidence = profile.name ? "high" : "low";
      rationale = "From your name";
    } else if (title.includes("school") || title.includes("high school")) {
      value = profile.school;
      confidence = profile.school ? "high" : "low";
      rationale = "From your school";
    } else if (
      (title.includes("grade") || title.includes("year")) &&
      !title.includes("gradua")
    ) {
      value = profile.grade;
      confidence = "high";
      rationale = "From your grade";
    } else if (title.includes("city") || title.includes("location")) {
      value = profile.city;
      confidence = profile.city ? "high" : "low";
      rationale = "From your city";
    } else if (title.includes("parent") || title.includes("guardian")) {
      value = profile.parentName || profile.parentEmail;
      confidence = value ? "medium" : "low";
      rationale = "From parent/guardian fields";
    } else if (title.includes("skill")) {
      value = profile.skills.join(", ");
      confidence = profile.skills.length ? "high" : "low";
      rationale = "From skills";
    } else if (question.options.length) {
      value = "";
      confidence = "low";
      rationale = "Pick an option — AI unavailable for this fill";
    } else {
      const fact = profile.customFacts.find((item) =>
        title.includes(item.label.toLowerCase()),
      );
      if (fact) {
        value = fact.value;
        confidence = "high";
        rationale = `From custom fact "${fact.label}"`;
      } else {
        // Do NOT paste bio into every unknown field — that looks broken.
        value = "";
        confidence = "low";
        rationale = "Left blank for you to complete";
      }
    }

    if (
      (question.type === "multiple_choice" || question.type === "dropdown") &&
      question.options.length &&
      value &&
      !question.options.includes(value)
    ) {
      const match = question.options.find(
        (option) =>
          option.toLowerCase() === value.toLowerCase() ||
          option.toLowerCase().includes(value.toLowerCase()) ||
          value.toLowerCase().includes(option.toLowerCase()),
      );
      value = match ?? "";
      confidence = match ? "medium" : "low";
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
  const fallback = heuristicFill(
    options.profile,
    options.application.questions,
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
    system:
      "You fill internship/program applications for a high school student. Return ONLY a JSON array. Each item: {entryId, value, confidence: high|medium|low, rationale}. Use only facts from the student profile. Write specific answers for essays using bio/resume/activities — tailor them to each question; never paste the same bio into every field. For multiple_choice/dropdown/checkboxes, value MUST be one of the provided options (checkboxes: join selected options with ||). Leave value empty if unknown. Never invent achievements. For file questions return empty value.",
    user: JSON.stringify({
      student: profileToPromptContext(options.profile),
      opportunity: options.opportunityContext ?? options.application.title,
      formTitle: options.application.title,
      formDescription: options.application.description,
      questions: options.application.questions.map((q) => ({
        entryId: q.entryId,
        title: q.title,
        type: q.type,
        required: q.required,
        options: q.options,
        manualOnly: q.manualOnly,
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
    const ai = byEntry.get(base.entryId);
    if (!ai) return base;
    let value = typeof ai.value === "string" ? ai.value : base.value;
    const question = options.application.questions.find(
      (q) => q.entryId === base.entryId,
    );
    if (
      question &&
      (question.type === "multiple_choice" || question.type === "dropdown") &&
      question.options.length &&
      value &&
      !question.options.includes(value)
    ) {
      const match = question.options.find(
        (option) => option.toLowerCase() === value.toLowerCase(),
      );
      value = match ?? base.value;
    }
    const confidence =
      ai.confidence === "high" ||
      ai.confidence === "medium" ||
      ai.confidence === "low"
        ? ai.confidence
        : base.confidence;
    return {
      ...base,
      value,
      confidence,
      rationale: ai.rationale || base.rationale,
    };
  });

  return {
    answers,
    provider: "gemini",
    geminiError: null,
    geminiModel: result.model,
  };
}
