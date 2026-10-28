import { describe, expect, it } from "vitest";
import { ABSENCE_MAX_DAYS, carveAbsenceInput, daysSpan, declareAbsenceInput, listAbsencesInput } from "@/lib/validation/absence";

const base = { userId: "ana", backlogId: "11111111-1111-4111-8111-111111111111", startDate: "2026-11-03", endDate: "2026-11-07" };
const whole = { startHalf: "am", endHalf: "pm" };

describe("declareAbsenceInput", () => {
  it("accepts whole calendar days, both ends included", () => {
    expect(declareAbsenceInput.parse(base)).toEqual({ ...base, ...whole });
    expect(declareAbsenceInput.parse({ ...base, endDate: "2026-11-03" })).toEqual({ ...base, ...whole, endDate: "2026-11-03" });
    expect(daysSpan("2026-11-03", "2026-11-07")).toBe(5);
    expect(daysSpan("2026-11-03", "2026-11-03")).toBe(1);
  });

  it("refuses an end before the start, a day that does not exist, and more than a year", () => {
    expect(() => declareAbsenceInput.parse({ ...base, endDate: "2026-11-02" })).toThrow("La fin de l’absence précède son début.");
    expect(() => declareAbsenceInput.parse({ ...base, startDate: "2026-02-30", endDate: "2026-03-01" })).toThrow("Date invalide.");
    expect(() => declareAbsenceInput.parse({ ...base, startDate: "3 nov. 2026" })).toThrow("Date invalide.");
    expect(() => declareAbsenceInput.parse({ ...base, endDate: "2027-11-04" })).toThrow("Une absence dure au plus un an.");
    expect(declareAbsenceInput.parse({ ...base, endDate: "2027-11-03" }).endDate).toBe("2027-11-03");
    expect(ABSENCE_MAX_DAYS).toBe(366);
  });

  it("reads half-days, in order, whole days by default", () => {
    const afternoon = { ...base, startDate: "2026-11-03", startHalf: "pm", endDate: "2026-11-03", endHalf: "pm" };
    expect(declareAbsenceInput.parse(afternoon)).toMatchObject({ startHalf: "pm", endHalf: "pm" });
    expect(() => declareAbsenceInput.parse({ ...afternoon, endHalf: "am" })).toThrow("La fin de l’absence précède son début.");
    expect(() => declareAbsenceInput.parse({ ...base, startHalf: "noon" })).toThrow();
    const id = "22222222-2222-4222-8222-222222222222";
    expect(carveAbsenceInput.parse({ id, backlogId: base.backlogId, startDate: "2026-11-04", startHalf: "pm", endDate: "2026-11-05", endHalf: "am" })).toMatchObject({ id, startHalf: "pm", endHalf: "am" });
    expect(() => carveAbsenceInput.parse({ id, backlogId: base.backlogId, startDate: "2026-11-04", endDate: "2026-11-05", endHalf: "am" })).toThrow();
  });

  it("needs a person and a backlog", () => {
    expect(() => declareAbsenceInput.parse({ ...base, userId: " " })).toThrow("Personne requise.");
    expect(() => declareAbsenceInput.parse({ ...base, backlogId: "DEMO" })).toThrow();
  });
});

describe("listAbsencesInput", () => {
  it("keeps a bounded, ordered period", () => {
    expect(listAbsencesInput.parse({ userIds: ["ana", "bo"], startDate: "2026-11-01", endDate: "2026-11-30" }).userIds).toEqual(["ana", "bo"]);
    expect(() => listAbsencesInput.parse({ userIds: [], startDate: "2026-11-30", endDate: "2026-11-01" })).toThrow("La fin de l’absence précède son début.");
  });
});
