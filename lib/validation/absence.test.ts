import { describe, expect, it } from "vitest";
import { ABSENCE_MAX_DAYS, daysSpan, declareAbsenceInput, listAbsencesInput } from "@/lib/validation/absence";

const base = { userId: "ana", backlogId: "11111111-1111-4111-8111-111111111111", startDate: "2026-11-03", endDate: "2026-11-07" };

describe("declareAbsenceInput", () => {
  it("accepts whole calendar days, both ends included", () => {
    expect(declareAbsenceInput.parse(base)).toEqual(base);
    expect(declareAbsenceInput.parse({ ...base, endDate: "2026-11-03" })).toEqual({ ...base, endDate: "2026-11-03" });
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
