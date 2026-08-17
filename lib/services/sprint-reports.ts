import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  items,
  sprintEvents,
  sprintReportItems,
  sprintReportSnapshots,
  sprints,
} from "@/lib/db/schema/domain";
import { calculateVelocity } from "@/lib/reports/sprint-calculations";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SprintState = typeof sprints.$inferSelect.state;
type ItemType = typeof items.$inferSelect.type;
type ItemKind = typeof items.$inferSelect.kind;
type EventType = typeof sprintEvents.$inferSelect.eventType;
type StatusCategory = NonNullable<
  typeof sprintReportItems.$inferSelect.finalStatusCategory
>;
type SprintOutcome = typeof sprintReportItems.$inferSelect.finalOutcome;

const reportPageCommand = z.object({
  itemPage: z.number().int().min(1),
  eventPage: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
});

const velocityLimit = z.union([z.literal(7), z.literal(12)]);

export type Page<T> = {
  page: number;
  pageSize: number;
  total: number;
  rows: T[];
};

export type ReportableSprint = {
  id: string;
  name: string;
  goal: string | null;
  state: Extract<SprintState, "active" | "completed">;
  startedAt: Date;
  completedAt: Date | null;
  hasSnapshot: boolean;
};

export type SprintReportMetrics = {
  initialItemCount: number;
  committedPoints: number;
  initialUnestimatedCount: number;
  currentItemCount: number;
  currentScopePoints: number;
  currentUnestimatedCount: number;
  completedItemCount: number;
  completedPoints: number;
  grossPointsAdded: number;
  grossPointsRemoved: number;
  netEstimateDelta: number;
  scopeEventCount: number;
};

export type SprintReportItem = {
  itemId: string | null;
  itemKey: string;
  itemTitle: string;
  itemType: ItemType | null;
  itemKind: ItemKind | null;
  firstJoinedAt: Date;
  finalLeftAt: Date | null;
  initialCommitment: boolean;
  addedAfterStart: boolean;
  removedAfterStart: boolean;
  estimateAtStart: number | null;
  estimateAtFinalParticipation: number | null;
  estimateAtCompletion: number | null;
  statusCategory: StatusCategory | null;
  outcome:
    | SprintOutcome
    | "incomplete";
  destinationSprint: { id: string | null; name: string } | null;
  section: "completed" | "incomplete" | "removed" | "carried";
};

export type SprintReportEvent = {
  id: string;
  sequence: bigint;
  eventType: EventType;
  occurredAt: Date;
  actor: { id: string; name: string };
  itemId: string | null;
  itemKey: string | null;
  itemTitle: string | null;
  previousEstimate: number | null;
  nextEstimate: number | null;
  previousDone: boolean | null;
  nextDone: boolean | null;
  relatedSprint: { id: string | null; name: string } | null;
  removalReason: typeof sprintEvents.$inferSelect.removalReason;
};

export type SprintReportSections = {
  completed: number;
  incomplete: number;
  removed: number;
  carried: number;
};

type ReportSprintIdentity = {
  id: string;
  name: string;
  goal: string | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
};

export type ActiveSprintReport = {
  kind: "active";
  statusLabel: "Données en cours";
  sprint: ReportSprintIdentity;
  metrics: SprintReportMetrics;
  items: Page<SprintReportItem>;
  events: Page<SprintReportEvent>;
  sections: SprintReportSections;
};

export type CompletedSprintReport = {
  kind: "completed";
  statusLabel: "Historique figé";
  snapshotAt: Date;
  sprint: ReportSprintIdentity;
  metrics: SprintReportMetrics;
  items: Page<SprintReportItem>;
  events: Page<SprintReportEvent>;
  sections: SprintReportSections;
  finalDestinationSummary: {
    backlog: number;
    sprints: Array<{ id: string | null; name: string; count: number }>;
  };
};

export type LegacySprintReport = {
  kind: "legacy_unavailable";
  statusLabel: "Historique détaillé indisponible";
  sprint: ReportableSprint;
};

export type SprintReport =
  | ActiveSprintReport
  | CompletedSprintReport
  | LegacySprintReport;

export type VelocityBar = {
  sprintId: string;
  sprintName: string;
  completedAt: Date;
  committedPoints: number | null;
  completedPoints: number | null;
  includedInAverage: boolean;
  excludedReason: "no_point_data" | "history_unavailable" | null;
};

export type VelocityReport = {
  state: "ready" | "empty";
  label: "Pas encore de vélocité" | null;
  limit: 7 | 12;
  bars: VelocityBar[];
  population: number;
  averageCompletedPoints: number | null;
};

export class InconsistentSprintReportError extends Error {
  constructor() {
    super("Le rapport de sprint est temporairement indisponible.");
    this.name = "InconsistentSprintReportError";
  }
}

export async function listReportableSprints(backlogId: string): Promise<{
  sprints: ReportableSprint[];
  plannedCount: number;
}> {
  const [rows, plannedRows] = await Promise.all([
    db
      .select({
        id: sprints.id,
        name: sprints.name,
        goal: sprints.goal,
        state: sprints.state,
        startedAt: sprints.startedAt,
        completedAt: sprints.completedAt,
        snapshotId: sprintReportSnapshots.id,
      })
      .from(sprints)
      .leftJoin(
        sprintReportSnapshots,
        and(
          eq(sprintReportSnapshots.backlogId, sprints.backlogId),
          eq(sprintReportSnapshots.sprintId, sprints.id),
        ),
      )
      .where(
        and(
          eq(sprints.backlogId, backlogId),
          inArray(sprints.state, ["active", "completed"]),
        ),
      )
      .orderBy(
        asc(sql<number>`case when ${sprints.state} = 'active' then 0 else 1 end`),
        desc(sprints.completedAt),
        desc(sprints.id),
      ),
    db
      .select({ total: count() })
      .from(sprints)
      .where(and(eq(sprints.backlogId, backlogId), eq(sprints.state, "planned"))),
  ]);
  return {
    sprints: rows.flatMap((row) => {
      if (
        (row.state !== "active" && row.state !== "completed") ||
        !row.startedAt
      ) {
        return [];
      }
      return [{
        id: row.id,
        name: row.name,
        goal: row.goal,
        state: row.state,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        hasSnapshot: row.snapshotId !== null,
      }];
    }),
    plannedCount: plannedRows[0]?.total ?? 0,
  };
}

async function readSprintEventPageWithExecutor(
  tx: Tx,
  backlogId: string,
  sprintId: string,
  page: number,
  pageSize: number,
): Promise<Page<SprintReportEvent>> {
  const where = and(
    eq(sprintEvents.backlogId, backlogId),
    eq(sprintEvents.sprintId, sprintId),
  );
  const rows = await tx
      .select({
        id: sprintEvents.id,
        sequence: sprintEvents.sequence,
        eventType: sprintEvents.eventType,
        occurredAt: sprintEvents.occurredAt,
        actorId: sprintEvents.actorId,
        actorName: user.name,
        sourceItemId: items.id,
        itemKey: sprintEvents.itemKey,
        itemTitle: sprintEvents.itemTitle,
        previousEstimate: sprintEvents.previousEstimate,
        nextEstimate: sprintEvents.nextEstimate,
        previousDone: sprintEvents.previousDone,
        nextDone: sprintEvents.nextDone,
        relatedSprintId: sprintEvents.relatedSprintId,
        relatedSprintName: sprintEvents.relatedSprintName,
        removalReason: sprintEvents.removalReason,
      })
      .from(sprintEvents)
      .innerJoin(user, eq(user.id, sprintEvents.actorId))
      .leftJoin(
        items,
        and(
          eq(items.id, sprintEvents.itemId),
          eq(items.backlogId, backlogId),
          isNull(items.deletedAt),
        ),
      )
      .where(where)
      .orderBy(desc(sprintEvents.occurredAt), desc(sprintEvents.sequence))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
  const totalRows = await tx
    .select({ total: count() })
    .from(sprintEvents)
    .where(where);
  return {
    page,
    pageSize,
    total: totalRows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      eventType: row.eventType,
      occurredAt: row.occurredAt,
      actor: { id: row.actorId, name: row.actorName },
      itemId: row.sourceItemId,
      itemKey: row.itemKey,
      itemTitle: row.itemTitle,
      previousEstimate: row.previousEstimate,
      nextEstimate: row.nextEstimate,
      previousDone: row.previousDone,
      nextDone: row.nextDone,
      relatedSprint:
        row.relatedSprintName === null
          ? null
          : { id: row.relatedSprintId, name: row.relatedSprintName },
      removalReason: row.removalReason,
    })),
  };
}

export function readSprintEventPage(
  backlogId: string,
  sprintId: string,
  pageInput: number,
  pageSizeInput: number,
): Promise<Page<SprintReportEvent>>;
export function readSprintEventPage(
  backlogId: string,
  sprintId: string,
  pageInput: number,
  pageSizeInput: number,
  tx: Tx,
): Promise<Page<SprintReportEvent>>;
export async function readSprintEventPage(
  backlogId: string,
  sprintId: string,
  pageInput: number,
  pageSizeInput: number,
  tx?: Tx,
): Promise<Page<SprintReportEvent>> {
  const page = Math.max(1, Math.trunc(pageInput) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.trunc(pageSizeInput) || 1));
  if (tx) {
    return readSprintEventPageWithExecutor(tx, backlogId, sprintId, page, pageSize);
  }
  return db.transaction(
    (eventTx) => readSprintEventPageWithExecutor(
      eventTx,
      backlogId,
      sprintId,
      page,
      pageSize,
    ),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

type ActiveMetricsRow = {
  initialItemCount: number;
  committedPoints: number;
  initialUnestimatedCount: number;
  openMembershipCount: number;
  joinedItemCount: number;
  joinedStatusCount: number;
  currentItemCount: number;
  currentScopePoints: number;
  currentUnestimatedCount: number;
  completedItemCount: number;
  completedPoints: number;
};

type ScopeMetricsRow = {
  grossPointsAdded: number;
  grossPointsRemoved: number;
  netEstimateDelta: number;
  scopeEventCount: number;
};

const activeParticipantCte = (
  backlogId: string,
  sprintId: string,
  pagination?: { limit: number; offset: number },
) => sql`
  with membership_keys as (
    select
      si.id,
      si.item_id,
      source_item.key as item_key,
      si.joined_at,
      si.left_at,
      si.estimate_at_start,
      exists (
        select 1 from sprint_events added_event
        where added_event.sprint_id = si.sprint_id
          and added_event.source_membership_id = si.id
          and added_event.event_type = 'item_added'
      ) as added,
      exists (
        select 1 from sprint_events removed_event
        where removed_event.sprint_id = si.sprint_id
          and removed_event.source_membership_id = si.id
          and removed_event.event_type = 'item_removed'
      ) as removed
    from sprint_items si
    join items source_item
      on source_item.id = si.item_id and source_item.backlog_id = ${backlogId}
    where si.sprint_id = ${sprintId}
      and (
        si.left_at is null
        or si.estimate_at_start is not null
        or exists (
          select 1 from sprint_events participant_event
          where participant_event.sprint_id = si.sprint_id
            and participant_event.source_membership_id = si.id
        )
      )
  ),
  participant_keys as (
    select item_key from membership_keys
    union
    select item_key from sprint_events
    where backlog_id = ${backlogId} and sprint_id = ${sprintId} and item_key is not null
  ),
  selected_participant_keys as (
    select item_key from participant_keys
    order by item_key
    ${pagination
      ? sql`limit ${pagination.limit} offset ${pagination.offset}`
      : sql``}
  ),
  relevant_memberships as (
    select
      membership_keys.*,
      source_item.title as item_title,
      source_item.type as item_type,
      source_item.kind as item_kind,
      source_item.estimate_points as current_estimate,
      source_item.deleted_at,
      source_status.category as status_category
    from membership_keys
    join selected_participant_keys
      on selected_participant_keys.item_key = membership_keys.item_key
    join items source_item
      on source_item.id = membership_keys.item_id
      and source_item.backlog_id = ${backlogId}
    join statuses source_status
      on source_status.id = source_item.status_id
      and source_status.backlog_id = ${backlogId}
  )
`;

type ActiveParticipantRow = {
  itemId: string | null;
  itemKey: string;
  itemTitle: string;
  itemType: ItemType | null;
  itemKind: ItemKind | null;
  firstJoinedAt: string;
  finalLeftAt: string | null;
  initialCommitment: boolean;
  addedAfterStart: boolean;
  removedAfterStart: boolean;
  estimateAtStart: number | null;
  estimateAtFinalParticipation: number | null;
  statusCategory: StatusCategory | null;
  outcome: "completed" | "incomplete" | "removed";
};

async function readActiveItems(
  tx: Tx,
  backlogId: string,
  sprintId: string,
  page: number,
  pageSize: number,
): Promise<{ page: Page<SprintReportItem>; sections: SprintReportSections }> {
  const summarySql = sql`
    select
      selected_participant_keys.item_key as "itemKey",
      coalesce(
        (select rm.item_title from relevant_memberships rm
          where rm.item_key = selected_participant_keys.item_key
          order by rm.joined_at desc, rm.id desc limit 1),
        (select se.item_title from sprint_events se
          where se.backlog_id = ${backlogId} and se.sprint_id = ${sprintId}
            and se.item_key = selected_participant_keys.item_key
          order by se.occurred_at desc, se.sequence desc limit 1)
      ) as "itemTitle",
      (select case when rm.deleted_at is null then rm.item_id else null end
        from relevant_memberships rm
        where rm.item_key = selected_participant_keys.item_key
        order by rm.joined_at desc, rm.id desc limit 1) as "itemId",
      (select rm.item_type from relevant_memberships rm
        where rm.item_key = selected_participant_keys.item_key
        order by rm.joined_at desc, rm.id desc limit 1) as "itemType",
      (select rm.item_kind from relevant_memberships rm
        where rm.item_key = selected_participant_keys.item_key
        order by rm.joined_at desc, rm.id desc limit 1) as "itemKind",
      coalesce(
        (select min(rm.joined_at) from relevant_memberships rm
          where rm.item_key = selected_participant_keys.item_key),
        (select min(se.occurred_at) from sprint_events se
          where se.backlog_id = ${backlogId} and se.sprint_id = ${sprintId}
            and se.item_key = selected_participant_keys.item_key)
      ) as "firstJoinedAt",
      case when exists (
        select 1 from relevant_memberships rm
        where rm.item_key = selected_participant_keys.item_key and rm.left_at is null
      ) then null else coalesce(
        (select max(rm.left_at) from relevant_memberships rm
          where rm.item_key = selected_participant_keys.item_key),
        (select max(se.occurred_at) from sprint_events se
          where se.backlog_id = ${backlogId} and se.sprint_id = ${sprintId}
            and se.item_key = selected_participant_keys.item_key and se.event_type = 'item_removed')
      ) end as "finalLeftAt",
      exists (
        select 1 from relevant_memberships rm
        where rm.item_key = selected_participant_keys.item_key and not rm.added
      ) as "initialCommitment",
      exists (
        select 1 from sprint_events se
        where se.backlog_id = ${backlogId} and se.sprint_id = ${sprintId}
          and se.item_key = selected_participant_keys.item_key and se.event_type = 'item_added'
      ) as "addedAfterStart",
      exists (
        select 1 from sprint_events se
        where se.backlog_id = ${backlogId} and se.sprint_id = ${sprintId}
          and se.item_key = selected_participant_keys.item_key and se.event_type = 'item_removed'
      ) as "removedAfterStart",
      (select rm.estimate_at_start from relevant_memberships rm
        where rm.item_key = selected_participant_keys.item_key and not rm.added
        order by rm.joined_at, rm.id limit 1) as "estimateAtStart",
      case when exists (
        select 1 from relevant_memberships rm
        where rm.item_key = selected_participant_keys.item_key and rm.left_at is null
      ) then (
        (select rm.current_estimate from relevant_memberships rm
          where rm.item_key = selected_participant_keys.item_key and rm.left_at is null
          order by rm.joined_at desc, rm.id desc limit 1)
      ) else (
        (select se.previous_estimate from sprint_events se
          where se.backlog_id = ${backlogId} and se.sprint_id = ${sprintId}
            and se.item_key = selected_participant_keys.item_key and se.event_type = 'item_removed'
          order by se.occurred_at desc, se.sequence desc limit 1)
      ) end::double precision as "estimateAtFinalParticipation",
      (select rm.status_category from relevant_memberships rm
        where rm.item_key = selected_participant_keys.item_key and rm.left_at is null
        order by rm.joined_at desc, rm.id desc limit 1) as "statusCategory",
      case
        when not exists (select 1 from relevant_memberships rm
          where rm.item_key = selected_participant_keys.item_key and rm.left_at is null)
          then 'removed'
        when (select rm.status_category from relevant_memberships rm
          where rm.item_key = selected_participant_keys.item_key and rm.left_at is null
          order by rm.joined_at desc, rm.id desc limit 1) = 'done'
          then 'completed'
        else 'incomplete'
      end as outcome
    from selected_participant_keys
  `;
  const pageResult = await tx.execute<ActiveParticipantRow>(sql`
      ${activeParticipantCte(backlogId, sprintId, {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })}
      ${summarySql}
      order by "itemKey"
    `);
  const countResult = await tx.execute<{
      total: number;
      completed: number;
      incomplete: number;
      removed: number;
    }>(sql`
      ${activeParticipantCte(backlogId, sprintId)}, participant_summary as (${summarySql})
      select
        count(*)::int as total,
        count(*) filter (where outcome = 'completed')::int as completed,
        count(*) filter (where outcome = 'incomplete')::int as incomplete,
        count(*) filter (where outcome = 'removed')::int as removed
      from participant_summary
    `);
  const totals = countResult.rows[0] ?? {
    total: 0,
    completed: 0,
    incomplete: 0,
    removed: 0,
  };
  return {
    page: {
      page,
      pageSize,
      total: totals.total,
      rows: pageResult.rows.map((row) => ({
        ...row,
        firstJoinedAt: new Date(row.firstJoinedAt),
        finalLeftAt: row.finalLeftAt ? new Date(row.finalLeftAt) : null,
        estimateAtCompletion:
          row.outcome === "completed" ? row.estimateAtFinalParticipation : null,
        destinationSprint: null,
        section: row.outcome,
      })),
    },
    sections: {
      completed: totals.completed,
      incomplete: totals.incomplete,
      removed: totals.removed,
      carried: 0,
    },
  };
}

async function readActiveReport(
  tx: Tx,
  sprint: typeof sprints.$inferSelect,
  backlogId: string,
  command: z.infer<typeof reportPageCommand>,
): Promise<ActiveSprintReport> {
  const metricsResult = await tx.execute<ActiveMetricsRow>(sql`
      with relevant_memberships as (
        select si.*,
          exists (
            select 1 from sprint_events added_event
            where added_event.sprint_id = si.sprint_id
              and added_event.source_membership_id = si.id
              and added_event.event_type = 'item_added'
          ) as added
        from sprint_items si
        where si.sprint_id = ${sprint.id}
          and (
            si.left_at is null or si.estimate_at_start is not null or exists (
              select 1 from sprint_events participant_event
              where participant_event.sprint_id = si.sprint_id
                and participant_event.source_membership_id = si.id
            )
          )
      ), initial_metrics as (
        select
          count(*) filter (where not added)::int as initial_item_count,
          coalesce(sum(estimate_at_start) filter (where not added), 0)::double precision as committed_points,
          count(*) filter (where not added and estimate_at_start is null)::int as initial_unestimated_count
        from relevant_memberships
      ), current_metrics as (
        select
          count(si.id)::int as open_membership_count,
          count(current_item.id)::int as joined_item_count,
          count(current_status.id)::int as joined_status_count,
          count(current_item.id)::int as current_item_count,
          coalesce(sum(current_item.estimate_points), 0)::double precision as current_scope_points,
          count(current_item.id) filter (where current_item.estimate_points is null)::int as current_unestimated_count,
          count(current_item.id) filter (where current_status.category = 'done')::int as completed_item_count,
          coalesce(sum(current_item.estimate_points) filter (where current_status.category = 'done'), 0)::double precision as completed_points
        from sprint_items si
        left join items current_item
          on current_item.id = si.item_id
          and current_item.backlog_id = ${backlogId}
          and current_item.type = 'tache'
          and current_item.deleted_at is null
        left join statuses current_status
          on current_status.id = current_item.status_id
          and current_status.backlog_id = ${backlogId}
        where si.sprint_id = ${sprint.id} and si.left_at is null
      )
      select
        initial_item_count as "initialItemCount",
        committed_points as "committedPoints",
        initial_unestimated_count as "initialUnestimatedCount",
        open_membership_count as "openMembershipCount",
        joined_item_count as "joinedItemCount",
        joined_status_count as "joinedStatusCount",
        current_item_count as "currentItemCount",
        current_scope_points as "currentScopePoints",
        current_unestimated_count as "currentUnestimatedCount",
        completed_item_count as "completedItemCount",
        completed_points as "completedPoints"
      from initial_metrics cross join current_metrics
    `);
  const scopeResult = await tx.execute<ScopeMetricsRow>(sql`
      select
        coalesce(sum(coalesce(next_estimate, 0)) filter (where event_type = 'item_added'), 0)::double precision as "grossPointsAdded",
        coalesce(sum(coalesce(previous_estimate, 0)) filter (where event_type = 'item_removed'), 0)::double precision as "grossPointsRemoved",
        coalesce(sum(coalesce(next_estimate, 0) - coalesce(previous_estimate, 0)) filter (where event_type = 'estimate_changed'), 0)::double precision as "netEstimateDelta",
        count(*) filter (where event_type in ('item_added', 'item_removed', 'estimate_changed'))::int as "scopeEventCount"
      from sprint_events
      where backlog_id = ${backlogId} and sprint_id = ${sprint.id}
    `);
  const itemResult = await readActiveItems(
    tx,
    backlogId,
    sprint.id,
    command.itemPage,
    command.pageSize,
  );
  const events = await readSprintEventPage(
    backlogId,
    sprint.id,
    command.eventPage,
    command.pageSize,
    tx,
  );
  const metrics = metricsResult.rows[0];
  const scope = scopeResult.rows[0];
  if (
    !metrics ||
    !scope ||
    metrics.openMembershipCount !== metrics.joinedItemCount ||
    metrics.openMembershipCount !== metrics.joinedStatusCount
  ) {
    throw new InconsistentSprintReportError();
  }
  if (!sprint.startedAt) throw new InconsistentSprintReportError();
  return {
    kind: "active",
    statusLabel: "Données en cours",
    sprint: {
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      plannedStartAt: sprint.plannedStartAt,
      plannedEndAt: sprint.plannedEndAt,
      startedAt: sprint.startedAt,
      completedAt: null,
    },
    metrics: {
      initialItemCount: metrics.initialItemCount,
      committedPoints: metrics.committedPoints,
      initialUnestimatedCount: metrics.initialUnestimatedCount,
      currentItemCount: metrics.currentItemCount,
      currentScopePoints: metrics.currentScopePoints,
      currentUnestimatedCount: metrics.currentUnestimatedCount,
      completedItemCount: metrics.completedItemCount,
      completedPoints: metrics.completedPoints,
      grossPointsAdded: scope.grossPointsAdded,
      grossPointsRemoved: scope.grossPointsRemoved,
      netEstimateDelta: scope.netEstimateDelta,
      scopeEventCount: scope.scopeEventCount,
    },
    items: itemResult.page,
    events,
    sections: itemResult.sections,
  };
}

async function readCompletedReport(
  tx: Tx,
  sprint: typeof sprints.$inferSelect,
  backlogId: string,
  command: z.infer<typeof reportPageCommand>,
): Promise<CompletedSprintReport | LegacySprintReport> {
  if (!sprint.startedAt || !sprint.completedAt) {
    throw new InconsistentSprintReportError();
  }
  const [snapshot] = await tx
    .select()
    .from(sprintReportSnapshots)
    .where(
      and(
        eq(sprintReportSnapshots.backlogId, backlogId),
        eq(sprintReportSnapshots.sprintId, sprint.id),
      ),
    )
    .limit(1);
  const reportable: ReportableSprint = {
    id: sprint.id,
    name: sprint.name,
    goal: sprint.goal,
    state: "completed",
    startedAt: sprint.startedAt,
    completedAt: sprint.completedAt,
    hasSnapshot: snapshot !== undefined,
  };
  if (!snapshot) {
    return {
      kind: "legacy_unavailable",
      statusLabel: "Historique détaillé indisponible",
      sprint: reportable,
    };
  }
  const itemWhere = and(
    eq(sprintReportItems.backlogId, backlogId),
    eq(sprintReportItems.sprintId, sprint.id),
    eq(sprintReportItems.snapshotId, snapshot.id),
  );
  const itemRows = await tx
      .select({
        row: sprintReportItems,
        accessibleItemId: items.id,
      })
      .from(sprintReportItems)
      .leftJoin(
        items,
        and(
          eq(items.id, sprintReportItems.sourceItemId),
          eq(items.backlogId, backlogId),
          isNull(items.deletedAt),
        ),
      )
      .where(itemWhere)
      .orderBy(asc(sprintReportItems.itemKey), asc(sprintReportItems.id))
      .limit(command.pageSize)
      .offset((command.itemPage - 1) * command.pageSize);
  const itemCountRows = await tx
    .select({ total: count() })
    .from(sprintReportItems)
    .where(itemWhere);
  const sectionRows = await tx
      .select({
        outcome: sprintReportItems.finalOutcome,
        total: count(),
        points: sql<number>`coalesce(sum(${sprintReportItems.estimateAtFinalParticipation}), 0)::double precision`,
      })
      .from(sprintReportItems)
      .where(itemWhere)
      .groupBy(sprintReportItems.finalOutcome);
  const events = await readSprintEventPage(
    backlogId,
    sprint.id,
    command.eventPage,
    command.pageSize,
    tx,
  );
  const sections: SprintReportSections = {
    completed: 0,
    incomplete: 0,
    removed: 0,
    carried: 0,
  };
  let finalScopePoints = 0;
  for (const row of sectionRows) {
    if (row.outcome === "completed") sections.completed += row.total;
    else if (row.outcome === "removed") sections.removed += row.total;
    else sections.carried += row.total;
    if (row.outcome !== "removed") finalScopePoints += row.points;
  }
  return {
    kind: "completed",
    statusLabel: "Historique figé",
    snapshotAt: snapshot.createdAt,
    sprint: {
      id: sprint.id,
      name: snapshot.sprintName,
      goal: snapshot.sprintGoal,
      plannedStartAt: snapshot.plannedStartAt,
      plannedEndAt: snapshot.plannedEndAt,
      startedAt: snapshot.startedAt,
      completedAt: snapshot.completedAt,
    },
    metrics: {
      initialItemCount: snapshot.initialItemCount,
      committedPoints: snapshot.committedPoints,
      initialUnestimatedCount: snapshot.initialUnestimatedCount,
      currentItemCount: snapshot.finalItemCount,
      currentScopePoints: finalScopePoints,
      currentUnestimatedCount: snapshot.finalUnestimatedCount,
      completedItemCount: snapshot.completedItemCount,
      completedPoints: snapshot.completedPoints,
      grossPointsAdded: snapshot.grossPointsAdded,
      grossPointsRemoved: snapshot.grossPointsRemoved,
      netEstimateDelta: snapshot.netEstimateDelta,
      scopeEventCount: snapshot.scopeEventCount,
    },
    items: {
      page: command.itemPage,
      pageSize: command.pageSize,
      total: itemCountRows[0]?.total ?? 0,
      rows: itemRows.map(({ row, accessibleItemId }) => ({
        itemId: accessibleItemId,
        itemKey: row.itemKey,
        itemTitle: row.itemTitle,
        itemType: row.itemType,
        itemKind: row.itemKind,
        firstJoinedAt: row.firstJoinedAt,
        finalLeftAt: row.finalLeftAt,
        initialCommitment: row.initialCommitment,
        addedAfterStart: row.addedAfterStart,
        removedAfterStart: row.removedAfterStart,
        estimateAtStart: row.estimateAtStart,
        estimateAtFinalParticipation: row.estimateAtFinalParticipation,
        estimateAtCompletion: row.estimateAtCompletion,
        statusCategory: row.finalStatusCategory,
        outcome: row.finalOutcome,
        destinationSprint:
          row.destinationSprintName === null
            ? null
            : { id: row.destinationSprintId, name: row.destinationSprintName },
        section:
          row.finalOutcome === "completed"
            ? "completed"
            : row.finalOutcome === "removed"
              ? "removed"
              : "carried",
      })),
    },
    events,
    sections,
    finalDestinationSummary: snapshot.finalDestinationSummary,
  };
}

export async function getSprintReport(
  backlogId: string,
  sprintId: string,
  options: unknown,
): Promise<SprintReport | null> {
  const command = reportPageCommand.parse(options);
  return db.transaction(
    async (tx) => {
      const [sprint] = await tx
        .select()
        .from(sprints)
        .where(and(eq(sprints.backlogId, backlogId), eq(sprints.id, sprintId)))
        .limit(1);
      if (!sprint || sprint.state === "planned") return null;
      if (sprint.state === "active") {
        return readActiveReport(tx, sprint, backlogId, command);
      }
      return readCompletedReport(tx, sprint, backlogId, command);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getVelocityReport(
  backlogId: string,
  limitInput: unknown,
): Promise<VelocityReport> {
  const limit = velocityLimit.parse(limitInput);
  const newest = await db
    .select({
      sprintId: sprints.id,
      currentSprintName: sprints.name,
      sprintCompletedAt: sprints.completedAt,
      snapshotId: sprintReportSnapshots.id,
      snapshotSprintName: sprintReportSnapshots.sprintName,
      snapshotCompletedAt: sprintReportSnapshots.completedAt,
      committedPoints: sprintReportSnapshots.committedPoints,
      completedPoints: sprintReportSnapshots.completedPoints,
    })
    .from(sprints)
    .leftJoin(
      sprintReportSnapshots,
      and(
        eq(sprintReportSnapshots.backlogId, sprints.backlogId),
        eq(sprintReportSnapshots.sprintId, sprints.id),
      ),
    )
    .where(and(eq(sprints.backlogId, backlogId), eq(sprints.state, "completed")))
    .orderBy(desc(sprints.completedAt), desc(sprints.id))
    .limit(limit);
  const bars: VelocityBar[] = newest.reverse().flatMap((row) => {
    const completedAt = row.snapshotCompletedAt ?? row.sprintCompletedAt;
    if (!completedAt) return [];
    const hasSnapshot = row.snapshotId !== null;
    const hasPointData =
      hasSnapshot &&
      row.committedPoints !== null &&
      row.completedPoints !== null &&
      (row.committedPoints !== 0 || row.completedPoints !== 0);
    return [{
      sprintId: row.sprintId,
      sprintName: row.snapshotSprintName ?? row.currentSprintName,
      completedAt,
      committedPoints: hasSnapshot ? row.committedPoints : null,
      completedPoints: hasSnapshot ? row.completedPoints : null,
      includedInAverage: hasPointData,
      excludedReason: !hasSnapshot
        ? "history_unavailable" as const
        : hasPointData
          ? null
          : "no_point_data" as const,
    }];
  });
  const velocity = calculateVelocity(
    bars.map((bar) => ({
      hasSnapshot: bar.excludedReason !== "history_unavailable",
      committedPoints: bar.committedPoints,
      completedPoints: bar.completedPoints,
    })),
  );
  return {
    state: velocity.population === 0 ? "empty" : "ready",
    label: velocity.population === 0 ? "Pas encore de vélocité" : null,
    limit,
    bars,
    population: velocity.population,
    averageCompletedPoints: velocity.averageCompletedPoints,
  };
}
