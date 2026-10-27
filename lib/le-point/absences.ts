import { HALVES, halfKey, type Half, type HalfDay } from "@/lib/dates/half-days";
import { isWorkingDay, nextWorkingDay } from "@/lib/dates/working-days";
import type { Day, LePointDataset } from "@/lib/le-point/model";

/**
 * What the declared absences say about one person (JIR-124): away today,
 * until when, and how many working days a period loses to them. Pure, over
 * the dataset's absences: half-days, both ends included, on the team's
 * calendar (a weekend or a holiday inside an absence is never counted).
 */
export type Absence = NonNullable<LePointDataset["absences"]>[number];

const shift = (day: Day, days: number): Day =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const startKey = (absence: Absence) => halfKey(absence.start, absence.startHalf ?? "am");
const endKey = (absence: Absence) => halfKey(absence.end, absence.endHalf ?? "pm");
const covering = (absences: Absence[], user: string, day: Day, half: Half) => {
  const key = halfKey(day, half);
  return absences.find((absence) => absence.user === user && startKey(absence) <= key && key <= endKey(absence));
};

/** Whether the person is away that half-day. */
export function absentHalf(absences: Absence[], user: string, day: Day, half: Half): boolean {
  return covering(absences, user, day, half) !== undefined;
}

/** Whether the person is away the whole day: a half-day away still counts them present. */
export function absentOn(absences: Absence[], user: string, day: Day): boolean {
  return absentHalf(absences, user, day, "am") && absentHalf(absences, user, day, "pm");
}

/**
 * The last working day of the person's absence covering `day` whole, the
 * following absences joined over weekends and holidays; null when they are
 * there.
 */
export function absentUntil(absences: Absence[], user: string, day: Day): Day | null {
  if (!absentOn(absences, user, day)) return null;
  let last = day;
  for (;;) {
    const next = nextWorkingDay(last);
    if (!absentOn(absences, user, next)) return last;
    last = next;
  }
}

/** Working days of `from` to `to`, both included, the person is away; a half-day counts 0,5. */
export function absentWorkingDays(absences: Absence[], user: string, from: Day, to: Day): number {
  let total = 0;
  for (let day = from; day <= to; day = shift(day, 1)) {
    if (!isWorkingDay(day)) continue;
    for (const half of HALVES) if (absentHalf(absences, user, day, half)) total += 0.5;
  }
  return total;
}

/** The working half-days an absence covers, in order; weekends and holidays left out. */
export function absenceSlots(absence: Absence): HalfDay[] {
  const slots: HalfDay[] = [];
  const first = startKey(absence);
  const last = endKey(absence);
  for (let day = absence.start; day <= absence.end; day = shift(day, 1)) {
    if (!isWorkingDay(day)) continue;
    for (const half of HALVES) {
      const key = halfKey(day, half);
      if (first <= key && key <= last) slots.push({ day, half });
    }
  }
  return slots;
}

const nextSlotKey = ({ day, half }: HalfDay) => (half === "am" ? halfKey(day, "pm") : halfKey(nextWorkingDay(day), "am"));

/**
 * What remains of an absence once the half-days from `from` to `to` are
 * taken off: up to two ranges, each on working half-days, the id dropped.
 */
export function carve(absence: Absence, from: HalfDay, to: HalfDay): Omit<Absence, "id">[] {
  const low = halfKey(from.day, from.half);
  const high = halfKey(to.day, to.half);
  const ranges: (Omit<Absence, "id"> & { startHalf: Half; endHalf: Half })[] = [];
  for (const slot of absenceSlots(absence)) {
    const key = halfKey(slot.day, slot.half);
    if (low <= key && key <= high) continue;
    const last = ranges.at(-1);
    if (last && nextSlotKey({ day: last.end, half: last.endHalf }) === key) {
      last.end = slot.day;
      last.endHalf = slot.half;
    } else {
      ranges.push({ user: absence.user, start: slot.day, startHalf: slot.half, end: slot.day, endHalf: slot.half });
    }
  }
  return ranges;
}
