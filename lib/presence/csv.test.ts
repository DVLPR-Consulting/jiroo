import { describe, expect, it } from "vitest";
import { csvDocument, yearRows, registerRows } from "@/lib/presence/csv";

describe("csvDocument", () => {
  it.each([
    [[], "\uFEFF"],
    [[[]], "\uFEFF"],
    [[["Portée", "Personne"], ["Équipe", "Léa"]], '\uFEFF"Portée";"Personne"\r\n"Équipe";"Léa"'],
    [[["Un titre ; avec \"guillemets\"\net deux lignes"]], '\uFEFF"Un titre ; avec ""guillemets""\net deux lignes"'],
    [[["a\r\nb", ""]], '\uFEFF"a\r\nb";""'],
  ] as const)("quotes every field, preserving its content (%j)", (rows, expected) => {
    expect(csvDocument(rows)).toBe(expected);
  });
});

describe("yearRows", () => {
  it("formats precomputed monthly values without recalculating or ranking", () => {
    expect(yearRows([
      { scope: 'Projet "A"; B', person: "Léa", profile: "developer", month: "octobre 2026", absenceDays: 1.5, startedTickets: 3, completedTickets: 2, points: 13.75 },
      { scope: "Tous les backlogs", person: "Inès", profile: "product", month: "novembre 2026", absenceDays: 0, startedTickets: 0, completedTickets: 0, points: 0 },
    ])).toEqual([
      ["Portée", "Personne", "Rôle", "Mois", "Jours d'absence", "Tickets commencés", "Tickets terminés", "Points"],
      ['Projet "A"; B', "Léa", "Développement", "octobre 2026", "1,5", "3", "2", "13,8"],
      ["Tous les backlogs", "Inès", "Produit", "novembre 2026", "0", "0", "0", "0"],
    ]);
  });
  it("retains only headers for empty data", () => { expect(yearRows([])).toHaveLength(1); });
});

describe("registerRows", () => {
  it("formats half-day labels and precomputed working days", () => {
    expect(registerRows([{ person: "Inès", profile: "product", start: "2026-11-10", startHalf: "pm", end: "2026-11-12", endHalf: "am", workingDays: 1 }])).toEqual([
      ["Personne", "Rôle", "Du", "Demi-journée", "Au", "Demi-journée", "Jours ouvrés"],
      ["Inès", "Produit", "2026-11-10", "après-midi", "2026-11-12", "matin", "1"],
    ]);
  });
  it("keeps half a working day, no thousands separator", () => {
    expect(registerRows([{ person: "Léa", profile: "developer", start: "2026-10-27", startHalf: "am", end: "2026-10-27", endHalf: "am", workingDays: 0.5 }])[1]).toEqual(["Léa", "Développement", "2026-10-27", "matin", "2026-10-27", "matin", "0,5"]);
  });
  it("retains only headers for empty data", () => { expect(registerRows([])).toHaveLength(1); });
});

describe("spreadsheet-safe text", () => {
  it.each(["=1+1", "+SUM(1;2)", "-2+3", "@SUM(1;2)", "  =1+1", "\t=1+1", "\r=1+1", "\n=1+1", "\uFEFF=1+1", "\u0000=1+1"])("neutralizes formula/control prefix %j", (text) => {
    expect(csvDocument([[text]])).toBe('\uFEFF"\'' + text + '"');
  });
  it("protects exported person and scope values, retaining quotes and separators", () => {
    const rows = yearRows([{ scope: '=HYPERLINK("https://example.test";"X")', person: "+1+1", profile: "developer", month: "octobre 2026", absenceDays: 0, startedTickets: 0, completedTickets: 0, points: 0 }]);
    expect(csvDocument(rows)).toContain('"\'=HYPERLINK(""https://example.test"";""X"")";"\'+1+1"');
  });
});
