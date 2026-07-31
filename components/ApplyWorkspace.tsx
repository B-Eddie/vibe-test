"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  answersToFillPayloadWithOptions,
  buildBookmarklet,
  buildConsoleScript,
} from "@/lib/fill-script";
import {
  ensureApplicationSections,
  hasSectionBranching,
  mergeAnswerLists,
  orderAnswersForPath,
  pruneAnswersAfterQuestion,
  questionsMissingAnswers,
  resolveFormPath,
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
}: {
  answer: FilledAnswer;
  question?: FormQuestion;
  onChange: (value: string) => void;
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

  if ((type === "dropdown" || type === "scale") && options.length) {
    return (
      <select
        value={options.includes(answer.value) ? answer.value : ""}
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
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <input
      value={answer.value}
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
  const [geminiModel, setGeminiModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionLoadingLabel, setSectionLoadingLabel] = useState(
    "Drafting the next section…",
  );
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
  const bookmarklet = useMemo(
    () => buildBookmarklet(fillPayload),
    [fillPayload],
  );
  const consoleScript = useMemo(
    () => buildConsoleScript(fillPayload),
    [fillPayload],
  );
  const branching = Boolean(
    normalizedApp && hasSectionBranching(normalizedApp),
  );

  useEffect(() => {
    setProfile(loadProfile());
    const preset = searchParams.get("url");
    if (preset) setUrl(preset);
  }, [searchParams]);

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
  ) {
    const ensured = ensureApplicationSections(app);
    let working = [...seedAnswers];
    let lastProvider: string | null = null;
    let lastError: string | null = null;
    let lastModel: string | null = null;
    const maxPasses = Math.max(ensured.sections?.length || 1, 1) + 2;

    for (let pass = 0; pass < maxPasses; pass += 1) {
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

      const fillData = await requestFill(
        ensured,
        missing.map((q) => q.entryId),
        `Only fill these currently visible section question(s): ${missing
          .map((q) => q.title)
          .join("; ")}. Respect the selected path through the form.`,
      );
      working = mergeAnswerLists(working, fillData.answers || []);
      lastProvider = fillData.provider ?? lastProvider;
      lastError = fillData.geminiError ?? lastError;
      lastModel = fillData.geminiModel ?? lastModel;
    }

    return {
      answers: orderAnswersForPath(ensured, working),
      provider: lastProvider,
      geminiError: lastError,
      geminiModel: lastModel,
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

      const app = ensureApplicationSections(parseData.application);
      const filled = await fillAlongPath(app, []);

      setApplication(app);
      setAnswers(filled.answers);
      setProvider(filled.provider ?? null);
      setGeminiError(filled.geminiError ?? null);
      setGeminiModel(filled.geminiModel ?? null);
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
    const isBranchPoint = Boolean(question?.optionBranches?.length);

    if (!isBranchPoint) {
      setAnswers((current) =>
        current.map((answer) =>
          answer.entryId === entryId ? { ...answer, value } : answer,
        ),
      );
      return;
    }

    const nextAnswers = pruneAnswersAfterQuestion(
      normalizedApp,
      answers.map((answer) =>
        answer.entryId === entryId ? { ...answer, value } : answer,
      ),
      entryId,
    ).map((answer) =>
      answer.entryId === entryId ? { ...answer, value } : answer,
    );

    setAnswers(orderAnswersForPath(normalizedApp, nextAnswers));
    setConfirmed(false);
    setSectionLoading(true);
    setSectionLoadingLabel("Updating path and drafting the new section…");
    setError(null);

    try {
      const filled = await fillAlongPath(normalizedApp, nextAnswers);
      setAnswers(filled.answers);
      setProvider(filled.provider ?? provider);
      setGeminiError(filled.geminiError ?? null);
      setGeminiModel(filled.geminiModel ?? null);
      setStatusNote(
        "Path updated — new section answers were drafted from your background.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not draft the new section. Try again.",
      );
    } finally {
      setSectionLoading(false);
    }
  }

  async function copyFillScript() {
    await navigator.clipboard.writeText(consoleScript);
    setScriptCopied(true);
    window.setTimeout(() => setScriptCopied(false), 2500);
  }

  async function launchPageFill() {
    if (!application) return;
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
    setStatusNote(
      "Marked applied. Double-check the live page for file uploads or CAPTCHA before you hit their submit button.",
    );
    setStep("done");
  }

  const manualCount = visibleAnswers.filter((answer) => answer.manualOnly).length;
  const lowConfidence = visibleAnswers.filter(
    (answer) => answer.confidence === "low" && !answer.manualOnly,
  ).length;
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
            <h2>Apply desk</h2>
            <p>
              Paste any application link — Google Forms, Greenhouse, Lever,
              Workday, Typeform, school portals, and more. InternHarbor reads
              the page, drafts answers from your background, then autofills the
              live form.
            </p>
          </div>
          <Link className="btn-ghost" href="/profile">
            Background {completeness}%
          </Link>
        </div>

        {opportunityTitle ? (
          <p className="opportunity-chip">Applying to: {opportunityTitle}</p>
        ) : null}

        {step === "link" ? (
          <div className="apply-link-stage">
            <label>
              Application URL
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… any application or form link"
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={() => prepareApplication()}
              >
                {loading ? "Reading page & drafting…" : "Prepare application"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => router.push("/internships")}
              >
                Find opportunities
              </button>
            </div>
          </div>
        ) : null}

        {step === "review" && application && normalizedApp ? (
          <div className="apply-review-stage">
            <div className="apply-meta-card">
              <div>
                <h3>{application.title}</h3>
                <p>{application.description || application.url}</p>
                <div className="tag-row">
                  <span>{application.platform}</span>
                  <span>
                    {visibleAnswers.length} visible field
                    {visibleAnswers.length === 1 ? "" : "s"}
                  </span>
                  {branching ? (
                    <span>
                      {formPath.sectionIndexes.length} section
                      {formPath.sectionIndexes.length === 1 ? "" : "s"} on path
                    </span>
                  ) : null}
                  <span>
                    {isGoogle ? "Direct submit available" : "Live-page autofill"}
                  </span>
                  {provider ? <span>{provider}</span> : null}
                  {geminiModel ? <span>{geminiModel}</span> : null}
                </div>
                {branching ? (
                  <p className="provider-note" style={{ marginTop: "0.75rem" }}>
                    This form has multiple sections. Only the path unlocked by
                    your current choices is shown. Changing a branching option
                    redrafts the next section.
                  </p>
                ) : null}
                {geminiError ? (
                  <p className="error-note" style={{ marginTop: "0.75rem" }}>
                    Gemini did not fill this form ({geminiError}). Showing
                    local draft answers — edit before submitting.
                    {/not set|API key|UNAUTHENTICATED|PERMISSION/i.test(
                      geminiError,
                    )
                      ? " Confirm GEMINI_API_KEY is set for Production on Vercel, then redeploy."
                      : /quota|rate.?limit|exceeded|billing/i.test(geminiError)
                        ? " Try again shortly, or check your Gemini plan/billing and model quota."
                        : ""}
                  </p>
                ) : null}
              </div>
              <a
                className="btn-ghost"
                href={application.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open original
              </a>
            </div>

            {(manualCount > 0 || lowConfidence > 0) && (
              <p className="provider-note">
                {manualCount > 0
                  ? `${manualCount} file upload(s) stay manual. `
                  : ""}
                {lowConfidence > 0
                  ? `${lowConfidence} answer(s) are best-effort drafts (low confidence) — edit them before filling.`
                  : ""}
              </p>
            )}

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
                if (!sectionAnswers.length) return null;
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
                      return (
                        <div key={answer.entryId} className="answer-card">
                          <div className="answer-card-head">
                            <strong>{answer.title}</strong>
                            <span className={`confidence ${answer.confidence}`}>
                              {answer.manualOnly
                                ? "manual"
                                : question?.optionBranches?.length
                                  ? `${answer.confidence} · branching`
                                  : question?.type &&
                                      [
                                        "multiple_choice",
                                        "dropdown",
                                        "checkboxes",
                                        "scale",
                                      ].includes(question.type)
                                    ? `${answer.confidence} · ${question.type.replace("_", " ")}`
                                    : answer.confidence}
                            </span>
                          </div>
                          <p className="rationale">{answer.rationale}</p>
                          <AnswerEditor
                            answer={answer}
                            question={question}
                            onChange={(value) =>
                              void updateAnswer(answer.entryId, value)
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {isGoogle ? (
              <>
                <label className="checkbox-label confirm-row">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I’ve reviewed every answer and want InternHarbor to submit this
                  Google Form now.
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
                    disabled={sectionLoading}
                    onClick={launchPageFill}
                  >
                    Autofill in browser instead
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={submitting || sectionLoading}
                    onClick={submitGoogle}
                  >
                    {submitting ? "Submitting…" : "Submit Google Form"}
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
                  disabled={sectionLoading}
                  onClick={launchPageFill}
                >
                  Autofill on live page
                </button>
              </div>
            )}
          </div>
        ) : null}

        {step === "fill" && application ? (
          <div className="apply-fill-stage">
            <h3>Autofill the live page</h3>
            <p className="provider-note">
              The application tab should be open and the fill script is on your
              clipboard. It sets text fields, dropdowns, radios, and checkboxes
              on the live page.
            </p>

            <ol className="fill-instructions">
              <li>
                Switch to the <strong>{application.platform}</strong> tab (
                <a
                  href={application.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  reopen
                </a>
                ).
              </li>
              <li>
                Press <kbd>F12</kbd> or <kbd>Cmd/Ctrl + Option + J</kbd> to open
                the console.
              </li>
              <li>
                Paste (<kbd>Cmd/Ctrl + V</kbd>) and press <kbd>Enter</kbd>.
                Fields highlight in teal as they’re filled.
              </li>
              <li>Review, handle file uploads / CAPTCHA, then submit there.</li>
            </ol>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={copyFillScript}
              >
                {scriptCopied ? "Script copied" : "Copy fill script again"}
              </button>
              <a className="btn-secondary" href={bookmarklet}>
                Autofill bookmarklet
              </a>
              <button
                type="button"
                className="btn-primary"
                onClick={markApplied}
              >
                I submitted — mark applied
              </button>
            </div>

            <details className="fill-advanced">
              <summary>Keep a reusable bookmarklet</summary>
              <p>
                Drag this link to your bookmarks bar, open any application page,
                then click the bookmark after preparing answers here.
              </p>
              <a className="bookmarklet-link" href={bookmarklet}>
                InternHarbor Autofill
              </a>
            </details>

            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStep("review")}
            >
              ← Back to answers
            </button>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="apply-done-stage">
            <h3>You’re set</h3>
            <p>{statusNote}</p>
            <div className="form-actions">
              <Link className="btn-primary" href="/tracker">
                View tracker
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
                  setGeminiModel(null);
                  setProvider(null);
                }}
              >
                Apply to another
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="error-note">{error}</p> : null}
      </section>

      {sectionLoading ? (
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
