import { countLabel, formatPoints } from "@/lib/format/plural";
import { workingDaysBetween } from "@/lib/le-point/lights";
import type { Day, LePointDataset, LePointTicket } from "@/lib/le-point/model";

/**
 * « Va-t-on finir ? » (JIR-124): what is left, against the working days left
 * and the people there to do it, in one sentence. Points when the sprint is
 * estimated, tickets otherwise, as the sprint's light counts them. The pace
 * so far reads the same way on the working days gone by. Until absences are
 * known, everyone counted is there every day.
 */
export type Forecast = {
  unit: "points" | "tickets";
  /** Still to do in the sprint's current scope. */
  remaining: number;
  /** Working days from today to the planned end, today included; 0 once the end is past. */
  daysLeft: number;
  /** Working days from the start to yesterday. */
  daysGone: number;
  present: number;
  /** Per person-day, to finish on time; null when nothing is left or nobody has a day left. */
  needed: number | null;
  /** Per person-day so far; null on the first day. */
  pace: number | null;
  overdue: boolean;
  sentence: string;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const round = (value: number) => Math.round(value * 10) / 10;
const shift = (day: Day, days: number): Day => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function sprintForecast(data: LePointDataset, present: number): Forecast | null {
  const sprint = data.sprint;
  if (!sprint) return null;
  const scope = data.tickets.filter((ticket) => !ticket.external && ticket.inSprint);
  if (scope.length === 0) return null;

  const points = (ticket: LePointTicket) => (typeof ticket.points === "number" ? ticket.points : null);
  const unit = sum(scope.map((ticket) => points(ticket) ?? 0)) > 0 ? "points" : "tickets";
  const weight = (ticket: LePointTicket) => (unit === "points" ? points(ticket) ?? 0 : 1);
  const remaining = sum(scope.filter((ticket) => ticket.category !== "done").map(weight));
  const done = sum(scope.filter((ticket) => ticket.category === "done").map(weight));

  const overdue = sprint.end < data.today;
  const daysLeft = overdue ? 0 : workingDaysBetween(shift(data.today, -1), sprint.end);
  const daysGone = data.today <= sprint.start ? 0 : workingDaysBetween(shift(sprint.start, -1), shift(data.today, -1));
  const capacityLeft = daysLeft * present;
  const capacityGone = daysGone * present;
  const needed = remaining > 0 && capacityLeft > 0 ? round(remaining / capacityLeft) : null;
  const pace = capacityGone > 0 ? round(done / capacityGone) : null;

  const amount = (value: number) =>
    unit === "points" ? countLabel(value, "pt", "pts", formatPoints) : countLabel(value, "ticket", "tickets", formatPoints);
  let sentence: string;
  if (remaining === 0) {
    sentence = "Tout le périmètre est terminé.";
  } else if (overdue) {
    sentence = `Reste ${amount(remaining)} après la fin prévue : à terminer, ou à reporter au sprint suivant.`;
  } else if (needed === null) {
    sentence = present === 0
      ? `Reste ${amount(remaining)} pour ${countLabel(daysLeft, "jour ouvré", "jours ouvrés")}, et personne n’a de ticket dans le sprint.`
      : `Reste ${amount(remaining)}, sans jour ouvré avant la fin prévue.`;
  } else {
    const rhythm = pace === null ? " ; premier jour, pas encore de rythme." : `, contre ${amount(pace)} jusqu’ici.`;
    sentence = `Reste ${amount(remaining)} pour ${countLabel(daysLeft, "jour ouvré", "jours ouvrés")} et ${countLabel(present, "personne présente", "personnes présentes")} : il faudrait ${amount(needed)} par jour-personne${rhythm}`;
  }

  return { unit, remaining, daysLeft, daysGone, present, needed, pace, overdue, sentence };
}
