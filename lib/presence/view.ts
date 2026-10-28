import { halfKey, type Half, type HalfDay } from "@/lib/dates/half-days";
import { isWorkingDay, nextWorkingDay, previousWorkingDay, publicHoliday } from "@/lib/dates/working-days";
import { absentHalf, absentWorkingDays, type Absence } from "@/lib/le-point/absences";
import type { Category } from "@/lib/le-point/model";
import type { PresenceProfile } from "@/lib/presence/model";
import { addDays, type Day } from "@/lib/roadmap/days";

/**
 * « Calendrier d’équipe » (JIR-124, lot B2): who is there, who is not, and
 * each developer's tickets in time. Pure rules over a dataset the page
 * loads for one period, so the fixtures and the real read feed the same
 * view. Decisions of 27 October 2026: absences in half-days on the team's
 * calendar; a product person has no ticket; a day away is never idle.
 */

export type Profile = PresenceProfile;
export type PresencePerson = { id: string; name: string; profile: Profile };
export type PresenceBacklog = { id: string; key: string; name: string; color: string; members: string[] };
export type PresenceTicket = {
  id: string;
  key: string;
  title: string;
  type: "composant" | "epic" | "tache" | "soustache";
  kind?: "feature" | "bug";
  points: number | null;
  statusName?: string;
  statusCategory: Category;
  assigneeId: string;
  backlogId: string;
  backlogKey: string;
  /** The day it went « En cours »; the day it was done when it never did. */
  startedAt: Day;
  /** The day it went « Terminé »; null while it is open. */
  doneAt: Day | null;
  /** Some of its journal could not be read: its dates are approximate. */
  historyIncomplete?: boolean;
};
export type PresenceSprint = { id: string; name: string; state: "planned" | "active" | "completed"; start: Day; end: Day | null };
export type PresenceAbsence = { id: string; userId: string; startDate: Day; startHalf: Half; endDate: Day; endHalf: Half };

export type PresenceDataset = {
  today: Day;
  viewerId: string;
  /** The backlogs the viewer may browse, with their members. */
  backlogs: PresenceBacklog[];
  people: PresencePerson[];
  absences: PresenceAbsence[];
  tickets: PresenceTicket[];
  /** By backlog id, those touching the loaded period. */
  sprints: Record<string, PresenceSprint[]>;
  /** The backlogs whose members' absences the viewer may declare. */
  managedBacklogIds: string[];
};

export type Scope = "all" | string;
export type View = "month" | "sprint" | "year";
export type HalfState = "free" | "away" | "future" | "off";
export type Selection = { personId: string; from: HalfDay; to: HalfDay };

const LANES = 2;

export const toAbsences = (absences: PresenceAbsence[]): Absence[] =>
  absences.map((absence) => ({
    id: absence.id, user: absence.userId, start: absence.startDate, startHalf: absence.startHalf, end: absence.endDate, endHalf: absence.endHalf,
  }));

export const scopeBacklog = (data: PresenceDataset, scope: Scope): PresenceBacklog | null =>
  scope === "all" ? null : data.backlogs.find((backlog) => backlog.id === scope) ?? null;

const byName = (a: PresencePerson, b: PresencePerson) => a.name.localeCompare(b.name, "fr");

/** The people of the scope, developers then product, each group by name. */
export function visiblePeople(data: PresenceDataset, scope: Scope): { developers: PresencePerson[]; product: PresencePerson[] } {
  const backlog = scopeBacklog(data, scope);
  const people = data.people.filter((person) => !backlog || backlog.members.includes(person.id));
  return {
    developers: people.filter((person) => person.profile === "developer").sort(byName),
    product: people.filter((person) => person.profile === "product").sort(byName),
  };
}

/** The backlogs a person belongs to, for the tags next to their name in the team view. */
export const backlogsOf = (data: PresenceDataset, personId: string): PresenceBacklog[] =>
  data.backlogs.filter((backlog) => backlog.members.includes(personId));

/** The person's tickets in the scope, earliest start first. */
export function ticketsOf(data: PresenceDataset, personId: string, scope: Scope): PresenceTicket[] {
  return data.tickets
    .filter((ticket) => ticket.assigneeId === personId && (scope === "all" || ticket.backlogId === scope))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.key.localeCompare(b.key, "fr", { numeric: true }));
}

/** The day a ticket's bar ends: when it was done, else today. */
export const ticketUntil = (ticket: PresenceTicket, today: Day): Day => ticket.doneAt ?? today;

/** A ticket is in a period when its bar touches it. */
export const activeIn = (ticket: PresenceTicket, from: Day, to: Day, today: Day) =>
  ticket.startedAt <= to && ticketUntil(ticket, today) >= from;

export const daysOf = (from: Day, to: Day): Day[] => {
  const days: Day[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
};

/** What a half-cell shows: away, away later, free, or not a working day at all. */
export function halfState(absences: Absence[], personId: string, day: Day, half: Half, today: Day): HalfState {
  if (!isWorkingDay(day)) return "off";
  if (!absentHalf(absences, personId, day, half)) return "free";
  return day > today ? "future" : "away";
}

/** One segment of a ticket's bar on a day: which lane, and whether the bar starts, ends or goes on there. */
export type LaneSegment = { lane: number; ticket: PresenceTicket; starts: boolean; ends: boolean; goesOn: boolean };

/**
 * Lays a person's tickets on two lanes, the earliest first, a ticket taking
 * the first lane free after the previous one ended; tickets beyond the two
 * lanes are not drawn, the day's panel lists them all.
 */
export function laneOf(tickets: PresenceTicket[], today: Day): Map<string, number> {
  const lanes = new Map<string, number>();
  const busyUntil: Day[] = [];
  for (const ticket of tickets) {
    const lane = busyUntil.findIndex((until) => until < ticket.startedAt);
    const index = lane === -1 ? busyUntil.length : lane;
    busyUntil[index] = ticketUntil(ticket, today);
    lanes.set(ticket.id, index);
  }
  return lanes;
}

export function segmentsOn(tickets: PresenceTicket[], lanes: Map<string, number>, day: Day, today: Day, to: Day): (LaneSegment | null)[] {
  const segments: (LaneSegment | null)[] = Array.from({ length: LANES }, () => null);
  for (const ticket of tickets) {
    const lane = lanes.get(ticket.id) ?? LANES;
    if (lane >= LANES) continue;
    const until = ticketUntil(ticket, today);
    if (ticket.startedAt > day || until < day) continue;
    segments[lane] = {
      lane, ticket, starts: ticket.startedAt === day, ends: ticket.doneAt === day,
      goesOn: ticket.doneAt === null && (day === until || day === to),
    };
  }
  return segments;
}

/** Working days from a ticket's start to its end (or today), both included. */
export const ticketWorkingDays = (ticket: PresenceTicket, today: Day) =>
  daysOf(ticket.startedAt, ticketUntil(ticket, today)).filter(isWorkingDay).length;

/** Snaps a dragged selection onto working half-days, in order; null when nothing working lies in it. */
export function snapSelection(personId: string, a: HalfDay, b: HalfDay): Selection | null {
  const [from, to] = halfKey(a.day, a.half) <= halfKey(b.day, b.half) ? [a, b] : [b, a];
  let start = { ...from };
  let end = { ...to };
  if (!isWorkingDay(start.day)) start = { day: nextWorkingDay(start.day), half: "am" };
  if (!isWorkingDay(end.day)) end = { day: previousWorkingDay(end.day), half: "pm" };
  if (halfKey(start.day, start.half) > halfKey(end.day, end.half)) return null;
  return { personId, from: start, to: end };
}

/** The working half-days of a selection, in order. */
export function selectionSlots(selection: Selection): HalfDay[] {
  const slots: HalfDay[] = [];
  const low = halfKey(selection.from.day, selection.from.half);
  const high = halfKey(selection.to.day, selection.to.half);
  for (const day of daysOf(selection.from.day, selection.to.day)) {
    if (!isWorkingDay(day)) continue;
    for (const half of ["am", "pm"] as const) {
      const key = halfKey(day, half);
      if (low <= key && key <= high) slots.push({ day, half });
    }
  }
  return slots;
}

/** What a finished drag means: declare the free half-days, take the absent ones off, or nothing when they mix. */
export function selectionOutcome(absences: Absence[], selection: Selection): { kind: "declare" | "remove" | "mixed" | "empty"; days: number } {
  const slots = selectionSlots(selection);
  const absent = slots.filter((slot) => absentHalf(absences, selection.personId, slot.day, slot.half)).length;
  const days = slots.length / 2;
  if (slots.length === 0) return { kind: "empty", days };
  if (absent === 0) return { kind: "declare", days };
  if (absent === slots.length) return { kind: "remove", days };
  return { kind: "mixed", days };
}

/** The absences a removal touches, each with the half-days to take off it. */
export function removalsFor(absences: Absence[], selection: Selection): { absenceId: string; from: HalfDay; to: HalfDay }[] {
  const low = halfKey(selection.from.day, selection.from.half);
  const high = halfKey(selection.to.day, selection.to.half);
  return absences
    .filter((absence) => absence.user === selection.personId && absence.id !== undefined)
    .filter((absence) => halfKey(absence.start, absence.startHalf ?? "am") <= high && low <= halfKey(absence.end, absence.endHalf ?? "pm"))
    .map((absence) => {
      const start = halfKey(absence.start, absence.startHalf ?? "am") >= low
        ? { day: absence.start, half: absence.startHalf ?? "am" }
        : selection.from;
      const end = halfKey(absence.end, absence.endHalf ?? "pm") <= high
        ? { day: absence.end, half: absence.endHalf ?? "pm" }
        : selection.to;
      return { absenceId: absence.id!, from: start, to: end };
    });
}

/**
 * The backlog whose rights let the viewer act on this person's absences:
 * one's own from any backlog one belongs to, a member's from a backlog the
 * viewer administers; null when the viewer may not.
 */
export function rightsBacklogFor(data: PresenceDataset, personId: string): string | null {
  const shared = data.backlogs.filter((backlog) => backlog.members.includes(personId));
  if (personId === data.viewerId) return shared[0]?.id ?? data.backlogs[0]?.id ?? null;
  return shared.find((backlog) => data.managedBacklogIds.includes(backlog.id))?.id ?? null;
}

export type PersonSummary = { away: number; done: number; doing: number };

/** The person's figures over a period: working days away, tickets done, tickets still open. */
export function personSummary(data: PresenceDataset, scope: Scope, personId: string, from: Day, to: Day): PersonSummary {
  const tickets = ticketsOf(data, personId, scope);
  return {
    away: absentWorkingDays(toAbsences(data.absences), personId, from, to),
    done: tickets.filter((ticket) => ticket.doneAt !== null && ticket.doneAt >= from && ticket.doneAt <= to).length,
    doing: tickets.filter((ticket) => ticket.doneAt === null && ticket.startedAt <= to).length,
  };
}

export type SprintBand = { sprint: PresenceSprint | null; span: number; state: PresenceSprint["state"] | null };

/**
 * The sprint bands over a run of days, for the ruler above the grid. A
 * sprint's state is its own, never read off its dates: a sprint closed this
 * morning and its successor started today share the day, and the active one
 * takes it; an active sprint past its target date is still running.
 */
export function sprintBands(days: Day[], sprints: PresenceSprint[]): SprintBand[] {
  const bands: SprintBand[] = [];
  const covering = (day: Day) => {
    const candidates = sprints.filter((sprint) => sprint.start <= day && (sprint.end === null || day <= sprint.end));
    return candidates.find((sprint) => sprint.state === "active") ?? candidates[0] ?? null;
  };
  for (const day of days) {
    const sprint = covering(day);
    const last = bands.at(-1);
    if (last && last.sprint === sprint) last.span += 1;
    else bands.push({ sprint, span: 1, state: sprint?.state ?? null });
  }
  return bands;
}

/** The sprint the sprint view shows: the one asked for, else the active one, else the latest started, else the first. */
export function chooseSprint(sprints: PresenceSprint[], sprintId: string | null, today: Day): PresenceSprint | null {
  const asked = sprintId ? sprints.find((sprint) => sprint.id === sprintId) : undefined;
  if (asked) return asked;
  const active = sprints.find((sprint) => sprint.state === "active");
  if (active) return active;
  return [...sprints].reverse().find((sprint) => sprint.start <= today) ?? sprints[0] ?? null;
}

/** The holiday's name for a day's tooltip, or the weekend. */
export const dayTitle = (day: Day): string | null => publicHoliday(day) ?? (isWorkingDay(day) ? null : "Week-end");
