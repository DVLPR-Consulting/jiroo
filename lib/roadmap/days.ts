/**
 * Calendar days as "YYYY-MM-DD" strings, the form of items.start_date,
 * items.due_date and release dates. All arithmetic runs on UTC day numbers,
 * so no time zone or daylight saving change can shift a day.
 */
export type Day = string;

const MS_PER_DAY = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Days since 1970-01-01. */
export function dayNumber(day: Day): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / MS_PER_DAY);
}

export function fromDayNumber(n: number): Day {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isDay(value: unknown): value is Day {
  return typeof value === "string" && DAY_RE.test(value) && fromDayNumber(dayNumber(value)) === value;
}

/** The UTC day of a timestamp. */
export function dayFromDate(date: Date): Day {
  return date.toISOString().slice(0, 10);
}

/**
 * The team's time zone. Sprint instants are entered in local time and
 * "today" must match on the server and in the browser (no hydration drift),
 * so the roadmap reads both in this zone.
 */
export const TEAM_TIME_ZONE = "Europe/Paris";

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** The calendar day of an instant in a time zone. */
export function dayInZone(date: Date, timeZone: string = TEAM_TIME_ZONE): Day {
  let format = dayFormats.get(timeZone);
  if (!format) {
    // en-CA formats as YYYY-MM-DD.
    format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormats.set(timeZone, format);
  }
  return format.format(date);
}

export function addDays(day: Day, days: number): Day {
  return fromDayNumber(dayNumber(day) + days);
}

/** `to` minus `from`, in days. */
export function daysBetween(from: Day, to: Day): number {
  return dayNumber(to) - dayNumber(from);
}

/** Weeks start on Monday, as in France. */
export function startOfWeek(day: Day): Day {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

export function startOfMonth(day: Day): Day {
  return `${day.slice(0, 7)}-01`;
}

export function startOfQuarter(day: Day): Day {
  const month = Number(day.slice(5, 7));
  const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${day.slice(0, 4)}-${String(quarterMonth).padStart(2, "0")}-01`;
}

/** ISO days sort as text. */
export function minDay(days: readonly (Day | null | undefined)[]): Day | null {
  let min: Day | null = null;
  for (const day of days) if (day && (min === null || day < min)) min = day;
  return min;
}

export function maxDay(days: readonly (Day | null | undefined)[]): Day | null {
  let max: Day | null = null;
  for (const day of days) if (day && (max === null || day > max)) max = day;
  return max;
}
