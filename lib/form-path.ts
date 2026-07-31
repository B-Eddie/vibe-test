import type {
  FilledAnswer,
  FormOptionBranch,
  FormQuestion,
  FormSection,
  ParsedApplication,
} from "./types";

export type FormPath = {
  sectionIndexes: number[];
  questions: FormQuestion[];
  pageHistory: string;
  branchingEntryIds: string[];
};

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
      const branch = question.optionBranches.find(
        (item) => item.option === value,
      );
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

  return answers.filter((answer) => keepIds.has(answer.entryId));
}

export function isBranchingQuestion(question: FormQuestion): boolean {
  return Boolean(question.optionBranches?.some((b) => b.nextSectionIndex !== undefined));
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

export function orderAnswersForPath(
  application: ParsedApplication,
  answers: FilledAnswer[],
): FilledAnswer[] {
  const path = resolveFormPath(application, answers);
  const map = new Map(answers.map((answer) => [answer.entryId, answer]));
  const ordered: FilledAnswer[] = [];
  for (const question of path.questions) {
    const answer = map.get(question.entryId);
    if (answer) ordered.push(answer);
  }
  return ordered;
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
