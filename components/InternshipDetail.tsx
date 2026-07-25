"use client";

import { useEffect, useMemo, useState } from "react";
import { DraftPanel } from "@/components/DraftPanel";
import { scoreInternship } from "@/lib/match";
import { loadProfile, upsertTrackerStatus } from "@/lib/storage";
import { EMPTY_PROFILE, type Internship, type StudentProfile } from "@/lib/types";

export function InternshipDetail({ internship }: { internship: Internship }) {
  const [profile, setProfile] = useState<StudentProfile>(EMPTY_PROFILE);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  const match = useMemo(
    () => scoreInternship(internship, profile),
    [internship, profile],
  );

  return (
    <div className="detail-layout">
      <section className="detail-panel">
        <div className="internship-meta">
          <span className="score-chip">{match.score}% match</span>
          <span>{internship.remote ? "Remote OK" : "On-site"}</span>
          <span>{internship.source}</span>
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
          {internship.title}
        </h1>
        <p className="org-line">
          {internship.org} · {internship.location}
        </p>
        <p>{internship.description}</p>
        <div className="tag-row">
          {internship.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <ul className="reason-list">
          {match.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <div className="draft-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => upsertTrackerStatus(internship.id, "saved")}
          >
            Save
          </button>
          <a
            className="btn-primary"
            href={internship.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open apply link
          </a>
        </div>
      </section>

      <DraftPanel internship={internship} profile={profile} />
    </div>
  );
}
