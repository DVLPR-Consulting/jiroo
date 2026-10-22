import "dotenv/config";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { comments, itemLinks } from "@/lib/db/schema/domain";
import { loadLePoint } from "@/lib/le-point/load";
import {
  createReadVisibilityFixture,
  deleteReadVisibilityFixture,
  type ReadVisibilityFixture,
} from "@/lib/services/read-visibility.integration-fixture";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("loadLePoint", () => {
  let fixture: ReadVisibilityFixture;

  beforeAll(async () => {
    fixture = await createReadVisibilityFixture("Le point");
    // B's ticket, which A cannot browse, blocks A's ticket.
    await db.insert(itemLinks).values({ sourceId: fixture.liveB.id, targetId: fixture.liveA.id, type: "blocks" });
    await db.insert(comments).values([
      { itemId: fixture.liveA.id, authorId: fixture.actorB, body: "@A une décision ?", mentions: [fixture.actorA] },
      { itemId: fixture.trashA.id, authorId: fixture.actorB, body: "dans la corbeille", mentions: [fixture.actorA] },
    ]);
  });

  afterAll(async () => {
    if (fixture) await deleteReadVisibilityFixture(fixture);
  });

  it("refuses a backlog the reader cannot browse", async () => {
    await expect(loadLePoint({ userId: fixture.actorA, backlogKey: fixture.backlogB.key, lastVisit: null })).resolves.toBeNull();
  });

  it("reads the reader's backlog, live tickets only", async () => {
    const data = (await loadLePoint({ userId: fixture.actorA, backlogKey: fixture.backlogA.key, lastVisit: null }))!;
    expect(data.backlog.key).toBe(fixture.backlogA.key);
    expect(data.personas).toEqual({ developer: fixture.actorA, product: fixture.actorA });
    expect(data.tickets.map((ticket) => ticket.key)).toEqual([fixture.liveA.key]);
    expect(data.firstVisit).toBe(true);
    expect(data.mentions.map((mention) => mention.ticket)).toEqual([fixture.liveA.key]);
  });

  it("reduces a dependency in a hidden backlog to « a ticket you cannot see »", async () => {
    const data = (await loadLePoint({ userId: fixture.actorA, backlogKey: fixture.backlogA.key, lastVisit: "2026-10-01" }))!;
    expect(data.tickets[0]!.blockedBy).toEqual([{ hidden: true }]);
    expect(JSON.stringify(data)).not.toContain(fixture.liveB.key);
    expect(JSON.stringify(data)).not.toContain(fixture.liveB.id);
  });
});
