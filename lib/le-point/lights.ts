import { countLabel, formatPoints } from "@/lib/format/plural";
import { absentUntil, absentWorkingDays } from "@/lib/le-point/absences";
import {
  byDue,
  daysFrom,
  duePhrase,
  dueTag,
  formatDay,
  inWorkload,
  openBlockersOf,
  sentence,
  ticketContext,
  type Day,
  type LePointCard,
  type LePointDataset,
  type LePointTicket,
  type Tone,
} from "@/lib/le-point/model";
import { countWorkingDays } from "@/lib/dates/working-days";
import { addDays } from "@/lib/roadmap/days";

/**
 * JIR-124 proof of concept: a traffic light for the active sprint and one per
 * person, read from the facts « Le point » already holds. The thresholds live
 * here, in code; every light says why, with the numbers behind it, so the
 * product owner can judge the rules before they become a feature.
 */

export type LightColor = "green" | "amber" | "red" | "none";

export type Light = {
  color: LightColor;
  /** The sprint's verdict (« En bonne voie », « À surveiller »), a person's fact (« 1 bloqué », « Rien en cours »). */
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
  /** Share of the sprint's current scope under way, 0–100, in `unit`. */
  doingPercent: number;
  unit: "points" | "tickets";
  /** The figures behind the percentages, in `unit`. */
  done: number;
  total: number;
  /** In tickets whatever the unit; `unestimated` only counts when points are the unit. */
  tickets: { done: number; total: number; unestimated: number };
  /** Keys of the open tickets waiting on another one. */
  blocked: string[];
  /** Joined since the start: tickets, their weight in `unit`, and that weight in % of the initial commitment. */
  added: { tickets: number; weight: number; percent: number };
};

/** Percentage points between time elapsed and work done; scope added, in % of the initial commitment. */
export const SPRINT_THRESHOLDS = { red: 25, amber: 10, scopeAdded: 20 } as const;
/** Working days without activity, and tickets in progress at once. */
export const PERSON_THRESHOLDS = { idleDays: 3, stuckDays: 5, wip: 4 } as const;

const TONE: Record<LightColor, Tone> = { green: "success", amber: "warning", red: "danger", none: "neutral" };
const SPRINT_LABEL: Record<LightColor, string> = {
  green: "En bonne voie",
  amber: "À surveiller",
  red: "En retard",
  none: "Rien à évaluer",
};

const light = (color: LightColor, label: string, summary: string, details: string[]): Light =>
  ({ color, label, summary, details, tone: TONE[color] });
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
/** A ratio as a percentage kept to two decimals: compared to the thresholds as is, rounded only to be shown. */
const percent = (ratio: number) => Math.round(ratio * 10_000) / 100;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const present = (line: string | null): line is string => line !== null;

/** Working days after `from`, up to and including `to`, on the team's calendar (holidays off). */
export function workingDaysBetween(from: Day, to: Day): number {
  return countWorkingDays(addDays(from, 1), to);
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
  const elapsed = percent(span <= 0 ? 1 : Math.min(Math.max(position / span, 0), 1));
  const elapsedPercent = Math.round(elapsed);
  const timing = position < 0
    ? `commence le ${formatDay(sprint.start)}`
    : position > span
      ? `fin prévue le ${formatDay(sprint.end)}, dépassée de ${countLabel(position - span, "jour", "jours")}`
      : `jour ${position + 1} sur ${span + 1}`;

  if (scope.length === 0) {
    return {
      ...light("none", SPRINT_LABEL.none, "Le sprint ne contient aucun ticket.", [`${capitalize(timing)}.`]),
      elapsedPercent,
      donePercent: 0,
      doingPercent: 0,
      unit: "tickets",
      done: 0,
      total: 0,
      tickets: { done: 0, total: 0, unestimated: 0 },
      blocked: [],
      added: { tickets: 0, weight: 0, percent: 0 },
    };
  }

  const points = (ticket: LePointTicket) => (typeof ticket.points === "number" ? ticket.points : null);
  const unit = sum(scope.map((ticket) => points(ticket) ?? 0)) > 0 ? "points" : "tickets";
  const weight = (ticket: LePointTicket) => (unit === "points" ? points(ticket) ?? 0 : 1);
  const total = sum(scope.map(weight));
  const done = sum(scope.filter((ticket) => ticket.category === "done").map(weight));
  const doing = sum(scope.filter((ticket) => ticket.category === "in_progress").map(weight));
  const completed = percent(done / total);
  const donePercent = Math.round(completed);
  const doingPercent = Math.round(percent(doing / total));
  const added = scope.filter((ticket) => ticket.addedAfterStart);
  const addedWeight = sum(added.map(weight));
  // Against the scope frozen at the start when it is known, removed tickets
  // included; otherwise against the initial tickets still here.
  const commitment = sprint.commitment
    ? (unit === "points" ? sprint.commitment.points : sprint.commitment.tickets)
    : total - addedWeight;
  const addedShare = percent(commitment > 0 ? addedWeight / commitment : addedWeight > 0 ? 1 : 0);
  const addedPercent = Math.round(addedShare);
  const blocked = scope.filter((ticket) => ticket.category !== "done" && openBlockersOf(ticket, byKey).length > 0);
  const unestimated = unit === "points" ? scope.filter((ticket) => points(ticket) === null).length : 0;
  const gap = elapsed - completed;
  const unitLabel = unit === "points" ? "des points" : "des tickets";
  const progress = `${elapsedPercent} % du temps écoulé pour ${donePercent} % ${unitLabel} terminés`;
  const addedLabel = unit === "points"
    ? countLabel(addedWeight, "point", "points", formatPoints)
    : countLabel(addedWeight, "ticket", "tickets");

  const details = [
    `${elapsedPercent} % du temps écoulé (${timing}), ${donePercent} % ${unitLabel} terminés (${formatPoints(done)} sur ${formatPoints(total)}).`,
    added.length > 0
      ? `${countLabel(added.length, "ticket ajouté", "tickets ajoutés")} depuis le début du sprint : ${addedLabel}, ${addedPercent} % de l’engagement initial.`
      : null,
    blocked.length > 0
      ? `${countLabel(blocked.length, "ticket bloqué", "tickets bloqués")} : ${blocked.map((ticket) => ticket.key).join(", ")}.`
      : null,
    unestimated > 0
      ? `${countLabel(unestimated, "ticket sans estimation", "tickets sans estimation")}, non ${unestimated > 1 ? "comptés" : "compté"}.`
      : null,
    unit === "tickets" ? "Aucun ticket estimé : les tickets sont comptés à la place des points." : null,
  ].filter(present);

  const concerns = [
    gap > SPRINT_THRESHOLDS.amber ? progress : null,
    addedShare > SPRINT_THRESHOLDS.scopeAdded ? `périmètre ajouté de ${addedPercent} %` : null,
    blocked.length > 0 ? countLabel(blocked.length, "ticket bloqué", "tickets bloqués") : null,
  ].filter(present);

  const color: LightColor = gap > SPRINT_THRESHOLDS.red ? "red" : concerns.length > 0 ? "amber" : "green";
  // The verdict is the label; the summary keeps to the facts behind it.
  const ahead = color === "green" && gap < -SPRINT_THRESHOLDS.amber;
  const summary = concerns.length > 0
    ? `${capitalize(concerns.join(", "))}.`
    : ahead
      ? `${capitalize(progress)}.`
      : "Le travail terminé suit le temps écoulé.";
  return {
    ...light(color, ahead ? "En avance" : SPRINT_LABEL[color], summary, details),
    elapsedPercent,
    donePercent,
    doingPercent,
    unit,
    done,
    total,
    tickets: { done: scope.filter((ticket) => ticket.category === "done").length, total: scope.length, unestimated },
    blocked: blocked.map((ticket) => ticket.key),
    added: { tickets: added.length, weight: addedWeight, percent: addedPercent },
  };
}

const workingDays = (count: number) => countLabel(count, "jour ouvré", "jours ouvrés");

const dayAfter = (day: Day): Day => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * One person's light: a load, never a verdict on their work. Read on their
 * open tickets of the active sprint (plus anything of theirs in progress), or
 * on all their committed open tickets without a sprint. A ticket without any
 * known activity is never called idle, and a day away is never an idle day;
 * away today, the pill says until when. The label is the fact (« 1 bloqué »,
 * « Rien en cours »); the colour says how much it matters.
 */
export function personLight(data: LePointDataset, assignee: string): Light {
  const byKey = new Map(data.tickets.map((ticket) => [ticket.key, ticket]));
  const absences = data.absences ?? [];
  const work = data.tickets.filter((ticket) =>
    !ticket.external
    && ticket.assignee === assignee
    && ticket.category !== "done"
    && (data.sprint ? ticket.inSprint || ticket.category === "in_progress" : ticket.committed !== false),
  );
  const inProgress = work.filter((ticket) => ticket.category === "in_progress");
  const blocked = work.filter((ticket) => openBlockersOf(ticket, byKey).length > 0);
  const idleDays = (ticket: LePointTicket) => (ticket.lastActivity
    ? workingDaysBetween(ticket.lastActivity, data.today)
      - absentWorkingDays(absences, assignee, dayAfter(ticket.lastActivity), data.today)
    : 0);
  const stale = inProgress.filter((ticket) => idleDays(ticket) >= PERSON_THRESHOLDS.idleDays);
  const stuck = inProgress.length > 0 && inProgress.every((ticket) => idleDays(ticket) >= PERSON_THRESHOLDS.stuckDays);
  const todo = work.length - inProgress.length;
  // « Since N working days »: every one of these tickets has been idle at least that long.
  const idleSince = (tickets: LePointTicket[]) => Math.min(...tickets.map(idleDays));

  const details = [
    `${countLabel(inProgress.length, "ticket en cours", "tickets en cours")}, ${todo} à faire.`,
    ...stale.map((ticket) => `${ticket.key} en cours sans activité depuis ${workingDays(idleDays(ticket))}.`),
    ...blocked.map((ticket) => `${ticket.key} bloqué.`),
  ];

  const away = absentUntil(absences, assignee, data.today);
  if (away) {
    return light("none", `En congé jusqu’au ${formatDay(away)}`, sentence(`Absence déclarée jusqu’au ${formatDay(away)}`), details);
  }
  if (stuck) {
    const since = idleSince(inProgress);
    return light("red", `Rien ne bouge depuis ${since} j ouvrés`, `Plus rien n’a bougé depuis ${workingDays(since)}.`, details);
  }
  if (inProgress.length >= PERSON_THRESHOLDS.wip) {
    return light("red", `${inProgress.length} en cours`, `${inProgress.length} tickets en cours en même temps.`, details);
  }
  if (stale.length > 0 || blocked.length > 0) {
    const since = stale.length > 0 ? idleSince(stale) : 0;
    // The days stay on the pill while it says one thing only; the summary always keeps them.
    const facts = [
      stale.length > 0
        ? `${countLabel(stale.length, "inactif", "inactifs")}${blocked.length === 0 ? ` depuis ${since} j ouvrés` : ""}`
        : null,
      blocked.length > 0 ? countLabel(blocked.length, "bloqué", "bloqués") : null,
    ].filter(present);
    const concerns = [
      stale.length > 0
        ? `${countLabel(stale.length, "ticket en cours", "tickets en cours")} sans activité depuis ${workingDays(since)}`
        : null,
      blocked.length > 0 ? countLabel(blocked.length, "ticket bloqué", "tickets bloqués") : null,
    ].filter(present);
    return light("amber", facts.join(", "), `${capitalize(concerns.join(", "))}.`, details);
  }
  if (inProgress.length === 0) return light("none", "Rien en cours", "Aucun ticket en cours.", details);
  return light("green", "En rythme", "Ses tickets en cours avancent.", details);
}

/**
 * The tickets behind a workload row, as cards: what each one waits for, how
 * long it has been idle, how late it is. The blocked first, then the idle
 * (the longest first), the work under way, what is still to do by due date,
 * and last what is still to do outside the active sprint, counted in the
 * load but not in the light. The unassigned row lists the tickets the team
 * has committed to.
 */
export function workloadTickets(data: LePointDataset, assignee: string | null): LePointCard[] {
  const { isBlocked, blockedReason, blockedTag, card } = ticketContext(data);
  const absences = data.absences ?? [];
  // The same idle days as the person's light: a day away is never an idle day.
  const idleDays = (ticket: LePointTicket) => (ticket.lastActivity
    ? workingDaysBetween(ticket.lastActivity, data.today)
      - (assignee === null ? 0 : absentWorkingDays(absences, assignee, dayAfter(ticket.lastActivity), data.today))
    : 0);
  const stale = (ticket: LePointTicket) => ticket.category === "in_progress" && idleDays(ticket) >= PERSON_THRESHOLDS.idleDays;
  const outside = (ticket: LePointTicket) => data.sprint !== null && !ticket.inSprint && ticket.category !== "in_progress";
  const IDLE = 1;
  const rank = (ticket: LePointTicket) =>
    isBlocked(ticket) ? 0 : stale(ticket) ? IDLE : ticket.category === "in_progress" ? 2 : outside(ticket) ? 4 : 3;
  const activity = (ticket: LePointTicket) =>
    ticket.lastActivity ? `dernière activité le ${formatDay(ticket.lastActivity)}` : "aucune activité connue";

  // Within a group, only the idle ones are told apart by how long they sat still; the rest by due date.
  return data.tickets
    .filter((ticket) => inWorkload(ticket, assignee))
    .sort((a, b) => {
      const group = rank(a);
      return group - rank(b) || (group === IDLE ? idleDays(b) - idleDays(a) : 0) || byDue(a, b);
    })
    .map((ticket) => {
      if (isBlocked(ticket)) return card(ticket, blockedReason(ticket), blockedTag(ticket), "danger");
      if (stale(ticket)) {
        const idle = idleDays(ticket);
        return card(
          ticket,
          `En cours, sans activité depuis ${workingDays(idle)} (${activity(ticket)}).`,
          `Inactif depuis ${idle} j ouvrés`,
          idle >= PERSON_THRESHOLDS.stuckDays ? "danger" : "warning",
        );
      }
      if (ticket.category === "in_progress") {
        const reason = sentence(`En cours ; ${duePhrase(ticket.due, data.today)} ; ${activity(ticket)}`);
        if (ticket.due) {
          const { tag, tone } = dueTag(ticket.due, data.today);
          return card(ticket, reason, tag, tone);
        }
        return card(ticket, reason, ticket.lastActivity ? `Actif le ${formatDay(ticket.lastActivity)}` : "En cours", "success");
      }
      if (outside(ticket)) return card(ticket, "À faire, en dehors du sprint actif.", "Hors sprint", "neutral");
      const { tag, tone } = dueTag(ticket.due, data.today);
      return card(ticket, sentence(capitalize(duePhrase(ticket.due, data.today))), tag, tone);
    });
}
