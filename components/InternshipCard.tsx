import Link from "next/link";
import { isDeadlinePassed } from "@/lib/deadline";
import type { MatchResult } from "@/lib/types";

function formatDeadline(deadline: string | null): string {
  if (!deadline) return "Rolling";
  if (isDeadlinePassed(deadline)) return "Closed";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
  if (match) {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = months[Number(match[2]) - 1];
    if (!month) return deadline;
    return `${month} ${Number(match[3])}`;
  }
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function InternshipCard({ match }: { match: MatchResult }) {
  const { internship, score } = match;
  const applyHref = `/apply?url=${encodeURIComponent(internship.url)}&title=${encodeURIComponent(internship.title)}&from=${encodeURIComponent(internship.id)}`;

  return (
    <article className="internship-row">
      <div className="internship-row-main">
        <div className="internship-meta">
          <span className="score-chip">{score}%</span>
          <span>{internship.remote ? "Remote" : "On-site"}</span>
          <span>{formatDeadline(internship.deadline)}</span>
          <span className="source-chip">
            {internship.source === "gemini-search" ? "Live" : "Curated"}
          </span>
        </div>
        <h3>
          <Link href={`/internships/${internship.id}`}>{internship.title}</Link>
        </h3>
        <p className="org-line">
          {internship.org} · {internship.location}
        </p>
      </div>
      <div className="internship-row-actions">
        <Link className="btn-primary" href={applyHref}>
          Apply
        </Link>
        <Link className="btn-secondary" href={`/internships/${internship.id}`}>
          View
        </Link>
      </div>
    </article>
  );
}
