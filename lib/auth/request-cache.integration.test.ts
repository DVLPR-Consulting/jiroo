import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkPermission } from "@/lib/auth/authorization";
import { requireItemPermission } from "@/lib/auth/action-authorization";
import { withRequestCache } from "@/lib/auth/request-cache";
import { db } from "@/lib/db";
import { createBacklog } from "@/lib/services/backlogs";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses, permissionSchemes } from "@/lib/db/schema/domain";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

async function countQueries(work: () => Promise<unknown>): Promise<number> {
  const spy = vi.spyOn(Client.prototype, "query");
  try {
    await work();
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

describeDb("authorization reads through the request cache", () => {
  let actorId = "";
  let backlogId = "";
  let itemId = "";

  beforeAll(async () => {
    actorId = `request-cache-${randomUUID()}`;
    await db.insert(user).values({ id: actorId, name: "Request cache fixture", email: `${actorId}@example.test`, role: "contributor" });
    const backlog = await createBacklog({ key: `R${randomUUID().replace(/[^a-f]/gi, "").slice(0, 5).toUpperCase()}`, name: "Cache", color: "#475569" }, actorId);
    backlogId = backlog.id;
    const [status] = await db.select().from(statuses).where(eq(statuses.backlogId, backlogId)).limit(1);
    itemId = randomUUID();
    await db.insert(items).values({
      id: itemId,
      key: `${backlog.key}-1`,
      type: "tache",
      backlogId,
      title: "Tâche",
      statusId: status!.id,
      reporterId: actorId,
      rank: "a0",
      path: `root.${itemId.replaceAll("-", "")}`,
      depth: 0,
    });
  });

  afterAll(async () => {
    if (backlogId) {
      await db.delete(backlogs).where(eq(backlogs.id, backlogId));
      await db.delete(permissionSchemes).where(eq(permissionSchemes.key, `backlog-${backlogId}-permission-scheme`));
    }
    if (actorId) await db.delete(user).where(eq(user.id, actorId));
  });

  it("asks the same question once per scope, and every time outside one", async () => {
    const ask = () =>
      checkPermission({ actorId, permission: "transition_items", scope: { type: "backlog", backlogId } });
    const [first, second] = await Promise.all([ask(), ask()]);
    expect(first.allowed).toBe(true);
    expect(second).toEqual(first);

    const unscoped = await countQueries(async () => {
      await ask();
      await ask();
    });
    const scoped = await countQueries(() =>
      withRequestCache(async () => {
        await ask();
        await ask();
      }),
    );
    const once = await countQueries(ask);
    expect(unscoped).toBe(once * 2);
    expect(scoped).toBe(once);
    // The decision is the same through the cache.
    expect(await withRequestCache(ask)).toEqual(first);
  });

  it("spares the repeated reads of an action's boundaries without changing its decisions", async () => {
    const boundaries = async () => {
      const authorized = await requireItemPermission({ actorId, itemId, permission: "schedule_items" });
      await requireItemPermission({ actorId, itemId, permission: "transition_items" });
      return authorized;
    };
    const unscoped = await countQueries(boundaries);
    const scoped = await countQueries(() => withRequestCache(boundaries));
    expect(scoped).toBeLessThan(unscoped);
    expect(await withRequestCache(boundaries)).toEqual({ backlogId, resourceId: itemId });
  });
});
