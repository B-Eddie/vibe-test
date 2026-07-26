"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  answersToFillPayload,
  buildBookmarklet,
  buildConsoleScript,
} from "@/lib/fill-script";
import {
  loadProfile,
  profileCompleteness,
  upsertTrackerStatus,
} from "@/lib/storage";
import {
  EMPTY_PROFILE,
  type FilledAnswer,
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
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const opportunityTitle = searchParams.get("title") || "";
  const fromId = searchParams.get("from") || "";

  const completeness = useMemo(() => profileCompleteness(profile), [profile]);
  const fillPayload = useMemo(() => answersToFillPayload(answers), [answers]);
  const bookmarklet = useMemo(
    () => buildBookmarklet(fillPayload),
    [fillPayload],
  );
  const consoleScript = useMemo(
    () => buildConsoleScript(fillPayload),
    [fillPayload],
  );

  useEffect(() => {
    setProfile(loadProfile());
    const preset = searchParams.get("url");
    if (preset) setUrl(preset);
  }, [searchParams]);

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

      const fillRes = await fetch("/api/apply/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          application: parseData.application,
          opportunityContext: opportunityTitle || parseData.application.title,
        }),
      });

      let fillData: {
        answers?: FilledAnswer[];
        provider?: string;
        error?: string;
      } = {};
      try {
        fillData = (await fillRes.json()) as {
          answers?: FilledAnswer[];
          provider?: string;
          error?: string;
        };
      } catch {
        throw new Error(
          `Could not draft answers (HTTP ${fillRes.status}). Check GEMINI_API_KEY.`,
        );
      }

      if (!fillRes.ok || !fillData.answers) {
        throw new Error(fillData.error || "Could not draft answers");
      }

      setApplication(parseData.application);
      setAnswers(fillData.answers);
      setProvider(fillData.provider ?? null);
      setStep("review");

      const id = fromId || targetIdFor(parseData.application.url);
      upsertTrackerStatus(id, "ready", {
        title: opportunityTitle || parseData.application.title,
        url: parseData.application.url,
        kind: parseData.application.kind,
        notes: "Answers ready — review then autofill",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function updateAnswer(entryId: string, value: string) {
    setAnswers((current) =>
      current.map((answer) =>
        answer.entryId === entryId ? { ...answer, value } : answer,
      ),
    );
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
    if (!application?.submitUrl) return;
    if (!confirmed) {
      setError("Confirm you’ve reviewed every answer before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const id = fromId || targetIdFor(application.url);

    try {
      const payload: Record<string, string> = {};
      for (const answer of answers) {
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

  const manualCount = answers.filter((answer) => answer.manualOnly).length;
  const lowConfidence = answers.filter(
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

        {step === "review" && application ? (
          <div className="apply-review-stage">
            <div className="apply-meta-card">
              <div>
                <h3>{application.title}</h3>
                <p>{application.description || application.url}</p>
                <div className="tag-row">
                  <span>{application.platform}</span>
                  <span>{application.questions.length} fields</span>
                  <span>
                    {isGoogle ? "Direct submit available" : "Live-page autofill"}
                  </span>
                  {provider ? <span>{provider}</span> : null}
                </div>
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
                  ? `${lowConfidence} answer(s) are low-confidence — edit them before filling.`
                  : ""}
              </p>
            )}

            <div className="answer-list">
              {answers.map((answer) => (
                <label key={answer.entryId} className="answer-card">
                  <div className="answer-card-head">
                    <strong>{answer.title}</strong>
                    <span className={`confidence ${answer.confidence}`}>
                      {answer.manualOnly ? "manual" : answer.confidence}
                    </span>
                  </div>
                  <p className="rationale">{answer.rationale}</p>
                  {answer.manualOnly ? (
                    <p className="empty-state">
                      Upload this on the live page after autofill.
                    </p>
                  ) : answer.type === "paragraph" ? (
                    <textarea
                      rows={5}
                      value={answer.value}
                      onChange={(e) =>
                        updateAnswer(answer.entryId, e.target.value)
                      }
                    />
                  ) : (
                    <input
                      value={answer.value}
                      onChange={(e) =>
                        updateAnswer(answer.entryId, e.target.value)
                      }
                    />
                  )}
                </label>
              ))}
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
                    onClick={launchPageFill}
                  >
                    Autofill in browser instead
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={submitting}
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
              clipboard. This works on basically any platform because it runs
              inside that page.
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
                }}
              >
                Apply to another
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="error-note">{error}</p> : null}
      </section>
    </div>
  );
}
