import { addDays, dayNumber, type Day } from "@/lib/roadmap/days";

/**
 * The team's working calendar (JIR-124): Monday to Friday, less the French
 * public holidays, fixed in the code as the hierarchy and the statuses are.
 * Every count of working days in Jiroo (Le point, the sprint review, the
 * absences page) reads it, so a day away, an idle day and a person-day
 * always mean the same thing.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Easter Sunday of the year, by the Gregorian algorithm (Meeus, Jones, Butcher). */
export function easterSunday(year: number): Day {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The eleven French public holidays of a year, by day. */
export function frenchPublicHolidays(year: number): ReadonlyMap<Day, string> {
  const easter = easterSunday(year);
  return new Map<Day, string>([
    [`${year}-01-01`, "Jour de l’an"],
    [addDays(easter, 1), "Lundi de Pâques"],
    [`${year}-05-01`, "Fête du Travail"],
    [`${year}-05-08`, "Victoire de 1945"],
    [addDays(easter, 39), "Ascension"],
    [addDays(easter, 50), "Lundi de Pentecôte"],
    [`${year}-07-14`, "Fête nationale"],
    [`${year}-08-15`, "Assomption"],
    [`${year}-11-01`, "Toussaint"],
    [`${year}-11-11`, "Armistice de 1918"],
    [`${year}-12-25`, "Noël"],
  ]);
}

const holidaysByYear = new Map<number, ReadonlyMap<Day, string>>();
function holidaysOf(year: number): ReadonlyMap<Day, string> {
  let holidays = holidaysByYear.get(year);
  if (!holidays) {
    holidays = frenchPublicHolidays(year);
    holidaysByYear.set(year, holidays);
  }
  return holidays;
}

/** The holiday's name when the day is one, null otherwise. */
export function publicHoliday(day: Day): string | null {
  return holidaysOf(Number(day.slice(0, 4))).get(day) ?? null;
}

/** Saturday or Sunday; day 0 (1970-01-01) was a Thursday. */
export function isWeekend(day: Day): boolean {
  const weekday = (dayNumber(day) + 4) % 7;
  return weekday === 0 || weekday === 6;
}

export function isWorkingDay(day: Day): boolean {
  return !isWeekend(day) && publicHoliday(day) === null;
}

/** Working days from `from` to `to`, both included; 0 when `to` precedes `from`. */
export function countWorkingDays(from: Day, to: Day): number {
  let total = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (isWorkingDay(day)) total += 1;
  }
  return total;
}

export function nextWorkingDay(day: Day): Day {
  let next = addDays(day, 1);
  while (!isWorkingDay(next)) next = addDays(next, 1);
  return next;
}

export function previousWorkingDay(day: Day): Day {
  let previous = addDays(day, -1);
  while (!isWorkingDay(previous)) previous = addDays(previous, -1);
  return previous;
}
