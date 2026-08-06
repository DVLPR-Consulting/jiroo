import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import {
  createReadVisibilityFixture,
  deleteReadVisibilityFixture,
} from "@/lib/services/read-visibility.integration-fixture";
import { recentItems, searchItems } from "@/lib/services/search";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(): string {
  return randomUUID().replace(/[^a-f]/gi, "").slice(0, 6).toUpperCase();
}

describeDb("recentItems", () => {
  it("preserves caller order while hiding deleted, archived, and missing keys", async () => {
    const actorId = `recent-admin-${randomUUID()}`;
    const [actor] = await db
      .insert(user)
      .values({
        id: actorId,
        name: "Administratrice récents",
        email: `${actorId}@example.test`,
        emailVerified: true,
        role: "admin",
      })
      .returning({ id: user.id, name: user.name });
    if (!actor) throw new Error("Impossible de créer l’administratrice de test.");

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
      const rows = await recentItems(actor.id, [
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
      await db.delete(user).where(eq(user.id, actor!.id));
    }
  });

  it("filters search and stale recent keys before limiting or materialising rows", async () => {
    const fixture = await createReadVisibilityFixture("Recherche cloisonnée");

    try {
      await expect(searchItems(fixture.actorA, "Recherche cloisonnée", 20)).resolves.toEqual([
        expect.objectContaining({ id: fixture.liveA.id, backlogKey: fixture.backlogA.key }),
      ]);
      await expect(searchItems(fixture.actorB, "Recherche cloisonnée", 1)).resolves.toEqual([
        expect.objectContaining({ id: fixture.liveB.id, backlogKey: fixture.backlogB.key }),
      ]);
      expect(
        (await searchItems(fixture.admin, "Recherche cloisonnée", 20)).map((row) => row.id),
      ).toEqual(expect.arrayContaining([fixture.liveA.id, fixture.liveB.id]));
      expect(
        (await searchItems(fixture.platformAdmin, "Recherche cloisonnée", 20)).map(
          (row) => row.id,
        ),
      ).toEqual(expect.arrayContaining([fixture.liveA.id, fixture.liveB.id]));

      await expect(
        recentItems(fixture.actorA, [fixture.liveB.key, fixture.liveA.key]),
      ).resolves.toEqual([
        expect.objectContaining({ id: fixture.liveA.id, key: fixture.liveA.key }),
      ]);
      expect(
        (await recentItems(fixture.admin, [fixture.liveB.key, fixture.liveA.key])).map(
          (row) => row.id,
        ),
      ).toEqual([fixture.liveB.id, fixture.liveA.id]);
    } finally {
      await deleteReadVisibilityFixture(fixture);
    }
  });
});
