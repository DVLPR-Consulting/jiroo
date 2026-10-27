import type { PresenceProfile } from "@/lib/presence/model";

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, useGrouping: false });
const role = (profile: PresenceProfile) => profile === "developer" ? "Développement" : "Produit";

/** CSV quotes do not disable spreadsheet formulas; keep risky prefixes as text. */
function spreadsheetText(value: string): string {
  return /^[\s\u0000-\u001f\u007f\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value) ? `'${value}` : value;
}

/** Excel-compatible UTF-8 CSV: BOM, quoted fields, semicolons, CRLF records. */
export function csvDocument(rows: readonly (readonly string[])[]): string {
  return "\uFEFF" + rows.map((row) => row.map((field) => `"${spreadsheetText(field).replaceAll('"', '""')}"`).join(";")).join("\r\n");
}

export type YearCsvRow = {
  scope: string;
  person: string;
  profile: PresenceProfile;
  month: string;
  absenceDays: number;
  startedTickets: number;
  completedTickets: number;
  points: number;
};

/** One already calculated row per person/month. The caller owns the calendar. */
export function yearRows(input: readonly YearCsvRow[]): string[][] {
  return [
    ["Portée", "Personne", "Rôle", "Mois", "Jours d'absence", "Tickets commencés", "Tickets terminés", "Points"],
    ...input.map((row) => [row.scope, row.person, role(row.profile), row.month, number.format(row.absenceDays), number.format(row.startedTickets), number.format(row.completedTickets), number.format(row.points)]),
  ];
}

export type RegisterCsvRow = {
  person: string;
  profile: PresenceProfile;
  start: string;
  startHalf: "am" | "pm";
  end: string;
  endHalf: "am" | "pm";
  workingDays: number;
};

/** Half-days and working-day totals are supplied, not inferred from B1 records. */
export function registerRows(input: readonly RegisterCsvRow[]): string[][] {
  const half = (value: RegisterCsvRow["startHalf"]) => value === "am" ? "matin" : "après-midi";
  return [
    ["Personne", "Rôle", "Du", "Demi-journée", "Au", "Demi-journée", "Jours ouvrés"],
    ...input.map((row) => [row.person, role(row.profile), row.start, half(row.startHalf), row.end, half(row.endHalf), number.format(row.workingDays)]),
  ];
}
