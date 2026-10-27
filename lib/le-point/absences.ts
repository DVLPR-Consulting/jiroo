import { isWorkingDay } from "@/lib/dates/working-days";
import type { Day, LePointDataset } from "@/lib/le-point/model";

/**
 * What the declared absences say about one person (JIR-124): away today,
 * until when, and how many working days a period loses to them. Pure, over
 * the dataset's absences, whole days both ends included.
 */
export type Absence = NonNullable<LePointDataset["absences"]>[number];

const shift = (day: Day, days: number): Day =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const covering = (absences: Absence[], user: string, day: Day) =>
  absences.find((absence) => absence.user === user && absence.start <= day && day <= absence.end);

/** Whether the person is away on that day. */
export function absentOn(absences: Absence[], user: string, day: Day): boolean {
  return covering(absences, user, day) !== undefined;
}

/**
 * The last day of the person's absence covering `day`, consecutive absences
 * joined into one; null when they are there.
 */
export function absentUntil(absences: Absence[], user: string, day: Day): Day | null {
  let current = covering(absences, user, day);
  if (!current) return null;
  for (;;) {
    const next = covering(absences, user, shift(current.end, 1));
    if (!next || next === current) return current.end;
    current = next;
  }
}

/** Working days of `from` to `to`, both included, the person is away. */
export function absentWorkingDays(absences: Absence[], user: string, from: Day, to: Day): number {
  let total = 0;
  for (let day = from; day <= to; day = shift(day, 1)) {
    if (isWorkingDay(day) && absentOn(absences, user, day)) total += 1;
  }
  return total;
}
