"use client";

import { useEffect, useMemo, useState } from "react";
import { InternshipCard } from "@/components/InternshipCard";
import { rankInternships } from "@/lib/match";
import { loadProfile, upsertTrackerStatus } from "@/lib/storage";
import type { Internship, StudentProfile } from "@/lib/types";
import { EMPTY_PROFILE } from "@/lib/types";

type Props = {
  listings: Internship[];
  limit?: number;
  showFilters?: boolean;
};

export function InternshipBrowser({
  listings,
  limit,
  showFilters = true,
}: Props) {
  const [profile, setProfile] = useState<StudentProfile>(EMPTY_PROFILE);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [tag, setTag] = useState("all");
  const [deadlineDays, setDeadlineDays] = useState<"any" | "30" | "60">("any");

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const item of listings) {
      for (const value of item.tags) set.add(value);
    }
    return [...set].sort();
  }, [listings]);

  const matches = useMemo(() => {
    const ranked = rankInternships(listings, profile).filter((match) => {
      const { internship } = match;
      if (remoteOnly && !internship.remote) return false;
      if (tag !== "all" && !internship.tags.includes(tag)) return false;
      if (deadlineDays !== "any" && internship.deadline) {
        const days =
          (Date.parse(internship.deadline) - Date.now()) /
          (1000 * 60 * 60 * 24);
        if (days < 0 || days > Number(deadlineDays)) return false;
      } else if (deadlineDays !== "any" && !internship.deadline) {
        return false;
      }
      return true;
    });
    return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
  }, [listings, profile, remoteOnly, tag, deadlineDays, limit]);

  return (
    <div className="browser">
      {showFilters ? (
        <div className="filters">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
            />
            Remote only
          </label>
          <label>
            Field
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="all">All tags</option>
              {tags.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Deadline
            <select
              value={deadlineDays}
              onChange={(e) =>
                setDeadlineDays(e.target.value as "any" | "30" | "60")
              }
            >
              <option value="any">Any</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="internship-list">
        {matches.map((match) => (
          <div key={match.internship.id} className="internship-list-item">
            <InternshipCard match={match} />
            <button
              type="button"
              className="btn-ghost save-inline"
              onClick={() => upsertTrackerStatus(match.internship.id, "saved")}
            >
              Save to tracker
            </button>
          </div>
        ))}
        {!matches.length ? (
          <p className="empty-state">
            No matches yet. Add interests on your profile or widen filters.
          </p>
        ) : null}
      </div>
    </div>
  );
}
