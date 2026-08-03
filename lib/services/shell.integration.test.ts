import "dotenv/config";

import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import { getShellCounts } from "@/lib/services/shell";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(): string {
  return randomUUID().replace(/[^a-f]/gi, "").slice(0, 6).toUpperCase();
}

describeDb("getShellCounts", () => {
  it("separates live backlog, assigned, and deleted item counts", async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    const baseline = await getShellCounts(actor.id);
    const backlogKey = randomBacklogKey();
    const archivedBacklogKey = randomBacklogKey();
    const [backlog] = await db
      .insert(backlogs)
      .values({ key: backlogKey, name: "Compteurs shell", color: "#475569" })
      .returning();
    const [archivedBacklog] = await db
      .insert(backlogs)
      .values({
        key: archivedBacklogKey,
        name: "Compteurs shell archivés",
        color: "#64748b",
        archivedAt: new Date(),
      })
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
    await db.insert(items).values([
      {
        id: ids[0]!,
        key: `${backlogKey}-${suffix}`,
        type: "composant",
        backlogId: backlog!.id,
        title: "Assigné vivant",
        statusId: status!.id,
        assigneeId: actor.id,
        reporterId: actor.id,
        rank: "a0",
        path: `root.${ids[0]!.replaceAll("-", "")}`,
      },
      {
        id: ids[1]!,
        key: `${backlogKey}-${suffix + 1}`,
        type: "composant",
        backlogId: backlog!.id,
        title: "Non assigné vivant",
        statusId: status!.id,
        reporterId: actor.id,
        rank: "a1",
        path: `root.${ids[1]!.replaceAll("-", "")}`,
      },
      {
        id: ids[2]!,
        key: `${backlogKey}-${suffix + 2}`,
        type: "composant",
        backlogId: backlog!.id,
        title: "Assigné supprimé",
        statusId: status!.id,
        assigneeId: actor.id,
        reporterId: actor.id,
        rank: "a2",
        path: `root.${ids[2]!.replaceAll("-", "")}`,
        deletedAt: new Date(),
      },
      {
        id: ids[3]!,
        key: `${archivedBacklogKey}-${suffix}`,
        type: "composant",
        backlogId: archivedBacklog!.id,
        title: "Assigné dans un backlog archivé",
        statusId: archivedStatus!.id,
        assigneeId: actor.id,
        reporterId: actor.id,
        rank: "a0",
        path: `root.${ids[3]!.replaceAll("-", "")}`,
      },
    ]);

    try {
      const counts = await getShellCounts(actor.id);
      expect(counts.allByBacklog[backlogKey]).toBe(2);
      expect(counts.mine).toBe(baseline.mine + 1);
      expect(counts.trash).toBe(baseline.trash + 1);
    } finally {
      await db
        .delete(backlogs)
        .where(inArray(backlogs.id, [backlog!.id, archivedBacklog!.id]));
    }
  });
});
