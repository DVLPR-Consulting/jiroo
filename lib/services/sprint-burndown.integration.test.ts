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
import { softDeleteItem, updateItem } from "@/lib/services/items";
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

async function assignAt(f: Fixture, itemIds: string[], sprintId: string, at: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  try {
    await assignItemsToSprint({ backlogId: f.backlog.id, itemIds, sprintId }, f.actor.id);
  } finally {
    vi.useRealTimers();
  }
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
    observedAt: report.observedAt,
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
      expect(report.observedAt).toEqual(completionAt);
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
      const planned = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      await expect(
        getBurndownReport(f.backlog.id, planned.id, options),
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
      expect(completed.observedAt).toEqual(completed.sprint.completedAt);
      expect(completed.eventPoints.rows[0]).toMatchObject({
        cause: "sprint_completed",
        remainingPoints: activeReport.eventPoints.rows[0]?.remainingPoints,
        unestimatedCount: activeReport.eventPoints.rows[0]?.unestimatedCount,
      });
      const before = immutableProjection(completed);

      const expectFrozen = async (step: string) => {
        const after = await getBurndownReport(f.backlog.id, active.id, options);
        expect(immutableProjection(after), step).toEqual(before);
      };

      const destination = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [task.id], sprintId: destination.id },
        f.actor.id,
      );
      await expectFrozen("move");
      await db.update(sprints).set({ name: "Nom mutable remplacé", goal: "But mutable" })
        .where(eq(sprints.id, active.id));
      await expectFrozen("sprint rename");
      await db.update(items).set({ title: "Titre mutable remplacé" })
        .where(eq(items.id, task.id));
      await expectFrozen("item rename");
      await db.update(items).set({ estimatePoints: 1 }).where(eq(items.id, task.id));
      await expectFrozen("re-estimate");
      await db.update(items).set({ statusId: f.todo.id }).where(eq(items.id, task.id));
      await expectFrozen("status change");
      await db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, task.id));
      await expectFrozen("soft delete");
      await db.delete(items).where(eq(items.id, task.id));
      await expectFrozen("purge");
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("ignores memberships closed during planning when identifying initial work", async () => {
    const f = await fixture();
    try {
      const kept = await insertTask(f, "Conservée", 5);
      const removed = await insertTask(f, "Retirée avant démarrage", 3);
      const readded = await insertTask(f, "Retirée puis réajoutée", 2);
      const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [kept.id, removed.id, readded.id], sprintId: sprint.id },
        f.actor.id,
      );
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [removed.id, readded.id], sprintId: null },
        f.actor.id,
      );
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [readded.id], sprintId: sprint.id },
        f.actor.id,
      );
      await startSprint({
        id: sprint.id,
        backlogId: f.backlog.id,
        name: sprint.name,
        goal: "Objectif immuable",
        startAt: startedAt.toISOString(),
        endAt: targetEndAt.toISOString(),
        capacityPoints: 13,
      }, f.actor.id);

      const report = await getBurndownReport(f.backlog.id, sprint.id, options);
      expect(report).toMatchObject({
        kind: "active",
        summary: { initialRemainingPoints: 7, remainingPoints: 7 },
        planningComparison: { commitmentPoints: 7 },
      });
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("observes active sprints after the snapshot when no explicit time is given", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Course de lecture", 5);
      const active = await startWithTasks(f, [task.id]);
      const calledAt = new Date("2026-08-12T09:00:00.000Z");
      const committedAt = new Date("2026-08-12T09:00:01.000Z");
      const readAt = new Date("2026-08-12T09:00:02.000Z");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(calledAt);
      const originalTransaction = db.transaction.bind(db);
      const transactionSpy = vi.spyOn(db, "transaction").mockImplementationOnce(
        async (callback, config) => {
          // A mutation commits while the reader is still waiting for a connection.
          await appendCompletionEvent(f, active.id, task, committedAt);
          vi.setSystemTime(readAt);
          return originalTransaction(callback, config);
        },
      );
      try {
        const report = await getBurndownReport(f.backlog.id, active.id, {
          eventPage: 1,
          pageSize: 50,
        });
        expect(report).toMatchObject({
          kind: "active",
          summary: { remainingPoints: 0, completedPoints: 5 },
        });
      } finally {
        transactionSpy.mockRestore();
      }
    } finally {
      vi.useRealTimers();
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("keeps exact points of soft-deleted items unlinked, like their journal events", async () => {
    const f = await fixture();
    try {
      const deleted = await insertTask(f, "Supprimée en cours de sprint", 5);
      const kept = await insertTask(f, "Toujours accessible", 3);
      const active = await startWithTasks(f, [deleted.id, kept.id]);
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2026-08-05T09:00:00.000Z"));
        await updateItem({ id: deleted.id, estimatePoints: 8 }, f.actor.id, "estimate-deleted");
        await updateItem({ id: kept.id, estimatePoints: 2 }, f.actor.id, "estimate-kept");
        vi.setSystemTime(new Date("2026-08-06T09:00:00.000Z"));
        await softDeleteItem({ id: deleted.id }, f.actor.id, "soft-delete");
      } finally {
        vi.useRealTimers();
      }

      const report = await getBurndownReport(f.backlog.id, active.id, options);
      if (!report || report.kind !== "active") throw new Error("Rapport actif attendu.");
      expect(report.summary.remainingPoints).toBe(2);
      const deletedPoints = report.eventPoints.rows.filter((point) => point.itemKey === deleted.key);
      expect(deletedPoints.map((point) => point.cause)).toEqual(["item_removed", "estimate_changed"]);
      expect(deletedPoints.map((point) => point.itemId)).toEqual([null, null]);
      expect(report.eventPoints.rows.find((point) => point.itemKey === kept.key))
        .toMatchObject({ itemId: kept.id });
      expect(report.eventPoints.rows.map((point) => point.itemId)).toEqual(
        report.events.rows.map((event) => event.itemId),
      );
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("returns identity-only legacy results for a missing initial done fact", async () => {
    const f = await fixture();
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
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("returns identity-only legacy results for a missing added done fact", async () => {
    const f = await fixture();
    let eventConstraintNeedsValidation = false;
    try {
      const task = await insertTask(f, "Initial valide", 3);
      const active = await startWithTasks(f, [task.id]);
      const added = await insertTask(f, "Legacy ajout", 2);
      await assignAt(f, [added.id], active.id, new Date("2026-08-05T09:00:00.000Z"));
      await expect(getBurndownReport(f.backlog.id, active.id, options))
        .resolves.toMatchObject({ kind: "active" });

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

  it("returns identity-only legacy results for completed sprints missing done facts", async () => {
    const initialFixture = await fixture();
    const addedFixture = await fixture();
    let eventConstraintNeedsValidation = false;
    const complete = async (f: Fixture, sprintId: string) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(completionAt);
      try {
        await completeSprint(
          { id: sprintId, backlogId: f.backlog.id, destination: { type: "backlog" } },
          f.actor.id,
          "burndown-legacy-completed",
        );
      } finally {
        vi.useRealTimers();
      }
    };
    try {
      const initialTask = await insertTask(initialFixture, "Legacy initial figé", 3);
      const initialSprint = await startWithTasks(initialFixture, [initialTask.id]);
      await complete(initialFixture, initialSprint.id);
      await expect(getBurndownReport(initialFixture.backlog.id, initialSprint.id, options))
        .resolves.toMatchObject({ kind: "completed" });
      await corruptHistory(async (client) => {
        await client.query(
          "update sprint_report_items set done_at_start = null where sprint_id = $1",
          [initialSprint.id],
        );
      });
      const initialLegacy = await getBurndownReport(
        initialFixture.backlog.id,
        initialSprint.id,
        options,
      );
      expect(initialLegacy).toEqual({
        kind: "legacy_unavailable",
        reason: "legacy_history",
        sprint: expect.objectContaining({ id: initialSprint.id, completedAt: completionAt }),
      });

      const kept = await insertTask(addedFixture, "Initial figé valide", 3);
      const addedSprint = await startWithTasks(addedFixture, [kept.id]);
      const added = await insertTask(addedFixture, "Ajout figé legacy", 2);
      await assignAt(addedFixture, [added.id], addedSprint.id, new Date("2026-08-05T09:00:00.000Z"));
      await complete(addedFixture, addedSprint.id);
      await expect(getBurndownReport(addedFixture.backlog.id, addedSprint.id, options))
        .resolves.toMatchObject({ kind: "completed" });
      await makeAddedEventLegacy(addedSprint.id);
      eventConstraintNeedsValidation = true;
      const addedLegacy = await getBurndownReport(
        addedFixture.backlog.id,
        addedSprint.id,
        options,
      );
      expect(addedLegacy).toEqual({
        kind: "legacy_unavailable",
        reason: "legacy_history",
        sprint: expect.objectContaining({ id: addedSprint.id }),
      });
    } finally {
      await cleanupBacklogs(initialFixture.backlog.id, addedFixture.backlog.id);
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
      // The estimate after event i cycles through 1..7 and never repeats consecutively.
      const estimateAfter = (index: number) => ((index + 1) % 7) + 1;
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
        previousEstimate: estimateAfter(index - 1),
        nextEstimate: estimateAfter(index),
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
      expect(report.summary.remainingPoints).toBe(estimateAfter(9_999));
      expect(report.displayPoints.length).toBeLessThanOrEqual(600);
      console.info("burndown-10k-events", { durationMs, eventCount: report.events.total });

      const pageSize = 100;
      const descendingPoints: NonNullable<typeof report.eventPoints.rows> = [];
      for (let page = 1; page <= Math.ceil(10_001 / pageSize); page += 1) {
        const paged = await getBurndownReport(f.backlog.id, active.id, {
          ...options,
          eventPage: page,
          pageSize,
        });
        if (!paged || paged.kind !== "active") throw new Error("Rapport actif attendu.");
        expect(paged.eventPoints).toMatchObject({ page, pageSize, total: 10_001 });
        expect(paged.eventPoints.rows.map((point) => point.sequence)).toEqual(
          paged.events.rows.map((event) => event.sequence),
        );
        expect(paged.eventPoints.rows).toHaveLength(page === 101 ? 1 : pageSize);
        descendingPoints.push(...paged.eventPoints.rows);
      }
      const points = descendingPoints.toReversed();
      expect(points).toHaveLength(10_001);
      expect(points[0]).toMatchObject({ cause: "sprint_started", remainingPoints: 1, deltaPoints: 0 });
      for (let index = 1; index < points.length; index += 1) {
        expect(points[index]!.sequence! > points[index - 1]!.sequence!).toBe(true);
      }
      expect(points.slice(1).map((point) => ({
        cause: point.cause,
        remainingPoints: point.remainingPoints,
        deltaPoints: point.deltaPoints,
      }))).toEqual(eventRows.map((_, index) => ({
        cause: "estimate_changed",
        remainingPoints: estimateAfter(index),
        deltaPoints: estimateAfter(index) - estimateAfter(index - 1),
      })));
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  }, 180_000);

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
