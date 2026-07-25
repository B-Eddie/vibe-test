import Link from "next/link";
import type { MatchResult } from "@/lib/types";

function formatDeadline(deadline: string | null): string {
  if (!deadline) return "Rolling / see posting";
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InternshipCard({ match }: { match: MatchResult }) {
  const { internship, score, reasons } = match;

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
        <ul className="reason-list">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
      <div className="internship-row-actions">
        <Link className="btn-secondary" href={`/internships/${internship.id}`}>
          Details
        </Link>
        <a
          className="btn-primary"
          href={internship.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Apply link
        </a>
      </div>
    </article>
  );
}
