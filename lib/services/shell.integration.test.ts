import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import { getShellCounts } from "@/lib/services/shell";
import {
  createReadVisibilityFixture,
  deleteReadVisibilityFixture,
} from "@/lib/services/read-visibility.integration-fixture";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(): string {
  return randomUUID().replace(/[^a-f]/gi, "").slice(0, 6).toUpperCase();
}

describeDb("getShellCounts", () => {
  it("separates live backlog, assigned, and deleted item counts", async () => {
    const actorId = `shell-admin-${randomUUID()}`;
    const [actor] = await db
      .insert(user)
      .values({
        id: actorId,
        name: "Administratrice shell",
        email: `${actorId}@example.test`,
        emailVerified: true,
        role: "admin",
      })
      .returning({ id: user.id });
    if (!actor) throw new Error("Impossible de créer l’administratrice de test.");
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
      await db.delete(user).where(eq(user.id, actor!.id));
    }
  });

  it("filters backlog, mine, and trash counts before COUNT", async () => {
    const fixture = await createReadVisibilityFixture("Compteurs cloisonnés");

    try {
      await expect(getShellCounts(fixture.actorA)).resolves.toEqual({
        allByBacklog: { [fixture.backlogA.key]: 1 },
        mine: 1,
        trash: 1,
      });
      const adminCounts = await getShellCounts(fixture.admin);
      expect(adminCounts.allByBacklog).toMatchObject({
        [fixture.backlogA.key]: 1,
        [fixture.backlogB.key]: 1,
      });
      expect(adminCounts.trash).toBeGreaterThanOrEqual(2);
      const platformAdminCounts = await getShellCounts(fixture.platformAdmin);
      expect(platformAdminCounts.allByBacklog).toMatchObject({
        [fixture.backlogA.key]: 1,
        [fixture.backlogB.key]: 1,
      });
      expect(platformAdminCounts.trash).toBeGreaterThanOrEqual(2);
    } finally {
      await deleteReadVisibilityFixture(fixture);
    }
  });
});
