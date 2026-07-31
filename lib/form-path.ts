import type {
  FilledAnswer,
  FormOptionBranch,
  FormQuestion,
  ParsedApplication,
} from "./types";

export type FormPath = {
  sectionIndexes: number[];
  questions: FormQuestion[];
  pageHistory: string;
  branchingEntryIds: string[];
};

function normalizeChoice(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findBranch(
  branches: FormOptionBranch[] | undefined,
  value: string,
): FormOptionBranch | undefined {
  if (!branches?.length || !value.trim()) return undefined;
  const want = normalizeChoice(value);
  return (
    branches.find((item) => normalizeChoice(item.option) === want) ||
    branches.find(
      (item) =>
        normalizeChoice(item.option).includes(want) ||
        want.includes(normalizeChoice(item.option)),
    )
  );
}

/** Walk sections using current answers and branching rules. */
export function resolveFormPath(
  application: ParsedApplication,
  answers: Array<Pick<FilledAnswer, "entryId" | "value">>,
): FormPath {
  const sections = application.sections;
  const questions = application.questions;

  if (!sections?.length) {
    return {
      sectionIndexes: [0],
      questions,
      pageHistory: "0",
      branchingEntryIds: [],
    };
  }

  const answerMap = new Map(
    answers.map((answer) => [answer.entryId, answer.value]),
  );
  const byEntry = new Map(questions.map((q) => [q.entryId, q]));
  const visited = new Set<number>();
  const sectionIndexes: number[] = [];
  const pathQuestions: FormQuestion[] = [];
  const branchingEntryIds: string[] = [];

  let current = 0;
  while (current >= 0 && current < sections.length && !visited.has(current)) {
    visited.add(current);
    sectionIndexes.push(current);
    const section = sections[current]!;
    let next: number | null = section.defaultNextSectionIndex;
    let waitingOnBranch = false;

    for (const entryId of section.questionEntryIds) {
      const question = byEntry.get(entryId);
      if (!question) continue;
      pathQuestions.push(question);
      if (!question.optionBranches?.length) continue;

      branchingEntryIds.push(entryId);
      const value = answerMap.get(entryId)?.trim() || "";
      if (!value) {
        // Don't reveal later sections until this choice is made.
        waitingOnBranch = true;
        next = null;
        break;
      }
      const branch = findBranch(question.optionBranches, value);
      if (branch) {
        next = branch.nextSectionIndex;
      }
    }

    if (waitingOnBranch || next === null || next === undefined) break;
    current = next;
  }

  return {
    sectionIndexes,
    questions: pathQuestions,
    pageHistory: sectionIndexes.join(","),
    branchingEntryIds: [...new Set(branchingEntryIds)],
  };
}

/** Questions on the current path that still need answers. */
export function questionsMissingAnswers(
  application: ParsedApplication,
  answers: FilledAnswer[],
): FormQuestion[] {
  const path = resolveFormPath(application, answers);
  const answered = new Set(
    answers.filter((a) => a.value.trim() || a.manualOnly).map((a) => a.entryId),
  );
  return path.questions.filter((q) => !answered.has(q.entryId));
}

export function isBranchingQuestion(question: FormQuestion): boolean {
  return Boolean(question.optionBranches?.length);
}

/** True when changing this answer can unlock a different later section. */
export function canChangeFormPath(
  application: ParsedApplication,
  question: FormQuestion | undefined,
): boolean {
  if (!question) return false;
  if (question.optionBranches?.length) return true;
  if (
    (application.sections?.length || 0) > 1 &&
    (question.type === "multiple_choice" || question.type === "dropdown") &&
    question.options.length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Keep answers for sections at/before the changed question's section;
 * drop everything after so a new branch can be filled.
 */
export function pruneAnswersAfterQuestion(
  application: ParsedApplication,
  answers: FilledAnswer[],
  changedEntryId: string,
): FilledAnswer[] {
  const question = application.questions.find((q) => q.entryId === changedEntryId);
  if (!question || question.sectionIndex == null || !application.sections?.length) {
    return answers.map((answer) =>
      answer.entryId === changedEntryId ? answer : answer,
    );
  }

  const keepThrough = question.sectionIndex;
  const keepIds = new Set<string>();
  for (const section of application.sections) {
    if (section.index > keepThrough) continue;
    for (const entryId of section.questionEntryIds) keepIds.add(entryId);
  }

  return answers
    .filter((answer) => keepIds.has(answer.entryId))
    .map((answer) =>
      answer.entryId === changedEntryId ? answer : answer,
    );
}

/** Next section index unlocked by this answer, if any. */
export function nextSectionAfterAnswer(
  application: ParsedApplication,
  entryId: string,
  value: string,
): number | null {
  const question = application.questions.find((q) => q.entryId === entryId);
  if (!question) return null;
  const branch = findBranch(question.optionBranches, value);
  if (branch) return branch.nextSectionIndex;
  const section = application.sections?.find(
    (item) => item.index === (question.sectionIndex ?? 0),
  );
  return section?.defaultNextSectionIndex ?? null;
}

export function hasSectionBranching(application: ParsedApplication): boolean {
  return Boolean(
    application.hasBranching ||
      (application.sections && application.sections.length > 1),
  );
}

export function mergeAnswerLists(
  existing: FilledAnswer[],
  incoming: FilledAnswer[],
): FilledAnswer[] {
  const map = new Map(existing.map((answer) => [answer.entryId, answer]));
  for (const answer of incoming) {
    map.set(answer.entryId, answer);
  }
  return [...map.values()];
}

export function placeholderAnswer(question: FormQuestion): FilledAnswer {
  return {
    entryId: question.entryId,
    questionId: question.id,
    title: question.title,
    type: question.type,
    value: "",
    confidence: "low",
    rationale: question.manualOnly
      ? "File upload — complete this manually in the form"
      : "Drafting from your background…",
    manualOnly: question.manualOnly,
    matchHints: question.matchHints,
    name: question.name,
    selector: question.selector,
  };
}

/** Ensure every question on the current path has an answer row (possibly empty). */
export function ensurePathAnswerRows(
  application: ParsedApplication,
  answers: FilledAnswer[],
): FilledAnswer[] {
  const path = resolveFormPath(application, answers);
  const map = new Map(answers.map((answer) => [answer.entryId, answer]));
  const ordered: FilledAnswer[] = [];
  for (const question of path.questions) {
    ordered.push(map.get(question.entryId) ?? placeholderAnswer(question));
  }
  return ordered;
}

export function orderAnswersForPath(
  application: ParsedApplication,
  answers: FilledAnswer[],
): FilledAnswer[] {
  return ensurePathAnswerRows(application, answers);
}

/** Path is ready to submit/autofill: not loading, and every required path field has a value. */
export function isApplyPathReady(
  application: ParsedApplication,
  answers: FilledAnswer[],
  options?: { loading?: boolean },
): { ready: boolean; missingRequired: FormQuestion[]; reason: string | null } {
  if (options?.loading) {
    return {
      ready: false,
      missingRequired: [],
      reason: "Wait for the next section to finish drafting.",
    };
  }

  const path = resolveFormPath(application, answers);
  const byEntry = new Map(answers.map((answer) => [answer.entryId, answer]));
  const missingRequired: FormQuestion[] = [];

  // Unanswered branching choice → later sections are still locked.
  for (const entryId of path.branchingEntryIds) {
    const answer = byEntry.get(entryId);
    if (!answer?.value.trim()) {
      const question =
        path.questions.find((item) => item.entryId === entryId) ||
        application.questions.find((item) => item.entryId === entryId);
      if (question) missingRequired.push(question);
      return {
        ready: false,
        missingRequired,
        reason: question
          ? `Choose an option for “${question.title}” before submitting.`
          : "Finish branching choices before submitting.",
      };
    }
  }

  for (const question of path.questions) {
    if (question.manualOnly) continue;
    // Prefer explicit required flags; if missing, treat as required so we never
    // submit a blank field the live form would reject.
    if (question.required === false) continue;
    const answer = byEntry.get(question.entryId);
    if (!answer || !answer.value.trim()) {
      missingRequired.push(question);
    }
  }

  if (missingRequired.length) {
    return {
      ready: false,
      missingRequired,
      reason: `Still need answers for: ${missingRequired
        .slice(0, 3)
        .map((q) => q.title)
        .join(", ")}${missingRequired.length > 3 ? "…" : ""}`,
    };
  }

  return { ready: true, missingRequired: [], reason: null };
}

export function ensureApplicationSections(
  application: ParsedApplication,
): ParsedApplication {
  if (application.sections?.length) return application;
  const questions = application.questions.map((question) => ({
    ...question,
    sectionIndex: question.sectionIndex ?? 0,
  }));
  return {
    ...application,
    questions,
    hasBranching: false,
    sections: [
      {
        id: "section-0",
        index: 0,
        title: "Application",
        questionEntryIds: questions.map((q) => q.entryId),
        defaultNextSectionIndex: null,
      },
    ],
  };
}

/**
 * Make sure every choice option has a branch target. Missing targets fall back
 * to the section's default next page so path changes still unlock later pages.
 */
export function backfillOptionBranches(
  application: ParsedApplication,
): ParsedApplication {
  const sections = application.sections;
  if (!sections?.length) return application;

  const questions = application.questions.map((question) => {
    if (
      question.type !== "multiple_choice" &&
      question.type !== "dropdown"
    ) {
      return question;
    }
    if (!question.options.length) return question;

    const section = sections.find(
      (item) => item.index === (question.sectionIndex ?? 0),
    );
    const fallbackNext = section?.defaultNextSectionIndex ?? null;
    const existing = new Map(
      (question.optionBranches || []).map((branch) => [branch.option, branch]),
    );
    let optionBranches = question.options.map((option) => {
      const prior = [...existing.entries()].find(
        ([key]) => normalizeChoice(key) === normalizeChoice(option),
      )?.[1];
      return prior ?? { option, nextSectionIndex: fallbackNext };
    });

    // Recover from older parses that marked every option as "submit" because a
    // trailing 0 was misread as navigation — if the section continues, use that.
    const allEnd =
      optionBranches.length > 0 &&
      optionBranches.every((branch) => branch.nextSectionIndex === null);
    const differentiated = optionBranches.some(
      (branch) => branch.nextSectionIndex !== optionBranches[0]?.nextSectionIndex,
    );
    if (allEnd && !differentiated && fallbackNext !== null) {
      optionBranches = question.options.map((option) => ({
        option,
        nextSectionIndex: fallbackNext,
      }));
    }

    return { ...question, optionBranches };
  });

  const hasBranching =
    application.hasBranching ||
    questions.some((question) =>
      Boolean(
        question.optionBranches?.some(
          (branch, _, all) =>
            branch.nextSectionIndex !== all[0]?.nextSectionIndex,
        ),
      ),
    ) ||
    sections.length > 1;

  return { ...application, questions, hasBranching };
}
