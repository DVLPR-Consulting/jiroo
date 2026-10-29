import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { activities, backlogs, items, permissionGrants, statuses } from "@/lib/db/schema/domain";
import { createReadVisibilityFixture, deleteReadVisibilityFixture, type ReadVisibilityFixture } from "@/lib/services/read-visibility.integration-fixture";
import { deleteStatus, updateStatus } from "@/lib/services/statuses";
import { loadTicketTimeline } from "@/lib/services/presence-page";

vi.mock("server-only", () => ({}));
const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("presence ticket timeline", () => {
  let f: ReadVisibilityFixture;
  let doing: string;
  let done: string;
  beforeEach(async () => {
    f = await createReadVisibilityFixture("Presence");
    const added = await db.insert(statuses).values([
      { backlogId: f.backlogA.id, name: "En cours", category: "in_progress", order: 1, color: "#4488cc" },
      { backlogId: f.backlogA.id, name: "Fini", category: "done", order: 2, color: "#22c55e" },
    ]).returning();
    doing = added[0]!.id; done = added[1]!.id;
  });
  afterEach(async () => { vi.restoreAllMocks(); await deleteReadVisibilityFixture(f); });
  const read = (from = "2026-10-01", to = "2026-10-31", backlogIds?: string[]) => loadTicketTimeline({ actorId: f.actorA, backlogIds: backlogIds ?? [f.backlogA.id], from, to });
  async function change(to: string, at: string, itemId = f.liveA.id) {
    await db.insert(activities).values({ itemId, actorId: f.actorA, action: "status_change", field: "status", oldValue: f.liveA.statusId, newValue: to, at: new Date(at) });
  }

  it("finds the first entry into progress, using Paris days, and the current assignee", async () => {
    await db.update(items).set({ statusId: doing, estimatePoints: 3.5, assigneeId: f.admin }).where(eq(items.id, f.liveA.id));
    await change(doing, "2026-09-30T22:30:00Z");
    await change(doing, "2026-10-10T08:00:00Z");
    expect((await read()).tickets).toEqual([{
      id: f.liveA.id, key: f.liveA.key, title: f.liveA.title, type: "tache", points: 3.5, statusCategory: "in_progress", assigneeId: f.admin, backlogId: f.backlogA.id, startedAt: "2026-10-01", doneAt: null, historyIncomplete: false,
    }]);
  });

  it("uses the last done entry, ignoring earlier completion after a reopening", async () => {
    await change(doing, "2026-10-01T08:00:00Z");
    await change(done, "2026-10-05T08:00:00Z");
    await change(doing, "2026-10-06T08:00:00Z");
    await change(done, "2026-10-25T23:30:00Z");
    await db.update(items).set({ statusId: done }).where(eq(items.id, f.liveA.id));
    expect((await read()).tickets[0]).toMatchObject({ startedAt: "2026-10-01", doneAt: "2026-10-26", points: null });
    await db.update(items).set({ statusId: doing }).where(eq(items.id, f.liveA.id));
    expect((await read()).tickets[0]!.doneAt).toBeNull();
  });

  it("starts a directly completed ticket on completion, and includes both period bounds", async () => {
    await change(done, "2026-10-10T08:00:00Z");
    await db.update(items).set({ statusId: done }).where(eq(items.id, f.liveA.id));
    expect((await read("2026-10-10", "2026-10-10")).tickets[0]).toMatchObject({ startedAt: "2026-10-10", doneAt: "2026-10-10", historyIncomplete: true });
    expect((await read("2026-10-11", "2026-10-31")).tickets).toEqual([]);
    expect((await read("2026-10-01", "2026-10-09")).tickets).toEqual([]);
  });

  it("excludes unknown starts, unassigned, deleted, archived, future-only, missing and hidden backlogs", async () => {
    expect((await read()).tickets).toEqual([]);
    await change(doing, "2026-10-01T08:00:00Z");
    expect((await read("2099-01-01", "2099-01-31")).tickets).toEqual([]);
    expect((await read("2026-10-01", "2026-10-31", [f.backlogB.id, randomUUID()])).tickets).toEqual([]);
    await db.update(items).set({ assigneeId: null }).where(eq(items.id, f.liveA.id));
    expect((await read()).tickets).toEqual([]);
    await db.update(items).set({ assigneeId: f.actorA, deletedAt: new Date() }).where(eq(items.id, f.liveA.id));
    expect((await read()).tickets).toEqual([]);
    await db.update(items).set({ deletedAt: null }).where(eq(items.id, f.liveA.id));
    await db.update(backlogs).set({ archivedAt: new Date() }).where(eq(backlogs.id, f.backlogA.id));
    expect((await read()).tickets).toEqual([]);
  });

  it("filters a mixed scope and ignores malformed historical status identifiers", async () => {
    await change(doing, "2026-10-01T08:00:00Z");
    await change(doing, "2026-10-01T08:00:00Z", f.liveB.id); // A foreign backlog's status is not valid here.
    await change("not-a-status-id", "2026-09-01T08:00:00Z");
    const result = await read("2026-10-01", "2026-10-31", [f.backlogB.id, f.backlogA.id, f.backlogA.id]);
    expect(result.tickets.map((ticket) => ticket.id)).toEqual([f.liveA.id]);
    expect(result.limited).toBe(false);
    await expect(read("2026-02-30")).rejects.toThrow();
    await expect(read("2026-11-01", "2026-10-01")).rejects.toThrow();
  });

  it("marks deleted status history approximate instead of guessing a category from its name", async () => {
    await change(doing, "2026-10-01T08:00:00Z");
    await change(done, "2026-10-10T08:00:00Z");
    await db.update(items).set({ statusId: done, closedAt: new Date("2026-10-10T08:00:00Z") }).where(eq(items.id, f.liveA.id));
    await deleteStatus({ id: doing, backlogId: f.backlogA.id }, f.admin);
    expect((await read()).tickets[0]).toMatchObject({ startedAt: "2026-10-10", doneAt: "2026-10-10", historyIncomplete: true });
  });

  it("keeps an in-progress ticket from the first unresolved transition when no progress entry resolves", async () => {
    await db.update(items).set({ statusId: doing }).where(eq(items.id, f.liveA.id));
    await change("Ancien statut supprimé", "2026-09-30T22:30:00Z");
    expect((await read()).tickets[0]).toMatchObject({ startedAt: "2026-10-01", doneAt: null, historyIncomplete: true });
  });

  it("applies today's category to all transitions when a workflow status is recategorized", async () => {
    await db.update(items).set({ statusId: doing }).where(eq(items.id, f.liveA.id));
    await change(doing, "2026-10-01T08:00:00Z");
    await updateStatus({ id: doing, backlogId: f.backlogA.id, name: "En cours", category: "done", color: "#22c55e" }, f.admin);
    // The explicit policy uses the resolved status's current category, not
    // the later update/status_category activity or the current closedAt.
    expect((await read()).tickets[0]).toMatchObject({ startedAt: "2026-10-01", doneAt: "2026-10-01", historyIncomplete: true });
  });

  it("uses closedAt in Paris when the current done ticket has no resolvable done transition", async () => {
    await change(doing, "2026-10-01T08:00:00Z");
    await change("Ancien statut terminé", "2026-10-10T08:00:00Z");
    await db.update(items).set({ statusId: done, closedAt: new Date("2026-10-25T23:30:00Z") }).where(eq(items.id, f.liveA.id));
    expect((await read()).tickets[0]).toMatchObject({ startedAt: "2026-10-01", doneAt: "2026-10-26", historyIncomplete: true });
  });

  it("keeps a done ticket with closedAt even without any status activity", async () => {
    await db.update(items).set({ statusId: done, closedAt: new Date("2026-10-10T08:00:00Z") }).where(eq(items.id, f.liveA.id));
    expect((await read()).tickets[0]).toMatchObject({ startedAt: "2026-10-10", doneAt: "2026-10-10", historyIncomplete: true });
  });

  it("caps at 2000 matching tickets with a deterministic order and fixed query count", async () => {
    await change(doing, "2026-10-01T08:00:00Z");
    const spy = vi.spyOn(Client.prototype, "query");
    await read(); const small = spy.mock.calls.length; expect(small).toBe(1); spy.mockRestore();
    const rows = Array.from({ length: 2000 }, (_, index) => {
      const id = randomUUID();
      return { id, key: `${f.backlogA.key}-V${index}`, type: "tache" as const, backlogId: f.backlogA.id, title: "Volume", statusId: doing, assigneeId: f.actorA, reporterId: f.actorA, rank: `vol${index}`, path: `root.${id.replaceAll("-", "")}` };
    });
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(items).values(rows.slice(i, i + 500));
      await db.insert(activities).values(rows.slice(i, i + 500).map((row) => ({ itemId: row.id, actorId: f.actorA, action: "status_change" as const, field: "status", newValue: doing, at: new Date("2026-10-02T08:00:00Z") })));
    }
    const largeSpy = vi.spyOn(Client.prototype, "query");
    const result = await read();
    expect(largeSpy.mock.calls.length).toBe(small); largeSpy.mockRestore();
    expect(result.limited).toBe(true); expect(result.tickets).toHaveLength(2000);
    expect(result.tickets[0]!.id).toBe(f.liveA.id);
    expect((await read()).tickets.map((ticket) => ticket.id)).toEqual(result.tickets.map((ticket) => ticket.id));
    // Reading multiple visible backlogs still takes one grouped data query.
    await db.insert(permissionGrants).values({ scope: "backlog", permissionSchemeId: f.schemeIds[1]!, permissionKey: "browse_backlog", principalType: "user", userId: f.actorA });
    expect((await read("2026-10-01", "2026-10-31", [f.backlogA.id, f.backlogB.id])).tickets).toHaveLength(2000);
    // Filtering dates after aggregation must not introduce out-of-period tickets at volume.
    expect((await read("2026-09-01", "2026-09-30")).tickets).toEqual([]);
  });
});
