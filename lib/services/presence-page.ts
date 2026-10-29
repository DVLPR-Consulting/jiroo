import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { browseAccessPredicate } from "@/lib/auth/accessible-backlogs";
import { checkPermission, listBacklogTeams } from "@/lib/auth/authorization";
import { user } from "@/lib/db/schema/auth";
import { backlogs } from "@/lib/db/schema/domain";
import type { PresenceProfile } from "@/lib/presence/model";
import { db } from "@/lib/db";
import type { items, statuses } from "@/lib/db/schema/domain";
import { dayInZone } from "@/lib/roadmap/days";
import { dayInput } from "@/lib/validation/absence";

const period = z.object({ from: dayInput, to: dayInput }).refine((value) => value.from <= value.to, { message: "La fin précède le début de la période.", path: ["to"] });
const sprintCommand = period.safeExtend({ actorId: z.string().min(1), backlogId: z.uuid() });
const timelineCommand = period.safeExtend({ actorId: z.string().min(1), backlogIds: z.array(z.uuid()) });
const TICKET_LIMIT = 2_000;

export type TicketTimelineEntry = {
  id: string;
  key: string;
  title: string;
  type: typeof items.$inferSelect.type;
  points: number | null;
  statusCategory: typeof statuses.$inferSelect.category;
  assigneeId: string;
  backlogId: string;
  startedAt: string;
  doneAt: string | null;
  historyIncomplete: boolean;
};

export type TicketTimeline = { tickets: TicketTimelineEntry[]; limited: boolean };

/**
 * At most 2,000 assigned, live tickets in the reader's visible backlogs.
 * This is a journal timeline, not a reconstruction of historic assignees:
 * the ticket belongs to its current assignee even after a reassignment.
 * Workflow policy (Claude/Nicolas, JIR-124): a resolvable status's CURRENT
 * category applies to all its transitions. Deleted/name-only references are
 * never guessed. closedAt and the first unresolved status activity supply
 * approximate dates when needed; historyIncomplete exposes every fallback.
 */
export async function loadTicketTimeline(input: {
  actorId: string;
  backlogIds: string[];
  from: string;
  to: string;
}): Promise<TicketTimeline> {
  const command = timelineCommand.parse(input);
  const ids = [...new Set(command.backlogIds)];
  if (ids.length === 0) return { tickets: [], limited: false };
  const today = dayInZone(new Date());
  const result = await db.execute<TicketTimelineEntry>(sql`
    with visible_tickets as (
      select items.id, items.key, items.title, items.type,
        items.estimate_points::double precision as points,
        current_status.category as status_category,
        items.assignee_id, items.backlog_id, items.closed_at
      from items
      join backlogs on backlogs.id = items.backlog_id
      join statuses current_status on current_status.id = items.status_id and current_status.backlog_id = backlogs.id
      where backlogs.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        and backlogs.archived_at is null and ${browseAccessPredicate(command.actorId)}
        and items.deleted_at is null and items.assignee_id is not null
    ), journal_dates as materialized (
      select ticket.id,
        min(change.at) filter (where changed_status.category = 'in_progress') as first_progress,
        max(change.at) filter (where changed_status.category = 'done') as last_done,
        min(change.at) filter (where change.id is not null and changed_status.id is null) as first_unresolved,
        count(change.id) filter (where changed_status.id is null) as unresolved_count
      from visible_tickets ticket
      left join activities change on change.item_id = ticket.id and change.action = 'status_change' and change.field = 'status'
      -- Compare text, never cast a legacy journal value to uuid or infer its category from a name.
      left join statuses changed_status on changed_status.id::text = change.new_value and changed_status.backlog_id = ticket.backlog_id
      group by ticket.id
    ), resolved_tickets as (
      select ticket.*, journal.first_progress, journal.first_unresolved,
        case when ticket.status_category = 'done' then coalesce(journal.last_done, ticket.closed_at) end as done_instant,
        (journal.unresolved_count > 0 or journal.first_progress is null
          or (ticket.status_category = 'done' and journal.last_done is null)) as history_incomplete
      from visible_tickets ticket join journal_dates journal on journal.id = ticket.id
    ), dated_tickets as (
      select id, key, title, type, points,
        status_category as "statusCategory", assignee_id as "assigneeId", backlog_id as "backlogId",
        ((coalesce(first_progress, case when status_category = 'done' then done_instant else first_unresolved end)
          at time zone 'Europe/Paris')::date)::text as "startedAt",
        ((done_instant at time zone 'Europe/Paris')::date)::text as "doneAt",
        history_incomplete as "historyIncomplete"
      from resolved_tickets
    )
    select * from dated_tickets
    where "startedAt" <= ${command.to} and coalesce("doneAt", ${today}) >= ${command.from}
    order by "startedAt", id
    limit ${TICKET_LIMIT + 1}
  `);
  return { tickets: result.rows.slice(0, TICKET_LIMIT), limited: result.rows.length > TICKET_LIMIT };
}


export type PresenceMember = { id: string; name: string; profile: PresenceProfile };
export type PresenceBacklog = { id: string; key: string; name: string; color: string; members: PresenceMember[] };

/** Twelve calendar months, clamping February 29 to February 28. */
function aYearAgo(now: Date): Date {
  const result = new Date(now);
  result.setUTCDate(1);
  result.setUTCFullYear(now.getUTCFullYear() - 1);
  result.setUTCDate(Math.min(now.getUTCDate(), new Date(Date.UTC(result.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()));
  return result;
}

/**
 * Sidebar-visible backlogs and their attached teams (assignable fallback when empty). Without browse_users,
 * only the reader is returned, even if they cannot be assigned work.
 * Nicolas's observed-profile rule: current assignment or an assignment change
 * in the last twelve months means developer, otherwise product. It is never
 * a permission role. A person's profile spans only the backlogs visible here;
 * an assignment in a hidden/archived backlog must not disclose that backlog.
 */
export async function loadPresenceScope(actorId: string): Promise<PresenceBacklog[]> {
  const directory = await checkPermission({ actorId, permission: "browse_users", scope: { type: "global" } });
  const now = new Date();
  return db.transaction(async (tx) => {
    const visible = await tx.select({ id: backlogs.id, key: backlogs.key, name: backlogs.name, color: backlogs.color })
      .from(backlogs).where(and(isNull(backlogs.archivedAt), browseAccessPredicate(actorId))).orderBy(asc(backlogs.name));
    if (visible.length === 0) return [];
    const ids = visible.map((row) => row.id);
    const directoryRows = directory.allowed ? await listBacklogTeams(ids, tx) : null;
    const self = directoryRows === null ? await tx.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, actorId)).limit(1) : [];
    const people = new Set(directoryRows ? directoryRows.map((person) => person.id) : self.map((person) => person.id));
    const observed = people.size === 0 ? [] : (await tx.execute<{ userId: string }>(sql`
      select assignee_id as "userId" from items
      where items.backlog_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) and items.deleted_at is null
        and assignee_id in (${sql.join([...people].map((id) => sql`${id}`), sql`, `)})
      union
      select assignment.user_id as "userId"
      from activities change join items on items.id = change.item_id
      cross join lateral unnest(array[change.old_value, change.new_value]) as assignment(user_id)
      where items.backlog_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        and change.action = 'update' and change.field = 'assignee'
        and change.at >= ${aYearAgo(now)} and change.at <= ${now}
        and assignment.user_id in (${sql.join([...people].map((id) => sql`${id}`), sql`, `)})
    `)).rows;
    const developers = new Set(observed.map((row) => row.userId));
    const members = new Map<string, PresenceMember[]>();
    for (const person of directoryRows ?? []) {
      const group = members.get(person.backlogId) ?? [];
      group.push({ id: person.id, name: person.name, profile: developers.has(person.id) ? "developer" : "product" });
      members.set(person.backlogId, group);
    }
    return visible.map((row) => ({ ...row, members: directoryRows !== null ? members.get(row.id) ?? [] : self.map((person) => ({ ...person, profile: developers.has(person.id) ? "developer" : "product" })) }));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}


export type PresenceSprint = {
  id: string;
  name: string;
  state: "planned" | "active" | "completed";
  start: string;
  end: string | null;
};

/** Actual dates take precedence, as in the sprint review. Unknown ends stay open. */
export async function loadSprintsForPeriod(input: {
  actorId: string;
  backlogId: string;
  from: string;
  to: string;
}): Promise<PresenceSprint[]> {
  const command = sprintCommand.parse(input);
  const result = await db.execute<PresenceSprint>(sql`
    with dated_sprints as (
      select sprints.id, sprints.name, sprints.state,
        ((coalesce(sprints.started_at, sprints.planned_start_at) at time zone 'Europe/Paris')::date)::text as start,
        ((coalesce(sprints.completed_at, sprints.planned_end_at) at time zone 'Europe/Paris')::date)::text as "end"
      from sprints join backlogs on backlogs.id = sprints.backlog_id
      where backlogs.id = ${command.backlogId} and backlogs.archived_at is null and ${browseAccessPredicate(command.actorId)}
    )
    select * from dated_sprints
    where start <= ${command.to} and ("end" is null or "end" >= ${command.from})
    order by start, id
  `);
  return result.rows;
}
