import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  backlogs,
  itemFixVersions,
  itemLabels,
  items,
  labels,
  releases,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import {
  createItem,
  getItemByIdForBacklog,
  getItemByKeyForBacklog,
  listItems,
  listItemsWithAncestors,
  listLiveParentCandidates,
  moveItem,
  rankBacklogItem,
  reparentItem,
  restoreItem,
  updateItem,
} from "@/lib/services/items";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

async function cleanupReleaseBacklogs(backlogIds: string[]) {
  await db.delete(releases).where(inArray(releases.backlogId, backlogIds));
  await db.delete(backlogs).where(inArray(backlogs.id, backlogIds));
}

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

  it("rejects an invalid correlation without an active sprint before changing the item", async () => {
    const fixture = await createTaskUpdateFixture();

    try {
      await expect(
        updateItem(
          { id: fixture.item.id, estimatePoints: 3 },
          fixture.actorId,
          " ",
        ),
      ).rejects.toThrow("correlation");
      await expect(
        moveItem(
          { id: fixture.item.id, beforeId: null, afterId: null },
          fixture.actorId,
          "x".repeat(129),
        ),
      ).rejects.toThrow("correlation");

      const [stored] = await db
        .select({ estimatePoints: items.estimatePoints, rank: items.rank })
        .from(items)
        .where(eq(items.id, fixture.item.id));
      expect(stored).toEqual({
        estimatePoints: null,
        rank: fixture.item.rank,
      });
      expect(
        await db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.itemId, fixture.item.id)),
      ).toEqual([]);
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
    const [existingReporter] = await db.select({ id: user.id }).from(user).limit(1);
    if (!existingReporter) throw new Error("Le seed doit contenir un utilisateur.");
    const reporterId = `reporter-${randomUUID()}`;
    await db.insert(user).values({
      id: reporterId,
      name: "Nouveau rapporteur",
      email: `${reporterId}@example.test`,
    });
    const fixture = await createUpdateFixture(existingReporter.id);

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

describeDb("updateItem start and due days (JIR-101)", () => {
  async function dayAudit(itemId: string) {
    return db
      .select({ field: activities.field, oldValue: activities.oldValue, newValue: activities.newValue })
      .from(activities)
      .where(and(eq(activities.itemId, itemId), inArray(activities.field, ["start_date", "due_date"])))
      .orderBy(asc(activities.at), asc(activities.id));
  }

  async function withFixture(run: (fixture: Awaited<ReturnType<typeof createUpdateFixture>>) => Promise<void>) {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    const fixture = await createUpdateFixture(actor.id);
    try {
      await run(fixture);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  }

  it("stores both days and audits each change", async () => {
    await withFixture(async (fixture) => {
      const updated = await updateItem(
        { id: fixture.item.id, startDate: "2026-10-01", dueDate: "2026-10-31" },
        fixture.actorId,
      );
      expect(updated).toMatchObject({ startDate: "2026-10-01", dueDate: "2026-10-31" });
      // Both rows share one timestamp: compare them in any order.
      const audit = await dayAudit(fixture.item.id);
      expect(audit).toHaveLength(2);
      expect(audit).toEqual(expect.arrayContaining([
        { field: "start_date", oldValue: null, newValue: "2026-10-01" },
        { field: "due_date", oldValue: null, newValue: "2026-10-31" },
      ]));
    });
  });

  it("checks a day given alone against the stored other one", async () => {
    await withFixture(async (fixture) => {
      await updateItem({ id: fixture.item.id, dueDate: "2026-10-31" }, fixture.actorId);
      await expect(
        updateItem({ id: fixture.item.id, startDate: "2026-11-01" }, fixture.actorId),
      ).rejects.toThrow("Le début doit précéder l’échéance.");
      await expect(
        updateItem({ id: fixture.item.id, startDate: "2026-10-31" }, fixture.actorId),
      ).resolves.toMatchObject({ startDate: "2026-10-31" });
    });
  });

  it("checks a due day given alone against the stored start, and clears either day", async () => {
    await withFixture(async (fixture) => {
      await updateItem({ id: fixture.item.id, startDate: "2026-10-10" }, fixture.actorId);
      await expect(
        updateItem({ id: fixture.item.id, dueDate: "2026-10-09" }, fixture.actorId),
      ).rejects.toThrow("Le début doit précéder l’échéance.");
      await updateItem({ id: fixture.item.id, dueDate: "2026-10-20" }, fixture.actorId);
      await expect(
        updateItem({ id: fixture.item.id, startDate: null }, fixture.actorId),
      ).resolves.toMatchObject({ startDate: null, dueDate: "2026-10-20" });
      await expect(
        updateItem({ id: fixture.item.id, dueDate: "" }, fixture.actorId),
      ).resolves.toMatchObject({ startDate: null, dueDate: null });
    });
  });

  it("writes nothing for an unchanged day", async () => {
    await withFixture(async (fixture) => {
      await updateItem({ id: fixture.item.id, startDate: "2026-10-01" }, fixture.actorId);
      await updateItem({ id: fixture.item.id, startDate: "2026-10-01" }, fixture.actorId);
      expect(await dayAudit(fixture.item.id)).toHaveLength(1);
    });
  });

  it("is enforced by the database too", async () => {
    await withFixture(async (fixture) => {
      await expect(
        db.update(items)
          .set({ startDate: "2026-11-01", dueDate: "2026-10-31" })
          .where(eq(items.id, fixture.item.id)),
      ).rejects.toThrow();
    });
  });
});

describeDb("item fix version integration", () => {
  it("treats a malformed release filter like a non-matching foreign release", async () => {
    const fixture = await createUpdateFixture();
    try {
      await expect(listItems(fixture.backlogId, {
        releaseIds: ["not-a-uuid"],
      })).resolves.toEqual([]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("filters 1,000 Fix-version links in one query with OR semantics", async () => {
    const fixture = await createUpdateFixture();
    const secondId = randomUUID();
    const excludedId = randomUUID();
    await db.insert(items).values([
      {
        id: secondId,
        key: `${randomBacklogKey()}-2`,
        type: "tache",
        backlogId: fixture.backlogId,
        title: "Deuxième correspondance",
        statusId: fixture.item.statusId,
        reporterId: fixture.actorId,
        rank: "a1",
        parentId: excludedId,
        path: `root.${excludedId.replaceAll("-", "")}.${secondId.replaceAll("-", "")}`,
        depth: 1,
      },
      {
        id: excludedId,
        key: `${randomBacklogKey()}-3`,
        type: "composant",
        backlogId: fixture.backlogId,
        title: "Sans correspondance",
        statusId: fixture.item.statusId,
        reporterId: fixture.actorId,
        rank: "a2",
        path: `root.${excludedId.replaceAll("-", "")}`,
        depth: 0,
      },
    ]);
    const releaseRows = await db
      .insert(releases)
      .values(Array.from({ length: 1_000 }, (_, index) => ({
        backlogId: fixture.backlogId,
        name: `Filtre volume ${index.toString().padStart(4, "0")}`,
        createdBy: fixture.actorId,
      })))
      .returning({ id: releases.id });
    await db.insert(itemFixVersions).values([
      ...releaseRows.slice(0, 999).map(({ id }) => ({
        backlogId: fixture.backlogId,
        itemId: fixture.item.id,
        releaseId: id,
        addedBy: fixture.actorId,
      })),
      {
        backlogId: fixture.backlogId,
        itemId: secondId,
        releaseId: releaseRows[999]!.id,
        addedBy: fixture.actorId,
      },
    ]);

    try {
      const querySpy = vi.spyOn(Client.prototype, "query");
      let filtered: Awaited<ReturnType<typeof listItems>>;
      try {
        filtered = await listItems(fixture.backlogId, {
          releaseIds: [releaseRows[0]!.id, releaseRows[999]!.id],
        });
        expect(querySpy).toHaveBeenCalledTimes(1);
      } finally {
        querySpy.mockRestore();
      }
      expect(filtered.map(({ id }) => id)).toEqual([fixture.item.id, secondId]);
      const withAncestors = await listItemsWithAncestors(
        fixture.backlogId,
        filtered.map(({ id }) => id),
      );
      expect(withAncestors.map(({ id }) => id)).toEqual([
        fixture.item.id,
        excludedId,
        secondId,
      ]);
    } finally {
      await cleanupReleaseBacklogs([fixture.backlogId]);
    }
  });

  it("lists the live parents a Version filter hides, without Sous-tâches or other backlogs", async () => {
    const fixture = await createTaskUpdateFixture();
    const other = await createTaskUpdateFixture();
    const subtaskId = randomUUID();
    const deletedEpicId = randomUUID();
    const [task] = await db.select().from(items).where(eq(items.id, fixture.item.id));
    await db.insert(items).values([
      {
        id: subtaskId,
        key: `${randomBacklogKey()}-4`,
        type: "soustache",
        backlogId: fixture.backlogId,
        title: "Sous-tâche",
        parentId: fixture.item.id,
        statusId: fixture.item.statusId,
        reporterId: fixture.actorId,
        rank: "a3",
        path: `${task!.path}.${subtaskId.replaceAll("-", "")}`,
        depth: 3,
      },
      {
        id: deletedEpicId,
        key: `${randomBacklogKey()}-5`,
        type: "epic",
        backlogId: fixture.backlogId,
        title: "Epic supprimée",
        parentId: fixture.componentId,
        statusId: fixture.item.statusId,
        reporterId: fixture.actorId,
        rank: "a4",
        path: `root.${fixture.componentId.replaceAll("-", "")}.${deletedEpicId.replaceAll("-", "")}`,
        depth: 1,
        deletedAt: new Date(),
      },
    ]);
    const [emptyRelease] = await db
      .insert(releases)
      .values({ backlogId: fixture.backlogId, name: "Version vide", createdBy: fixture.actorId })
      .returning({ id: releases.id });

    try {
      await expect(listItems(fixture.backlogId, { releaseIds: [emptyRelease!.id] })).resolves.toEqual([]);
      const candidates = await listLiveParentCandidates(fixture.backlogId);
      expect(candidates).toEqual([
        { id: fixture.componentId, key: expect.any(String), type: "composant", title: "Produit" },
        { id: fixture.epicId, key: expect.any(String), type: "epic", title: "Epic estimable" },
        { id: fixture.item.id, key: fixture.item.key, type: "tache", title: "Travail estimable" },
      ]);
    } finally {
      await cleanupReleaseBacklogs([fixture.backlogId]);
      await db.delete(backlogs).where(eq(backlogs.id, other.backlogId));
    }
  });

  it("creates an item with sprint and fix versions under one correlated audit", async () => {
    const fixture = await createTaskUpdateFixture();
    const [release] = await db
      .insert(releases)
      .values({
        backlogId: fixture.backlogId,
        name: "Create target",
        releaseDate: "2026-08-07",
        createdBy: fixture.actorId,
      })
      .returning();
    const [sprint] = await db
      .insert(sprints)
      .values({
        backlogId: fixture.backlogId,
        name: "Create sprint target",
        rank: "create-sprint-target",
        createdBy: fixture.actorId,
      })
      .returning();
    try {
      const created = await createItem(
        {
          backlogId: fixture.backlogId,
          title: "Créée avec version",
          type: "tache",
          parentId: fixture.epicId,
          sprintId: sprint!.id,
          fixVersionIds: [release!.id],
        },
        fixture.actorId,
        "item-create-fix-versions",
      );

      expect(
        await db
          .select({ itemId: itemFixVersions.itemId, releaseId: itemFixVersions.releaseId })
          .from(itemFixVersions)
          .where(eq(itemFixVersions.itemId, created.id)),
      ).toEqual([{ itemId: created.id, releaseId: release!.id }]);
      expect(
        await db
          .select({
            field: activities.field,
            correlationId: activities.requestCorrelationId,
          })
          .from(activities)
          .where(eq(activities.itemId, created.id))
          .orderBy(asc(activities.field)),
      ).toEqual([
        { field: "fix_versions", correlationId: "item-create-fix-versions" },
        { field: "sprint", correlationId: "item-create-fix-versions" },
        { field: null, correlationId: "item-create-fix-versions" },
      ]);
    } finally {
      await cleanupReleaseBacklogs([fixture.backlogId]);
    }
  });

  it("rolls back item creation when a fix version belongs to another backlog", async () => {
    const fixture = await createTaskUpdateFixture();
    const [foreignBacklog] = await db
      .insert(backlogs)
      .values({ key: randomBacklogKey(), name: "Version create étrangère", color: "#64748b" })
      .returning();
    const [foreignRelease] = await db
      .insert(releases)
      .values({
        backlogId: foreignBacklog!.id,
        name: "Foreign create target",
        createdBy: fixture.actorId,
      })
      .returning();
    try {
      await expect(
        createItem(
          {
            backlogId: fixture.backlogId,
            title: "Création à annuler",
            type: "tache",
            parentId: fixture.epicId,
            fixVersionIds: [foreignRelease!.id],
          },
          fixture.actorId,
          "item-create-rollback",
        ),
      ).rejects.toThrow("Une ou plusieurs releases sont invalides pour ce backlog.");
      expect(
        await db
          .select({ id: items.id })
          .from(items)
          .where(
            and(
              eq(items.backlogId, fixture.backlogId),
              eq(items.title, "Création à annuler"),
            ),
          ),
      ).toEqual([]);
    } finally {
      await cleanupReleaseBacklogs([fixture.backlogId, foreignBacklog!.id]);
    }
  });

  it("updates scalar fields and fix versions in one transaction", async () => {
    const fixture = await createUpdateFixture();
    const [release] = await db
      .insert(releases)
      .values({
        backlogId: fixture.backlogId,
        name: "Update target",
        createdBy: fixture.actorId,
      })
      .returning();
    try {
      const updated = await updateItem(
        {
          id: fixture.item.id,
          title: "Rapport versionné",
          fixVersionIds: [release!.id],
        },
        fixture.actorId,
      );

      expect(updated?.title).toBe("Rapport versionné");
      expect(
        await db
          .select({ releaseId: itemFixVersions.releaseId })
          .from(itemFixVersions)
          .where(eq(itemFixVersions.itemId, fixture.item.id)),
      ).toEqual([{ releaseId: release!.id }]);
      const audit = await db
        .select({
          field: activities.field,
          correlationId: activities.requestCorrelationId,
        })
        .from(activities)
        .where(eq(activities.itemId, fixture.item.id))
        .orderBy(asc(activities.field));
      expect(audit).toHaveLength(2);
      expect(audit[0]).toEqual({
        field: "fix_versions",
        correlationId: expect.any(String),
      });
      expect(audit[1]).toEqual({
        field: "title",
        correlationId: audit[0]?.correlationId,
      });
    } finally {
      await cleanupReleaseBacklogs([fixture.backlogId]);
    }
  });

  it("rolls back scalar updates when a replacement fix version is invalid", async () => {
    const fixture = await createUpdateFixture();
    const [foreignBacklog] = await db
      .insert(backlogs)
      .values({ key: randomBacklogKey(), name: "Version update étrangère", color: "#64748b" })
      .returning();
    const [foreignRelease] = await db
      .insert(releases)
      .values({
        backlogId: foreignBacklog!.id,
        name: "Foreign update target",
        createdBy: fixture.actorId,
      })
      .returning();
    try {
      await expect(
        updateItem(
          {
            id: fixture.item.id,
            title: "Titre à annuler",
            fixVersionIds: [foreignRelease!.id],
          },
          fixture.actorId,
          "item-update-rollback",
        ),
      ).rejects.toThrow("Une ou plusieurs releases sont invalides pour ce backlog.");
      const [stored] = await db
        .select({ title: items.title })
        .from(items)
        .where(eq(items.id, fixture.item.id));
      expect(stored?.title).toBe(fixture.item.title);
      expect(
        await db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.itemId, fixture.item.id)),
      ).toEqual([]);
    } finally {
      await cleanupReleaseBacklogs([fixture.backlogId, foreignBacklog!.id]);
    }
  });
});

describeDb("createItem with the « Nouvel item » fields (JIR-73)", () => {
  it("stores task points with the item and its sprint membership in one transaction", async () => {
    const fixture = await createTaskUpdateFixture();
    const [sprint] = await db
      .insert(sprints)
      .values({
        backlogId: fixture.backlogId,
        name: "Sprint estimé",
        rank: "a0",
        createdBy: fixture.actorId,
      })
      .returning();
    try {
      const created = await createItem(
        {
          backlogId: fixture.backlogId,
          title: "Tâche estimée",
          type: "tache",
          parentId: fixture.epicId,
          sprintId: sprint!.id,
          estimatePoints: 3.5,
        },
        fixture.actorId,
      );

      expect(created.estimatePoints).toBe(3.5);
      const [membership] = await db
        .select({ estimateAtJoin: sprintItems.estimateAtJoin })
        .from(sprintItems)
        .where(eq(sprintItems.itemId, created.id));
      expect(membership).toEqual({ estimateAtJoin: 3.5 });
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("rejects points on a structural item before creating anything", async () => {
    const fixture = await createTaskUpdateFixture();
    try {
      await expect(
        createItem(
          {
            backlogId: fixture.backlogId,
            title: "Epic estimée",
            type: "epic",
            parentId: fixture.componentId,
            estimatePoints: 2,
          },
          fixture.actorId,
        ),
      ).rejects.toThrow("Seules les tâches peuvent être estimées.");
      const stored = await db
        .select({ id: items.id })
        .from(items)
        .where(eq(items.backlogId, fixture.backlogId));
      expect(stored).toHaveLength(3);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("creates with assignee, labels and due date under the single create activity", async () => {
    const fixture = await createTaskUpdateFixture();
    const [label] = await db
      .insert(labels)
      .values({ backlogId: fixture.backlogId, name: "front", color: "--label-1" })
      .returning();
    try {
      const created = await createItem(
        {
          backlogId: fixture.backlogId,
          title: "Tâche complète",
          type: "tache",
          parentId: fixture.epicId,
          assigneeId: fixture.actorId,
          labelIds: [label!.id],
          dueDate: "2026-11-02",
        },
        fixture.actorId,
      );

      expect(created.assigneeId).toBe(fixture.actorId);
      expect(created.dueDate).toBe("2026-11-02");
      expect(
        await db
          .select({ labelId: itemLabels.labelId })
          .from(itemLabels)
          .where(eq(itemLabels.itemId, created.id)),
      ).toEqual([{ labelId: label!.id }]);
      expect(
        await db
          .select({ action: activities.action })
          .from(activities)
          .where(eq(activities.itemId, created.id)),
      ).toEqual([{ action: "create" }]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });
});

describeDb("history of parent, nature and labels (JIR-73)", () => {
  async function auditOf(itemId: string, field: string) {
    return db
      .select({
        action: activities.action,
        oldValue: activities.oldValue,
        newValue: activities.newValue,
      })
      .from(activities)
      .where(and(eq(activities.itemId, itemId), eq(activities.field, field)))
      .orderBy(asc(activities.at), asc(activities.id));
  }

  it("logs a nature change with the old and new kind", async () => {
    const fixture = await createTaskUpdateFixture();
    try {
      await updateItem({ id: fixture.item.id, kind: "bug" }, fixture.actorId);
      expect(await auditOf(fixture.item.id, "kind")).toEqual([
        { action: "update", oldValue: "feature", newValue: "bug" },
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("logs label changes with the before and after sets, so additions and removals show", async () => {
    const fixture = await createTaskUpdateFixture();
    const created = await db
      .insert(labels)
      .values([
        { backlogId: fixture.backlogId, name: "front", color: "--label-1" },
        { backlogId: fixture.backlogId, name: "back", color: "--label-2" },
      ])
      .returning();
    const [front, back] = created;
    try {
      await updateItem({ id: fixture.item.id, labelIds: [front!.id] }, fixture.actorId);
      await updateItem({ id: fixture.item.id, labelIds: [back!.id] }, fixture.actorId);
      expect(await auditOf(fixture.item.id, "labels")).toEqual([
        { action: "update", oldValue: null, newValue: front!.id },
        { action: "update", oldValue: front!.id, newValue: back!.id },
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("logs a parent change with the old and new parent ids in the reparent transaction", async () => {
    const fixture = await createTaskUpdateFixture();
    const otherEpicId = randomUUID();
    const [component] = await db
      .select({ path: items.path, key: items.key })
      .from(items)
      .where(eq(items.id, fixture.componentId));
    await db.insert(items).values({
      id: otherEpicId,
      key: `${component!.key}0`,
      type: "epic",
      backlogId: fixture.backlogId,
      title: "Autre epic",
      parentId: fixture.componentId,
      statusId: fixture.item.statusId,
      reporterId: fixture.actorId,
      rank: "a5",
      path: `${component!.path}.${otherEpicId.replaceAll("-", "")}`,
      depth: 1,
    });
    try {
      await reparentItem({ id: fixture.item.id, newParentId: otherEpicId }, fixture.actorId);
      expect(await auditOf(fixture.item.id, "parent")).toEqual([
        { action: "move", oldValue: fixture.epicId, newValue: otherEpicId },
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });
});

describeDb("updateItem description activity coalescing", () => {
  async function descriptionAudit(itemId: string) {
    return db
      .select({
        id: activities.id,
        actorId: activities.actorId,
        field: activities.field,
        oldValue: activities.oldValue,
        newValue: activities.newValue,
        at: activities.at,
      })
      .from(activities)
      .where(eq(activities.itemId, itemId))
      .orderBy(asc(activities.at), asc(activities.id));
  }

  async function withOtherUser<T>(run: (otherId: string) => Promise<T>) {
    const otherId = `editor-${randomUUID()}`;
    await db.insert(user).values({
      id: otherId,
      name: "Autre rédacteur",
      email: `${otherId}@example.test`,
    });
    try {
      return await run(otherId);
    } finally {
      await db.delete(activities).where(eq(activities.actorId, otherId));
      await db.delete(user).where(eq(user.id, otherId));
    }
  }

  it("keeps a single entry for successive autosaves of the same actor", async () => {
    const fixture = await createUpdateFixture();
    try {
      await updateItem({ id: fixture.item.id, description: "Premier jet" }, fixture.actorId);
      await updateItem({ id: fixture.item.id, description: "Premier jet complété" }, fixture.actorId);
      const updated = await updateItem(
        { id: fixture.item.id, description: "Version finale" },
        fixture.actorId,
      );

      expect(updated?.description).toBe("Version finale");
      const audit = await descriptionAudit(fixture.item.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: fixture.actorId,
        field: "description",
        oldValue: null,
        newValue: "Version finale",
      });
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("bumps the coalesced entry to the time of the latest save", async () => {
    const fixture = await createUpdateFixture();
    try {
      await updateItem({ id: fixture.item.id, description: "Avant" }, fixture.actorId);
      const [first] = await descriptionAudit(fixture.item.id);
      const earlier = new Date(Date.now() - 5 * 60 * 1000);
      await db.update(activities).set({ at: earlier }).where(eq(activities.id, first!.id));

      await updateItem({ id: fixture.item.id, description: "Après" }, fixture.actorId);

      const audit = await descriptionAudit(fixture.item.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]!.id).toBe(first!.id);
      expect(audit[0]!.at.getTime()).toBeGreaterThan(earlier.getTime());
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("starts a new entry after ten minutes", async () => {
    const fixture = await createUpdateFixture();
    try {
      await updateItem({ id: fixture.item.id, description: "Hier" }, fixture.actorId);
      await db
        .update(activities)
        .set({ at: new Date(Date.now() - 11 * 60 * 1000) })
        .where(eq(activities.itemId, fixture.item.id));

      await updateItem({ id: fixture.item.id, description: "Aujourd'hui" }, fixture.actorId);

      const audit = await descriptionAudit(fixture.item.id);
      expect(audit.map(({ oldValue, newValue }) => [oldValue, newValue])).toEqual([
        [null, "Hier"],
        ["Hier", "Aujourd'hui"],
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("starts a new entry when another actor edited the description last", async () => {
    const fixture = await createUpdateFixture();
    try {
      await withOtherUser(async (otherId) => {
        await updateItem({ id: fixture.item.id, description: "De moi" }, fixture.actorId);
        await updateItem({ id: fixture.item.id, description: "De l'autre" }, otherId);
        await updateItem({ id: fixture.item.id, description: "De moi encore" }, fixture.actorId);

        const audit = await descriptionAudit(fixture.item.id);
        expect(audit.map(({ actorId, oldValue, newValue }) => [actorId, oldValue, newValue])).toEqual([
          [fixture.actorId, null, "De moi"],
          [otherId, "De moi", "De l'autre"],
          [fixture.actorId, "De l'autre", "De moi encore"],
        ]);
      });
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("starts a new entry when another change was logged in between", async () => {
    const fixture = await createUpdateFixture();
    try {
      await updateItem({ id: fixture.item.id, description: "Texte" }, fixture.actorId);
      await updateItem({ id: fixture.item.id, title: "Nouveau titre" }, fixture.actorId);
      await updateItem({ id: fixture.item.id, description: "Texte revu" }, fixture.actorId);

      const audit = await descriptionAudit(fixture.item.id);
      expect(audit.map(({ field, newValue }) => [field, newValue])).toEqual([
        ["description", "Texte"],
        ["title", "Nouveau titre"],
        ["description", "Texte revu"],
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("never coalesces into an ambiguous latest entry (equal timestamps)", async () => {
    const fixture = await createUpdateFixture();
    try {
      await withOtherUser(async (bobId) => {
        const at = new Date(Date.now() - 60 * 1000);
        await db.update(items).set({ description: "Bob" }).where(eq(items.id, fixture.item.id));
        // Alice then Bob, same timestamp; Alice's random id sorts first.
        await db.insert(activities).values([
          {
            id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
            itemId: fixture.item.id,
            actorId: fixture.actorId,
            action: "update",
            field: "description",
            oldValue: "Original",
            newValue: "Alice",
            at,
          },
          {
            id: "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa",
            itemId: fixture.item.id,
            actorId: bobId,
            action: "update",
            field: "description",
            oldValue: "Alice",
            newValue: "Bob",
            at,
          },
        ]);

        await updateItem({ id: fixture.item.id, description: "Original" }, fixture.actorId);

        const audit = await descriptionAudit(fixture.item.id);
        expect(
          audit.map(({ actorId, oldValue, newValue }) => [actorId, oldValue, newValue]).sort(),
        ).toEqual(
          [
            [fixture.actorId, "Original", "Alice"],
            [bobId, "Alice", "Bob"],
            [fixture.actorId, "Bob", "Original"],
          ].sort(),
        );
      });
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("only coalesces an entry that continues into the change", async () => {
    const fixture = await createUpdateFixture();
    try {
      await db.update(items).set({ description: "Actuel" }).where(eq(items.id, fixture.item.id));
      await db.insert(activities).values({
        itemId: fixture.item.id,
        actorId: fixture.actorId,
        action: "update",
        field: "description",
        oldValue: null,
        newValue: "Autre texte",
        at: new Date(Date.now() - 60 * 1000),
      });

      await updateItem({ id: fixture.item.id, description: "Suite" }, fixture.actorId);

      const audit = await descriptionAudit(fixture.item.id);
      expect(audit.map(({ oldValue, newValue }) => [oldValue, newValue])).toEqual([
        [null, "Autre texte"],
        ["Actuel", "Suite"],
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("drops the entry when the session ends on the original description", async () => {
    const fixture = await createUpdateFixture();
    try {
      await updateItem({ id: fixture.item.id, description: "Original" }, fixture.actorId);
      await db
        .update(activities)
        .set({ at: new Date(Date.now() - 11 * 60 * 1000) })
        .where(eq(activities.itemId, fixture.item.id));
      await updateItem({ id: fixture.item.id, description: "Brouillon" }, fixture.actorId);
      const updated = await updateItem(
        { id: fixture.item.id, description: "Original" },
        fixture.actorId,
      );

      expect(updated?.description).toBe("Original");
      const audit = await descriptionAudit(fixture.item.id);
      expect(audit.map(({ oldValue, newValue }) => [oldValue, newValue])).toEqual([
        [null, "Original"],
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });
});

describeDb("item revision (updatedAt) ordering", () => {
  it("strictly increases on every write, even within one millisecond", async () => {
    const fixture = await createUpdateFixture();
    try {
      // A clock behind the stored revision must not repeat or go back.
      const ahead = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.update(items).set({ updatedAt: ahead }).where(eq(items.id, fixture.item.id));
      const first = await updateItem({ id: fixture.item.id, description: "Un" }, fixture.actorId);
      const second = await updateItem({ id: fixture.item.id, description: "Deux" }, fixture.actorId);
      const third = await updateItem({ id: fixture.item.id, title: "Trois" }, fixture.actorId);

      expect(first!.updatedAt.getTime()).toBe(ahead.getTime() + 1);
      expect(second!.updatedAt.getTime()).toBe(ahead.getTime() + 2);
      expect(third!.updatedAt.getTime()).toBe(ahead.getTime() + 3);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });

  it("uses whole milliseconds so the revision survives a JS Date", async () => {
    const fixture = await createUpdateFixture();
    try {
      const updated = await updateItem({ id: fixture.item.id, description: "Texte" }, fixture.actorId);
      const [row] = await db
        .select({ micros: sql<string>`extract(microseconds from ${items.updatedAt})::text` })
        .from(items)
        .where(eq(items.id, fixture.item.id));
      expect(Number(row!.micros) % 1000).toBe(0);
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(fixture.item.updatedAt.getTime());
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });
});


describeDb("item view projection", () => {
  it("omits documents from ordered live rows and their ancestors, keeping full detail reads", async () => {
    const fixture = await createUpdateFixture();
    const siblingId = randomUUID();
    const epicId = randomUUID();
    const taskId = randomUUID();
    const deletedId = randomUUID();
    const prefix = fixture.item.key.split("-")[0]!;
    const description = "Description réservée au panneau, absente des vues.";
    const rootPath = fixture.item.path;
    const epicPath = `${rootPath}.${epicId.replaceAll("-", "")}`;
    try {
      await db.update(items).set({ description }).where(eq(items.id, fixture.item.id));
      await db.insert(items).values([
        {
          id: epicId, key: `${prefix}-2`, type: "epic", title: "Epic",
          parentId: fixture.item.id, path: epicPath, depth: 1, rank: "a1",
        },
        {
          id: taskId, key: `${prefix}-3`, type: "tache", title: "Task",
          parentId: epicId, path: `${epicPath}.${taskId.replaceAll("-", "")}`, depth: 2, rank: "a2",
        },
        {
          id: siblingId, key: `${prefix}-4`, type: "composant", title: "First root by binary rank",
          parentId: null, path: `root.${siblingId.replaceAll("-", "")}`, depth: 0, rank: "Z",
        },
        {
          id: deletedId, key: `${prefix}-5`, type: "composant", title: "Deleted",
          parentId: null, path: `root.${deletedId.replaceAll("-", "")}`, depth: 0, rank: "a3",
          deletedAt: new Date(),
        },
      ].map((row) => ({
        ...row, type: row.type as "composant" | "epic" | "tache",
        backlogId: fixture.backlogId, statusId: fixture.item.statusId,
        reporterId: fixture.actorId, description,
      })));

      const rows = await listItems(fixture.backlogId);
      const ancestors = await listItemsWithAncestors(fixture.backlogId, [taskId, taskId]);
      expect(rows.map(({ id }) => id)).toEqual([siblingId, fixture.item.id, epicId, taskId]);
      expect(ancestors.map(({ id }) => id)).toEqual([fixture.item.id, epicId, taskId]);
      for (const row of [...rows, ...ancestors]) {
        expect(row).not.toHaveProperty("description");
        expect(row).not.toHaveProperty("search");
      }
      await expect(getItemByIdForBacklog(fixture.item.id, fixture.backlogId))
        .resolves.toMatchObject({ id: fixture.item.id, description });
      await expect(getItemByKeyForBacklog(fixture.item.key, fixture.backlogId))
        .resolves.toMatchObject({ id: fixture.item.id, description });
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
    }
  });
});
