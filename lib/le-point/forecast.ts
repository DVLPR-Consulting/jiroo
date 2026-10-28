import { countLabel, formatPoints } from "@/lib/format/plural";
import { absentOn, absentWorkingDays } from "@/lib/le-point/absences";
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
  /** Person-days left before the planned end, declared absences taken off. */
  personDaysLeft: number;
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

const inSprint = (ticket: LePointTicket) => !ticket.external && ticket.inSprint === true;

/**
 * Who does the sprint's work: every known backlog member, or, without the
 * directory, the distinct holders of open sprint tickets. Someone whose only
 * open tickets sit outside the sprint is not counted.
 */
export function sprintPeople(data: LePointDataset): string[] {
  if (data.members?.length) return data.members.map((member) => member.id);
  const holders = data.tickets
    .filter((ticket) => inSprint(ticket) && ticket.category !== "done" && ticket.assignee !== null)
    .map((ticket) => ticket.assignee as string);
  return [...new Set(holders)];
}

/** Those of the sprint's people not away today. */
export function presentInSprint(data: LePointDataset): number {
  const absences = data.absences ?? [];
  return sprintPeople(data).filter((person) => !absentOn(absences, person, data.today)).length;
}

/**
 * `who` is the sprint's people, their declared absences taken off their
 * days; a plain number stands for that many people there every day.
 */
export function sprintForecast(data: LePointDataset, who: number | string[]): Forecast | null {
  const sprint = data.sprint;
  if (!sprint) return null;
  const scope = data.tickets.filter(inSprint);
  if (scope.length === 0) return null;
  const absences = data.absences ?? [];
  const people = typeof who === "number" ? [] : who;
  const present = typeof who === "number" ? who : people.filter((person) => !absentOn(absences, person, data.today)).length;
  const lost = (from: Day, to: Day) => sum(people.map((person) => absentWorkingDays(absences, person, from, to)));

  const points = (ticket: LePointTicket) => (typeof ticket.points === "number" ? ticket.points : null);
  const unit = sum(scope.map((ticket) => points(ticket) ?? 0)) > 0 ? "points" : "tickets";
  const weight = (ticket: LePointTicket) => (unit === "points" ? points(ticket) ?? 0 : 1);
  const open = scope.filter((ticket) => ticket.category !== "done");
  const remaining = sum(open.map(weight));
  const done = sum(scope.filter((ticket) => ticket.category === "done").map(weight));

  const overdue = sprint.end < data.today;
  const daysLeft = overdue ? 0 : workingDaysBetween(shift(data.today, -1), sprint.end);
  const daysGone = data.today <= sprint.start ? 0 : workingDaysBetween(shift(sprint.start, -1), shift(data.today, -1));
  const capacityLeft = typeof who === "number"
    ? daysLeft * who
    : overdue ? 0 : daysLeft * people.length - lost(data.today, sprint.end);
  const capacityGone = typeof who === "number"
    ? daysGone * who
    : daysGone === 0 ? 0 : daysGone * people.length - lost(sprint.start, shift(data.today, -1));
  const needed = remaining > 0 && capacityLeft > 0 ? round(remaining / capacityLeft) : null;
  const pace = capacityGone > 0 ? round(done / capacityGone) : null;

  const amount = (value: number) =>
    unit === "points" ? countLabel(value, "pt", "pts", formatPoints) : countLabel(value, "ticket", "tickets", formatPoints);
  let sentence: string;
  if (open.length === 0) {
    sentence = "Tout le périmètre est terminé.";
  } else if (remaining === 0) {
    sentence = `Tout ce qui est estimé est terminé, mais ${countLabel(open.length, "ticket reste ouvert", "tickets restent ouverts")}, sans estimation ou à zéro.`;
  } else if (overdue) {
    sentence = `Reste ${amount(remaining)} après la fin prévue : à terminer, ou à reporter au sprint suivant.`;
  } else if (needed === null) {
    const nobody = typeof who === "number" ? who === 0 : people.length === 0;
    sentence = nobody
      ? `Reste ${amount(remaining)} pour ${countLabel(daysLeft, "jour ouvré", "jours ouvrés")}, et personne n’a de ticket dans le sprint.`
      : daysLeft === 0
        ? `Reste ${amount(remaining)}, sans jour ouvré avant la fin prévue.`
        : `Reste ${amount(remaining)} pour ${countLabel(daysLeft, "jour ouvré", "jours ouvrés")}, et personne n’est présent d’ici la fin prévue.`;
  } else {
    const rhythm = pace === null ? " ; premier jour, pas encore de rythme." : `, contre ${amount(pace)} jusqu’ici.`;
    sentence = `Reste ${amount(remaining)} pour ${countLabel(daysLeft, "jour ouvré", "jours ouvrés")} et ${countLabel(present, "personne présente", "personnes présentes")} : il faudrait ${amount(needed)} par jour-personne${rhythm}`;
  }

  return { unit, remaining, daysLeft, daysGone, present, personDaysLeft: capacityLeft, needed, pace, overdue, sentence };
}
