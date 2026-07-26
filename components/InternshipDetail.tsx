"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DraftPanel } from "@/components/DraftPanel";
import { findCachedListing } from "@/lib/listings-cache";
import { scoreInternship } from "@/lib/match";
import { loadProfile, upsertTrackerStatus } from "@/lib/storage";
import {
  EMPTY_PROFILE,
  type Internship,
  type StudentProfile,
} from "@/lib/types";

export function InternshipDetail({
  internship: initial,
}: {
  internship: Internship | null;
}) {
  const [internship, setInternship] = useState<Internship | null>(initial);
  const [profile, setProfile] = useState<StudentProfile>(EMPTY_PROFILE);

  useEffect(() => {
    setProfile(loadProfile());
    if (!initial && typeof window !== "undefined") {
      const id = window.location.pathname.split("/").pop();
      if (id) {
        const cached = findCachedListing(id);
        if (cached) setInternship(cached);
      }
    }
  }, [initial]);

  const match = useMemo(
    () => (internship ? scoreInternship(internship, profile) : null),
    [internship, profile],
  );

  if (!internship || !match) {
    return (
      <section className="detail-panel">
        <p className="empty-state">
          Listing not found. Go back to Find and open it again from the feed.
        </p>
      </section>
    );
  }

  const applyHref = `/apply?url=${encodeURIComponent(internship.url)}&title=${encodeURIComponent(internship.title)}&from=${encodeURIComponent(internship.id)}`;

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
            onClick={() =>
              upsertTrackerStatus(internship.id, "saved", {
                title: internship.title,
                url: internship.url,
                kind: "internship",
              })
            }
          >
            Save
          </button>
          <Link className="btn-primary" href={applyHref}>
            Apply with InternHarbor
          </Link>
          <a
            className="btn-ghost"
            href={internship.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open listing
          </a>
        </div>
      </section>

      <DraftPanel internship={internship} profile={profile} />
    </div>
  );
}
