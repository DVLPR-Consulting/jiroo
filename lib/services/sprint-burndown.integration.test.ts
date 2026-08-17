import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Client, type PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogs,
  items,
  sprintEvents,
  sprintItems,
  sprintReportSnapshots,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import { InconsistentBurndownError } from "@/lib/reports/burndown-calculations";
import {
  getBurndownReport,
  getRecentVelocityContext,
} from "@/lib/services/sprint-burndown";
import { appendSprintEventsInTx } from "@/lib/services/sprint-events";
import { updateItem } from "@/lib/services/items";
import { completeSprint, startSprint } from "@/lib/services/sprint-lifecycle";
import { readSprintEventPage } from "@/lib/services/sprint-reports";
import { assignItemsToSprint, createSprint } from "@/lib/services/sprints";
import { withSprintHistoryCleanup } from "@/test-utils/sprint-history-cleanup";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const startedAt = new Date("2026-08-01T09:00:00.000Z");
const targetEndAt = new Date("2026-08-31T09:00:00.000Z");
const completionAt = new Date("2026-08-15T09:00:00.000Z");
const options = { eventPage: 1, pageSize: 50, now: completionAt };

afterEach(() => {
  vi.useRealTimers();
});

async function cleanupBacklogs(...backlogIds: string[]) {
  const client = await databasePool.connect();
  await client.query("begin");
  try {
    await withSprintHistoryCleanup(client, async () => {
      await client.query(
        "delete from sprint_report_items where backlog_id = any($1::uuid[])",
        [backlogIds],
      );
      await client.query(
        "delete from sprint_report_snapshots where backlog_id = any($1::uuid[])",
        [backlogIds],
      );
      await client.query(
        "delete from sprint_events where backlog_id = any($1::uuid[])",
        [backlogIds],
      );
    });
    await client.query("delete from backlogs where id = any($1::uuid[])", [backlogIds]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function fixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const [backlog] = await db.insert(backlogs).values({
    key: `BD${suffix}`,
    name: "Read model burndown",
    color: "#475569",
  }).returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  const [todo, done] = await db.insert(statuses).values([
    { backlogId: backlog.id, name: "À faire", category: "todo", order: 0, color: "#999999" },
    { backlogId: backlog.id, name: "Terminé", category: "done", order: 1, color: "#22c55e" },
  ]).returning();
  if (!todo || !done) throw new Error("Fixture statuts impossible.");
  return { actor, backlog, todo, done };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function insertTask(
  f: Fixture,
  title: string,
  estimatePoints: number | null,
  statusId = f.todo.id,
) {
  const id = randomUUID();
  const [item] = await db.insert(items).values({
    id,
    key: `${f.backlog.key}-${id.slice(0, 6)}`,
    type: "tache",
    backlogId: f.backlog.id,
    title,
    statusId,
    estimatePoints,
    reporterId: f.actor.id,
    rank: `a${randomUUID().replaceAll("-", "")}`,
    path: `root.${id.replaceAll("-", "")}`,
  }).returning();
  if (!item) throw new Error("Fixture tâche impossible.");
  return item;
}

async function startWithTasks(f: Fixture, taskIds: string[]) {
  const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
  if (taskIds.length > 0) {
    await assignItemsToSprint(
      { backlogId: f.backlog.id, itemIds: taskIds, sprintId: sprint.id },
      f.actor.id,
    );
  }
  await startSprint({
    id: sprint.id,
    backlogId: f.backlog.id,
    name: sprint.name,
    goal: "Objectif immuable",
    startAt: startedAt.toISOString(),
    endAt: targetEndAt.toISOString(),
    capacityPoints: 13,
  }, f.actor.id);
  return sprint;
}

async function createVelocitySnapshot(f: Fixture) {
  const sprintId = randomUUID();
  const completedAt = new Date("2026-07-31T09:00:00.000Z");
  await db.insert(sprints).values({
    id: sprintId,
    backlogId: f.backlog.id,
    name: "Sprint vélocité",
    state: "completed",
    rank: "a0",
    startedAt: new Date("2026-07-15T09:00:00.000Z"),
    completedAt,
    createdBy: f.actor.id,
  });
  await db.insert(sprintReportSnapshots).values({
    backlogId: f.backlog.id,
    sprintId,
    sprintName: "Sprint vélocité figé",
    sprintGoal: null,
    startedAt: new Date("2026-07-15T09:00:00.000Z"),
    completedAt,
    createdAt: completedAt,
    createdBy: f.actor.id,
    initialItemCount: 1,
    committedPoints: 8,
    initialUnestimatedCount: 0,
    finalItemCount: 1,
    completedItemCount: 1,
    completedPoints: 5,
    finalUnestimatedCount: 0,
    grossPointsAdded: 0,
    grossPointsRemoved: 0,
    netEstimateDelta: 0,
    scopeEventCount: 0,
    finalDestinationSummary: { backlog: 0, sprints: [] },
    requestCorrelationId: "burndown-velocity",
  });
}

async function appendCompletionEvent(
  f: Fixture,
  sprintId: string,
  item: Awaited<ReturnType<typeof insertTask>>,
  occurredAt = new Date("2026-08-10T09:00:00.000Z"),
) {
  const [membership] = await db.select({ id: sprintItems.id })
    .from(sprintItems)
    .where(and(eq(sprintItems.sprintId, sprintId), eq(sprintItems.itemId, item.id)));
  if (!membership) throw new Error("Appartenance attendue.");
  await db.transaction(async (tx) => {
    await appendSprintEventsInTx(tx, [{
      type: "item_completed",
      backlogId: f.backlog.id,
      sprintId,
      membershipId: membership.id,
      item: { id: item.id, key: item.key, title: item.title },
      actorId: f.actor.id,
      correlationId: "burndown-complete-item",
      occurredAt,
    }]);
  });
}

async function corruptHistory(callback: (client: PoolClient) => Promise<void>) {
  const client = await databasePool.connect();
  await client.query("begin");
  try {
    await withSprintHistoryCleanup(client, () => callback(client));
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function makeAddedEventLegacy(sprintId: string): Promise<void> {
  const client = await databasePool.connect();
  await client.query("begin");
  try {
    const definitionResult = await client.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
       from pg_constraint
       where conrelid = 'sprint_events'::regclass
         and conname = 'sprint_events_shape'`,
    );
    const definition = definitionResult.rows[0]?.definition;
    if (!definition) throw new Error("Contrainte sprint_events_shape attendue.");
    await withSprintHistoryCleanup(client, async () => {
      await client.query('alter table sprint_events drop constraint "sprint_events_shape"');
      await client.query(
        "update sprint_events set next_done = null where sprint_id = $1 and event_type = 'item_added'",
        [sprintId],
      );
      await client.query(
        `alter table sprint_events add constraint "sprint_events_shape" ${definition} not valid`,
      );
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function validateSprintEventShape(): Promise<void> {
  await databasePool.query(
    'alter table sprint_events validate constraint "sprint_events_shape"',
  );
}

function immutableProjection(report: Awaited<ReturnType<typeof getBurndownReport>>) {
  if (!report || report.kind === "legacy_unavailable") {
    throw new Error("Projection détaillée attendue.");
  }
  return {
    kind: report.kind,
    sprint: report.sprint,
    summary: report.summary,
    trajectory: report.trajectory,
    planningComparison: report.planningComparison,
    guideline: report.guideline,
    displayPoints: report.displayPoints,
    eventPoints: report.eventPoints,
  };
}

async function insertDirectActiveSprint(f: Fixture, participantCount: number) {
  const sprintId = randomUUID();
  await db.insert(sprints).values({
    id: sprintId,
    backlogId: f.backlog.id,
    name: `Sprint volume ${participantCount}`,
    goal: "Charge",
    state: "active",
    rank: `q${randomUUID().replaceAll("-", "")}`,
    plannedStartAt: startedAt,
    plannedEndAt: targetEndAt,
    startedAt,
    createdBy: f.actor.id,
  });
  const rows = Array.from({ length: participantCount }, (_, index) => {
    const id = randomUUID();
    return {
      id,
      key: `${f.backlog.key}-V${index.toString().padStart(4, "0")}`,
      type: "tache" as const,
      backlogId: f.backlog.id,
      title: `Volume ${index}`,
      statusId: f.todo.id,
      estimatePoints: 1,
      reporterId: f.actor.id,
      rank: `v${index.toString().padStart(5, "0")}`,
      path: `root.${id.replaceAll("-", "")}`,
    };
  });
  for (let index = 0; index < rows.length; index += 500) {
    const batch = rows.slice(index, index + 500);
    await db.insert(items).values(batch);
    await db.insert(sprintItems).values(batch.map((item) => ({
      sprintId,
      itemId: item.id,
      joinedAt: startedAt,
      joinedBy: f.actor.id,
      estimateAtJoin: 1,
      estimateAtStart: 1,
      doneAtStart: false,
    })));
  }
  await db.insert(sprintEvents).values({
    backlogId: f.backlog.id,
    sprintId,
    eventType: "sprint_started",
    actorId: f.actor.id,
    requestCorrelationId: `volume-${participantCount}`,
    occurredAt: startedAt,
  });
  return sprintId;
}

describeDb("sprint burndown read model", () => {
  it("returns a backlog-scoped active projection and aligns every paged journal event by sequence", async () => {
    const f = await fixture();
    const foreign = await fixture();
    try {
      await createVelocitySnapshot(f);
      const open = await insertTask(f, "Travail ouvert", 5);
      const done = await insertTask(f, "Déjà fini", 3, f.done.id);
      const active = await startWithTasks(f, [open.id, done.id]);
      await appendCompletionEvent(f, active.id, open);

      const report = await getBurndownReport(f.backlog.id, active.id, options);
      expect(report).toMatchObject({
        kind: "active",
        sprint: { id: active.id, goal: "Objectif immuable" },
        summary: {
          initialRemainingPoints: 5,
          remainingPoints: 0,
          completedPoints: 8,
          unestimatedCount: 0,
        },
        trajectory: { label: "Sur la trajectoire idéale" },
        planningComparison: {
          state: "ready",
          commitmentPoints: 8,
          population: 1,
          averageCompletedPoints: 5,
        },
        events: { page: 1, pageSize: 50, total: 2 },
        eventPoints: { page: 1, pageSize: 50, total: 2 },
      });
      if (!report || report.kind !== "active") throw new Error("Rapport actif attendu.");
      expect(report.events.rows.map((event) => event.eventType)).toEqual([
        "item_completed",
        "sprint_started",
      ]);
      expect(report.eventPoints.rows.map((point) => point.sequence)).toEqual(
        report.events.rows.map((event) => event.sequence),
      );
      expect(report.eventPoints.rows.map((point) => point.cause)).toEqual(
        report.events.rows.map((event) => event.eventType),
      );
      expect(report.displayPoints.length).toBeLessThanOrEqual(600);
      expect(report.baseline).toMatchObject({ cause: "start", sequence: null });

      const readerPage = await readSprintEventPage(f.backlog.id, active.id, 0, 500);
      expect(readerPage).toMatchObject({ page: 1, pageSize: 100, total: 2 });
      expect(readerPage.rows.map((event) => event.sequence)).toEqual(
        report.events.rows.map((event) => event.sequence),
      );
      await expect(
        getBurndownReport(foreign.backlog.id, active.id, options),
      ).resolves.toBeNull();
      await expect(
        getBurndownReport(f.backlog.id, randomUUID(), options),
      ).resolves.toBeNull();
    } finally {
      await cleanupBacklogs(f.backlog.id, foreign.backlog.id);
    }
  });

  it("matches the active completion boundary and keeps completed calculations frozen after mutable changes and purge", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Identité figée", 8);
      const active = await startWithTasks(f, [task.id]);
      await appendCompletionEvent(f, active.id, task, new Date("2026-08-10T09:00:00.000Z"));
      const activeReport = await getBurndownReport(f.backlog.id, active.id, options);

      await db.update(items).set({ statusId: f.done.id }).where(eq(items.id, task.id));

      vi.useFakeTimers();
      vi.setSystemTime(completionAt);
      await completeSprint(
        { id: active.id, backlogId: f.backlog.id, destination: { type: "backlog" } },
        f.actor.id,
        "burndown-freeze",
      );
      vi.useRealTimers();

      const completed = await getBurndownReport(f.backlog.id, active.id, options);
      expect(completed).toMatchObject({ kind: "completed" });
      if (!activeReport || activeReport.kind !== "active" ||
          !completed || completed.kind !== "completed") {
        throw new Error("Rapports actif et terminé attendus.");
      }
      expect(completed.summary).toEqual(activeReport.summary);
      expect(completed.eventPoints.rows[0]).toMatchObject({
        cause: "sprint_completed",
        remainingPoints: activeReport.eventPoints.rows[0]?.remainingPoints,
        unestimatedCount: activeReport.eventPoints.rows[0]?.unestimatedCount,
      });
      const before = immutableProjection(completed);

      const destination = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [task.id], sprintId: destination.id },
        f.actor.id,
      );
      await db.update(sprints).set({ name: "Nom mutable remplacé", goal: "But mutable" })
        .where(eq(sprints.id, active.id));
      await db.update(items).set({
        title: "Titre mutable remplacé",
        estimatePoints: 1,
        statusId: f.todo.id,
        deletedAt: new Date(),
      }).where(eq(items.id, task.id));
      await db.delete(items).where(eq(items.id, task.id));

      const after = await getBurndownReport(f.backlog.id, active.id, options);
      expect(immutableProjection(after)).toEqual(before);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("returns identity-only legacy results for missing done facts", async () => {
    const f = await fixture();
    let eventConstraintNeedsValidation = false;
    try {
      const task = await insertTask(f, "Legacy initial", 3);
      const active = await startWithTasks(f, [task.id]);
      await db.update(sprintItems).set({ doneAtStart: null })
        .where(and(eq(sprintItems.sprintId, active.id), eq(sprintItems.itemId, task.id)));

      const initialLegacy = await getBurndownReport(f.backlog.id, active.id, options);
      expect(initialLegacy).toEqual({
        kind: "legacy_unavailable",
        reason: "legacy_history",
        sprint: expect.objectContaining({
          id: active.id,
          goal: "Objectif immuable",
          startedAt,
          completedAt: null,
        }),
      });
      expect(initialLegacy).not.toHaveProperty("summary");

      const added = await insertTask(f, "Legacy ajout", 2);
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [added.id], sprintId: active.id },
        f.actor.id,
      );
      await makeAddedEventLegacy(active.id);
      eventConstraintNeedsValidation = true;
      const addedLegacy = await getBurndownReport(f.backlog.id, active.id, options);
      expect(addedLegacy).toEqual({
        kind: "legacy_unavailable",
        reason: "legacy_history",
        sprint: expect.objectContaining({ id: active.id }),
      });
      expect(addedLegacy).not.toHaveProperty("events");
    } finally {
      await cleanupBacklogs(f.backlog.id);
      if (eventConstraintNeedsValidation) await validateSprintEventShape();
    }
  });

  it("fails closed for contradictory ledger values and completed snapshot totals", async () => {
    const ledgerFixture = await fixture();
    const snapshotFixture = await fixture();
    try {
      const task = await insertTask(ledgerFixture, "Contradiction", 5);
      const active = await startWithTasks(ledgerFixture, [task.id]);
      const [membership] = await db.select({ id: sprintItems.id }).from(sprintItems)
        .where(and(eq(sprintItems.sprintId, active.id), eq(sprintItems.itemId, task.id)));
      if (!membership) throw new Error("Appartenance attendue.");
      await db.transaction(async (tx) => appendSprintEventsInTx(tx, [{
        type: "estimate_changed",
        backlogId: ledgerFixture.backlog.id,
        sprintId: active.id,
        membershipId: membership.id,
        item: { id: task.id, key: task.key, title: task.title },
        actorId: ledgerFixture.actor.id,
        correlationId: "contradiction",
        occurredAt: new Date("2026-08-10T09:00:00.000Z"),
        previousEstimate: 4,
        nextEstimate: 8,
      }]));
      await expect(
        getBurndownReport(ledgerFixture.backlog.id, active.id, options),
      ).rejects.toBeInstanceOf(InconsistentBurndownError);

      const completeTask = await insertTask(snapshotFixture, "Snapshot", 5, snapshotFixture.done.id);
      const completeSprintFixture = await startWithTasks(snapshotFixture, [completeTask.id]);
      vi.useFakeTimers();
      vi.setSystemTime(completionAt);
      await completeSprint(
        { id: completeSprintFixture.id, backlogId: snapshotFixture.backlog.id, destination: { type: "backlog" } },
        snapshotFixture.actor.id,
        "snapshot-contradiction",
      );
      vi.useRealTimers();
      await corruptHistory(async (client) => {
        await client.query(
          "update sprint_report_snapshots set completed_points = 99 where sprint_id = $1",
          [completeSprintFixture.id],
        );
      });
      await expect(
        getBurndownReport(snapshotFixture.backlog.id, completeSprintFixture.id, options),
      ).rejects.toBeInstanceOf(InconsistentBurndownError);
    } finally {
      await cleanupBacklogs(ledgerFixture.backlog.id, snapshotFixture.backlog.id);
    }
  });

  it("reuses only the seven-sprint velocity population and average", async () => {
    const f = await fixture();
    try {
      await createVelocitySnapshot(f);
      await expect(getRecentVelocityContext(f.backlog.id)).resolves.toEqual({
        population: 1,
        averageCompletedPoints: 5,
      });
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("keeps query count fixed from five to one thousand participants", async () => {
    const small = await fixture();
    const large = await fixture();
    const querySpy = vi.spyOn(Client.prototype, "query");
    try {
      const smallSprintId = await insertDirectActiveSprint(small, 5);
      const largeSprintId = await insertDirectActiveSprint(large, 1_000);

      querySpy.mockClear();
      const smallReport = await getBurndownReport(small.backlog.id, smallSprintId, options);
      const smallQueryCount = querySpy.mock.calls.length;
      querySpy.mockClear();
      const largeReport = await getBurndownReport(large.backlog.id, largeSprintId, options);
      const largeQueryCount = querySpy.mock.calls.length;

      expect(smallReport).toMatchObject({ kind: "active", summary: { initialRemainingPoints: 5 } });
      expect(largeReport).toMatchObject({ kind: "active", summary: { initialRemainingPoints: 1_000 } });
      expect(largeQueryCount).toBe(smallQueryCount);
    } finally {
      querySpy.mockRestore();
      await cleanupBacklogs(small.backlog.id, large.backlog.id);
    }
  });

  it("replays ten thousand ordered events without truncating exact journal points", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Volume événements", 1);
      const active = await startWithTasks(f, [task.id]);
      const [membership] = await db.select({ id: sprintItems.id }).from(sprintItems)
        .where(and(eq(sprintItems.sprintId, active.id), eq(sprintItems.itemId, task.id)));
      if (!membership) throw new Error("Appartenance attendue.");
      const eventRows = Array.from({ length: 10_000 }, (_, index) => ({
        backlogId: f.backlog.id,
        sprintId: active.id,
        eventType: "estimate_changed" as const,
        sourceMembershipId: membership.id,
        itemId: task.id,
        itemKey: task.key,
        itemTitle: task.title,
        actorId: f.actor.id,
        requestCorrelationId: `volume-event-${index}`,
        occurredAt: new Date(startedAt.getTime() + index + 1),
        previousEstimate: index % 2 === 0 ? 1 : 2,
        nextEstimate: index % 2 === 0 ? 2 : 1,
      }));
      for (let index = 0; index < eventRows.length; index += 500) {
        await db.insert(sprintEvents).values(eventRows.slice(index, index + 500));
      }

      const measuredAt = performance.now();
      const report = await getBurndownReport(f.backlog.id, active.id, options);
      const durationMs = Math.round((performance.now() - measuredAt) * 100) / 100;
      if (!report || report.kind !== "active") throw new Error("Rapport actif attendu.");
      expect(report.events.total).toBe(10_001);
      expect(report.eventPoints.total).toBe(10_001);
      expect(report.baseline).toMatchObject({ cause: "start", sequence: null });
      expect(report.summary.remainingPoints).toBe(1);
      expect(report.displayPoints.length).toBeLessThanOrEqual(600);
      console.info("burndown-10k-events", { durationMs, eventCount: report.events.total });
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  }, 60_000);

  it("uses committed global sequences for deterministic concurrent equal-timestamp events", async () => {
      const f = await fixture();
    try {
      const first = await insertTask(f, "Concurrent A", 1);
      const second = await insertTask(f, "Concurrent B", 2);
      const active = await startWithTasks(f, [first.id, second.id]);
      const sameTime = new Date("2026-08-10T12:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(sameTime);
      await Promise.all([
        updateItem({ id: first.id, estimatePoints: 3 }, f.actor.id, "concurrent-a"),
        updateItem({ id: second.id, estimatePoints: 4 }, f.actor.id, "concurrent-b"),
      ]);
      vi.useRealTimers();

      const firstRead = await getBurndownReport(f.backlog.id, active.id, options);
      const secondRead = await getBurndownReport(f.backlog.id, active.id, options);
      if (!firstRead || firstRead.kind !== "active" ||
          !secondRead || secondRead.kind !== "active") {
        throw new Error("Rapports actifs attendus.");
      }
      expect(secondRead.eventPoints.rows).toEqual(firstRead.eventPoints.rows);
      const sameTimeSequences = firstRead.events.rows
        .filter((event) => event.occurredAt.getTime() === sameTime.getTime())
        .map((event) => event.sequence);
      expect(sameTimeSequences).toHaveLength(2);
      expect(sameTimeSequences[0]! > sameTimeSequences[1]!).toBe(true);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });
});
