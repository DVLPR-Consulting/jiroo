import { describe, expect, it } from "vitest";
import { absentOn, absentUntil, absentWorkingDays, type Absence } from "@/lib/le-point/absences";

// Ana is away Tuesday 3 to Friday 6 November, then again from Monday 9 to Tuesday 10; Bo on Thursday 5.
const absences: Absence[] = [
  { user: "ana", start: "2026-11-03", end: "2026-11-06" },
  { user: "ana", start: "2026-11-09", end: "2026-11-10" },
  { user: "bo", start: "2026-11-05", end: "2026-11-05" },
];

describe("absentOn", () => {
  it("reads whole days, both ends included, for the right person", () => {
    expect(absentOn(absences, "ana", "2026-11-03")).toBe(true);
    expect(absentOn(absences, "ana", "2026-11-06")).toBe(true);
    expect(absentOn(absences, "ana", "2026-11-07")).toBe(false);
    expect(absentOn(absences, "bo", "2026-11-03")).toBe(false);
    expect(absentOn(absences, "cy", "2026-11-05")).toBe(false);
  });
});

describe("absentUntil", () => {
  it("gives the end of the absence, consecutive ones joined", () => {
    expect(absentUntil(absences, "ana", "2026-11-04")).toBe("2026-11-06");
    // The 7th and 8th are a weekend: the two absences are not joined across them.
    expect(absentUntil(absences, "ana", "2026-11-09")).toBe("2026-11-10");
    expect(absentUntil([{ user: "ana", start: "2026-11-03", end: "2026-11-06" }, { user: "ana", start: "2026-11-07", end: "2026-11-12" }], "ana", "2026-11-03")).toBe("2026-11-12");
    expect(absentUntil(absences, "ana", "2026-11-02")).toBeNull();
  });
});

describe("absentWorkingDays", () => {
  it("counts the working days of a period lost to absences", () => {
    expect(absentWorkingDays(absences, "ana", "2026-11-02", "2026-11-13")).toBe(6);
    expect(absentWorkingDays(absences, "ana", "2026-11-05", "2026-11-09")).toBe(3);
    expect(absentWorkingDays(absences, "bo", "2026-11-01", "2026-11-30")).toBe(1);
    expect(absentWorkingDays(absences, "cy", "2026-11-01", "2026-11-30")).toBe(0);
    // A weekend inside an absence does not count.
    expect(absentWorkingDays([{ user: "cy", start: "2026-11-06", end: "2026-11-09" }], "cy", "2026-11-01", "2026-11-30")).toBe(2);
  });
});
