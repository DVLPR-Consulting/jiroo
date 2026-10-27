import { describe, expect, it } from "vitest";
import { absenceSlots, absentHalf, absentOn, absentUntil, absentWorkingDays, carve, type Absence } from "@/lib/le-point/absences";

// Ana is away Tuesday 3 to Friday 6 November, then again from Monday 9 to Tuesday 10; Bo on Thursday 5.
const absences: Absence[] = [
  { user: "ana", start: "2026-11-03", end: "2026-11-06" },
  { user: "ana", start: "2026-11-09", end: "2026-11-10" },
  { user: "bo", start: "2026-11-05", end: "2026-11-05" },
];
// Cy is away from Tuesday afternoon to Thursday morning.
const halves: Absence[] = [{ user: "cy", start: "2026-11-03", startHalf: "pm", end: "2026-11-05", endHalf: "am" }];

describe("absentOn", () => {
  it("reads whole days, both ends included, for the right person", () => {
    expect(absentOn(absences, "ana", "2026-11-03")).toBe(true);
    expect(absentOn(absences, "ana", "2026-11-06")).toBe(true);
    expect(absentOn(absences, "ana", "2026-11-07")).toBe(false);
    expect(absentOn(absences, "bo", "2026-11-03")).toBe(false);
    expect(absentOn(absences, "cy", "2026-11-05")).toBe(false);
  });

  it("counts a half-day away as present that day, and knows which half", () => {
    expect(absentHalf(halves, "cy", "2026-11-03", "am")).toBe(false);
    expect(absentHalf(halves, "cy", "2026-11-03", "pm")).toBe(true);
    expect(absentHalf(halves, "cy", "2026-11-05", "am")).toBe(true);
    expect(absentHalf(halves, "cy", "2026-11-05", "pm")).toBe(false);
    expect(absentOn(halves, "cy", "2026-11-03")).toBe(false);
    expect(absentOn(halves, "cy", "2026-11-04")).toBe(true);
  });
});

describe("absentUntil", () => {
  it("gives the last working day away, the following absences joined over the weekend", () => {
    // The 7th and 8th are a weekend: Ana is away every working day until the 10th.
    expect(absentUntil(absences, "ana", "2026-11-04")).toBe("2026-11-10");
    expect(absentUntil(absences, "ana", "2026-11-09")).toBe("2026-11-10");
    expect(absentUntil([{ user: "ana", start: "2026-11-03", end: "2026-11-06" }], "ana", "2026-11-03")).toBe("2026-11-06");
    // Thursday 12 to Friday 13 across the Armistice: still one absence.
    expect(absentUntil([{ user: "ana", start: "2026-11-09", end: "2026-11-10" }, { user: "ana", start: "2026-11-12", end: "2026-11-13" }], "ana", "2026-11-09")).toBe("2026-11-13");
    expect(absentUntil(absences, "ana", "2026-11-02")).toBeNull();
    expect(absentUntil(halves, "cy", "2026-11-03")).toBeNull();
    expect(absentUntil(halves, "cy", "2026-11-04")).toBe("2026-11-04");
  });
});

describe("absentWorkingDays", () => {
  it("counts the working days of a period lost to absences, half-days included", () => {
    expect(absentWorkingDays(absences, "ana", "2026-11-02", "2026-11-13")).toBe(6);
    expect(absentWorkingDays(absences, "ana", "2026-11-05", "2026-11-09")).toBe(3);
    expect(absentWorkingDays(absences, "bo", "2026-11-01", "2026-11-30")).toBe(1);
    expect(absentWorkingDays(absences, "cy", "2026-11-01", "2026-11-30")).toBe(0);
    expect(absentWorkingDays(halves, "cy", "2026-11-01", "2026-11-30")).toBe(2);
    // A weekend inside an absence does not count, nor does a holiday.
    expect(absentWorkingDays([{ user: "cy", start: "2026-11-06", end: "2026-11-09" }], "cy", "2026-11-01", "2026-11-30")).toBe(2);
    expect(absentWorkingDays([{ user: "cy", start: "2026-11-10", end: "2026-11-12" }], "cy", "2026-11-01", "2026-11-30")).toBe(2);
  });
});

describe("carve", () => {
  const whole: Absence = { id: "a1", user: "ana", start: "2026-11-09", end: "2026-11-13" };

  it("lists the working half-days of an absence", () => {
    expect(absenceSlots(halves[0]!)).toEqual([
      { day: "2026-11-03", half: "pm" }, { day: "2026-11-04", half: "am" }, { day: "2026-11-04", half: "pm" }, { day: "2026-11-05", half: "am" },
    ]);
    // Wednesday 11 November is a holiday.
    expect(absenceSlots(whole).map((slot) => slot.day)).toEqual(["2026-11-09", "2026-11-09", "2026-11-10", "2026-11-10", "2026-11-12", "2026-11-12", "2026-11-13", "2026-11-13"]);
  });

  it("takes a half-day, a day or an inside stretch off, and keeps what remains on working half-days", () => {
    expect(carve(whole, { day: "2026-11-10", half: "pm" }, { day: "2026-11-10", half: "pm" })).toEqual([
      { user: "ana", start: "2026-11-09", startHalf: "am", end: "2026-11-10", endHalf: "am" },
      { user: "ana", start: "2026-11-12", startHalf: "am", end: "2026-11-13", endHalf: "pm" },
    ]);
    expect(carve(whole, { day: "2026-11-09", half: "am" }, { day: "2026-11-09", half: "pm" })).toEqual([
      { user: "ana", start: "2026-11-10", startHalf: "am", end: "2026-11-13", endHalf: "pm" },
    ]);
    expect(carve(whole, { day: "2026-11-13", half: "pm" }, { day: "2026-11-13", half: "pm" })).toEqual([
      { user: "ana", start: "2026-11-09", startHalf: "am", end: "2026-11-13", endHalf: "am" },
    ]);
    // The holiday in the middle does not split what remains.
    expect(carve(whole, { day: "2026-11-09", half: "am" }, { day: "2026-11-10", half: "am" })).toEqual([
      { user: "ana", start: "2026-11-10", startHalf: "pm", end: "2026-11-13", endHalf: "pm" },
    ]);
    expect(carve(whole, { day: "2026-11-09", half: "am" }, { day: "2026-11-13", half: "pm" })).toEqual([]);
    expect(carve(whole, { day: "2026-11-02", half: "am" }, { day: "2026-11-06", half: "pm" })).toEqual([
      { user: "ana", start: "2026-11-09", startHalf: "am", end: "2026-11-13", endHalf: "pm" },
    ]);
  });
});
