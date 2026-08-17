import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  items,
  sprintEvents,
  sprintItems,
  sprintReportItems,
  sprintReportSnapshots,
  sprints,
} from "@/lib/db/schema/domain";
import {
  calculateBurndown,
  calculatePlanningComparison,
  InconsistentBurndownError,
  type BurndownCalculation,
  type BurndownEvent,
  type BurndownPoint,
  type PlanningComparison,
} from "@/lib/reports/burndown-calculations";
import {
  getVelocityReport,
  readSprintEventPage,
  type Page,
  type SprintReportEvent,
} from "@/lib/services/sprint-reports";

const burndownOptions = z.object({
  eventPage: z.number().int().default(1),
  pageSize: z.number().int().default(50),
  now: z.date().default(() => new Date()),
});

export type BurndownSprintIdentity = {
  id: string;
  name: string;
  goal: string | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
};

export type DetailedBurndownReport = {
  sprint: BurndownSprintIdentity;
  summary: BurndownCalculation["summary"];
  trajectory: BurndownCalculation["trajectory"];
  planningComparison: PlanningComparison;
  guideline: BurndownCalculation["guideline"];
  displayPoints: BurndownCalculation["displayPoints"];
  baseline: BurndownPoint;
  eventPoints: Page<BurndownPoint>;
  events: Page<SprintReportEvent>;
};

export type ActiveBurndownReport = DetailedBurndownReport & { kind: "active" };
export type CompletedBurndownReport = DetailedBurndownReport & { kind: "completed" };
export type LegacyBurndownReport = {
  kind: "legacy_unavailable";
  reason: "legacy_history";
  sprint: BurndownSprintIdentity;
};

export type BurndownReport =
  | ActiveBurndownReport
  | CompletedBurndownReport
  | LegacyBurndownReport;

type LedgerRow = {
  eventType: typeof sprintEvents.$inferSelect.eventType;
  occurredAt: Date;
  sequence: bigint;
  itemId: string | null;
  itemKey: string | null;
  itemTitle: string | null;
  previousEstimate: number | null;
  nextEstimate: number | null;
  previousDone: boolean | null;
  nextDone: boolean | null;
  removalReason: typeof sprintEvents.$inferSelect.removalReason;
};

type InitialItem = {
  itemId: string | null;
  itemKey: string;
  itemTitle: string;
  estimate: number | null;
  done: boolean;
};

type ReadSource = {
  kind: "active" | "completed";
  sprint: BurndownSprintIdentity;
  initial: InitialItem[];
  commitmentPoints: number;
  snapshotCompletedPoints: number | null;
  burndownEvents: BurndownEvent[];
  events: Page<SprintReportEvent>;
  observedAt: Date;
};

type ReadResult = ReadSource | LegacyBurndownReport | null;

function assertConsistent(condition: unknown): asserts condition {
  if (!condition) throw new InconsistentBurndownError();
}

function mutableSprintIdentity(
  sprint: typeof sprints.$inferSelect,
): BurndownSprintIdentity {
  assertConsistent(sprint.startedAt !== null);
  return {
    id: sprint.id,
    name: sprint.name,
    goal: sprint.goal,
    plannedStartAt: sprint.plannedStartAt,
    plannedEndAt: sprint.plannedEndAt,
    startedAt: sprint.startedAt,
    completedAt: sprint.completedAt,
  };
}

function legacy(sprint: BurndownSprintIdentity): LegacyBurndownReport {
  return { kind: "legacy_unavailable", reason: "legacy_history", sprint };
}

function isLifecycleShape(row: LedgerRow): boolean {
  return row.itemKey === null &&
    row.itemTitle === null &&
    row.previousEstimate === null &&
    row.nextEstimate === null &&
    row.previousDone === null &&
    row.nextDone === null &&
    row.removalReason === null;
}

function mapLedger(rows: readonly LedgerRow[]): {
  events: BurndownEvent[];
  legacyHistory: boolean;
} {
  const events: BurndownEvent[] = [];
  let legacyHistory = false;
  for (const row of rows) {
    const boundary = {
      occurredAt: row.occurredAt,
      sequence: row.sequence,
    };
    switch (row.eventType) {
      case "sprint_started":
      case "sprint_completed":
        assertConsistent(isLifecycleShape(row));
        events.push({ ...boundary, type: row.eventType });
        break;
      case "item_added":
        assertConsistent(
          row.itemKey !== null &&
            row.itemTitle !== null &&
            row.previousEstimate === null &&
            row.previousDone === null &&
            row.removalReason === null,
        );
        if (row.nextDone === null) {
          legacyHistory = true;
          break;
        }
        events.push({
          ...boundary,
          type: "item_added",
          itemId: row.itemId,
          itemKey: row.itemKey,
          itemTitle: row.itemTitle,
          nextEstimate: row.nextEstimate,
          nextDone: row.nextDone,
        });
        break;
      case "item_removed":
        assertConsistent(
          row.itemKey !== null &&
            row.itemTitle !== null &&
            row.nextEstimate === null &&
            row.previousDone === null &&
            row.nextDone === null &&
            row.removalReason !== null,
        );
        events.push({
          ...boundary,
          type: "item_removed",
          itemId: row.itemId,
          itemKey: row.itemKey,
          itemTitle: row.itemTitle,
          previousEstimate: row.previousEstimate,
        });
        break;
      case "estimate_changed":
        assertConsistent(
          row.itemKey !== null &&
            row.itemTitle !== null &&
            row.previousEstimate !== row.nextEstimate &&
            row.previousDone === null &&
            row.nextDone === null &&
            row.removalReason === null,
        );
        events.push({
          ...boundary,
          type: "estimate_changed",
          itemId: row.itemId,
          itemKey: row.itemKey,
          itemTitle: row.itemTitle,
          previousEstimate: row.previousEstimate,
          nextEstimate: row.nextEstimate,
        });
        break;
      case "item_completed":
      case "item_reopened": {
        const completed = row.eventType === "item_completed";
        assertConsistent(
          row.itemKey !== null &&
            row.itemTitle !== null &&
            row.previousEstimate === null &&
            row.nextEstimate === null &&
            row.previousDone === !completed &&
            row.nextDone === completed &&
            row.removalReason === null,
        );
        events.push({
          ...boundary,
          type: row.eventType,
          itemId: row.itemId,
          itemKey: row.itemKey,
          itemTitle: row.itemTitle,
        });
        break;
      }
    }
  }
  return { events, legacyHistory };
}

async function readLedger(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  backlogId: string,
  sprintId: string,
): Promise<LedgerRow[]> {
  return tx.select({
    eventType: sprintEvents.eventType,
    occurredAt: sprintEvents.occurredAt,
    sequence: sprintEvents.sequence,
    itemId: sprintEvents.itemId,
    itemKey: sprintEvents.itemKey,
    itemTitle: sprintEvents.itemTitle,
    previousEstimate: sprintEvents.previousEstimate,
    nextEstimate: sprintEvents.nextEstimate,
    previousDone: sprintEvents.previousDone,
    nextDone: sprintEvents.nextDone,
    removalReason: sprintEvents.removalReason,
  }).from(sprintEvents).where(and(
    eq(sprintEvents.backlogId, backlogId),
    eq(sprintEvents.sprintId, sprintId),
  )).orderBy(asc(sprintEvents.occurredAt), asc(sprintEvents.sequence));
}

async function readActiveSource(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  backlogId: string,
  sprint: typeof sprints.$inferSelect,
  command: z.infer<typeof burndownOptions>,
): Promise<ReadSource | LegacyBurndownReport> {
  const identity = mutableSprintIdentity(sprint);
  assertConsistent(sprint.state === "active" && identity.completedAt === null);
  const memberships = await tx.select({
      itemId: items.id,
      itemKey: items.key,
      itemTitle: items.title,
      itemType: items.type,
      estimateAtStart: sprintItems.estimateAtStart,
      doneAtStart: sprintItems.doneAtStart,
      addedAfterStart: sql<boolean>`exists (
        select 1 from sprint_events added_event
        where added_event.backlog_id = ${backlogId}
          and added_event.sprint_id = ${sprint.id}
          and added_event.source_membership_id = ${sprintItems.id}
          and added_event.event_type = 'item_added'
      )`,
    }).from(sprintItems).leftJoin(
      items,
      and(eq(items.id, sprintItems.itemId), eq(items.backlogId, backlogId)),
    ).where(eq(sprintItems.sprintId, sprint.id))
      .orderBy(asc(sprintItems.joinedAt), asc(sprintItems.id));
  const ledger = await readLedger(tx, backlogId, sprint.id);
  const events = await readSprintEventPage(
    backlogId,
    sprint.id,
    command.eventPage,
    command.pageSize,
    tx,
  );

  const initial: InitialItem[] = [];
  let commitmentPoints = 0;
  for (const membership of memberships) {
    if (membership.addedAfterStart) continue;
    if (membership.doneAtStart === null) return legacy(identity);
    assertConsistent(
      membership.itemId !== null &&
        membership.itemKey !== null &&
        membership.itemTitle !== null &&
        membership.itemType === "tache",
    );
    initial.push({
      itemId: membership.itemId,
      itemKey: membership.itemKey,
      itemTitle: membership.itemTitle,
      estimate: membership.estimateAtStart,
      done: membership.doneAtStart,
    });
    commitmentPoints += membership.estimateAtStart ?? 0;
  }
  const mapped = mapLedger(ledger);
  if (mapped.legacyHistory) return legacy(identity);
  return {
    kind: "active",
    sprint: identity,
    initial,
    commitmentPoints,
    snapshotCompletedPoints: null,
    burndownEvents: mapped.events,
    events,
    observedAt: new Date(Math.max(command.now.getTime(), identity.startedAt.getTime())),
  };
}

async function readCompletedSource(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  backlogId: string,
  sprint: typeof sprints.$inferSelect,
  command: z.infer<typeof burndownOptions>,
): Promise<ReadSource | LegacyBurndownReport> {
  const mutableIdentity = mutableSprintIdentity(sprint);
  assertConsistent(sprint.state === "completed" && sprint.completedAt !== null);
  const [snapshot] = await tx.select().from(sprintReportSnapshots).where(and(
    eq(sprintReportSnapshots.backlogId, backlogId),
    eq(sprintReportSnapshots.sprintId, sprint.id),
  )).limit(1);
  if (!snapshot) return legacy(mutableIdentity);
  const identity: BurndownSprintIdentity = {
    id: sprint.id,
    name: snapshot.sprintName,
    goal: snapshot.sprintGoal,
    plannedStartAt: snapshot.plannedStartAt,
    plannedEndAt: snapshot.plannedEndAt,
    startedAt: snapshot.startedAt,
    completedAt: snapshot.completedAt,
  };
  const participants = await tx.select({
      itemKey: sprintReportItems.itemKey,
      itemTitle: sprintReportItems.itemTitle,
      itemType: sprintReportItems.itemType,
      initialCommitment: sprintReportItems.initialCommitment,
      estimateAtStart: sprintReportItems.estimateAtStart,
      doneAtStart: sprintReportItems.doneAtStart,
    }).from(sprintReportItems).where(and(
      eq(sprintReportItems.backlogId, backlogId),
      eq(sprintReportItems.sprintId, sprint.id),
      eq(sprintReportItems.snapshotId, snapshot.id),
    )).orderBy(asc(sprintReportItems.itemKey), asc(sprintReportItems.id));
  const ledger = await readLedger(tx, backlogId, sprint.id);
  const events = await readSprintEventPage(
    backlogId,
    sprint.id,
    command.eventPage,
    command.pageSize,
    tx,
  );
  const initial: InitialItem[] = [];
  for (const participant of participants) {
    assertConsistent(participant.itemType === "tache");
    if (!participant.initialCommitment) continue;
    if (participant.doneAtStart === null) return legacy(identity);
    initial.push({
      itemId: null,
      itemKey: participant.itemKey,
      itemTitle: participant.itemTitle,
      estimate: participant.estimateAtStart,
      done: participant.doneAtStart,
    });
  }
  const immutableLedger = ledger.map((row) => ({ ...row, itemId: null }));
  const immutableEvents = {
    ...events,
    rows: events.rows.map((event) => ({ ...event, itemId: null })),
  };
  const mapped = mapLedger(immutableLedger);
  if (mapped.legacyHistory) return legacy(identity);
  return {
    kind: "completed",
    sprint: identity,
    initial,
    commitmentPoints: snapshot.committedPoints,
    snapshotCompletedPoints: snapshot.completedPoints,
    burndownEvents: mapped.events,
    events: immutableEvents,
    observedAt: snapshot.completedAt,
  };
}

async function readSource(
  backlogId: string,
  sprintId: string,
  command: z.infer<typeof burndownOptions>,
): Promise<ReadResult> {
  return db.transaction(async (tx) => {
    const [sprint] = await tx.select().from(sprints).where(and(
      eq(sprints.backlogId, backlogId),
      eq(sprints.id, sprintId),
    )).limit(1);
    if (!sprint || sprint.state === "planned") return null;
    if (sprint.state === "active") {
      return readActiveSource(tx, backlogId, sprint, command);
    }
    return readCompletedSource(tx, backlogId, sprint, command);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function getRecentVelocityContext(backlogId: string): Promise<{
  population: number;
  averageCompletedPoints: number | null;
}> {
  const velocity = await getVelocityReport(backlogId, 7);
  return {
    population: velocity.population,
    averageCompletedPoints: velocity.averageCompletedPoints,
  };
}

export async function getBurndownReport(
  backlogId: string,
  sprintId: string,
  options: unknown,
): Promise<BurndownReport | null> {
  const command = burndownOptions.parse(options);
  const source = await readSource(backlogId, sprintId, command);
  if (!source || source.kind === "legacy_unavailable") return source;
  const calculation = calculateBurndown({
    startedAt: source.sprint.startedAt,
    targetEndAt: source.sprint.plannedEndAt,
    completedAt: source.sprint.completedAt,
    observedAt: source.observedAt,
    initial: source.initial,
    events: source.burndownEvents,
  });
  if (source.kind === "completed") {
    assertConsistent(
      source.snapshotCompletedPoints !== null &&
        calculation.summary.completedPoints === source.snapshotCompletedPoints,
    );
  }
  const pointsBySequence = new Map(
    calculation.exactPoints.flatMap((point) =>
      point.sequence === null ? [] : [[point.sequence, point] as const]),
  );
  const eventPointRows = source.events.rows.map((event) => {
    const point = pointsBySequence.get(event.sequence);
    assertConsistent(point !== undefined);
    return point;
  });
  const velocity = await getRecentVelocityContext(backlogId);
  const baseline = calculation.exactPoints[0];
  assertConsistent(baseline !== undefined && baseline.cause === "start");
  return {
    kind: source.kind,
    sprint: source.sprint,
    summary: calculation.summary,
    trajectory: calculation.trajectory,
    planningComparison: calculatePlanningComparison(
      source.commitmentPoints,
      velocity,
    ),
    guideline: calculation.guideline,
    displayPoints: calculation.displayPoints,
    baseline,
    eventPoints: {
      page: source.events.page,
      pageSize: source.events.pageSize,
      total: source.events.total,
      rows: eventPointRows,
    },
    events: source.events,
  };
}
