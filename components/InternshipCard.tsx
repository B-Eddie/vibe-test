import Link from "next/link";
import type { MatchResult } from "@/lib/types";

function formatDeadline(deadline: string | null): string {
  if (!deadline) return "Rolling / see posting";
  // Parse as UTC date-only when possible to avoid SSR/client timezone skew.
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
    return `${month} ${Number(match[3])}, ${match[1]}`;
  }
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function InternshipCard({ match }: { match: MatchResult }) {
  const { internship, score, reasons } = match;
  const applyHref = `/apply?url=${encodeURIComponent(internship.url)}&title=${encodeURIComponent(internship.title)}&from=${encodeURIComponent(internship.id)}`;

  return (
    <article className="internship-row">
      <div className="internship-row-main">
        <div className="internship-meta">
          <span className="score-chip">{score}% match</span>
          <span>{internship.remote ? "Remote OK" : "On-site"}</span>
          <span>{formatDeadline(internship.deadline)}</span>
        </div>
        <h3>
          <Link href={`/internships/${internship.id}`}>{internship.title}</Link>
        </h3>
        <p className="org-line">
          {internship.org} · {internship.location}
        </p>
        <p className="desc-line">{internship.description}</p>
        {reasons.length ? (
          <ul className="reason-list">
            {reasons.slice(0, 2).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="internship-row-actions">
        <Link className="btn-primary" href={applyHref}>
          Apply
        </Link>
        <Link className="btn-secondary" href={`/internships/${internship.id}`}>
          Details
        </Link>
      </div>
    </article>
  );
}
