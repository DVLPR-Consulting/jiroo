import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, itemLinks, statuses } from "@/lib/db/schema/domain";
import { addLink } from "@/lib/services/links";

vi.mock("server-only", () => ({}));
const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("concurrent link invariants", () => {
  it.each([
    { type: "blocks" as const, mixedCase: false },
    { type: "relates" as const, mixedCase: false },
    { type: "blocks" as const, mixedCase: true },
    { type: "relates" as const, mixedCase: true },
  ])("serializes inverse $type requests (mixed case: $mixedCase)", async ({ type, mixedCase }) => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Missing seeded actor");
    const [backlog] = await db.insert(backlogs).values({ key: `LK${randomUUID().replaceAll("-", "").slice(0, 8)}`, name: "Link race" }).returning();
    const [status] = await db.insert(statuses).values({ backlogId: backlog!.id, name: "Todo", category: "todo", order: 0, color: "#9aa0a6" }).returning();
    const ids = [randomUUID(), randomUUID()];
    await db.insert(items).values(ids.map((id, i) => ({ id, key: `${backlog!.key}-${i + 1}`, backlogId: backlog!.id, type: "tache" as const, title: "Link fixture", statusId: status!.id, reporterId: actor.id, rank: `a${i}`, path: `root.${id.replaceAll("-", "")}` })));
    const gate = new Client({ connectionString: process.env.DATABASE_URL });
    await gate.connect();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await gate.query("begin");
      // Hold inserts until both mutations reach an observable database lock wait.
      await gate.query("lock table item_links in share mode");
      pending = Promise.allSettled([
        addLink({ sourceId: ids[0], targetId: ids[1], type }, actor.id),
        addLink({ sourceId: mixedCase ? ids[1]!.toUpperCase() : ids[1], targetId: ids[0], type }, actor.id),
      ]);
      let blocked = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        await gate.query("select pg_stat_clear_snapshot()");
        const result = await gate.query<{ count: number }>("select count(*)::int as count from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and wait_event_type = 'Lock'");
        if (result.rows[0]!.count >= 2) { blocked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked, "two mutations reached the database barrier").toBe(true);
      await gate.query("commit");
      const result = await pending;
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const refused = result.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(refused.reason.message).toContain(type === "blocks" ? "Cycle" : "existe déjà");
      const links = await db.select().from(itemLinks).where(inArray(itemLinks.sourceId, ids));
      expect(links).toHaveLength(1);
    } finally {
      await gate.query("rollback");
      await pending;
      await gate.end();
      await db.delete(backlogs).where(eq(backlogs.id, backlog!.id));
    }
  });
});
