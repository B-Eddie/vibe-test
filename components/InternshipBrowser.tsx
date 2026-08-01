"use client";

import { useEffect, useMemo, useState } from "react";
import { InternshipCard } from "@/components/InternshipCard";
import { daysUntilDeadline, isDeadlinePassed } from "@/lib/deadline";
import { isHighSchoolAccessible, rankInternships } from "@/lib/match";
import { cacheListings } from "@/lib/listings-cache";
import { loadProfile, upsertTrackerStatus } from "@/lib/storage";
import type { Internship, StudentProfile } from "@/lib/types";
import { EMPTY_PROFILE } from "@/lib/types";

type Props = {
  initialListings: Internship[];
  limit?: number;
  showFilters?: boolean;
  /** Default for the high-school-only filter (Find page defaults on). */
  defaultHsOnly?: boolean;
};

export function InternshipBrowser({
  initialListings,
  limit,
  showFilters = true,
  defaultHsOnly = false,
}: Props) {
  const [listings, setListings] = useState<Internship[]>(initialListings);
  const [profile, setProfile] = useState<StudentProfile>(EMPTY_PROFILE);
  const [hsOnly, setHsOnly] = useState(defaultHsOnly);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [tag, setTag] = useState("all");
  const [deadlineDays, setDeadlineDays] = useState<"any" | "30" | "60">("any");
  const [liveSearch, setLiveSearch] = useState(false);
  const [loadingLive, setLoadingLive] = useState(false);

  useEffect(() => {
    const loaded = loadProfile();
    setProfile(loaded);
    cacheListings(initialListings);

    const params = new URLSearchParams();
    if (loaded.interests.length) {
      params.set("interests", loaded.interests.join(","));
    }
    if (loaded.city) params.set("city", loaded.city);

    setLoadingLive(true);
    fetch(`/api/internships?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { listings?: Internship[]; liveSearch?: boolean }) => {
        if (data.listings?.length) {
          setListings(data.listings);
          cacheListings(data.listings);
        }
        setLiveSearch(Boolean(data.liveSearch));
      })
      .catch(() => {
        /* keep seed listings */
      })
      .finally(() => setLoadingLive(false));
  }, [initialListings]);

  const expiredCount = useMemo(
    () => listings.filter((item) => isDeadlinePassed(item.deadline)).length,
    [listings],
  );

  const openListings = useMemo(
    () => listings.filter((item) => !isDeadlinePassed(item.deadline)),
    [listings],
  );

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const item of openListings) {
      for (const value of item.tags) set.add(value);
    }
    return [...set].sort();
  }, [openListings]);

  const matches = useMemo(() => {
    const ranked = rankInternships(openListings, profile).filter((match) => {
      const { internship } = match;
      if (hsOnly && !isHighSchoolAccessible(internship)) return false;
      if (remoteOnly && !internship.remote) return false;
      if (tag !== "all" && !internship.tags.includes(tag)) return false;
      if (deadlineDays !== "any") {
        const days = daysUntilDeadline(internship.deadline);
        if (days === null || days < 0 || days > Number(deadlineDays)) {
          return false;
        }
      }
      return true;
    });
    return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
  }, [openListings, profile, hsOnly, remoteOnly, tag, deadlineDays, limit]);

  const hiddenCollegeCount = useMemo(() => {
    if (!hsOnly) return 0;
    return openListings.filter((item) => !isHighSchoolAccessible(item)).length;
  }, [openListings, hsOnly]);

  return (
    <div className="browser">
      {showFilters ? (
        <div className="filters">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={hsOnly}
              onChange={(e) => setHsOnly(e.target.checked)}
            />
            High school only
          </label>
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
              <option value="any">Open deadlines</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
            </select>
          </label>
        </div>
      ) : null}

      {hsOnly && showFilters ? (
        <p className="provider-note">
          Showing programs a high school student can realistically apply to.
          {hiddenCollegeCount > 0
            ? ` ${hiddenCollegeCount} college-only listing${hiddenCollegeCount === 1 ? "" : "s"} hidden.`
            : null}
        </p>
      ) : null}

      {loadingLive || liveSearch || expiredCount > 0 ? (
        <p className="provider-note">
          {loadingLive
            ? "Searching…"
            : liveSearch
              ? "Live results included."
              : null}
          {expiredCount > 0
            ? `${loadingLive || liveSearch ? " " : ""}${expiredCount} closed hidden.`
            : null}
        </p>
      ) : null}

      <div className="internship-list">
        {matches.map((match) => (
          <div key={match.internship.id} className="internship-list-item">
            <InternshipCard match={match} />
            <button
              type="button"
              className="btn-ghost save-inline"
              onClick={() =>
                upsertTrackerStatus(match.internship.id, "saved", {
                  title: match.internship.title,
                  url: match.internship.url,
                  kind: "internship",
                })
              }
            >
              Save
            </button>
          </div>
        ))}
        {!matches.length ? (
          <p className="empty-state">
            {hsOnly
              ? "No open high school–accessible matches. Turn off “High school only” to see more listings."
              : "No open matches."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
