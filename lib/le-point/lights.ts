import {
  daysFrom,
  formatDay,
  openBlockersOf,
  type Day,
  type LePointDataset,
  type LePointTicket,
  type Tone,
} from "@/lib/le-point/model";
import { dayNumber } from "@/lib/roadmap/days";

/**
 * JIR-124 proof of concept: a traffic light for the active sprint and one per
 * person, read from the facts « Le point » already holds. The thresholds live
 * here, in code; every light says why, with the numbers behind it, so the
 * product owner can judge the rules before they become a feature.
 */

export type LightColor = "green" | "amber" | "red" | "none";

export type Light = {
  color: LightColor;
  /** « Vert », « À surveiller »… */
  label: string;
  /** Why this colour, in one sentence. */
  summary: string;
  /** The facts behind it, one sentence per line. */
  details: string[];
  tone: Tone;
};

export type SprintLight = Light & {
  /** Share of the sprint's calendar span gone by, 0–100. */
  elapsedPercent: number;
  /** Share of the sprint's current scope done, 0–100, in `unit`. */
  donePercent: number;
  unit: "points" | "tickets";
};

/** Percentage points between time elapsed and work done; scope added, in % of the initial commitment. */
export const SPRINT_THRESHOLDS = { red: 25, amber: 10, scopeAdded: 20 } as const;
/** Working days without activity, and tickets in progress at once. */
export const PERSON_THRESHOLDS = { idleDays: 3, stuckDays: 5, wip: 4 } as const;

const TONE: Record<LightColor, Tone> = { green: "success", amber: "warning", red: "danger", none: "neutral" };
const SPRINT_LABEL: Record<LightColor, string> = { green: "Vert", amber: "Orange", red: "Rouge", none: "Pas de feu" };

const light = (color: LightColor, label: string, summary: string, details: string[]): Light =>
  ({ color, label, summary, details, tone: TONE[color] });
const count = (n: number, singular: string, plural = `${singular}s`) => `${n} ${n > 1 ? plural : singular}`;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
/** « 12 », « 7,5 ». */
const figure = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const present = (line: string | null): line is string => line !== null;

/** Working days (Monday to Friday) after `from`, up to and including `to`. */
export function workingDaysBetween(from: Day, to: Day): number {
  let total = 0;
  for (let n = dayNumber(from) + 1; n <= dayNumber(to); n += 1) {
    const weekday = (n + 4) % 7; // Day 0 (1970-01-01) was a Thursday; 0 is Sunday.
    if (weekday !== 0 && weekday !== 6) total += 1;
  }
  return total;
}

/**
 * The sprint's light, as Jira's « Sprint health » gadget reads it: time
 * elapsed against work done, scope added since the start, blocked tickets.
 * Points when the sprint is estimated, tickets otherwise. Null without an
 * active sprint.
 */
export function sprintLight(data: LePointDataset): SprintLight | null {
  const sprint = data.sprint;
  if (!sprint) return null;
  const byKey = new Map(data.tickets.map((ticket) => [ticket.key, ticket]));
  const scope = data.tickets.filter((ticket) => !ticket.external && ticket.inSprint);

  const span = daysFrom(sprint.start, sprint.end);
  const position = daysFrom(sprint.start, data.today);
  const elapsedPercent = span <= 0 ? 100 : Math.round(Math.min(Math.max(position / span, 0), 1) * 100);
  const timing = position < 0
    ? `commence le ${formatDay(sprint.start)}`
    : position > span
      ? `fin prévue le ${formatDay(sprint.end)}, dépassée de ${count(position - span, "jour")}`
      : `jour ${position + 1} sur ${span + 1}`;

  if (scope.length === 0) {
    return {
      ...light("none", SPRINT_LABEL.none, "Le sprint ne contient aucun ticket.", [`${capitalize(timing)}.`]),
      elapsedPercent,
      donePercent: 0,
      unit: "tickets",
    };
  }

  const points = (ticket: LePointTicket) => (typeof ticket.points === "number" ? ticket.points : null);
  const unit = sum(scope.map((ticket) => points(ticket) ?? 0)) > 0 ? "points" : "tickets";
  const weight = (ticket: LePointTicket) => (unit === "points" ? points(ticket) ?? 0 : 1);
  const total = sum(scope.map(weight));
  const done = sum(scope.filter((ticket) => ticket.category === "done").map(weight));
  const donePercent = Math.round((done / total) * 100);
  const added = scope.filter((ticket) => ticket.addedAfterStart);
  const addedWeight = sum(added.map(weight));
  const initial = total - addedWeight;
  const addedPercent = initial > 0 ? Math.round((addedWeight / initial) * 100) : addedWeight > 0 ? 100 : 0;
  const blocked = scope.filter((ticket) => ticket.category !== "done" && openBlockersOf(ticket, byKey).length > 0);
  const unestimated = unit === "points" ? scope.filter((ticket) => points(ticket) === null).length : 0;
  const gap = elapsedPercent - donePercent;
  const unitLabel = unit === "points" ? "des points" : "des tickets";
  const progress = `${elapsedPercent} % du temps écoulé pour ${donePercent} % ${unitLabel} terminés`;

  const details = [
    `${elapsedPercent} % du temps écoulé (${timing}), ${donePercent} % ${unitLabel} terminés (${figure(done)} sur ${figure(total)}).`,
    added.length > 0
      ? `${count(added.length, "ticket ajouté", "tickets ajoutés")} depuis le début du sprint : ${figure(addedWeight)} ${unit}, ${addedPercent} % de l’engagement initial.`
      : null,
    blocked.length > 0 ? `${count(blocked.length, "ticket bloqué", "tickets bloqués")} : ${blocked.map((ticket) => ticket.key).join(", ")}.` : null,
    unestimated > 0 ? `${count(unestimated, "ticket sans estimation", "tickets sans estimation")}, non ${unestimated > 1 ? "comptés" : "compté"}.` : null,
    unit === "tickets" ? "Aucun ticket estimé : le feu compte les tickets." : null,
  ].filter(present);

  const concerns = [
    gap > SPRINT_THRESHOLDS.amber ? progress : null,
    addedPercent > SPRINT_THRESHOLDS.scopeAdded ? `périmètre ajouté de ${addedPercent} %` : null,
    blocked.length > 0 ? count(blocked.length, "ticket bloqué", "tickets bloqués") : null,
  ].filter(present);

  const color: LightColor = gap > SPRINT_THRESHOLDS.red ? "red" : concerns.length > 0 ? "amber" : "green";
  const summary = color === "red"
    ? `En retard : ${concerns.join(", ")}.`
    : color === "amber"
      ? `À surveiller : ${concerns.join(", ")}.`
      : gap < -SPRINT_THRESHOLDS.amber
        ? `En avance : ${progress}.`
        : "Le travail terminé suit le temps écoulé.";
  return { ...light(color, SPRINT_LABEL[color], summary, details), elapsedPercent, donePercent, unit };
}

/**
 * One person's light: a load, never a verdict on their work. Read on their
 * open tickets of the active sprint (plus anything of theirs in progress), or
 * on all their committed open tickets without a sprint. A ticket without any
 * known activity is never called idle.
 */
export function personLight(data: LePointDataset, assignee: string): Light {
  const byKey = new Map(data.tickets.map((ticket) => [ticket.key, ticket]));
  const work = data.tickets.filter((ticket) =>
    !ticket.external
    && ticket.assignee === assignee
    && ticket.category !== "done"
    && (data.sprint ? ticket.inSprint || ticket.category === "in_progress" : ticket.committed !== false),
  );
  const inProgress = work.filter((ticket) => ticket.category === "in_progress");
  const blocked = work.filter((ticket) => openBlockersOf(ticket, byKey).length > 0);
  const idleDays = (ticket: LePointTicket) => (ticket.lastActivity ? workingDaysBetween(ticket.lastActivity, data.today) : 0);
  const stale = inProgress.filter((ticket) => idleDays(ticket) >= PERSON_THRESHOLDS.idleDays);
  const stuck = inProgress.length > 0 && inProgress.every((ticket) => idleDays(ticket) >= PERSON_THRESHOLDS.stuckDays);
  const todo = work.length - inProgress.length;

  const details = [
    `${count(inProgress.length, "ticket en cours", "tickets en cours")}, ${todo} à faire.`,
    ...stale.map((ticket) => `${ticket.key} en cours sans activité depuis ${count(idleDays(ticket), "jour ouvré", "jours ouvrés")}.`),
    ...blocked.map((ticket) => `${ticket.key} bloqué.`),
  ];

  if (stuck) {
    return light("red", "En difficulté", `Plus rien n’a bougé depuis ${PERSON_THRESHOLDS.stuckDays} jours ouvrés.`, details);
  }
  if (inProgress.length >= PERSON_THRESHOLDS.wip) {
    return light("red", "En difficulté", `${inProgress.length} tickets en cours en même temps.`, details);
  }
  if (stale.length > 0 || blocked.length > 0) {
    const concerns = [
      stale.length > 0
        ? `${count(stale.length, "ticket en cours", "tickets en cours")} sans activité depuis ${PERSON_THRESHOLDS.idleDays} jours ouvrés`
        : null,
      blocked.length > 0 ? count(blocked.length, "ticket bloqué", "tickets bloqués") : null,
    ].filter(present);
    return light("amber", "À surveiller", `${capitalize(concerns.join(", "))}.`, details);
  }
  if (inProgress.length === 0) return light("none", "Disponible", "Aucun ticket en cours.", details);
  return light("green", "En rythme", "Ses tickets en cours avancent.", details);
}
