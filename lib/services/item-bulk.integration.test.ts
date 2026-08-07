import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  backlogs,
  itemFixVersions,
  items,
  releases,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import { bulkUpdateItems } from "@/lib/services/item-bulk";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(): string {
  return `B${randomUUID().replace(/[^a-f]/gi, "").slice(0, 5).toUpperCase()}`;
}

async function createBulkFixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");

  const [backlog, foreignBacklog] = await db
    .insert(backlogs)
    .values([
      { key: randomBacklogKey(), name: "Bulk", color: "#475569" },
      { key: randomBacklogKey(), name: "Étranger", color: "#64748b" },
    ])
    .returning();
  const [todo, done, foreignStatus] = await db
    .insert(statuses)
    .values([
      {
        backlogId: backlog!.id,
        name: "À faire",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      },
      {
        backlogId: backlog!.id,
        name: "Terminé",
        category: "done",
        order: 1,
        color: "#3aa675",
      },
      {
        backlogId: foreignBacklog!.id,
        name: "Étranger",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      },
    ])
    .returning();

  const componentId = randomUUID();
  const taskAId = randomUUID();
  const taskBId = randomUUID();
  const foreignTaskId = randomUUID();
  const componentPath = `root.${componentId.replaceAll("-", "")}`;
  await db.insert(items).values([
    {
      id: componentId,
      key: `${backlog!.key}-1`,
      type: "composant",
      backlogId: backlog!.id,
      title: "Produit",
      statusId: todo!.id,
      reporterId: actor.id,
      rank: "a0",
      path: componentPath,
      depth: 0,
    },
    {
      id: taskAId,
      key: `${backlog!.key}-2`,
      type: "tache",
      backlogId: backlog!.id,
      title: "Tâche A",
      parentId: componentId,
      statusId: todo!.id,
      reporterId: actor.id,
      rank: "a1",
      path: `${componentPath}.${taskAId.replaceAll("-", "")}`,
      depth: 1,
    },
    {
      id: taskBId,
      key: `${backlog!.key}-3`,
      type: "tache",
      backlogId: backlog!.id,
      title: "Tâche B",
      parentId: componentId,
      statusId: todo!.id,
      reporterId: actor.id,
      rank: "a2",
      path: `${componentPath}.${taskBId.replaceAll("-", "")}`,
      depth: 1,
    },
    {
      id: foreignTaskId,
      key: `${foreignBacklog!.key}-1`,
      type: "tache",
      backlogId: foreignBacklog!.id,
      title: "Tâche étrangère",
      statusId: foreignStatus!.id,
      reporterId: actor.id,
      rank: "a0",
      path: `root.${foreignTaskId.replaceAll("-", "")}`,
      depth: 0,
    },
  ]);

  return {
    actorId: actor.id,
    backlogId: backlog!.id,
    foreignBacklogId: foreignBacklog!.id,
    todoId: todo!.id,
    doneId: done!.id,
    foreignStatusId: foreignStatus!.id,
    componentId,
    taskAId,
    taskBId,
    foreignTaskId,
  };
}

async function cleanupFixture(fixture: Awaited<ReturnType<typeof createBulkFixture>>) {
  await db
    .delete(backlogs)
    .where(inArray(backlogs.id, [fixture.backlogId, fixture.foreignBacklogId]));
}

describeDb("bulkUpdateItems transaction", () => {
  it("supports the validated maximum of 500 items and 100 fix versions", async () => {
    const fixture = await createBulkFixture();
    try {
      const extraItemIds = Array.from({ length: 498 }, () => randomUUID());
      await db.insert(items).values(
        extraItemIds.map((id, index) => ({
          id,
          key: `SCALE-${id}`,
          type: "tache" as const,
          backlogId: fixture.backlogId,
          title: `Tâche volume ${index}`,
          statusId: fixture.todoId,
          reporterId: fixture.actorId,
          rank: `scale-${index.toString().padStart(3, "0")}`,
          path: `root.${id.replaceAll("-", "")}`,
          depth: 0,
        })),
      );
      const releaseRows = await db
        .insert(releases)
        .values(
          Array.from({ length: 100 }, (_, index) => ({
            backlogId: fixture.backlogId,
            name: `Volume ${index.toString().padStart(3, "0")}`,
            createdBy: fixture.actorId,
          })),
        )
        .returning({ id: releases.id });
      const itemIds = [fixture.taskAId, fixture.taskBId, ...extraItemIds];

      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds,
            patch: {
              field: "fixVersionIds",
              mode: "replace",
              value: releaseRows.map(({ id }) => id),
            },
          },
          fixture.actorId,
          "fix-version-scale-test",
        ),
      ).resolves.toEqual({ changedCount: 500, unchangedCount: 0 });

      const counts = await db
        .select({ assignmentCount: sql<number>`count(*)::int` })
        .from(itemFixVersions)
        .where(inArray(itemFixVersions.itemId, itemIds));
      expect(counts[0]?.assignmentCount).toBe(50_000);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("updates two priorities and writes one activity per changed item", async () => {
    const fixture = await createBulkFixture();
    try {
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId, fixture.taskBId],
            patch: { field: "priority", value: 4 },
          },
          fixture.actorId,
        ),
      ).resolves.toEqual({ changedCount: 2, unchangedCount: 0 });

      const stored = await db
        .select({ id: items.id, priority: items.priority })
        .from(items)
        .where(inArray(items.id, [fixture.taskAId, fixture.taskBId]))
        .orderBy(asc(items.id));
      expect(stored.map((row) => row.priority)).toEqual([4, 4]);
      const audit = await db
        .select({ field: activities.field })
        .from(activities)
        .where(inArray(activities.itemId, [fixture.taskAId, fixture.taskBId]));
      expect(audit).toEqual([{ field: "priority" }, { field: "priority" }]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("counts no-op rows without updating or logging them", async () => {
    const fixture = await createBulkFixture();
    try {
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId, fixture.taskBId],
            patch: { field: "priority", value: 0 },
          },
          fixture.actorId,
        ),
      ).resolves.toEqual({ changedCount: 0, unchangedCount: 2 });
      expect(
        await db
          .select({ id: activities.id })
          .from(activities)
          .where(inArray(activities.itemId, [fixture.taskAId, fixture.taskBId])),
      ).toEqual([]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rolls back every row when one selected item belongs to another backlog", async () => {
    const fixture = await createBulkFixture();
    try {
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId, fixture.foreignTaskId],
            patch: { field: "priority", value: 4 },
          },
          fixture.actorId,
        ),
      ).rejects.toThrow("Tous les items doivent appartenir au backlog.");
      const stored = await db
        .select({ priority: items.priority })
        .from(items)
        .where(inArray(items.id, [fixture.taskAId, fixture.foreignTaskId]));
      expect(stored.map((row) => row.priority)).toEqual([0, 0]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rejects a deleted selected item before changing another row", async () => {
    const fixture = await createBulkFixture();
    try {
      await db
        .update(items)
        .set({ deletedAt: new Date() })
        .where(eq(items.id, fixture.taskBId));
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId, fixture.taskBId],
            patch: { field: "priority", value: 4 },
          },
          fixture.actorId,
        ),
      ).rejects.toThrow("Un ou plusieurs items sont introuvables.");
      const [taskA] = await db.select().from(items).where(eq(items.id, fixture.taskAId));
      expect(taskA?.priority).toBe(0);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("updates closedAt on status category boundaries and rejects foreign statuses", async () => {
    const fixture = await createBulkFixture();
    try {
      await bulkUpdateItems(
        {
          backlogId: fixture.backlogId,
          itemIds: [fixture.taskAId],
          patch: { field: "statusId", value: fixture.doneId },
        },
        fixture.actorId,
      );
      let [stored] = await db.select().from(items).where(eq(items.id, fixture.taskAId));
      expect(stored?.statusId).toBe(fixture.doneId);
      expect(stored?.closedAt).toBeInstanceOf(Date);

      await bulkUpdateItems(
        {
          backlogId: fixture.backlogId,
          itemIds: [fixture.taskAId],
          patch: { field: "statusId", value: fixture.todoId },
        },
        fixture.actorId,
      );
      [stored] = await db.select().from(items).where(eq(items.id, fixture.taskAId));
      expect(stored?.closedAt).toBeNull();

      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId],
            patch: { field: "statusId", value: fixture.foreignStatusId },
          },
          fixture.actorId,
        ),
      ).rejects.toThrow("Statut invalide pour ce backlog.");
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("validates assignees once and supports assigning then clearing", async () => {
    const fixture = await createBulkFixture();
    try {
      await bulkUpdateItems(
        {
          backlogId: fixture.backlogId,
          itemIds: [fixture.taskAId, fixture.taskBId],
          patch: { field: "assigneeId", value: fixture.actorId },
        },
        fixture.actorId,
      );
      await bulkUpdateItems(
        {
          backlogId: fixture.backlogId,
          itemIds: [fixture.taskAId, fixture.taskBId],
          patch: { field: "assigneeId", value: null },
        },
        fixture.actorId,
      );
      const stored = await db
        .select({ assigneeId: items.assigneeId })
        .from(items)
        .where(inArray(items.id, [fixture.taskAId, fixture.taskBId]));
      expect(stored.map((row) => row.assigneeId)).toEqual([null, null]);

      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId],
            patch: { field: "assigneeId", value: `missing-${randomUUID()}` },
          },
          fixture.actorId,
        ),
      ).rejects.toThrow("Assigné introuvable.");
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rolls back estimates unless every selected item is a task", async () => {
    const fixture = await createBulkFixture();
    try {
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId, fixture.componentId],
            patch: { field: "estimatePoints", value: 5 },
          },
          fixture.actorId,
        ),
      ).rejects.toThrow("Seules les tâches peuvent être estimées.");
      const stored = await db
        .select({ estimatePoints: items.estimatePoints })
        .from(items)
        .where(inArray(items.id, [fixture.taskAId, fixture.componentId]));
      expect(stored.map((row) => row.estimatePoints)).toEqual([null, null]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("assigns and clears a sprint through the shared historical membership transaction", async () => {
    const fixture = await createBulkFixture();
    try {
      const [sprint] = await db
        .insert(sprints)
        .values({
          backlogId: fixture.backlogId,
          name: "Sprint bulk",
          rank: "a0",
          createdBy: fixture.actorId,
        })
        .returning();

      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId, fixture.taskBId],
            patch: { field: "sprintId", value: sprint!.id },
          },
          fixture.actorId,
        ),
      ).resolves.toEqual({ changedCount: 2, unchangedCount: 0 });
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId],
            patch: { field: "sprintId", value: null },
          },
          fixture.actorId,
        ),
      ).resolves.toEqual({ changedCount: 1, unchangedCount: 0 });

      const current = await db
        .select({ itemId: sprintItems.itemId })
        .from(sprintItems)
        .where(
          and(
            inArray(sprintItems.itemId, [fixture.taskAId, fixture.taskBId]),
            isNull(sprintItems.leftAt),
          ),
        );
      expect(current).toEqual([{ itemId: fixture.taskBId }]);
      const history = await db
        .select({ outcome: sprintItems.outcome, leftAt: sprintItems.leftAt })
        .from(sprintItems)
        .where(eq(sprintItems.itemId, fixture.taskAId));
      expect(history[0]).toMatchObject({ outcome: "removed" });
      expect(history[0]?.leftAt).toBeInstanceOf(Date);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rolls back sprint bulk assignment when one selected item is structural", async () => {
    const fixture = await createBulkFixture();
    try {
      const [sprint] = await db
        .insert(sprints)
        .values({
          backlogId: fixture.backlogId,
          name: "Sprint rollback",
          rank: "a0",
          createdBy: fixture.actorId,
        })
        .returning();

      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId, fixture.componentId],
            patch: { field: "sprintId", value: sprint!.id },
          },
          fixture.actorId,
        ),
      ).rejects.toThrow("Seules les tâches peuvent être planifiées dans un sprint.");
      const current = await db
        .select({ id: sprintItems.id })
        .from(sprintItems)
        .where(
          and(
            inArray(sprintItems.itemId, [fixture.taskAId, fixture.componentId]),
            isNull(sprintItems.leftAt),
          ),
        );
      expect(current).toEqual([]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("counts mixed fix-version no-ops exactly and preserves unrelated versions", async () => {
    const fixture = await createBulkFixture();
    const [releaseA, releaseB] = await db
      .insert(releases)
      .values([
        { backlogId: fixture.backlogId, name: "Bulk A", createdBy: fixture.actorId },
        { backlogId: fixture.backlogId, name: "Bulk B", createdBy: fixture.actorId },
      ])
      .returning();
    await db.insert(itemFixVersions).values([
      { backlogId: fixture.backlogId, itemId: fixture.taskAId, releaseId: releaseA!.id },
      { backlogId: fixture.backlogId, itemId: fixture.taskAId, releaseId: releaseB!.id },
    ]);
    try {
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskBId, fixture.taskAId],
            patch: { field: "fixVersionIds", mode: "add", value: [releaseA!.id] },
          },
          fixture.actorId,
          "bulk-mixed",
        ),
      ).resolves.toEqual({ changedCount: 1, unchangedCount: 1 });
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId],
            patch: { field: "fixVersionIds", mode: "remove", value: [releaseA!.id] },
          },
          fixture.actorId,
          "bulk-remove",
        ),
      ).resolves.toEqual({ changedCount: 1, unchangedCount: 0 });

      const taskARows = await db
        .select({ releaseId: itemFixVersions.releaseId })
        .from(itemFixVersions)
        .where(eq(itemFixVersions.itemId, fixture.taskAId));
      expect(taskARows).toEqual([{ releaseId: releaseB!.id }]);
      const mixedAudit = await db
        .select({ itemId: activities.itemId, correlationId: activities.requestCorrelationId })
        .from(activities)
        .where(eq(activities.requestCorrelationId, "bulk-mixed"));
      expect(mixedAudit).toEqual([
        { itemId: fixture.taskBId, correlationId: "bulk-mixed" },
      ]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("uses one correlation for every changed item and records JSON labels", async () => {
    const fixture = await createBulkFixture();
    const [release] = await db
      .insert(releases)
      .values({
        backlogId: fixture.backlogId,
        name: "Bulk shared",
        releaseDate: "2026-08-07",
        createdBy: fixture.actorId,
      })
      .returning();
    try {
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskBId, fixture.taskAId],
            patch: { field: "fixVersionIds", mode: "replace", value: [release!.id] },
          },
          fixture.actorId,
          "bulk-shared-correlation",
        ),
      ).resolves.toEqual({ changedCount: 2, unchangedCount: 0 });

      const audit = await db
        .select({
          itemId: activities.itemId,
          oldValue: activities.oldValue,
          newValue: activities.newValue,
          correlationId: activities.requestCorrelationId,
        })
        .from(activities)
        .where(eq(activities.requestCorrelationId, "bulk-shared-correlation"))
        .orderBy(asc(activities.itemId));
      expect(audit).toEqual(
        [fixture.taskAId, fixture.taskBId].sort().map((itemId) => ({
          itemId,
          oldValue: "[]",
          newValue: JSON.stringify([{ id: release!.id, name: release!.name }]),
          correlationId: "bulk-shared-correlation",
        })),
      );
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("allows archived removal but rejects archived addition for the whole bulk operation", async () => {
    const fixture = await createBulkFixture();
    const [archived] = await db
      .insert(releases)
      .values({
        backlogId: fixture.backlogId,
        name: "Bulk archived",
        archivedAt: new Date(),
        createdBy: fixture.actorId,
      })
      .returning();
    await db.insert(itemFixVersions).values({
      backlogId: fixture.backlogId,
      itemId: fixture.taskAId,
      releaseId: archived!.id,
    });
    try {
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId, fixture.taskBId],
            patch: { field: "fixVersionIds", mode: "remove", value: [archived!.id] },
          },
          fixture.actorId,
          "bulk-archived-remove",
        ),
      ).resolves.toEqual({ changedCount: 1, unchangedCount: 1 });
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId, fixture.taskBId],
            patch: { field: "fixVersionIds", mode: "add", value: [archived!.id] },
          },
          fixture.actorId,
          "bulk-archived-add",
        ),
      ).rejects.toThrow("Une release archivée ne peut pas être ajoutée.");
      expect(
        await db
          .select({ id: itemFixVersions.itemId })
          .from(itemFixVersions)
          .where(inArray(itemFixVersions.itemId, [fixture.taskAId, fixture.taskBId])),
      ).toEqual([]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rolls back every fix-version row when the requested release is foreign", async () => {
    const fixture = await createBulkFixture();
    const [local, foreign] = await db
      .insert(releases)
      .values([
        { backlogId: fixture.backlogId, name: "Bulk local", createdBy: fixture.actorId },
        {
          backlogId: fixture.foreignBacklogId,
          name: "Bulk foreign",
          createdBy: fixture.actorId,
        },
      ])
      .returning();
    await db.insert(itemFixVersions).values({
      backlogId: fixture.backlogId,
      itemId: fixture.taskAId,
      releaseId: local!.id,
    });
    try {
      await expect(
        bulkUpdateItems(
          {
            backlogId: fixture.backlogId,
            itemIds: [fixture.taskAId, fixture.taskBId],
            patch: { field: "fixVersionIds", mode: "replace", value: [foreign!.id] },
          },
          fixture.actorId,
          "bulk-foreign",
        ),
      ).rejects.toThrow("Une ou plusieurs releases sont invalides pour ce backlog.");
      expect(
        await db
          .select({ itemId: itemFixVersions.itemId, releaseId: itemFixVersions.releaseId })
          .from(itemFixVersions)
          .where(inArray(itemFixVersions.itemId, [fixture.taskAId, fixture.taskBId])),
      ).toEqual([{ itemId: fixture.taskAId, releaseId: local!.id }]);
      expect(
        await db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.requestCorrelationId, "bulk-foreign")),
      ).toEqual([]);
    } finally {
      await cleanupFixture(fixture);
    }
  });
});
