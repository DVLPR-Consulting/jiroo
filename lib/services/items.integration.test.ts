import "dotenv/config";

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogs, items, statuses } from "@/lib/db/schema/domain";
import { restoreItem } from "@/lib/services/items";

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
