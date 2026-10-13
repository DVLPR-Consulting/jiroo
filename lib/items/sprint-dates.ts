/**
 * Sprint date fields (JIR-87): each date is entered as a native date input
 * plus an optional time input, so picking a day alone is always enough. Values
 * are read and written in the browser's time zone (Europe/Paris for the team)
 * and stored as UTC instants, as before.
 */

export type DateTimeParts = { date: string; time: string };

/** Field values plus the browser's `validity.badInput` flags (partial entry). */
export type DateTimeEntry = DateTimeParts & {
  dateIncomplete?: boolean;
  timeIncomplete?: boolean;
};

export const DEFAULT_SPRINT_START_TIME = "09:00";
export const DEFAULT_SPRINT_END_TIME = "18:00";
/** Jira's default sprint length when a sprint starts without an end date. */
export const DEFAULT_SPRINT_DURATION_DAYS = 14;

export const SPRINT_DATE_MESSAGES = {
  startRequired: "La date de début est requise.",
  endRequired: "La date de fin est requise.",
  invalidDate: "Date incomplète ou invalide.",
  invalidTime: "Heure incomplète ou invalide.",
  timeWithoutDate: "Indiquez la date correspondant à cette heure.",
  // Same wording as the server-side check in lib/validation/sprint.ts.
  endBeforeStart: "La date de fin doit être postérieure à la date de début.",
} as const;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function part(number: number) {
  return String(number).padStart(2, "0");
}

function parseDate(value: string): [number, number, number] | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Reject days the calendar does not have (31 April, 30 February…).
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    return null;
  }
  return [year, month, day];
}

function parseTime(value: string): [number, number] | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? [hours, minutes] : null;
}

/** Splits a stored instant into local `YYYY-MM-DD` and `HH:mm` field values. */
export function toDateTimeParts(value: string | Date | null): DateTimeParts {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  return {
    date: `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`,
    time: `${part(date.getHours())}:${part(date.getMinutes())}`,
  };
}

/**
 * Local instant for a date and an optional time; an empty time takes
 * `defaultTime`. Null without a date, an Invalid Date for impossible values.
 */
export function toSprintInstant(parts: DateTimeParts, defaultTime: string): Date | null {
  if (!parts.date) return null;
  const day = parseDate(parts.date);
  const clock = parseTime(parts.time || defaultTime);
  if (!day || !clock) return new Date(Number.NaN);
  return new Date(day[0], day[1] - 1, day[2], clock[0], clock[1]);
}

/**
 * Start-dialog prefill, as in Jira: the planned dates when set, otherwise
 * start now and end two weeks (wall-clock) after the start.
 */
export function startSprintDateDefaults(
  plannedStartAt: string | Date | null,
  plannedEndAt: string | Date | null,
  now: Date,
): { start: DateTimeParts; end: DateTimeParts } {
  const start = plannedStartAt ? new Date(plannedStartAt) : now;
  let end: Date;
  if (plannedEndAt) {
    end = new Date(plannedEndAt);
  } else {
    end = new Date(start);
    end.setDate(end.getDate() + DEFAULT_SPRINT_DURATION_DAYS);
  }
  return { start: toDateTimeParts(start), end: toDateTimeParts(end) };
}

function resolveField(
  entry: DateTimeEntry,
  defaultTime: string,
  required: boolean,
  missingMessage: string,
): { error: string } | { instant: Date | null } {
  if (entry.dateIncomplete || (entry.date && !parseDate(entry.date))) {
    return { error: SPRINT_DATE_MESSAGES.invalidDate };
  }
  if (entry.timeIncomplete || (entry.time && !parseTime(entry.time))) {
    return { error: SPRINT_DATE_MESSAGES.invalidTime };
  }
  if (!entry.date) {
    if (entry.time) return { error: SPRINT_DATE_MESSAGES.timeWithoutDate };
    if (required) return { error: missingMessage };
    return { instant: null };
  }
  return { instant: toSprintInstant(entry, defaultTime) };
}

export type SprintDateErrors = { start?: string; end?: string };

export type ResolvedSprintDates =
  | { ok: true; startAt: string | null; endAt: string | null }
  | { ok: false; errors: SprintDateErrors };

/**
 * Client-side check of the sprint date fields, with a French message per
 * field. The server still validates the resulting ISO instants.
 */
export function resolveSprintDates({
  start,
  end,
  required,
}: {
  start: DateTimeEntry;
  end: DateTimeEntry;
  required: boolean;
}): ResolvedSprintDates {
  const startField = resolveField(start, DEFAULT_SPRINT_START_TIME, required, SPRINT_DATE_MESSAGES.startRequired);
  const endField = resolveField(end, DEFAULT_SPRINT_END_TIME, required, SPRINT_DATE_MESSAGES.endRequired);
  const errors: SprintDateErrors = {};
  if ("error" in startField) errors.start = startField.error;
  if ("error" in endField) errors.end = endField.error;
  if ("instant" in startField && "instant" in endField) {
    const startAt = startField.instant;
    const endAt = endField.instant;
    if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
      errors.end = SPRINT_DATE_MESSAGES.endBeforeStart;
    } else {
      return {
        ok: true,
        startAt: startAt ? startAt.toISOString() : null,
        endAt: endAt ? endAt.toISOString() : null,
      };
    }
  }
  return { ok: false, errors };
}
