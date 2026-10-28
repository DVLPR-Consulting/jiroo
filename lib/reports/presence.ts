import { countWorkingDays } from "@/lib/dates/working-days";
import { absentWorkingDays, type Absence } from "@/lib/le-point/absences";

/** Person-days on the team's calendar (working days, holidays off), both bounds included. */
export function presenceDays(input: {
  start: string;
  end: string;
  members: readonly string[];
  absences: readonly Absence[];
}): number {
  const weekdays = countWorkingDays(input.start, input.end);
  if (weekdays === 0) return 0;
  const absences = [...input.absences];
  return [...new Set(input.members)].reduce(
    (total, user) => total + weekdays - absentWorkingDays(absences, user, input.start, input.end),
    0,
  );
}
