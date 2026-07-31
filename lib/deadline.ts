/** Date-only helpers for application deadlines (YYYY-MM-DD preferred). */

function todayUtcDateString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Normalize a deadline to YYYY-MM-DD when possible. */
export function deadlineDateOnly(deadline: string | null): string | null {
  if (!deadline) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline.trim());
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const ms = Date.parse(deadline);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * True when the deadline day is before today (UTC date).
 * Rolling / missing / unparseable deadlines are treated as still open.
 * The deadline day itself is still considered open.
 */
export function isDeadlinePassed(
  deadline: string | null,
  now = new Date(),
): boolean {
  const day = deadlineDateOnly(deadline);
  if (!day) return false;
  return day < todayUtcDateString(now);
}

export function isDeadlineOpen(
  deadline: string | null,
  now = new Date(),
): boolean {
  return !isDeadlinePassed(deadline, now);
}

/** Whole days from today until deadline (negative if passed). Null if unknown. */
export function daysUntilDeadline(
  deadline: string | null,
  now = new Date(),
): number | null {
  const day = deadlineDateOnly(deadline);
  if (!day) return null;
  const today = todayUtcDateString(now);
  const ms =
    Date.parse(`${day}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
