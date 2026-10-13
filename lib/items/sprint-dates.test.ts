import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_SPRINT_END_TIME,
  DEFAULT_SPRINT_START_TIME,
  resolveSprintDates,
  startSprintDateDefaults,
  toDateTimeParts,
  toSprintInstant,
} from "./sprint-dates";

// The dialogs read and write dates in the browser's time zone, which is
// Europe/Paris for the team; pin it so DST expectations are deterministic.
const previousTimeZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/Paris";
});
afterAll(() => {
  if (previousTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimeZone;
});

const empty = { date: "", time: "" };

describe("toDateTimeParts", () => {
  it("splits a stored instant into local date and time fields", () => {
    expect(toDateTimeParts("2026-10-15T07:00:00.000Z")).toEqual({ date: "2026-10-15", time: "09:00" });
    expect(toDateTimeParts(new Date("2026-11-03T08:30:00.000Z"))).toEqual({ date: "2026-11-03", time: "09:30" });
  });

  it("leaves both fields empty without a date", () => {
    expect(toDateTimeParts(null)).toEqual(empty);
  });
});

describe("toSprintInstant", () => {
  it("applies the default time to a date entered alone, in Europe/Paris", () => {
    expect(toSprintInstant({ date: "2026-10-15", time: "" }, DEFAULT_SPRINT_START_TIME)?.toISOString())
      .toBe("2026-10-15T07:00:00.000Z");
    expect(toSprintInstant({ date: "2026-10-15", time: "" }, DEFAULT_SPRINT_END_TIME)?.toISOString())
      .toBe("2026-10-15T16:00:00.000Z");
  });

  it("follows the late-October and late-March DST changes", () => {
    // Summer time ends on 25 October 2026 at 03:00 (UTC+2 → UTC+1).
    expect(toSprintInstant({ date: "2026-10-24", time: "" }, DEFAULT_SPRINT_START_TIME)?.toISOString())
      .toBe("2026-10-24T07:00:00.000Z");
    expect(toSprintInstant({ date: "2026-10-25", time: "" }, DEFAULT_SPRINT_START_TIME)?.toISOString())
      .toBe("2026-10-25T08:00:00.000Z");
    expect(toSprintInstant({ date: "2026-10-25", time: "" }, DEFAULT_SPRINT_END_TIME)?.toISOString())
      .toBe("2026-10-25T17:00:00.000Z");
    // Summer time starts on 29 March 2026 at 02:00 (UTC+1 → UTC+2).
    expect(toSprintInstant({ date: "2026-03-28", time: "" }, DEFAULT_SPRINT_START_TIME)?.toISOString())
      .toBe("2026-03-28T08:00:00.000Z");
    expect(toSprintInstant({ date: "2026-03-29", time: "" }, DEFAULT_SPRINT_START_TIME)?.toISOString())
      .toBe("2026-03-29T07:00:00.000Z");
  });

  it("keeps an explicit time", () => {
    expect(toSprintInstant({ date: "2026-10-15", time: "14:30" }, DEFAULT_SPRINT_START_TIME)?.toISOString())
      .toBe("2026-10-15T12:30:00.000Z");
  });

  it("returns null without a date and rejects impossible values", () => {
    expect(toSprintInstant(empty, DEFAULT_SPRINT_START_TIME)).toBeNull();
    expect(Number.isNaN(toSprintInstant({ date: "2026-02-30", time: "" }, "09:00")?.getTime())).toBe(true);
    expect(Number.isNaN(toSprintInstant({ date: "2026-10-15", time: "25:00" }, "09:00")?.getTime())).toBe(true);
    expect(Number.isNaN(toSprintInstant({ date: "15/10/2026", time: "" }, "09:00")?.getTime())).toBe(true);
  });

  it("round-trips a stored instant through its fields", () => {
    const stored = "2026-10-25T08:00:00.000Z";
    expect(toSprintInstant(toDateTimeParts(stored), DEFAULT_SPRINT_START_TIME)?.toISOString()).toBe(stored);
  });
});

describe("startSprintDateDefaults", () => {
  const now = new Date("2026-10-20T08:12:34.000Z"); // 10:12 in Paris

  it("prefills start with now and end two weeks later when the sprint has no dates", () => {
    expect(startSprintDateDefaults(null, null, now)).toEqual({
      start: { date: "2026-10-20", time: "10:12" },
      // Wall-clock two weeks later, across the October DST change.
      end: { date: "2026-11-03", time: "10:12" },
    });
  });

  it("keeps planned dates and completes only the missing one", () => {
    const plannedStart = new Date("2026-10-26T08:00:00.000Z");
    const plannedEnd = new Date("2026-11-06T17:00:00.000Z");
    expect(startSprintDateDefaults(plannedStart, plannedEnd, now)).toEqual({
      start: { date: "2026-10-26", time: "09:00" },
      end: { date: "2026-11-06", time: "18:00" },
    });
    expect(startSprintDateDefaults(plannedStart, null, now)).toEqual({
      start: { date: "2026-10-26", time: "09:00" },
      end: { date: "2026-11-09", time: "09:00" },
    });
    expect(startSprintDateDefaults(null, plannedEnd, now)).toEqual({
      start: { date: "2026-10-20", time: "10:12" },
      end: { date: "2026-11-06", time: "18:00" },
    });
  });
});

describe("resolveSprintDates", () => {
  it("accepts dates entered alone and returns ISO instants", () => {
    expect(resolveSprintDates({
      start: { date: "2026-10-15", time: "" },
      end: { date: "2026-10-29", time: "" },
      required: true,
    })).toEqual({
      ok: true,
      startAt: "2026-10-15T07:00:00.000Z",
      endAt: "2026-10-29T17:00:00.000Z",
    });
  });

  it("accepts a single-day sprint entered without times", () => {
    expect(resolveSprintDates({
      start: { date: "2026-10-15", time: "" },
      end: { date: "2026-10-15", time: "" },
      required: true,
    })).toMatchObject({ ok: true });
  });

  it("allows empty planned dates when they are optional", () => {
    expect(resolveSprintDates({ start: empty, end: empty, required: false }))
      .toEqual({ ok: true, startAt: null, endAt: null });
    expect(resolveSprintDates({ start: { date: "2026-10-15", time: "" }, end: empty, required: false }))
      .toEqual({ ok: true, startAt: "2026-10-15T07:00:00.000Z", endAt: null });
  });

  it("requires both dates to start a sprint", () => {
    expect(resolveSprintDates({ start: empty, end: empty, required: true })).toEqual({
      ok: false,
      errors: {
        start: "La date de début est requise.",
        end: "La date de fin est requise.",
      },
    });
  });

  it("rejects an end that is not after the start", () => {
    const expected = {
      ok: false,
      errors: { end: "La date de fin doit être postérieure à la date de début." },
    };
    expect(resolveSprintDates({
      start: { date: "2026-10-15", time: "" },
      end: { date: "2026-10-14", time: "" },
      required: true,
    })).toEqual(expected);
    expect(resolveSprintDates({
      start: { date: "2026-10-15", time: "10:00" },
      end: { date: "2026-10-15", time: "10:00" },
      required: false,
    })).toEqual(expected);
  });

  it("explains incomplete or invalid fields instead of guessing", () => {
    expect(resolveSprintDates({
      start: { date: "", time: "", dateIncomplete: true },
      end: { date: "2026-10-29", time: "", timeIncomplete: true },
      required: false,
    })).toEqual({
      ok: false,
      errors: {
        start: "Date incomplète ou invalide.",
        end: "Heure incomplète ou invalide.",
      },
    });
    expect(resolveSprintDates({
      start: { date: "2026-02-30", time: "" },
      end: { date: "2026-10-29", time: "25:00" },
      required: false,
    })).toEqual({
      ok: false,
      errors: {
        start: "Date incomplète ou invalide.",
        end: "Heure incomplète ou invalide.",
      },
    });
  });

  it("asks for the date when only a time is entered", () => {
    expect(resolveSprintDates({
      start: { date: "", time: "10:00" },
      end: empty,
      required: false,
    })).toEqual({
      ok: false,
      errors: { start: "Indiquez la date correspondant à cette heure." },
    });
  });
});
