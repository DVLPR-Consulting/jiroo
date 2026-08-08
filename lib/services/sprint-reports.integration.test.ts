import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogs,
  items,
  sprintReportSnapshots,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import { appendSprintEventsInTx } from "@/lib/services/sprint-events";
import { updateItem } from "@/lib/services/items";
import { completeSprint, startSprint } from "@/lib/services/sprint-lifecycle";
import {
  getSprintReport,
  getVelocityReport,
  listReportableSprints,
} from "@/lib/services/sprint-reports";
import { assignItemsToSprint, createSprint } from "@/lib/services/sprints";
import { withSprintHistoryCleanup } from "@/test-utils/sprint-history-cleanup";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

async function cleanupBacklogs(...backlogIds: string[]) {
  const client = await databasePool.connect();
  await client.query("begin");
  try {
    await withSprintHistoryCleanup(client, async () => {
      await client.query("delete from sprint_report_items where backlog_id = any($1::uuid[])", [backlogIds]);
      await client.query("delete from sprint_report_snapshots where backlog_id = any($1::uuid[])", [backlogIds]);
      await client.query("delete from sprint_events where backlog_id = any($1::uuid[])", [backlogIds]);
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
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: `RP${suffix}`, name: "Rapports de sprint", color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  const [todo, done] = await db
    .insert(statuses)
    .values([
      { backlogId: backlog.id, name: "À faire", category: "todo", order: 0, color: "#999999" },
      { backlogId: backlog.id, name: "Terminé", category: "done", order: 1, color: "#22c55e" },
    ])
    .returning();
  if (!todo || !done) throw new Error("Fixture statuts impossible.");
  return { actor, backlog, todo, done };
}

async function insertTask(
  f: Awaited<ReturnType<typeof fixture>>,
  title: string,
  estimatePoints: number | null,
  statusId = f.todo.id,
) {
  const id = randomUUID();
  const [item] = await db
    .insert(items)
    .values({
      id,
      key: `${f.backlog.key}-${title.replaceAll(" ", "").slice(0, 8)}${id.slice(0, 4)}`,
      type: "tache",
      backlogId: f.backlog.id,
      title,
      statusId,
      estimatePoints,
      reporterId: f.actor.id,
      rank: `a${randomUUID().replaceAll("-", "")}`,
      path: `root.${id.replaceAll("-", "")}`,
    })
    .returning();
  if (!item) throw new Error("Fixture tâche impossible.");
  return item;
}

async function startWithTasks(
  f: Awaited<ReturnType<typeof fixture>>,
  taskIds: string[],
) {
  const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
  if (taskIds.length > 0) {
    await assignItemsToSprint(
      { backlogId: f.backlog.id, itemIds: taskIds, sprintId: sprint.id },
      f.actor.id,
    );
  }
  await startSprint(
    {
      id: sprint.id,
      backlogId: f.backlog.id,
      name: sprint.name,
      goal: "Objectif rapport",
      startAt: "2026-08-01T09:00:00.000Z",
      endAt: "2026-08-15T09:00:00.000Z",
      capacityPoints: 10,
    },
    f.actor.id,
  );
  return sprint;
}

async function insertDirectActiveSprint(
  f: Awaited<ReturnType<typeof fixture>>,
  itemCount: number,
) {
  const sprintId = randomUUID();
  const startedAt = new Date("2026-08-01T09:00:00.000Z");
  await db.insert(sprints).values({
    id: sprintId,
    backlogId: f.backlog.id,
    name: `Sprint volume ${itemCount}`,
    state: "active",
    rank: `q${randomUUID().replaceAll("-", "")}`,
    startedAt,
    createdBy: f.actor.id,
  });
  const taskRows = Array.from({ length: itemCount }, (_, index) => {
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
  for (let index = 0; index < taskRows.length; index += 500) {
    const batch = taskRows.slice(index, index + 500);
    await db.insert(items).values(batch);
    await db.insert(sprintItems).values(
      batch.map((item) => ({
        sprintId,
        itemId: item.id,
        joinedAt: startedAt,
        joinedBy: f.actor.id,
        estimateAtJoin: 1,
        estimateAtStart: 1,
      })),
    );
  }
  return sprintId;
}

const pages = { itemPage: 1, eventPage: 1, pageSize: 50 };

describeDb("sprint report reads", () => {
  it("lists only active and completed sprints and returns active, frozen, legacy, and null states", async () => {
    const f = await fixture();
    const foreign = await fixture();
    try {
      const doneTask = await insertTask(f, "Lecture terminée", 3, f.done.id);
      const openTask = await insertTask(f, "Lecture ouverte", null);
      const active = await startWithTasks(f, [doneTask.id, openTask.id]);
      const planned = await createSprint({ backlogId: f.backlog.id }, f.actor.id);

      const selector = await listReportableSprints(f.backlog.id);
      expect(selector.plannedCount).toBe(1);
      expect(selector.sprints).toEqual([
        expect.objectContaining({ id: active.id, state: "active", hasSnapshot: false }),
      ]);
      await expect(getSprintReport(f.backlog.id, planned.id, pages)).resolves.toBeNull();
      await expect(
        getSprintReport(f.backlog.id, randomUUID(), pages),
      ).resolves.toBeNull();

      const activeReport = await getSprintReport(f.backlog.id, active.id, pages);
      expect(activeReport).toMatchObject({
        kind: "active",
        statusLabel: "Données en cours",
        metrics: {
          initialItemCount: 2,
          committedPoints: 3,
          initialUnestimatedCount: 1,
          currentItemCount: 2,
          currentScopePoints: 3,
          currentUnestimatedCount: 1,
          completedItemCount: 1,
          completedPoints: 3,
        },
        items: { total: 2 },
      });

      await completeSprint(
        { id: active.id, backlogId: f.backlog.id, destination: { type: "backlog" } },
        f.actor.id,
        "complete-read-test",
      );
      await db.delete(items).where(eq(items.id, doneTask.id));
      await db.delete(items).where(eq(items.id, openTask.id));
      const completedReport = await getSprintReport(f.backlog.id, active.id, pages);
      expect(completedReport).toMatchObject({
        kind: "completed",
        statusLabel: "Historique figé",
        metrics: { initialItemCount: 2, completedPoints: 3 },
        sections: { completed: 1, incomplete: 0, removed: 0, carried: 1 },
      });
      if (completedReport?.kind !== "completed") throw new Error("Rapport figé attendu.");
      expect(completedReport.items.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            itemId: null,
            itemKey: doneTask.key,
            itemTitle: doneTask.title,
          }),
        ]),
      );
      expect(completedReport.items.rows.every((item) => item.itemId === null)).toBe(true);

      const legacyId = randomUUID();
      const now = new Date();
      await db.insert(sprints).values({
        id: legacyId,
        backlogId: f.backlog.id,
        name: "Sprint historique",
        state: "completed",
        rank: `z${randomUUID().replaceAll("-", "")}`,
        startedAt: now,
        completedAt: now,
        createdBy: f.actor.id,
      });
      await expect(getSprintReport(f.backlog.id, legacyId, pages)).resolves.toMatchObject({
        kind: "legacy_unavailable",
        statusLabel: "Historique détaillé indisponible",
      });
      const foreignSprint = await createSprint(
        { backlogId: foreign.backlog.id },
        foreign.actor.id,
      );
      await expect(
        getSprintReport(f.backlog.id, foreignSprint.id, pages),
      ).resolves.toBeNull();
    } finally {
      await cleanupBacklogs(f.backlog.id, foreign.backlog.id);
    }
  });

  it("computes velocity inclusion from immutable headers in chronological display order", async () => {
    const f = await fixture();
    try {
      const rows = [
        { name: "Sprint A", committed: 10, completed: 0, snapshot: true },
        { name: "Sprint B", committed: 0, completed: 0, snapshot: true },
        { name: "Sprint C", committed: 8, completed: 5, snapshot: true },
        { name: "Legacy", committed: 0, completed: 0, snapshot: false },
      ];
      const sprintIds: string[] = [];
      for (const [index, row] of rows.entries()) {
        const sprintId = randomUUID();
        sprintIds.push(sprintId);
        const completedAt = new Date(Date.UTC(2026, 7, index + 1));
        await db.insert(sprints).values({
          id: sprintId,
          backlogId: f.backlog.id,
          name: row.name,
          state: "completed",
          rank: `v${index}`,
          startedAt: new Date(completedAt.getTime() - 86_400_000),
          completedAt,
          createdBy: f.actor.id,
        });
        if (row.snapshot) {
          await db.insert(sprintReportSnapshots).values({
            backlogId: f.backlog.id,
            sprintId,
            sprintName: row.name,
            sprintGoal: null,
            startedAt: new Date(completedAt.getTime() - 86_400_000),
            completedAt,
            createdAt: completedAt,
            createdBy: f.actor.id,
            initialItemCount: 1,
            committedPoints: row.committed,
            initialUnestimatedCount: 0,
            finalItemCount: 1,
            completedItemCount: row.completed > 0 ? 1 : 0,
            completedPoints: row.completed,
            finalUnestimatedCount: 0,
            grossPointsAdded: 0,
            grossPointsRemoved: 0,
            netEstimateDelta: 0,
            scopeEventCount: 0,
            finalDestinationSummary: { backlog: 0, sprints: [] },
            requestCorrelationId: `velocity-${index}`,
          });
        }
      }
      await db
        .update(sprints)
        .set({ name: "Nom courant remplacé" })
        .where(eq(sprints.id, sprintIds[2]!));

      const report = await getVelocityReport(f.backlog.id, 7);
      expect(report).toMatchObject({
        state: "ready",
        population: 2,
        averageCompletedPoints: 2.5,
      });
      expect(report.bars.map((bar) => bar.sprintName)).toEqual(rows.map((row) => row.name));
      expect(report.bars.map((bar) => [bar.includedInAverage, bar.excludedReason])).toEqual([
        [true, null],
        [false, "no_point_data"],
        [true, null],
        [false, "history_unavailable"],
      ]);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("projects empty and all-unestimated active scope without inventing points", async () => {
    const f = await fixture();
    try {
      const empty = await startWithTasks(f, []);
      await expect(getSprintReport(f.backlog.id, empty.id, pages)).resolves.toMatchObject({
        kind: "active",
        metrics: {
          initialItemCount: 0,
          committedPoints: 0,
          initialUnestimatedCount: 0,
          currentItemCount: 0,
          currentScopePoints: 0,
          currentUnestimatedCount: 0,
        },
        items: { total: 0, rows: [] },
      });
      await completeSprint(
        { id: empty.id, backlogId: f.backlog.id, destination: { type: "backlog" } },
        f.actor.id,
      );

      const first = await insertTask(f, "Sans points un", null);
      const second = await insertTask(f, "Sans points deux", null);
      const active = await startWithTasks(f, [first.id, second.id]);
      await expect(getSprintReport(f.backlog.id, active.id, pages)).resolves.toMatchObject({
        kind: "active",
        metrics: {
          initialItemCount: 2,
          committedPoints: 0,
          initialUnestimatedCount: 2,
          currentItemCount: 2,
          currentScopePoints: 0,
          currentUnestimatedCount: 2,
        },
      });
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("uses frozen event identity after removal and purge and orders equal timestamps by sequence", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Journal figé", 5);
      const active = await startWithTasks(f, []);
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [task.id], sprintId: active.id },
        f.actor.id,
        "report-add",
      );
      const [membership] = await db
        .select({ id: sprintItems.id })
        .from(sprintItems)
        .where(eq(sprintItems.itemId, task.id));
      if (!membership) throw new Error("Appartenance attendue.");
      const sameTime = new Date("2026-08-08T12:00:00.000Z");
      await db.transaction(async (tx) => {
        await appendSprintEventsInTx(tx, [
          {
            type: "item_completed",
            backlogId: f.backlog.id,
            sprintId: active.id,
            membershipId: membership.id,
            item: { id: task.id, key: task.key, title: task.title },
            actorId: f.actor.id,
            correlationId: "same-time-complete",
            occurredAt: sameTime,
          },
          {
            type: "item_reopened",
            backlogId: f.backlog.id,
            sprintId: active.id,
            membershipId: membership.id,
            item: { id: task.id, key: task.key, title: task.title },
            actorId: f.actor.id,
            correlationId: "same-time-reopen",
            occurredAt: sameTime,
          },
        ]);
      });
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [task.id], sprintId: null },
        f.actor.id,
        "report-remove",
      );
      const beforePurge = await getSprintReport(f.backlog.id, active.id, pages);
      if (beforePurge?.kind !== "active") throw new Error("Rapport actif attendu.");
      expect(beforePurge.items.rows).toEqual([
        expect.objectContaining({
          itemId: task.id,
          itemKey: task.key,
          section: "removed",
        }),
      ]);
      await db.delete(items).where(eq(items.id, task.id));

      const report = await getSprintReport(f.backlog.id, active.id, pages);
      if (report?.kind !== "active") throw new Error("Rapport actif attendu.");
      expect(report.items.rows).toEqual([
        expect.objectContaining({
          itemId: null,
          itemKey: task.key,
          itemTitle: task.title,
          addedAfterStart: true,
          removedAfterStart: true,
          section: "removed",
        }),
      ]);
      const sameTimeEvents = report.events.rows.filter(
        (event) => event.occurredAt.getTime() === sameTime.getTime(),
      );
      expect(sameTimeEvents.map((event) => event.eventType)).toEqual([
        "item_completed",
        "item_reopened",
      ]);
      expect(sameTimeEvents[0]!.sequence < sameTimeEvents[1]!.sequence).toBe(true);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("keeps a null current estimate after remove, unestimate, and re-add", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Retour non estimé", 5);
      const active = await startWithTasks(f, []);
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [task.id], sprintId: active.id },
        f.actor.id,
        "null-reentry-add",
      );
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [task.id], sprintId: null },
        f.actor.id,
        "null-reentry-remove",
      );
      await updateItem(
        { id: task.id, estimatePoints: null, statusId: f.done.id },
        f.actor.id,
        "null-reentry-edit",
      );
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [task.id], sprintId: active.id },
        f.actor.id,
        "null-reentry-return",
      );

      const report = await getSprintReport(f.backlog.id, active.id, pages);
      if (report?.kind !== "active") throw new Error("Rapport actif attendu.");
      expect(report.metrics).toMatchObject({
        currentScopePoints: 0,
        currentUnestimatedCount: 1,
        completedItemCount: 1,
        completedPoints: 0,
      });
      expect(report.items.rows).toEqual([
        expect.objectContaining({
          itemKey: task.key,
          estimateAtFinalParticipation: null,
          estimateAtCompletion: null,
          statusCategory: "done",
          section: "completed",
        }),
      ]);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("keeps active report query count fixed from five to one thousand items", async () => {
    const small = await fixture();
    const large = await fixture();
    const querySpy = vi.spyOn(Client.prototype, "query");
    try {
      const smallSprintId = await insertDirectActiveSprint(small, 5);
      const largeSprintId = await insertDirectActiveSprint(large, 1_000);

      querySpy.mockClear();
      const smallReport = await getSprintReport(small.backlog.id, smallSprintId, pages);
      const smallQueryCount = querySpy.mock.calls.length;
      querySpy.mockClear();
      const largeReport = await getSprintReport(large.backlog.id, largeSprintId, pages);
      const largeQueryCount = querySpy.mock.calls.length;

      expect(smallReport).toMatchObject({ kind: "active", items: { total: 5 } });
      expect(largeReport).toMatchObject({ kind: "active", items: { total: 1_000 } });
      if (smallReport?.kind !== "active" || largeReport?.kind !== "active") {
        throw new Error("Rapports actifs attendus.");
      }
      expect(smallReport.items.rows).toHaveLength(5);
      expect(largeReport.items.rows).toHaveLength(50);
      expect(largeReport.events.rows.length).toBeLessThanOrEqual(50);
      expect(largeQueryCount).toBe(smallQueryCount);
    } finally {
      querySpy.mockRestore();
      await cleanupBacklogs(small.backlog.id, large.backlog.id);
    }
  });

  it("returns a transactionally consistent active projection during an estimate update", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Lecture concurrente", 1);
      const active = await startWithTasks(f, [task.id]);
      const [report] = await Promise.all([
        getSprintReport(f.backlog.id, active.id, pages),
        updateItem({ id: task.id, estimatePoints: 5 }, f.actor.id, "concurrent-read"),
      ]);
      if (report?.kind !== "active") throw new Error("Rapport actif attendu.");
      const values = [
        report.metrics.currentScopePoints,
        report.items.rows[0]?.estimateAtFinalParticipation,
      ];
      expect([[1, 1], [5, 5]]).toContainEqual(values);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("throws instead of returning partial totals for an inconsistent open membership", async () => {
    const f = await fixture();
    try {
      const active = await startWithTasks(f, []);
      const id = randomUUID();
      await db.insert(items).values({
        id,
        key: `${f.backlog.key}-EPIC`,
        type: "epic",
        backlogId: f.backlog.id,
        title: "Structure invalide",
        statusId: f.todo.id,
        reporterId: f.actor.id,
        rank: `e${randomUUID().replaceAll("-", "")}`,
        path: `root.${id.replaceAll("-", "")}`,
      });
      await db.insert(sprintItems).values({
        sprintId: active.id,
        itemId: id,
        joinedBy: f.actor.id,
      });

      await expect(getSprintReport(f.backlog.id, active.id, pages)).rejects.toMatchObject({
        name: "InconsistentSprintReportError",
        message: "Le rapport de sprint est temporairement indisponible.",
      });
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });
});
