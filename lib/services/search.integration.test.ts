import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import { recentItems } from "@/lib/services/search";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(): string {
  return randomUUID().replace(/[^a-f]/gi, "").slice(0, 6).toUpperCase();
}

describeDb("recentItems", () => {
  it("preserves caller order while hiding deleted, archived, and missing keys", async () => {
    const [actor] = await db.select({ id: user.id, name: user.name }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");

    const activeKey = randomBacklogKey();
    const archivedKey = randomBacklogKey();
    const [activeBacklog] = await db
      .insert(backlogs)
      .values({ key: activeKey, name: "Recherche récente", color: "#475569" })
      .returning();
    const [archivedBacklog] = await db
      .insert(backlogs)
      .values({
        key: archivedKey,
        name: "Recherche récente archivée",
        color: "#64748b",
        archivedAt: new Date(),
      })
      .returning();
    const [activeStatus] = await db
      .insert(statuses)
      .values({
        backlogId: activeBacklog!.id,
        name: "À faire",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      })
      .returning();
    const [archivedStatus] = await db
      .insert(statuses)
      .values({
        backlogId: archivedBacklog!.id,
        name: "À faire",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      })
      .returning();

    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const suffix = Date.now();
    const activeAssignedKey = `${activeKey}-${suffix}`;
    const activeUnassignedKey = `${activeKey}-${suffix + 1}`;
    const deletedKey = `${activeKey}-${suffix + 2}`;
    const archivedItemKey = `${archivedKey}-${suffix}`;
    await db.insert(items).values([
      {
        id: ids[0]!,
        key: activeAssignedKey,
        type: "tache",
        backlogId: activeBacklog!.id,
        title: "Assigné vivant",
        statusId: activeStatus!.id,
        assigneeId: actor.id,
        reporterId: actor.id,
        rank: "a0",
        path: `root.${ids[0]!.replaceAll("-", "")}`,
      },
      {
        id: ids[1]!,
        key: activeUnassignedKey,
        type: "tache",
        backlogId: activeBacklog!.id,
        title: "Non assigné vivant",
        statusId: activeStatus!.id,
        reporterId: actor.id,
        rank: "a1",
        path: `root.${ids[1]!.replaceAll("-", "")}`,
      },
      {
        id: ids[2]!,
        key: deletedKey,
        type: "tache",
        backlogId: activeBacklog!.id,
        title: "Supprimé",
        statusId: activeStatus!.id,
        reporterId: actor.id,
        rank: "a2",
        path: `root.${ids[2]!.replaceAll("-", "")}`,
        deletedAt: new Date(),
      },
      {
        id: ids[3]!,
        key: archivedItemKey,
        type: "tache",
        backlogId: archivedBacklog!.id,
        title: "Archivé",
        statusId: archivedStatus!.id,
        reporterId: actor.id,
        rank: "a0",
        path: `root.${ids[3]!.replaceAll("-", "")}`,
      },
    ]);

    try {
      const rows = await recentItems([
        activeUnassignedKey,
        deletedKey,
        archivedItemKey,
        `${activeKey}-${suffix + 99}`,
        activeAssignedKey,
      ]);

      expect(rows.map(({ key, assigneeName }) => ({ key, assigneeName }))).toEqual([
        { key: activeUnassignedKey, assigneeName: null },
        { key: activeAssignedKey, assigneeName: actor.name },
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, activeBacklog!.id));
      await db.delete(backlogs).where(eq(backlogs.id, archivedBacklog!.id));
    }
  });
});
