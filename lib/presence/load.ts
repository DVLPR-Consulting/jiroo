import "server-only";

import { checkPermissions } from "@/lib/auth/authorization";
import { chooseSprint, type PresenceDataset, type PresencePerson, type PresenceSprint, type PresenceTicket, type Scope, type View } from "@/lib/presence/view";
import { addDays, dayInZone, startOfMonth, type Day } from "@/lib/roadmap/days";
import { listAbsences } from "@/lib/services/absences";
import { loadPresenceScope, loadSprintsForPeriod, loadTicketTimeline } from "@/lib/services/presence-page";

/**
 * « Calendrier d’équipe » (JIR-124, lot B2): reads one period for the page,
 * with the reader's own rights. The scope is every backlog they may browse,
 * or one of them; the view is a month, one of that backlog's sprints, or a
 * year. Absences and tickets are read for the period only.
 */

export type PresencePage = {
  data: PresenceDataset;
  scope: Scope;
  view: View;
  anchor: Day;
  period: { from: Day; to: Day };
  /** The sprint shown in the sprint view, and its neighbours for the navigation. */
  sprint: PresenceSprint | null;
  sprints: PresenceSprint[];
  /** The timeline was cut at its limit: the figures are partial. */
  limited: boolean;
};

const DIRECTORY_BATCH = 500;
const SPRINTS_AROUND_DAYS = 45;
const DEFAULT_SPRINT_DAYS = 13;

export const monthPeriod = (anchor: Day) => {
  const from = startOfMonth(anchor);
  return { from, to: addDays(startOfMonth(addDays(from, 31)), -1) };
};
export const yearPeriod = (anchor: Day) => ({ from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` });

export async function loadPresencePage(input: {
  userId: string;
  scopeKey: string | null;
  view: View;
  anchor: Day | null;
  sprintId: string | null;
}): Promise<PresencePage | null> {
  const today = dayInZone(new Date());
  const anchor = input.anchor ?? today;
  const backlogs = await loadPresenceScope(input.userId);
  const scoped = input.scopeKey
    ? backlogs.find((backlog) => backlog.key.toUpperCase() === input.scopeKey!.toUpperCase()) ?? null
    : null;
  if (input.scopeKey && !scoped) return null;
  const scope: Scope = scoped?.id ?? "all";
  const view: View = input.view === "sprint" && !scoped ? "month" : input.view;

  // One profile per person: a developer anywhere is a developer.
  const people = new Map<string, PresencePerson>();
  for (const backlog of backlogs) {
    for (const member of backlog.members) {
      const known = people.get(member.id);
      people.set(member.id, {
        id: member.id, name: member.name,
        profile: known?.profile === "developer" || member.profile === "developer" ? "developer" : "product",
      });
    }
  }

  let sprints: PresenceSprint[] = [];
  let sprint: PresenceSprint | null = null;
  let period = view === "year" ? yearPeriod(anchor) : monthPeriod(anchor);
  if (scoped) {
    const around = view === "sprint"
      ? { from: addDays(anchor, -SPRINTS_AROUND_DAYS), to: addDays(anchor, SPRINTS_AROUND_DAYS) }
      : period;
    sprints = await loadSprintsForPeriod({ actorId: input.userId, backlogId: scoped.id, ...around });
    if (view === "sprint") {
      sprint = chooseSprint(sprints, input.sprintId, today);
      period = sprint ? { from: sprint.start, to: sprint.end ?? addDays(sprint.start, DEFAULT_SPRINT_DAYS) } : monthPeriod(anchor);
    }
  }

  const scopedBacklogs = scoped ? [scoped] : backlogs;
  const personIds = [...new Set(scopedBacklogs.flatMap((backlog) => backlog.members.map((member) => member.id)))];
  const batches = Array.from({ length: Math.ceil(personIds.length / DIRECTORY_BATCH) }, (_, index) =>
    personIds.slice(index * DIRECTORY_BATCH, (index + 1) * DIRECTORY_BATCH));
  const [absenceBatches, timeline, managed] = await Promise.all([
    Promise.all(batches.map((userIds) => listAbsences({ userIds, startDate: period.from, endDate: period.to }))),
    loadTicketTimeline({ actorId: input.userId, backlogIds: scopedBacklogs.map((backlog) => backlog.id), from: period.from, to: period.to }),
    Promise.all(backlogs.map(async (backlog) => {
      const decisions = await checkPermissions({
        actorId: input.userId, permissions: ["administer_backlog", "manage_members"], scope: { type: "backlog", backlogId: backlog.id },
      });
      return [...decisions.values()].some((decision) => decision.allowed) ? [backlog.id] : [];
    })),
  ]);
  const keyOf = new Map(backlogs.map((backlog) => [backlog.id, backlog.key]));
  const tickets: PresenceTicket[] = timeline.tickets.map((ticket) => ({
    id: ticket.id, key: ticket.key, title: ticket.title, type: ticket.type, points: ticket.points,
    statusCategory: ticket.statusCategory, assigneeId: ticket.assigneeId, backlogId: ticket.backlogId,
    backlogKey: keyOf.get(ticket.backlogId) ?? "", startedAt: ticket.startedAt, doneAt: ticket.doneAt,
    ...(ticket.historyIncomplete ? { historyIncomplete: true } : {}),
  }));

  return {
    data: {
      today,
      viewerId: input.userId,
      backlogs: backlogs.map((backlog) => ({
        id: backlog.id, key: backlog.key, name: backlog.name, color: backlog.color, members: backlog.members.map((member) => member.id),
      })),
      people: [...people.values()],
      absences: absenceBatches.flat().map((absence) => ({
        id: absence.id, userId: absence.userId, startDate: absence.startDate, startHalf: absence.startHalf, endDate: absence.endDate, endHalf: absence.endHalf,
      })),
      tickets,
      sprints: scoped ? { [scoped.id]: sprints } : {},
      managedBacklogIds: managed.flat(),
    },
    scope, view, anchor, period, sprint, sprints, limited: timeline.limited,
  };
}
