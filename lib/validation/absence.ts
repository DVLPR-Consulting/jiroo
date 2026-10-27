import { z } from "zod";
import { halfKey, type Half } from "@/lib/dates/half-days";

/**
 * A declared absence (JIR-124): from the morning or the afternoon of a day
 * to that of another, both ends included, `YYYY-MM-DD` in the team's
 * calendar. A year at a time at most.
 */
export const halfInput = z.enum(["am", "pm"]);
export const ABSENCE_MAX_DAYS = 366;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar day: 2026-02-30 is refused. */
const isCalendarDay = (value: string) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
export const dayInput = z.string().regex(DAY, "Date invalide.").refine(isCalendarDay, "Date invalide.");

/** Calendar days from `from` to `to`, both included. */
export const daysSpan = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

const END_BEFORE_START = { message: "La fin de l’absence précède son début.", path: ["endDate"] };
const TOO_LONG = { message: "Une absence dure au plus un an.", path: ["endDate"] };
type Span = { startDate: string; endDate: string; startHalf?: Half; endHalf?: Half };
const ordered = (value: Span) =>
  halfKey(value.endDate, value.endHalf ?? "pm") >= halfKey(value.startDate, value.startHalf ?? "am");
const withinAYear = (value: Span) => !ordered(value) || daysSpan(value.startDate, value.endDate) <= ABSENCE_MAX_DAYS;

export const declareAbsenceInput = z
  .object({
    /** Whose absence: the actor's own, or a member's of `backlogId` for its administrators. */
    userId: z.string().trim().min(1, "Personne requise."),
    /** The backlog it is declared from: its rights apply, and its pages are told. */
    backlogId: z.uuid(),
    startDate: dayInput,
    /** The absence starts with the morning or the afternoon of `startDate`; whole days by default. */
    startHalf: halfInput.default("am"),
    endDate: dayInput,
    endHalf: halfInput.default("pm"),
  })
  .refine(ordered, END_BEFORE_START)
  .refine(withinAYear, TOO_LONG);

export const absenceIdInput = z.object({ id: z.uuid(), backlogId: z.uuid() });

/** The half-days to take off an absence, from one to another, both included. */
export const carveAbsenceInput = z
  .object({
    id: z.uuid(),
    backlogId: z.uuid(),
    startDate: dayInput,
    startHalf: halfInput,
    endDate: dayInput,
    endHalf: halfInput,
  })
  .refine(ordered, END_BEFORE_START);

export const listAbsencesInput = z
  .object({
    userIds: z.array(z.string().min(1)).max(500),
    startDate: dayInput,
    endDate: dayInput,
  })
  .refine(ordered, END_BEFORE_START);

export type DeclareAbsenceInput = z.input<typeof declareAbsenceInput>;
