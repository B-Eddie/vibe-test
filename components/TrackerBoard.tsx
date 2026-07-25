"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCachedListings } from "@/lib/listings-cache";
import { loadTracker, upsertTrackerStatus } from "@/lib/storage";
import type { Internship, TrackerEntry, TrackerStatus } from "@/lib/types";

const COLUMNS: TrackerStatus[] = ["saved", "drafted", "applied", "rejected"];

export function TrackerBoard({ listings }: { listings: Internship[] }) {
  const [entries, setEntries] = useState<TrackerEntry[]>([]);
  const [allListings, setAllListings] = useState<Internship[]>(listings);

  useEffect(() => {
    setEntries(loadTracker());
    const cached = getCachedListings();
    if (cached.length) {
      const map = new Map<string, Internship>();
      for (const item of [...listings, ...cached]) map.set(item.id, item);
      setAllListings([...map.values()]);
    }
  }, [listings]);

  const byId = useMemo(() => {
    return new Map(allListings.map((item) => [item.id, item]));
  }, [allListings]);

  function move(id: string, status: TrackerStatus) {
    setEntries(upsertTrackerStatus(id, status));
  }

  return (
    <div className="tracker-board">
      {COLUMNS.map((status) => {
        const columnEntries = entries.filter((entry) => entry.status === status);
        return (
          <section key={status} className="tracker-column">
            <h2>
              {status} <span>{columnEntries.length}</span>
            </h2>
            <ul>
              {columnEntries.map((entry) => {
                const internship = byId.get(entry.internshipId);
                return (
                  <li key={entry.internshipId} className="tracker-item">
                    <Link href={`/internships/${entry.internshipId}`}>
                      {internship?.title ?? entry.internshipId}
                    </Link>
                    <p>{internship?.org ?? "Listing unavailable offline"}</p>
                    <div className="tracker-move">
                      {COLUMNS.filter((column) => column !== status).map(
                        (column) => (
                          <button
                            key={column}
                            type="button"
                            className="btn-ghost"
                            onClick={() => move(entry.internshipId, column)}
                          >
                            {column}
                          </button>
                        ),
                      )}
                    </div>
                  </li>
                );
              })}
              {!columnEntries.length ? (
                <li className="tracker-empty">Nothing here yet</li>
              ) : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
