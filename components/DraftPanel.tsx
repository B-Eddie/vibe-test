"use client";

import { useState } from "react";
import { upsertTrackerStatus } from "@/lib/storage";
import type { Internship, StudentProfile } from "@/lib/types";

type Props = {
  internship: Internship;
  profile: StudentProfile;
};

export function DraftPanel({ internship, profile }: Props) {
  const [coverEmail, setCoverEmail] = useState("");
  const [whyMe, setWhyMe] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, internship }),
      });
      if (!res.ok) {
        throw new Error("Draft request failed");
      }
      const data = (await res.json()) as {
        coverEmail: string;
        whyMe: string;
        provider?: string;
      };
      setCoverEmail(data.coverEmail);
      setWhyMe(data.whyMe);
      setProvider(data.provider ?? null);
      upsertTrackerStatus(internship.id, "drafted");
    } catch {
      setError("Could not generate a draft. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Clipboard copy failed — select the text manually.");
    }
  }

  return (
    <section className="draft-panel">
      <div className="section-heading">
        <h2>Draft assist</h2>
        <p>
          Generate a cover email and short “why me” blurb. You review and submit
          yourself — nothing is sent automatically.
        </p>
      </div>

      <div className="draft-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={generate}
          disabled={loading}
        >
          {loading ? "Drafting…" : "Generate draft"}
        </button>
        <a
          className="btn-secondary"
          href={internship.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => upsertTrackerStatus(internship.id, "applied")}
        >
          Open apply page
        </a>
      </div>

      {provider ? (
        <p className="provider-note">
          Draft source: {provider === "openai" ? "OpenAI" : "local fallback"}
        </p>
      ) : null}
      {error ? <p className="error-note">{error}</p> : null}

      {coverEmail ? (
        <label>
          Cover email
          <textarea
            rows={12}
            value={coverEmail}
            onChange={(e) => setCoverEmail(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => copyText("email", coverEmail)}
          >
            {copied === "email" ? "Copied" : "Copy email"}
          </button>
        </label>
      ) : null}

      {whyMe ? (
        <label>
          Why me
          <textarea
            rows={5}
            value={whyMe}
            onChange={(e) => setWhyMe(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => copyText("why", whyMe)}
          >
            {copied === "why" ? "Copied" : "Copy blurb"}
          </button>
        </label>
      ) : null}
    </section>
  );
}
