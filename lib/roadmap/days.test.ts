import { describe, expect, it } from "vitest";
import {
  addDays,
  dayFromDate,
  dayInZone,
  dayNumber,
  daysBetween,
  fromDayNumber,
  isDay,
  maxDay,
  minDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from "@/lib/roadmap/days";

describe("calendar days", () => {
  it("round-trips through day numbers, across months and leap years", () => {
    for (const day of ["1970-01-01", "2026-10-15", "2028-02-29", "2026-12-31"]) {
      expect(fromDayNumber(dayNumber(day))).toBe(day);
    }
    expect(dayNumber("1970-01-02")).toBe(1);
  });

  it("adds days and counts the gap between two days", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
  });

  it("ignores daylight saving time", () => {
    // Europe switched clocks on 2026-10-25: still one day.
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("validates the YYYY-MM-DD form", () => {
    expect(isDay("2026-10-15")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-10-15T00:00:00Z")).toBe(false);
    expect(isDay(null)).toBe(false);
  });

  it("reads the UTC day of a timestamp", () => {
    expect(dayFromDate(new Date("2026-10-15T23:30:00Z"))).toBe("2026-10-15");
  });

  it("reads the day of an instant in the team's time zone", () => {
    // 23:30 UTC is already the next day in Paris (UTC+2 in October).
    expect(dayInZone(new Date("2026-10-15T23:30:00Z"))).toBe("2026-10-16");
    expect(dayInZone(new Date("2026-10-15T23:30:00Z"), "UTC")).toBe("2026-10-15");
  });

  it("finds the start of a week (Monday), month and quarter", () => {
    expect(startOfWeek("2026-10-15")).toBe("2026-10-12");
    expect(startOfWeek("2026-10-12")).toBe("2026-10-12");
    expect(startOfWeek("2026-10-18")).toBe("2026-10-12");
    expect(startOfMonth("2026-10-15")).toBe("2026-10-01");
    expect(startOfQuarter("2026-11-15")).toBe("2026-10-01");
    expect(startOfQuarter("2026-03-31")).toBe("2026-01-01");
  });

  it("picks the earliest and latest day, skipping missing ones", () => {
    expect(minDay(["2026-10-15", null, "2026-09-01"])).toBe("2026-09-01");
    expect(maxDay([undefined, "2026-10-15", "2026-12-01"])).toBe("2026-12-01");
    expect(minDay([null])).toBeNull();
  });
});
