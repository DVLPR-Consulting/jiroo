import "dotenv/config";

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogs, items, statuses } from "@/lib/db/schema/domain";
import { restoreItem, updateItem } from "@/lib/services/items";

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

  return { actorId: actor.id, backlogId: backlog!.id, item: item! };
}

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
  const [item] = await db
    .insert(items)
    .values({
      id: taskId,
      key: `${backlog!.key}-2`,
      type: "tache",
      backlogId: backlog!.id,
      title: "Travail estimable",
      parentId: componentId,
      statusId: status!.id,
      reporterId: actor.id,
      rank: "a1",
      path: `${componentPath}.${taskId.replaceAll("-", "")}`,
      depth: 1,
    })
    .returning();

  return { actorId: actor.id, backlogId: backlog!.id, item: item! };
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
