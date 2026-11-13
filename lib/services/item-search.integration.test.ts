import "dotenv/config";

import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema/domain";
import { InvalidCursorError, searchItemsForActor } from "@/lib/services/item-search";
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
    try {
      const first = await searchItemsForActor(fixture.actorA, { backlogKey: fixture.backlogA.key, limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await searchItemsForActor(fixture.actorA, { backlogKey: fixture.backlogA.key, limit: 2, cursor: first.nextCursor });
      const seen = [...first.items, ...second.items].map((i) => i.key);
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.slice(-1)[0]).toBe(`${fixture.backlogA.key}-903`);
      expect(second.nextCursor).toBeNull();

      await expect(searchItemsForActor(fixture.actorA, { cursor: "forged" })).rejects.toBeInstanceOf(InvalidCursorError);
    } finally {
      await db.delete(items).where(inArray(items.id, inserted.map((row) => row.id)));
    }
  });

  it("lists the statuses of a backlog in board order", async () => {
    const rows = await listStatusesForBacklog(fixture.backlogA.id);
    expect(rows).toEqual([{ id: expect.any(String), name: "À faire", category: "todo", color: "#9aa0a6", order: 0 }]);
  });
});
