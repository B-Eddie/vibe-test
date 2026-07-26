"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

type Step = "link" | "review" | "done";

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
  const opportunityTitle = searchParams.get("title") || "";
  const fromId = searchParams.get("from") || "";

  const completeness = useMemo(() => profileCompleteness(profile), [profile]);

  useEffect(() => {
    setProfile(loadProfile());
    const preset = searchParams.get("url");
    if (preset) {
      setUrl(preset);
    }
  }, [searchParams]);

  async function prepareApplication(nextUrl = url) {
    setError(null);
    setStatusNote(null);
    setConfirmed(false);

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
      const parseData = (await parseRes.json()) as {
        application?: ParsedApplication;
        error?: string;
      };
      if (!parseRes.ok || !parseData.application) {
        throw new Error(parseData.error || "Could not read that application");
      }

      const fillRes = await fetch("/api/apply/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          application: parseData.application,
          opportunityContext:
            opportunityTitle || parseData.application.title,
        }),
      });
      const fillData = (await fillRes.json()) as {
        answers?: FilledAnswer[];
        provider?: string;
        error?: string;
      };
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
        notes: "Answers drafted — review before submit",
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

  async function submitApplication() {
    if (!application) return;
    setError(null);
    setSubmitting(true);

    const id = fromId || targetIdFor(application.url);

    try {
      if (application.kind === "google-form" && application.submitUrl) {
        if (!confirmed) {
          setError("Confirm you’ve reviewed every answer before submitting.");
          setSubmitting(false);
          return;
        }

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
              `Google Form submit returned status ${data.status ?? "unknown"}`,
          );
        }

        upsertTrackerStatus(id, "applied", {
          title: opportunityTitle || application.title,
          url: application.url,
          kind: "google-form",
          notes: "Submitted via InternHarbor",
        });
        setStatusNote("Submitted to Google Forms. You’re marked as applied.");
        setStep("done");
      } else {
        upsertTrackerStatus(id, "applied", {
          title: opportunityTitle || application.title,
          url: application.url,
          kind: application.kind,
          notes: "Opened application with prepared answers",
        });
        window.open(application.url, "_blank", "noopener,noreferrer");
        setStatusNote(
          "Opened the application page. Paste your reviewed answers, then you’re done.",
        );
        setStep("done");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const manualCount = answers.filter((answer) => answer.manualOnly).length;
  const lowConfidence = answers.filter(
    (answer) => answer.confidence === "low" && !answer.manualOnly,
  ).length;

  return (
    <div className="apply-shell">
      <ol className="apply-steps" aria-label="Apply steps">
        {[
          { id: "link", label: "Link" },
          { id: "review", label: "Review" },
          { id: "done", label: "Done" },
        ].map((item, index) => {
          const active =
            step === item.id ||
            (step === "review" && item.id === "link") ||
            (step === "done" && item.id !== "done");
          const current = step === item.id;
          return (
            <li
              key={item.id}
              className={
                current ? "apply-step current" : active ? "apply-step done" : "apply-step"
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
              Paste a Google Form or any program application link. InternHarbor
              fills answers from your background, you review, then submit or
              paste.
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
                placeholder="https://docs.google.com/forms/... or any apply page"
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={() => prepareApplication()}
              >
                {loading ? "Reading & drafting…" : "Prepare application"}
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
                  <span>{application.kind}</span>
                  <span>
                    {application.supportsAutoSubmit
                      ? "Auto-submit available"
                      : "Copy & paste flow"}
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
                  ? `${manualCount} field(s) need manual upload. `
                  : ""}
                {lowConfidence > 0
                  ? `${lowConfidence} answer(s) are low-confidence — double-check them.`
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
                      Complete this file upload on the original form after
                      submit, or before if required.
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

            {application.kind === "google-form" ? (
              <label className="checkbox-label confirm-row">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I’ve reviewed every answer and want InternHarbor to submit this
                Google Form now.
              </label>
            ) : (
              <p className="provider-note">
                This site can’t be auto-submitted. We’ll open it and keep your
                answers here to copy.
              </p>
            )}

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
                disabled={submitting}
                onClick={submitApplication}
              >
                {submitting
                  ? "Working…"
                  : application.kind === "google-form"
                    ? "Submit application"
                    : "Open & mark applied"}
              </button>
            </div>
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
