import "dotenv/config";

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogs, items, statuses } from "@/lib/db/schema/domain";
import { updateBacklog } from "@/lib/services/backlogs";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(prefix: string): string {
  const letters = randomUUID().replace(/[^a-f]/gi, "").slice(0, 4).toUpperCase();
  return `${prefix}${letters}`.slice(0, 6);
}

async function createFixture(actorId: string) {
  const oldKey = randomBacklogKey("A");
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: oldKey, name: "Backlog test", color: "#7c3030" })
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

  const firstId = randomUUID();
  const secondId = randomUUID();
  const suffix = Date.now();
  await db.insert(items).values([
    {
      id: firstId,
      key: `${oldKey}-${suffix}`,
      type: "composant",
      backlogId: backlog!.id,
      title: "Actif",
      statusId: status!.id,
      reporterId: actorId,
      rank: "a0",
      path: `root.${firstId.replaceAll("-", "")}`,
      depth: 0,
    },
    {
      id: secondId,
      key: `${oldKey}-${suffix + 1}`,
      type: "composant",
      backlogId: backlog!.id,
      title: "Supprimé",
      statusId: status!.id,
      reporterId: actorId,
      rank: "a1",
      path: `root.${secondId.replaceAll("-", "")}`,
      depth: 0,
      deletedAt: new Date(),
    },
  ]);

  return { backlog: backlog!, oldKey, suffix };
}

describeDb("updateBacklog transaction", () => {
  it("renames live and deleted item keys and audits every item", async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    const fixture = await createFixture(actor.id);
    const newKey = randomBacklogKey("B");

    try {
      const result = await updateBacklog(
        {
          id: fixture.backlog.id,
          key: newKey,
          name: "Backlog renommé",
          color: "#2b6cb0",
        },
        actor.id,
      );

      expect(result).toMatchObject({
        previousKey: fixture.oldKey,
        backlog: { key: newKey, name: "Backlog renommé", color: "#2b6cb0" },
      });

      const renamed = await db
        .select({ key: items.key, deletedAt: items.deletedAt })
        .from(items)
        .where(eq(items.backlogId, fixture.backlog.id))
        .orderBy(asc(items.key));
      expect(renamed.map((row) => row.key)).toEqual([
        `${newKey}-${fixture.suffix}`,
        `${newKey}-${fixture.suffix + 1}`,
      ]);
      expect(renamed.some((row) => row.deletedAt !== null)).toBe(true);

      const audit = await db
        .select({ field: activities.field, oldValue: activities.oldValue, newValue: activities.newValue })
        .from(activities)
        .innerJoin(items, eq(activities.itemId, items.id))
        .where(eq(items.backlogId, fixture.backlog.id))
        .orderBy(asc(activities.oldValue));
      expect(audit).toEqual([
        { field: "key", oldValue: `${fixture.oldKey}-${fixture.suffix}`, newValue: `${newKey}-${fixture.suffix}` },
        { field: "key", oldValue: `${fixture.oldKey}-${fixture.suffix + 1}`, newValue: `${newKey}-${fixture.suffix + 1}` },
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlog.id));
    }
  });

  it("rolls back item keys and audit rows when the new backlog key collides", async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    const fixture = await createFixture(actor.id);
    const [conflict] = await db
      .insert(backlogs)
      .values({ key: randomBacklogKey("C"), name: "Conflit", color: "#475569" })
      .returning();

    try {
      await expect(
        updateBacklog(
          {
            id: fixture.backlog.id,
            key: conflict!.key,
            name: "Ne doit pas changer",
            color: "#2b6cb0",
          },
          actor.id,
        ),
      ).rejects.toBeTruthy();

      const [storedBacklog] = await db
        .select({ key: backlogs.key, name: backlogs.name })
        .from(backlogs)
        .where(eq(backlogs.id, fixture.backlog.id));
      expect(storedBacklog).toEqual({ key: fixture.oldKey, name: "Backlog test" });

      const storedItems = await db
        .select({ key: items.key })
        .from(items)
        .where(eq(items.backlogId, fixture.backlog.id))
        .orderBy(asc(items.key));
      expect(storedItems.map((row) => row.key)).toEqual([
        `${fixture.oldKey}-${fixture.suffix}`,
        `${fixture.oldKey}-${fixture.suffix + 1}`,
      ]);

      const audit = await db
        .select({ id: activities.id })
        .from(activities)
        .innerJoin(items, eq(activities.itemId, items.id))
        .where(eq(items.backlogId, fixture.backlog.id));
      expect(audit).toEqual([]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlog.id));
      await db.delete(backlogs).where(eq(backlogs.id, conflict!.id));
    }
  });
});
