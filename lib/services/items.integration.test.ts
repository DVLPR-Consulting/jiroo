import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  backlogs,
  items,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import {
  createItem,
  listItems,
  rankBacklogItem,
  restoreItem,
  updateItem,
} from "@/lib/services/items";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(): string {
  return `R${randomUUID().replace(/[^a-f]/gi, "").slice(0, 5).toUpperCase()}`;
}

describeDb("restoreItem transaction", () => {
  it("rejects an expired target before modifying its subtree", async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");

    const [backlog] = await db
      .insert(backlogs)
      .values({ key: randomBacklogKey(), name: "Restauration", color: "#475569" })
      .returning();
    const [status] = await db
      .insert(statuses)
      .values({
        backlogId: backlog!.id,
        name: "À faire",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      })
      .returning();

    const targetId = randomUUID();
    const childId = randomUUID();
    const deletedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const targetPath = `root.${targetId.replaceAll("-", "")}`;

    await db.insert(items).values([
      {
        id: targetId,
        key: `${backlog!.key}-1`,
        type: "composant",
        backlogId: backlog!.id,
        title: "Cible expirée",
        statusId: status!.id,
        reporterId: actor.id,
        rank: "a0",
        path: targetPath,
        depth: 0,
        deletedAt,
      },
      {
        id: childId,
        key: `${backlog!.key}-2`,
        type: "epic",
        backlogId: backlog!.id,
        title: "Descendant supprimé",
        parentId: targetId,
        statusId: status!.id,
        reporterId: actor.id,
        rank: "a1",
        path: `${targetPath}.${childId.replaceAll("-", "")}`,
        depth: 1,
        deletedAt,
      },
    ]);

    try {
      await expect(restoreItem({ id: targetId }, actor.id)).rejects.toThrow(
        "Délai de restauration dépassé.",
      );

      const stored = await db
        .select({ id: items.id, deletedAt: items.deletedAt })
        .from(items)
        .where(eq(items.backlogId, backlog!.id))
        .orderBy(asc(items.rank));
      expect(stored).toEqual([
        { id: targetId, deletedAt },
        { id: childId, deletedAt },
      ]);

      const audit = await db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.itemId, targetId));
      expect(audit).toEqual([]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, backlog!.id));
    }
  });
});

async function createUpdateFixture(reporterId?: string) {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");

  const [backlog] = await db
    .insert(backlogs)
    .values({ key: randomBacklogKey(), name: "Édition rapporteur", color: "#475569" })
    .returning();
  const [status] = await db
    .insert(statuses)
    .values({
      backlogId: backlog!.id,
      name: "À faire",
      category: "todo",
      order: 0,
      color: "#9aa0a6",
    })
    .returning();
  const itemId = randomUUID();
  const [item] = await db
    .insert(items)
    .values({
      id: itemId,
      key: `${backlog!.key}-1`,
      type: "composant",
      backlogId: backlog!.id,
      title: "Rapport transactionnel",
      statusId: status!.id,
      reporterId: reporterId ?? actor.id,
      rank: "a0",
      path: `root.${itemId.replaceAll("-", "")}`,
      depth: 0,
    })
    .returning();

  return {
    actorId: actor.id,
    backlogId: backlog!.id,
    item: item!,
  };
}

describeDb("createItem sprint transaction", () => {
  it("creates a task and its contextual sprint membership atomically", async () => {
    const fixture = await createTaskUpdateFixture();
    const [sprint] = await db
      .insert(sprints)
      .values({
        backlogId: fixture.backlogId,
        name: "Sprint contextuel",
        rank: "a0",
        createdBy: fixture.actorId,
      })
      .returning();
    try {
      const created = await createItem(
        {
          backlogId: fixture.backlogId,
          title: "Créée depuis le sprint",
          type: "tache",
          parentId: fixture.epicId,
          sprintId: sprint!.id,
        },
        fixture.actorId,
      );

      const [membership] = await db
        .select({
          sprintId: sprintItems.sprintId,
          itemId: sprintItems.itemId,
          leftAt: sprintItems.leftAt,
        })
        .from(sprintItems)
        .where(eq(sprintItems.itemId, created.id));
      expect(membership).toEqual({
        sprintId: sprint!.id,
        itemId: created.id,
        leftAt: null,
      });
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("rolls back the item for a completed or foreign sprint", async () => {
    const fixture = await createTaskUpdateFixture();
    const completedAt = new Date();
    const [completedSprint] = await db
      .insert(sprints)
      .values({
        backlogId: fixture.backlogId,
        name: "Sprint terminé",
        rank: "a0",
        state: "completed",
        startedAt: new Date(completedAt.getTime() - 60_000),
        completedAt,
        createdBy: fixture.actorId,
      })
      .returning();
    const [foreignBacklog] = await db
      .insert(backlogs)
      .values({
        key: randomBacklogKey(),
        name: "Backlog sprint étranger",
        color: "#475569",
      })
      .returning();
    const [foreignSprint] = await db
      .insert(sprints)
      .values({
        backlogId: foreignBacklog!.id,
        name: "Sprint étranger",
        rank: "a0",
        createdBy: fixture.actorId,
      })
      .returning();

    try {
      await expect(
        createItem(
          {
            backlogId: fixture.backlogId,
            title: "Refusée sprint terminé",
            type: "tache",
            parentId: fixture.epicId,
            sprintId: completedSprint!.id,
          },
          fixture.actorId,
        ),
      ).rejects.toThrow("Un sprint terminé ne peut plus recevoir d’items.");
      await expect(
        createItem(
          {
            backlogId: fixture.backlogId,
            title: "Refusée sprint étranger",
            type: "tache",
            parentId: fixture.epicId,
            sprintId: foreignSprint!.id,
          },
          fixture.actorId,
        ),
      ).rejects.toThrow("Le sprint appartient à un autre backlog.");

      const rolledBack = await db
        .select({ title: items.title })
        .from(items)
        .where(
          and(
            eq(items.backlogId, fixture.backlogId),
            inArray(items.title, [
              "Refusée sprint terminé",
              "Refusée sprint étranger",
            ]),
          ),
        );
      expect(rolledBack).toEqual([]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
      await db.delete(backlogs).where(eq(backlogs.id, foreignBacklog!.id));
    }
  });
});

describeDb("createItem binary rank ordering", () => {
  it("appends after lowercase ranks when the database locale sorts uppercase last", async () => {
    const fixture = await createUpdateFixture();
    const seeded = [
      { id: randomUUID(), key: "2", rank: "aZ" },
      { id: randomUUID(), key: "3", rank: "aa" },
    ];
    await db.insert(items).values(
      seeded.map((row) => ({
        id: row.id,
        key: `${row.key}${fixture.item.key}`,
        type: "composant" as const,
        backlogId: fixture.backlogId,
        title: `Rang ${row.rank}`,
        statusId: fixture.item.statusId,
        reporterId: fixture.actorId,
        rank: row.rank,
        path: `root.${row.id.replaceAll("-", "")}`,
        depth: 0,
      })),
    );

    try {
      const created = await createItem(
        {
          backlogId: fixture.backlogId,
          title: "Après aa",
          type: "composant",
          parentId: null,
        },
        fixture.actorId,
      );

      expect(created.rank > "aa").toBe(true);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });
});

async function createTaskUpdateFixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");

  const [backlog] = await db
    .insert(backlogs)
    .values({ key: randomBacklogKey(), name: "Estimation", color: "#475569" })
    .returning();
  const [status] = await db
    .insert(statuses)
    .values({
      backlogId: backlog!.id,
      name: "À faire",
      category: "todo",
      order: 0,
      color: "#9aa0a6",
    })
    .returning();
  const componentId = randomUUID();
  const epicId = randomUUID();
  const taskId = randomUUID();
  const componentPath = `root.${componentId.replaceAll("-", "")}`;
  await db.insert(items).values({
    id: componentId,
    key: `${backlog!.key}-1`,
    type: "composant",
    backlogId: backlog!.id,
    title: "Produit",
    statusId: status!.id,
    reporterId: actor.id,
    rank: "a0",
    path: componentPath,
    depth: 0,
  });
  const epicPath = `${componentPath}.${epicId.replaceAll("-", "")}`;
  await db.insert(items).values({
    id: epicId,
    key: `${backlog!.key}-2`,
    type: "epic",
    backlogId: backlog!.id,
    title: "Epic estimable",
    parentId: componentId,
    statusId: status!.id,
    reporterId: actor.id,
    rank: "a1",
    path: epicPath,
    depth: 1,
  });
  const [item] = await db
    .insert(items)
    .values({
      id: taskId,
      key: `${backlog!.key}-3`,
      type: "tache",
      backlogId: backlog!.id,
      title: "Travail estimable",
      parentId: epicId,
      statusId: status!.id,
      reporterId: actor.id,
      rank: "a2",
      path: `${epicPath}.${taskId.replaceAll("-", "")}`,
      depth: 2,
    })
    .returning();

  return {
    actorId: actor.id,
    backlogId: backlog!.id,
    componentId,
    epicId,
    item: item!,
  };
}

describeDb("updateItem estimate transaction", () => {
  it("updates and clears a task estimate with readable activity", async () => {
    const fixture = await createTaskUpdateFixture();

    try {
      await updateItem({ id: fixture.item.id, estimatePoints: 5 }, fixture.actorId);
      const updated = await updateItem(
        { id: fixture.item.id, estimatePoints: null },
        fixture.actorId,
      );

      expect(updated?.estimatePoints).toBeNull();
      const audit = await db
        .select({
          field: activities.field,
          oldValue: activities.oldValue,
          newValue: activities.newValue,
        })
        .from(activities)
        .where(eq(activities.itemId, fixture.item.id))
        .orderBy(asc(activities.at), asc(activities.id));
      expect(audit).toEqual([
        { field: "estimate_points", oldValue: null, newValue: "5" },
        { field: "estimate_points", oldValue: "5", newValue: null },
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("rejects estimates on structural items without changing their activity", async () => {
    const fixture = await createUpdateFixture();

    try {
      await expect(
        updateItem({ id: fixture.item.id, estimatePoints: 3 }, fixture.actorId),
      ).rejects.toThrow("Seules les tâches peuvent être estimées.");

      const [stored] = await db.select().from(items).where(eq(items.id, fixture.item.id));
      expect(stored?.estimatePoints).toBeNull();
      const audit = await db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.itemId, fixture.item.id));
      expect(audit).toEqual([]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });
});

async function createBacklogRankFixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");

  const [backlog] = await db
    .insert(backlogs)
    .values({ key: randomBacklogKey(), name: "Classement backlog", color: "#475569" })
    .returning();
  const [status] = await db
    .insert(statuses)
    .values({
      backlogId: backlog!.id,
      name: "À faire",
      category: "todo",
      order: 0,
      color: "#9aa0a6",
    })
    .returning();
  const componentId = randomUUID();
  const taskAId = randomUUID();
  const taskBId = randomUUID();
  const taskCId = randomUUID();
  const subtaskId = randomUUID();
  const componentPath = `root.${componentId.replaceAll("-", "")}`;
  const taskRows: Array<[string, string, string]> = [
    [taskAId, "A", "a1"],
    [taskBId, "B", "a2"],
    [taskCId, "C", "a3"],
  ];
  const rows = await db
    .insert(items)
    .values([
      {
        id: componentId,
        key: `${backlog!.key}-1`,
        type: "composant" as const,
        backlogId: backlog!.id,
        title: "Produit",
        statusId: status!.id,
        reporterId: actor.id,
        rank: "a0",
        path: componentPath,
        depth: 0,
      },
      ...taskRows.map(([id, suffix, rank]) => ({
        id,
        key: `${backlog!.key}-${suffix}`,
        type: "tache" as const,
        backlogId: backlog!.id,
        title: `Tâche ${suffix}`,
        parentId: componentId,
        statusId: status!.id,
        reporterId: actor.id,
        rank,
        path: `${componentPath}.${id!.replaceAll("-", "")}`,
        depth: 1,
      })),
      {
        id: subtaskId,
        key: `${backlog!.key}-S`,
        type: "soustache" as const,
        backlogId: backlog!.id,
        title: "Sous-tâche",
        parentId: taskAId,
        statusId: status!.id,
        reporterId: actor.id,
        rank: "a4",
        path: `${componentPath}.${taskAId.replaceAll("-", "")}.${subtaskId.replaceAll("-", "")}`,
        depth: 2,
      },
    ])
    .returning();

  return {
    actorId: actor.id,
    backlog: backlog!,
    component: rows.find((row) => row.id === componentId)!,
    taskA: rows.find((row) => row.id === taskAId)!,
    taskB: rows.find((row) => row.id === taskBId)!,
    taskC: rows.find((row) => row.id === taskCId)!,
    subtask: rows.find((row) => row.id === subtaskId)!,
  };
}

describeDb("rankBacklogItem transaction", () => {
  it("moves a task between task neighbors and records the persisted rank activity", async () => {
    const fixture = await createBacklogRankFixture();

    try {
      await rankBacklogItem(
        {
          backlogId: fixture.backlog.id,
          id: fixture.taskC.id,
          beforeId: fixture.taskA.id,
          afterId: fixture.taskB.id,
        },
        fixture.actorId,
      );

      const storedTaskIds = (await listItems(fixture.backlog.id))
        .filter((item) => item.type === "tache")
        .map((item) => item.id);
      expect(storedTaskIds).toEqual([
        fixture.taskA.id,
        fixture.taskC.id,
        fixture.taskB.id,
      ]);
      const audit = await db
        .select({
          action: activities.action,
          field: activities.field,
          oldValue: activities.oldValue,
          newValue: activities.newValue,
        })
        .from(activities)
        .where(eq(activities.itemId, fixture.taskC.id));
      expect(audit).toEqual([
        {
          action: "move",
          field: "rank",
          oldValue: fixture.taskC.rank,
          newValue: expect.any(String),
        },
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlog.id));
    }
  });

  it.each(["component", "subtask"] as const)(
    "rejects a structural %s without changing its rank",
    async (kind) => {
      const fixture = await createBacklogRankFixture();
      const target = kind === "component" ? fixture.component : fixture.subtask;

      try {
        await expect(
          rankBacklogItem(
            {
              backlogId: fixture.backlog.id,
              id: target.id,
              beforeId: fixture.taskA.id,
              afterId: fixture.taskB.id,
            },
            fixture.actorId,
          ),
        ).rejects.toThrow("Seules les tâches du backlog peuvent être classées.");
        const [stored] = await db.select().from(items).where(eq(items.id, target.id));
        expect(stored?.rank).toBe(target.rank);
      } finally {
        await db.delete(backlogs).where(eq(backlogs.id, fixture.backlog.id));
      }
    },
  );

  it("rejects deleted, structural and foreign neighbors atomically", async () => {
    const fixture = await createBacklogRankFixture();
    const [foreignBacklog] = await db
      .insert(backlogs)
      .values({ key: randomBacklogKey(), name: "Autre backlog", color: "#475569" })
      .returning();
    const [foreignStatus] = await db
      .insert(statuses)
      .values({
        backlogId: foreignBacklog!.id,
        name: "À faire",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      })
      .returning();
    const foreignId = randomUUID();
    await db.insert(items).values({
      id: foreignId,
      key: `${foreignBacklog!.key}-1`,
      type: "tache",
      backlogId: foreignBacklog!.id,
      title: "Étrangère",
      parentId: null,
      statusId: foreignStatus!.id,
      reporterId: fixture.actorId,
      rank: "a0",
      path: `root.${foreignId.replaceAll("-", "")}`,
      depth: 0,
    });
    await db
      .update(items)
      .set({ deletedAt: new Date() })
      .where(eq(items.id, fixture.taskB.id));

    try {
      for (const neighborId of [
        fixture.taskB.id,
        fixture.component.id,
        foreignId,
      ]) {
        await expect(
          rankBacklogItem(
            {
              backlogId: fixture.backlog.id,
              id: fixture.taskC.id,
              beforeId: fixture.taskA.id,
              afterId: neighborId,
            },
            fixture.actorId,
          ),
        ).rejects.toThrow("Voisin invalide pour ce backlog.");
        const [stored] = await db
          .select({ rank: items.rank })
          .from(items)
          .where(eq(items.id, fixture.taskC.id));
        expect(stored?.rank).toBe(fixture.taskC.rank);
      }
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlog.id));
      await db.delete(backlogs).where(eq(backlogs.id, foreignBacklog!.id));
    }
  });
});

describeDb("updateItem reporter transaction", () => {
  it("updates an existing reporter and writes the reporter audit", async () => {
    const reporterId = `reporter-${randomUUID()}`;
    await db.insert(user).values({
      id: reporterId,
      name: "Nouveau rapporteur",
      email: `${reporterId}@example.test`,
    });
    const fixture = await createUpdateFixture();

    try {
      const updated = await updateItem(
        { id: fixture.item.id, reporterId },
        fixture.actorId,
      );

      expect(updated?.reporterId).toBe(reporterId);
      const audit = await db
        .select({ action: activities.action, field: activities.field, oldValue: activities.oldValue, newValue: activities.newValue })
        .from(activities)
        .where(eq(activities.itemId, fixture.item.id));
      expect(audit).toEqual([
        {
          action: "update",
          field: "reporter",
          oldValue: fixture.item.reporterId,
          newValue: reporterId,
        },
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
      await db.delete(user).where(eq(user.id, reporterId));
    }
  });

  it("keeps updatedAt and activities unchanged for a reporter no-op", async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    const fixture = await createUpdateFixture(actor.id);

    try {
      const updated = await updateItem(
        { id: fixture.item.id, reporterId: actor.id },
        fixture.actorId,
      );

      expect(updated?.updatedAt).toEqual(fixture.item.updatedAt);
      const audit = await db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.itemId, fixture.item.id));
      expect(audit).toEqual([]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("rejects a missing reporter without changing the item or audit", async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    const fixture = await createUpdateFixture(actor.id);

    try {
      await expect(
        updateItem(
          { id: fixture.item.id, reporterId: `missing-${randomUUID()}` },
          fixture.actorId,
        ),
      ).rejects.toThrow("Rapporteur introuvable.");

      const [stored] = await db.select().from(items).where(eq(items.id, fixture.item.id));
      expect(stored?.reporterId).toBe(actor.id);
      expect(stored?.updatedAt).toEqual(fixture.item.updatedAt);
      const audit = await db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.itemId, fixture.item.id));
      expect(audit).toEqual([]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });
});
