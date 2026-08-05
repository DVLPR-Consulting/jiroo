import "dotenv/config";

import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogs, items, statuses } from "@/lib/db/schema/domain";
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
});
