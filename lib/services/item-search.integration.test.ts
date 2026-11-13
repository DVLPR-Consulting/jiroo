import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema/domain";
import { findItemSummaryByKey, InvalidCursorError, searchItemsForActor } from "@/lib/services/item-search";
import { listStatusesForBacklog } from "@/lib/services/statuses";
import {
  createReadVisibilityFixture,
  deleteReadVisibilityFixture,
  type ReadVisibilityFixture,
} from "@/lib/services/read-visibility.integration-fixture";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("item search for the API (JIR-157, JIR-158)", () => {
  let fixture: ReadVisibilityFixture;

  beforeAll(async () => {
    fixture = await createReadVisibilityFixture("Recherche API");
  });

  afterAll(async () => {
    if (fixture) await deleteReadVisibilityFixture(fixture);
  });

  it("returns only live items of the backlogs the actor may browse, as summaries", async () => {
    const page = await searchItemsForActor(fixture.actorA);
    const keys = page.items.map((item) => item.key);

    expect(keys).toContain(fixture.liveA.key);
    expect(keys).not.toContain(fixture.liveB.key);
    expect(keys).not.toContain(fixture.trashA.key);
    const live = page.items.find((item) => item.key === fixture.liveA.key)!;
    expect(live).toMatchObject({
      id: fixture.liveA.id,
      backlog: { id: fixture.backlogA.id, key: fixture.backlogA.key },
      status: { category: "todo" },
    });
    expect(typeof live.createdAt).toBe("string");
    expect(page.nextCursor).toBeNull();
  });

  it("sees everything as a platform administrator and filters by backlog, status, type and text", async () => {
    const all = await searchItemsForActor(fixture.platformAdmin);
    expect(all.items.map((i) => i.key)).toEqual(expect.arrayContaining([fixture.liveA.key, fixture.liveB.key]));

    const onlyB = await searchItemsForActor(fixture.platformAdmin, { backlogKey: fixture.backlogB.key.toLowerCase() });
    expect(onlyB.items.map((i) => i.backlog.key)).toEqual([fixture.backlogB.key]);

    const [statusB] = await listStatusesForBacklog(fixture.backlogB.id);
    const byStatus = await searchItemsForActor(fixture.platformAdmin, { statusId: statusB!.id });
    expect(byStatus.items.every((i) => i.status.id === statusB!.id)).toBe(true);
    expect(byStatus.items.map((i) => i.key)).toContain(fixture.liveB.key);

    const byType = await searchItemsForActor(fixture.platformAdmin, { type: fixture.liveA.type, backlogKey: fixture.backlogA.key });
    expect(byType.items.map((i) => i.key)).toContain(fixture.liveA.key);

    const byKey = await searchItemsForActor(fixture.platformAdmin, { query: fixture.liveA.key.toLowerCase() });
    expect(byKey.items.map((i) => i.key)).toEqual([fixture.liveA.key]);
    const byUnderscore = await searchItemsForActor(fixture.platformAdmin, { query: "%_" });
    expect(byUnderscore.items).toEqual([]);
  });

  it("pages in creation order with an opaque cursor and refuses a forged one", async () => {
    const ids = [1, 2, 3].map(() => randomUUID());
    const inserted = await db
      .insert(items)
      .values([1, 2, 3].map((n, index) => ({
        id: ids[index]!,
        key: `${fixture.backlogA.key}-${900 + n}`,
        type: "tache" as const,
        backlogId: fixture.backlogA.id,
        title: `Pagination ${n}`,
        statusId: fixture.liveA.statusId,
        rank: `zz${n}`,
        reporterId: fixture.actorA,
        path: `root.${ids[index]!.replaceAll("-", "")}`,
        createdAt: new Date(`2030-01-0${n}T00:00:00.000Z`),
      })))
      .returning({ id: items.id });
    // Microsecond instants, as PostgreSQL stores them: a millisecond cursor
    // would see the first item again and loop (review of JIR-158).
    await db.update(items).set({ createdAt: sql`'2030-01-01 00:00:00.123456+00'::timestamptz` }).where(eq(items.id, ids[0]!));
    await db.update(items).set({ createdAt: sql`'2030-01-01 00:00:00.654321+00'::timestamptz` }).where(eq(items.id, ids[1]!));
    await db.update(items).set({ createdAt: sql`'2030-01-01 00:00:00.654321+00'::timestamptz` }).where(eq(items.id, ids[2]!));
    try {
      const first = await searchItemsForActor(fixture.actorA, { backlogKey: fixture.backlogA.key, limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await searchItemsForActor(fixture.actorA, { backlogKey: fixture.backlogA.key, limit: 2, cursor: first.nextCursor });
      const seen = [...first.items, ...second.items].map((i) => i.key);
      expect(new Set(seen).size).toBe(seen.length);
      // 902 and 903 share one instant: the id breaks the tie, as in SQL.
      const tied = [1, 2].sort((a, b) => (ids[a]! < ids[b]! ? -1 : 1)).map((index) => `${fixture.backlogA.key}-${901 + index}`);
      expect(seen.slice(-3)).toEqual([`${fixture.backlogA.key}-901`, ...tied]);
      expect(second.nextCursor).toBeNull();

      // One item per page over microsecond instants and an exact tie: every item once, then the end.
      const walked: string[] = [];
      let cursor: string | null = null;
      for (let step = 0; step < 10; step += 1) {
        const page = await searchItemsForActor(fixture.actorA, { backlogKey: fixture.backlogA.key, query: "Pagination", limit: 1, cursor });
        walked.push(...page.items.map((i) => i.key));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      expect(walked).toEqual([`${fixture.backlogA.key}-901`, ...tied]);
      expect(cursor).toBeNull();

      await expect(searchItemsForActor(fixture.actorA, { cursor: "forged" })).rejects.toBeInstanceOf(InvalidCursorError);
    } finally {
      await db.delete(items).where(inArray(items.id, inserted.map((row) => row.id)));
    }
  });

  it("finds one item by key for the actor, exactly, or nothing", async () => {
    const mine = await findItemSummaryByKey(fixture.actorA, fixture.liveA.key.toLowerCase());
    expect(mine).toMatchObject({ id: fixture.liveA.id, key: fixture.liveA.key });
    expect(await findItemSummaryByKey(fixture.actorA, fixture.liveB.key)).toBeNull();
    expect(await findItemSummaryByKey(fixture.actorA, fixture.trashA.key)).toBeNull();
    expect(await findItemSummaryByKey(fixture.actorA, `${fixture.backlogA.key}-999999`)).toBeNull();
  });

  it("lists the statuses of a backlog in board order", async () => {
    const rows = await listStatusesForBacklog(fixture.backlogA.id);
    expect(rows).toEqual([{ id: expect.any(String), name: "À faire", category: "todo", color: "#9aa0a6", order: 0 }]);
  });
});
