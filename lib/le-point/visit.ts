import type { Day } from "@/lib/le-point/model";

/**
 * « Depuis ta dernière visite » (JIR-107 pilot): the days of the last two
 * visits, kept on the device in a cookie, so the page needs no migration. The
 * cookie reads `previous.current`; either may be empty.
 */
export const VISIT_COOKIE = "jiroo-le-point-visit";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parse(value: string | undefined): { previous: Day | null; current: Day | null } {
  const [previous = "", current = ""] = (value ?? "").split(".");
  return { previous: DAY.test(previous) ? previous : null, current: DAY.test(current) ? current : null };
}

/** The last visit before today, or null on a first visit. */
export function lastVisitBefore(value: string | undefined, today: Day): Day | null {
  const { previous, current } = parse(value);
  if (current && current < today) return current;
  return previous && previous < today ? previous : null;
}

/** The cookie value once today's visit is recorded: unchanged on a second visit the same day. */
export function recordVisit(value: string | undefined, today: Day): string {
  const { previous, current } = parse(value);
  if (current === today) return `${previous ?? ""}.${today}`;
  return `${current && current < today ? current : ""}.${today}`;
}
