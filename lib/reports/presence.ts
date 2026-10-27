import { absentWorkingDays, type Absence } from "@/lib/le-point/absences";
import { dayNumber } from "@/lib/roadmap/days";

/** Whole Monday–Friday person-days, both bounds included; no holiday calendar. */
export function presenceDays(input: {
  start: string;
  end: string;
  members: readonly string[];
  absences: readonly Absence[];
}): number {
  const first = dayNumber(input.start);
  const last = dayNumber(input.end);
  if (last < first) return 0;
  let weekdays = 0;
  for (let day = first; day <= last; day += 1) {
    const weekday = ((day + 4) % 7 + 7) % 7;
    if (weekday !== 0 && weekday !== 6) weekdays += 1;
  }
  const absences = [...input.absences];
  return [...new Set(input.members)].reduce(
    (total, user) => total + weekdays - absentWorkingDays(absences, user, input.start, input.end),
    0,
  );
}
