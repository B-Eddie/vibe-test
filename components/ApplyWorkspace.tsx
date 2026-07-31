"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  answersToFillPayloadWithOptions,
  buildConsoleScript,
} from "@/lib/fill-script";
import {
  backfillOptionBranches,
  canChangeFormPath,
  ensureApplicationSections,
  ensurePathAnswerRows,
  hasSectionBranching,
  isApplyPathReady,
  mergeAnswerLists,
  nextSectionAfterAnswer,
  orderAnswersForPath,
  pruneAnswersAfterQuestion,
  questionsMissingAnswers,
  resolveFormPath,
  seedContinueNavigationAnswers,
} from "@/lib/form-path";
import {
  loadProfile,
  profileCompleteness,
  upsertTrackerStatus,
} from "@/lib/storage";
import {
  EMPTY_PROFILE,
  type FilledAnswer,
  type FormQuestion,
  type ParsedApplication,
  type StudentProfile,
} from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";

type Step = "link" | "review" | "fill" | "done";

function targetIdFor(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  }
  return `app-${hash.toString(16)}`;
}

function AnswerEditor({
  answer,
  question,
  onChange,
  disabled = false,
}: {
  answer: FilledAnswer;
  question?: FormQuestion;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const type = question?.type || answer.type;
  const options = question?.options?.length
    ? question.options
    : answer.value
      ? [answer.value]
      : [];

  if (answer.manualOnly || type === "file") {
    return (
      <p className="empty-state">
        Upload this on the live page after autofill.
      </p>
    );
  }

  if (disabled && !answer.value.trim()) {
    return (
      <p className="empty-state">Drafting this answer from your background…</p>
    );
  }

  if ((type === "dropdown" || type === "scale") && options.length) {
    return (
      <select
        value={options.includes(answer.value) ? answer.value : ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Select an option
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (type === "multiple_choice" && options.length) {
    return (
      <div className="answer-choice-list" role="radiogroup">
        {options.map((option) => (
          <label key={option} className="answer-choice">
            <input
              type="radio"
              name={`answer-${answer.entryId}`}
              checked={answer.value === option}
              disabled={disabled}
              onChange={() => onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  if (type === "checkboxes" && options.length) {
    const selected = new Set(
      answer.value
        .split("||")
        .map((part) => part.trim())
        .filter(Boolean),
    );
    return (
      <div className="answer-choice-list">
        {options.map((option) => (
          <label key={option} className="answer-choice">
            <input
              type="checkbox"
              checked={selected.has(option)}
              disabled={disabled}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(option);
                else next.delete(option);
                onChange([...next].join("||"));
              }}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  if (type === "paragraph") {
    return (
      <textarea
        rows={5}
        value={answer.value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <input
      value={answer.value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      type={type === "email" ? "email" : type === "date" ? "date" : "text"}
    />
  );
}

export function ApplyWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("link");
  const [url, setUrl] = useState("");
  const [profile, setProfile] = useState<StudentProfile>(EMPTY_PROFILE);
  const [application, setApplication] = useState<ParsedApplication | null>(
    null,
  );
  const [answers, setAnswers] = useState<FilledAnswer[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionLoadingLabel, setSectionLoadingLabel] = useState(
    "Drafting the next section…",
  );
  const [loadingAfterEntryId, setLoadingAfterEntryId] = useState<string | null>(
    null,
  );
  const [pendingSectionIndex, setPendingSectionIndex] = useState<number | null>(
    null,
  );
  const branchFillGen = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const opportunityTitle = searchParams.get("title") || "";
  const fromId = searchParams.get("from") || "";

  const completeness = useMemo(() => profileCompleteness(profile), [profile]);
  const normalizedApp = useMemo(
    () => (application ? ensureApplicationSections(application) : null),
    [application],
  );
  const formPath = useMemo(
    () =>
      normalizedApp
        ? resolveFormPath(normalizedApp, answers)
        : { sectionIndexes: [0], questions: [], pageHistory: "0", branchingEntryIds: [] },
    [normalizedApp, answers],
  );
  const visibleAnswers = useMemo(
    () =>
      normalizedApp ? orderAnswersForPath(normalizedApp, answers) : answers,
    [normalizedApp, answers],
  );
  const optionMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const question of normalizedApp?.questions || []) {
      if (question.options?.length) map[question.entryId] = question.options;
    }
    return map;
  }, [normalizedApp]);
  const fillPayload = useMemo(
    () => answersToFillPayloadWithOptions(visibleAnswers, optionMap),
    [visibleAnswers, optionMap],
  );
  const consoleScript = useMemo(
    () => buildConsoleScript(fillPayload),
    [fillPayload],
  );
  const branching = Boolean(
    normalizedApp && hasSectionBranching(normalizedApp),
  );
  const pathReadiness = useMemo(
    () =>
      normalizedApp
        ? isApplyPathReady(normalizedApp, answers, { loading: sectionLoading })
        : { ready: false, missingRequired: [], reason: "Prepare an application first." },
    [normalizedApp, answers, sectionLoading],
  );

  useEffect(() => {
    setProfile(loadProfile());
    const preset = searchParams.get("url");
    if (preset) setUrl(preset);
  }, [searchParams]);

  // Never keep a stale confirm while the path is still drafting or incomplete.
  useEffect(() => {
    if (!pathReadiness.ready && confirmed) setConfirmed(false);
  }, [pathReadiness.ready, confirmed]);

  async function requestFill(
    app: ParsedApplication,
    onlyEntryIds: string[],
    pathContext?: string,
  ) {
    const fillRes = await fetch("/api/apply/fill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile,
        application: app,
        opportunityContext: opportunityTitle || app.title,
        onlyEntryIds,
        pathContext,
      }),
    });

    let fillData: {
      answers?: FilledAnswer[];
      provider?: string;
      error?: string;
      geminiError?: string | null;
      geminiModel?: string | null;
    } = {};
    try {
      fillData = (await fillRes.json()) as typeof fillData;
    } catch {
      throw new Error(
        `Could not draft answers (HTTP ${fillRes.status}). Check GEMINI_API_KEY.`,
      );
    }
    if (!fillRes.ok || !fillData.answers) {
      throw new Error(fillData.error || "Could not draft answers");
    }
    return fillData;
  }

  /** Fill the current path section-by-section as choices unlock later pages. */
  async function fillAlongPath(
    app: ParsedApplication,
    seedAnswers: FilledAnswer[],
    options?: { preferContinue?: boolean },
  ) {
    const ensured = backfillOptionBranches(ensureApplicationSections(app));
    const preferContinue = options?.preferContinue !== false;
    // Pre-select "Proceed / Continue" so later sections unlock for drafting.
    let working = preferContinue
      ? seedContinueNavigationAnswers(ensured, seedAnswers, {
          rewriteSubmit: true,
        })
      : ensurePathAnswerRows(ensured, seedAnswers);
    let lastProvider: string | null = null;
    let lastError: string | null = null;
    const maxPasses = Math.max(ensured.sections?.length || 1, 1) + 4;

    for (let pass = 0; pass < maxPasses; pass += 1) {
      if (preferContinue) {
        working = seedContinueNavigationAnswers(ensured, working, {
          rewriteSubmit: true,
        });
      }
      working = ensurePathAnswerRows(ensured, working);
      const missing = questionsMissingAnswers(ensured, working);
      if (!missing.length) break;

      const path = resolveFormPath(ensured, working);
      const sectionIndexes = [
        ...new Set(
          missing
            .map((q) => q.sectionIndex ?? 0)
            .filter((index) => path.sectionIndexes.includes(index)),
        ),
      ];
      const sectionTitles = sectionIndexes
        .map(
          (index) =>
            ensured.sections?.find((section) => section.index === index)
              ?.title || `Section ${index + 1}`,
        )
        .join(", ");

      setSectionLoadingLabel(
        sectionTitles
          ? `Drafting ${sectionTitles}…`
          : "Drafting the next section…",
      );

      // Show unlocked section rows immediately while AI drafts them.
      setAnswers(ensurePathAnswerRows(ensured, working));
      setApplication(ensured);

      const fillData = await requestFill(
        ensured,
        missing.map((q) => q.entryId),
        preferContinue
          ? `Only fill these currently visible section question(s): ${missing
              .map((q) => q.title)
              .join(
                "; ",
              )}. For Submit form vs Proceed/Continue choices, choose Proceed/Continue so later sections can be completed.`
          : `Only fill these currently visible section question(s): ${missing
              .map((q) => q.title)
              .join("; ")}. Respect the selected path through the form.`,
      );
      working = mergeAnswerLists(working, fillData.answers || []);
      if (preferContinue) {
        working = seedContinueNavigationAnswers(ensured, working, {
          rewriteSubmit: true,
        });
      }
      working = ensurePathAnswerRows(ensured, working);
      lastProvider = fillData.provider ?? lastProvider;
      lastError = fillData.geminiError ?? lastError;

      // If the API returned nothing useful, stop looping to avoid an infinite spin.
      const stillMissing = questionsMissingAnswers(ensured, working);
      if (
        stillMissing.length &&
        stillMissing.every((q) => missing.some((m) => m.entryId === q.entryId)) &&
        !(fillData.answers || []).some((a) => a.value.trim())
      ) {
        break;
      }
    }

    return {
      answers: orderAnswersForPath(ensured, working),
      provider: lastProvider,
      geminiError: lastError,
      application: ensured,
    };
  }

  async function prepareApplication(nextUrl = url) {
    setError(null);
    setStatusNote(null);
    setConfirmed(false);
    setScriptCopied(false);

    if (!nextUrl.trim()) {
      setError("Paste an application link to continue.");
      return;
    }

    if (completeness < 40) {
      setError(
        "Your background is still thin. Add more details under Background so answers are accurate.",
      );
      return;
    }

    setLoading(true);
    setSectionLoading(true);
    setSectionLoadingLabel("Reading the form and drafting section 1…");
    try {
      const parseRes = await fetch("/api/apply/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: nextUrl.trim() }),
      });

      let parseData: {
        application?: ParsedApplication;
        error?: string;
      } = {};
      try {
        parseData = (await parseRes.json()) as {
          application?: ParsedApplication;
          error?: string;
        };
      } catch {
        throw new Error(
          parseRes.status === 404
            ? "Apply API not found on this deploy — redeploy the latest main branch."
            : `Could not read that application (HTTP ${parseRes.status}).`,
        );
      }

      if (!parseRes.ok || !parseData.application) {
        throw new Error(
          parseData.error ||
            `Could not read that application (HTTP ${parseRes.status}).`,
        );
      }

      const app = backfillOptionBranches(
        ensureApplicationSections(parseData.application),
      );
      const filled = await fillAlongPath(app, [], { preferContinue: true });

      setApplication(filled.application ?? app);
      setAnswers(filled.answers);
      setProvider(filled.provider ?? null);
      setGeminiError(filled.geminiError ?? null);
      setStep("review");

      const id = fromId || targetIdFor(app.url);
      upsertTrackerStatus(id, "ready", {
        title: opportunityTitle || app.title,
        url: app.url,
        kind: app.kind,
        notes: "Answers ready — review then autofill",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setSectionLoading(false);
    }
  }

  async function updateAnswer(entryId: string, value: string) {
    if (!normalizedApp) return;

    const question = normalizedApp.questions.find((q) => q.entryId === entryId);
    const triggersPath = canChangeFormPath(normalizedApp, question);

    if (!triggersPath) {
      setAnswers((current) =>
        current.map((answer) =>
          answer.entryId === entryId ? { ...answer, value } : answer,
        ),
      );
      return;
    }

    // Ignore no-op reselection of the same option.
    const previous = answers.find((answer) => answer.entryId === entryId)?.value;
    if (previous === value) return;

    const app = backfillOptionBranches(normalizedApp);
    const seeded = answers.map((answer) =>
      answer.entryId === entryId ? { ...answer, value } : answer,
    );
    const pruned = pruneAnswersAfterQuestion(app, seeded, entryId).map(
      (answer) =>
        answer.entryId === entryId ? { ...answer, value } : answer,
    );

    // Immediately unlock the new path with placeholder rows so the next
    // section questions appear under the loader while AI drafts.
    const withPlaceholders = ensurePathAnswerRows(app, pruned);
    const nextSection = nextSectionAfterAnswer(app, entryId, value);
    const nextSectionMeta =
      nextSection !== null
        ? app.sections?.find((section) => section.index === nextSection)
        : null;

    const gen = ++branchFillGen.current;
    setApplication(app);
    setAnswers(withPlaceholders);
    setConfirmed(false);
    setError(null);
    setStatusNote(null);
    setLoadingAfterEntryId(entryId);
    setPendingSectionIndex(nextSection);
    setSectionLoading(true);
    setSectionLoadingLabel(
      nextSectionMeta
        ? `Drafting “${nextSectionMeta.title}”…`
        : nextSection === null
          ? "Updating path…"
          : "Drafting the next section…",
    );

    try {
      const filled = await fillAlongPath(app, withPlaceholders, {
        preferContinue: false,
      });
      if (gen !== branchFillGen.current) return;
      setApplication(filled.application ?? app);
      setAnswers(filled.answers);
      setProvider(filled.provider ?? provider);
      setGeminiError(filled.geminiError ?? null);
      const readiness = isApplyPathReady(app, filled.answers, { loading: false });
      setStatusNote(
        readiness.ready
          ? nextSectionMeta
            ? `Updated path — drafted “${nextSectionMeta.title}”. Review before submitting.`
            : "Path updated. Review before submitting."
          : readiness.reason ||
              "New section loaded — finish any blank required answers before submitting.",
      );
    } catch (err) {
      if (gen !== branchFillGen.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Could not draft the new section. Try again.",
      );
    } finally {
      if (gen === branchFillGen.current) {
        setSectionLoading(false);
        setLoadingAfterEntryId(null);
        setPendingSectionIndex(null);
      }
    }
  }

  async function copyFillScript() {
    await navigator.clipboard.writeText(consoleScript);
    setScriptCopied(true);
    window.setTimeout(() => setScriptCopied(false), 2500);
  }

  async function launchPageFill() {
    if (!application || !normalizedApp) return;
    if (!pathReadiness.ready) {
      setError(
        pathReadiness.reason ||
          "Wait for every section on this path to finish drafting before autofill.",
      );
      return;
    }
    setError(null);
    try {
      await copyFillScript();
      window.open(application.url, "_blank", "noopener,noreferrer");
      setStep("fill");
    } catch {
      setError("Could not copy the autofill script. Copy it manually below.");
      setStep("fill");
    }
  }

  async function submitGoogle() {
    if (!application?.submitUrl || !normalizedApp) return;
    if (sectionLoading || !pathReadiness.ready) {
      setError(
        pathReadiness.reason ||
          "Wait for the next section to finish drafting before submitting.",
      );
      return;
    }
    if (!confirmed) {
      setError("Confirm you’ve reviewed every answer before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const id = fromId || targetIdFor(application.url);
    const path = resolveFormPath(normalizedApp, answers);

    try {
      const payload: Record<string, string> = {};
      for (const answer of orderAnswersForPath(normalizedApp, answers)) {
        if (answer.manualOnly) continue;
        if (!answer.value.trim()) {
          throw new Error(
            `Missing required answer for “${answer.title}”. Finish the unlocked sections first.`,
          );
        }
        payload[answer.entryId] = answer.value;
      }

      const res = await fetch("/api/apply/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submitUrl: application.submitUrl,
          answers: payload,
          fbzx: application.fbzx,
          confirm: true,
          pageHistory: path.pageHistory,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        status?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error ||
            `Submit returned status ${data.status ?? "unknown"}. Try live-page autofill instead.`,
        );
      }

      upsertTrackerStatus(id, "applied", {
        title: opportunityTitle || application.title,
        url: application.url,
        kind: application.kind,
        notes: "Submitted via InternHarbor",
      });
      setStatusNote("Submitted. You’re marked as applied.");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  function markApplied() {
    if (!application) return;
    const id = fromId || targetIdFor(application.url);
    upsertTrackerStatus(id, "applied", {
      title: opportunityTitle || application.title,
      url: application.url,
      kind: application.kind,
      notes: "Autofilled on live page",
    });
    setStatusNote("Marked applied.");
    setStep("done");
  }

  const manualCount = visibleAnswers.filter((answer) => answer.manualOnly).length;
  const isGoogle = application?.kind === "google-form";

  return (
    <div className="apply-shell">
      <ol className="apply-steps apply-steps-4" aria-label="Apply steps">
        {[
          { id: "link", label: "Link" },
          { id: "review", label: "Review" },
          { id: "fill", label: "Fill" },
          { id: "done", label: "Done" },
        ].map((item, index) => {
          const order = ["link", "review", "fill", "done"] as Step[];
          const currentIdx = order.indexOf(step);
          const itemIdx = order.indexOf(item.id as Step);
          const current = step === item.id;
          const done = itemIdx < currentIdx;
          return (
            <li
              key={item.id}
              className={
                current
                  ? "apply-step current"
                  : done
                    ? "apply-step done"
                    : "apply-step"
              }
            >
              <span>{index + 1}</span>
              {item.label}
            </li>
          );
        })}
      </ol>

      <section className="apply-panel">
        <div className="apply-header">
          <div>
            <h2>Desk</h2>
          </div>
          <Link className="btn-ghost" href="/profile">
            Background {completeness}%
          </Link>
        </div>

        {opportunityTitle ? (
          <p className="opportunity-chip">{opportunityTitle}</p>
        ) : null}

        {step === "link" ? (
          <div className="apply-link-stage">
            <label>
              Link
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={() => prepareApplication()}
              >
                {loading ? "Drafting…" : "Prepare"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => router.push("/internships")}
              >
                Browse
              </button>
            </div>
          </div>
        ) : null}

        {step === "review" && application && normalizedApp ? (
          <div className="apply-review-stage">
            <div className="apply-meta-card">
              <div>
                <h3>{application.title}</h3>
                <div className="tag-row">
                  <span>{application.platform}</span>
                  <span>
                    {visibleAnswers.length} field
                    {visibleAnswers.length === 1 ? "" : "s"}
                  </span>
                  {branching ? (
                    <span>{formPath.sectionIndexes.length} sections</span>
                  ) : null}
                </div>
                {geminiError ? (
                  <p className="error-note" style={{ marginTop: "0.75rem" }}>
                    Draft fallback ({geminiError}).
                  </p>
                ) : null}
              </div>
              <a
                className="btn-ghost"
                href={application.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </a>
            </div>

            {manualCount > 0 ? (
              <p className="provider-note">
                {manualCount} upload{manualCount === 1 ? "" : "s"} stay manual.
              </p>
            ) : null}

            <div className="answer-list">
              {formPath.sectionIndexes.map((sectionIndex) => {
                const section = normalizedApp.sections?.find(
                  (item) => item.index === sectionIndex,
                );
                const sectionAnswers = visibleAnswers.filter((answer) => {
                  const question = normalizedApp.questions.find(
                    (item) => item.entryId === answer.entryId,
                  );
                  return (question?.sectionIndex ?? 0) === sectionIndex;
                });
                const waitingForThisSection =
                  sectionLoading &&
                  pendingSectionIndex === sectionIndex &&
                  !sectionAnswers.length;

                if (!sectionAnswers.length && !waitingForThisSection) {
                  return null;
                }

                return (
                  <div key={`section-${sectionIndex}`} className="apply-section-block">
                    {branching || (normalizedApp.sections?.length || 0) > 1 ? (
                      <div className="apply-section-heading">
                        <h4>{section?.title || `Section ${sectionIndex + 1}`}</h4>
                        {section?.description ? <p>{section.description}</p> : null}
                      </div>
                    ) : null}
                    {sectionAnswers.map((answer) => {
                      const question = normalizedApp.questions.find(
                        (item) => item.entryId === answer.entryId,
                      );
                      const showInlineLoader =
                        sectionLoading && loadingAfterEntryId === answer.entryId;
                      return (
                        <div key={answer.entryId} className="answer-card-stack">
                          <div className="answer-card">
                            <div className="answer-card-head">
                              <strong>{answer.title}</strong>
                              <span className={`confidence ${answer.confidence}`}>
                                {answer.manualOnly
                                  ? "manual"
                                  : canChangeFormPath(normalizedApp, question)
                                    ? "branch"
                                    : answer.confidence}
                              </span>
                            </div>
                            <AnswerEditor
                              answer={answer}
                              question={question}
                              disabled={
                                sectionLoading &&
                                !canChangeFormPath(normalizedApp, question)
                              }
                              onChange={(nextValue) =>
                                void updateAnswer(answer.entryId, nextValue)
                              }
                            />
                          </div>
                          {showInlineLoader ? (
                            <div
                              className="section-inline-loading"
                              role="status"
                              aria-live="polite"
                            >
                              <div
                                className="section-loading-spinner"
                                aria-hidden
                              />
                              <div>
                                <p>{sectionLoadingLabel}</p>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {waitingForThisSection ? (
                      <div className="section-inline-loading" role="status">
                        <div className="section-loading-spinner" aria-hidden />
                        <div>
                          <p>{sectionLoadingLabel}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {sectionLoading &&
              pendingSectionIndex !== null &&
              !formPath.sectionIndexes.includes(pendingSectionIndex) ? (
                <div className="apply-section-block section-pending-block">
                  <div className="apply-section-heading">
                    <h4>
                      {normalizedApp.sections?.find(
                        (item) => item.index === pendingSectionIndex,
                      )?.title || `Section ${pendingSectionIndex + 1}`}
                    </h4>
                  </div>
                  <div className="section-inline-loading" role="status">
                    <div className="section-loading-spinner" aria-hidden />
                    <div>
                      <p>{sectionLoadingLabel}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {statusNote && step === "review" ? (
              <p className="provider-note">{statusNote}</p>
            ) : null}
            {!pathReadiness.ready ? (
              <p className="error-note">
                {pathReadiness.reason ||
                  "Finish drafting every unlocked section before submitting."}
              </p>
            ) : null}
            {isGoogle ? (
              <>
                <label className="checkbox-label confirm-row">
                  <input
                    type="checkbox"
                    checked={confirmed && pathReadiness.ready}
                    disabled={!pathReadiness.ready || sectionLoading}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I’ve reviewed these answers.
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setStep("link")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!pathReadiness.ready || sectionLoading}
                    onClick={launchPageFill}
                  >
                    Autofill
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      submitting || sectionLoading || !pathReadiness.ready
                    }
                    onClick={submitGoogle}
                  >
                    {sectionLoading
                      ? "Drafting…"
                      : submitting
                        ? "Submitting…"
                        : "Submit"}
                  </button>
                </div>
              </>
            ) : (
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStep("link")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!pathReadiness.ready || sectionLoading}
                  onClick={launchPageFill}
                >
                  {sectionLoading ? "Drafting…" : "Autofill"}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {step === "fill" && application ? (
          <div className="apply-fill-stage">
            <h3>Autofill</h3>
            <ol className="fill-instructions">
              <li>
                Open the{" "}
                <a
                  href={application.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {application.platform}
                </a>{" "}
                tab
              </li>
              <li>
                Console (<kbd>F12</kbd>) → paste → Enter
              </li>
              <li>Review and submit there</li>
            </ol>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={copyFillScript}
              >
                {scriptCopied ? "Copied" : "Copy script"}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={markApplied}
              >
                Mark applied
              </button>
            </div>

            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStep("review")}
            >
              ← Answers
            </button>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="apply-done-stage">
            <h3>Done</h3>
            {statusNote ? <p>{statusNote}</p> : null}
            <div className="form-actions">
              <Link className="btn-primary" href="/tracker">
                Tracker
              </Link>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setStep("link");
                  setApplication(null);
                  setAnswers([]);
                  setConfirmed(false);
                  setStatusNote(null);
                  setGeminiError(null);
                  setProvider(null);
                }}
              >
                Another
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="error-note">{error}</p> : null}
      </section>

      {loading ? (
        <div className="section-loading-overlay" role="status" aria-live="polite">
          <div className="section-loading-card">
            <div className="section-loading-spinner" aria-hidden />
            <p>{sectionLoadingLabel}</p>
            <span>Only the unlocked section path is drafted.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
