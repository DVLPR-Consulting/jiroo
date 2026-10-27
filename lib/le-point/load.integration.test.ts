import "dotenv/config";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Client } from "pg";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, comments, itemLinks, items, permissionGrants, sprintEvents, sprintReportSnapshots, sprints } from "@/lib/db/schema/domain";
import { withSprintHistoryCleanup } from "@/test-utils/sprint-history-cleanup";
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

  it("keeps a dependency in an archived backlog hidden, even from someone who could open it", async () => {
    const visible = (await loadLePoint({ userId: fixture.admin, backlogKey: fixture.backlogA.key, lastVisit: null }))!;
    expect(visible.tickets.find((ticket) => ticket.key === fixture.liveA.key)!.blockedBy).toEqual([{ key: fixture.liveB.key }]);
    await db.update(backlogs).set({ archivedAt: new Date() }).where(eq(backlogs.id, fixture.backlogB.id));
    try {
      const data = (await loadLePoint({ userId: fixture.admin, backlogKey: fixture.backlogA.key, lastVisit: null }))!;
      expect(data.tickets.find((ticket) => ticket.key === fixture.liveA.key)!.blockedBy).toEqual([{ hidden: true }]);
      expect(JSON.stringify(data)).not.toContain(fixture.liveB.key);
    } finally {
      await db.update(backlogs).set({ archivedAt: null }).where(eq(backlogs.id, fixture.backlogB.id));
    }
  });
});

describeDb("loadLePoint sprint facts (JIR-124)", () => {
  let f: ReadVisibilityFixture;
  let idleMember: string;
  let browseOnly: string;

  beforeEach(async () => {
    f = await createReadVisibilityFixture("Sprint facts");
    idleMember = `idle-${randomUUID()}`;
    browseOnly = `browse-only-${randomUUID()}`;
    await db.insert(user).values([
      { id: idleMember, name: "Membre sans ticket", email: `${idleMember}@example.test`, role: "contributor" },
      { id: browseOnly, name: "Lecteur seulement", email: `${browseOnly}@example.test`, role: "contributor" },
    ]);
    f.userIds.push(idleMember, browseOnly);
    await db.insert(permissionGrants).values([
      { scope: "backlog", permissionSchemeId: f.schemeIds[0]!, permissionKey: "assignable_user", principalType: "user", userId: f.actorA },
      { scope: "backlog", permissionSchemeId: f.schemeIds[0]!, permissionKey: "assignable_user", principalType: "user", userId: idleMember },
      { scope: "backlog", permissionSchemeId: f.schemeIds[0]!, permissionKey: "browse_backlog", principalType: "user", userId: idleMember },
      { scope: "backlog", permissionSchemeId: f.schemeIds[0]!, permissionKey: "browse_backlog", principalType: "user", userId: browseOnly },
    ]);
  });

  afterEach(async () => {
    if (!f) return;
    const client = await databasePool.connect();
    try {
      await client.query("begin");
      await withSprintHistoryCleanup(client, async () => {
        for (const table of ["sprint_report_items", "sprint_report_snapshots", "sprint_events"]) {
          await client.query(`delete from ${table} where backlog_id = any($1::uuid[])`, [[f.backlogA.id, f.backlogB.id]]);
        }
      });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    await deleteReadVisibilityFixture(f);
  });

  const read = () => loadLePoint({ userId: f.actorA, backlogKey: f.backlogA.key, lastVisit: null });

  async function activeSprint() {
    const [sprint] = await db.insert(sprints).values({
      backlogId: f.backlogA.id, name: "Sprint actif", goal: "Publier la recherche", rank: "a0", state: "active",
      startedAt: new Date("2026-10-20T08:00:00Z"), plannedStartAt: new Date("2026-10-20T08:00:00Z"),
      plannedEndAt: new Date("2026-11-04T17:00:00Z"), createdBy: f.actorA,
    }).returning();
    return sprint!;
  }

  async function closedSprint(day: number, completedPoints: number | null, committedPoints = completedPoints ?? 0, backlogId = f.backlogA.id) {
    const completedAt = new Date(`2026-10-${day.toString().padStart(2, "0")}T17:00:00Z`);
    const [sprint] = await db.insert(sprints).values({
      backlogId, name: `Clos ${day}`, rank: `c${day}`, state: "completed", createdBy: f.actorA,
      startedAt: new Date("2026-10-01T08:00:00Z"), completedAt,
    }).returning();
    if (completedPoints !== null) await db.insert(sprintReportSnapshots).values({
      backlogId, sprintId: sprint!.id, sprintName: sprint!.name, startedAt: sprint!.startedAt!, completedAt,
      createdBy: f.actorA, initialItemCount: 1, committedPoints, initialUnestimatedCount: 0, finalItemCount: 1,
      completedItemCount: completedPoints > 0 ? 1 : 0, completedPoints, finalUnestimatedCount: 0,
      grossPointsAdded: 0, grossPointsRemoved: 0, netEstimateDelta: 0, scopeEventCount: 0,
      finalDestinationSummary: { backlog: 0, sprints: [] }, requestCorrelationId: randomUUID(),
    });
    return sprint!;
  }

  it("returns assignable members even without a sprint, including members without tickets", async () => {
    const data = (await read())!;
    expect(data.sprint).toBeNull();
    // Global administrators already in the database are assignable too;
    // require our members without assuming this fixture owns the directory.
    expect(data.members?.map((member) => member.id)).toEqual(expect.arrayContaining([f.actorA, idleMember, f.admin, f.platformAdmin]));
    expect(data.members).toContainEqual({ id: idleMember, name: "Membre sans ticket" });
    expect(data.members?.some((member) => member.id === f.actorB || member.id === browseOnly)).toBe(false);
  });

  it("does not disclose the member directory without browse_users", async () => {
    // Restrict only the default directory policy, restoring it even if the assertion fails.
    const grants = await db.delete(permissionGrants).where(and(
      eq(permissionGrants.scope, "global"), eq(permissionGrants.permissionKey, "browse_users"),
      eq(permissionGrants.principalType, "authenticated_user"),
    )).returning();
    try {
      const data = (await read())!;
      expect(data.members).toEqual([]);
      expect(data.people).toContainEqual({ id: f.actorA, name: "Sprint facts A" });
      expect(JSON.stringify(data)).not.toContain(idleMember);
    } finally {
      if (grants.length > 0) await db.insert(permissionGrants).values(grants);
    }
  });

  it("reads the goal and every scope event in instant/sequence order, with event estimates and Paris days", async () => {
    const sprint = await activeSprint();
    await db.update(items).set({ title: "Titre actuel", estimatePoints: 9 }).where(eq(items.id, f.liveA.id));
    const event = { backlogId: f.backlogA.id, sprintId: sprint.id, itemId: f.liveA.id,
      itemKey: f.liveA.key, itemTitle: "Titre du journal", actorId: idleMember, requestCorrelationId: randomUUID() };
    // Insert the later instant first, and an equal-instant pair in its sequence order.
    await db.insert(sprintEvents).values([
      { ...event, eventType: "item_removed", previousEstimate: 5, removalReason: "manual", occurredAt: new Date("2026-10-22T08:00:00Z") },
      { ...event, eventType: "item_added", nextEstimate: 2, nextDone: false, occurredAt: new Date("2026-10-20T22:30:00Z") },
      { ...event, eventType: "item_added", nextEstimate: 0, nextDone: false, occurredAt: new Date("2026-10-21T08:00:00Z") },
      { ...event, eventType: "item_removed", previousEstimate: null, removalReason: "manual", occurredAt: new Date("2026-10-21T08:00:00Z") },
      { ...event, eventType: "estimate_changed", previousEstimate: 1, nextEstimate: 2, occurredAt: new Date("2026-10-21T09:00:00Z") },
    ]);
    const foreign = await closedSprint(22, null, 0, f.backlogB.id);
    await db.insert(sprintEvents).values({ ...event, backlogId: f.backlogB.id, sprintId: foreign.id,
      itemId: f.liveB.id, itemKey: f.liveB.key, itemTitle: "SECRET", eventType: "item_added", nextDone: false, occurredAt: new Date() });

    const data = (await read())!;
    expect(data.sprint).toMatchObject({ goal: "Publier la recherche", velocity: null, changes: [
      { kind: "added", key: f.liveA.key, title: "Titre du journal", points: 2, day: "2026-10-21", actor: idleMember },
      { kind: "added", key: f.liveA.key, title: "Titre du journal", points: 0, day: "2026-10-21", actor: idleMember },
      { kind: "removed", key: f.liveA.key, title: "Titre du journal", points: 9, day: "2026-10-21", actor: idleMember },
      { kind: "removed", key: f.liveA.key, title: "Titre du journal", points: 5, day: "2026-10-22", actor: idleMember },
    ] });
    expect(data.people).toContainEqual({ id: idleMember, name: "Membre sans ticket" });
    expect(JSON.stringify(data)).not.toContain("SECRET");
    expect(JSON.stringify(data)).not.toContain(f.liveB.key);
  });

  it("retains deleted and purged tickets from the journal without fabricating an estimate", async () => {
    const sprint = await activeSprint();
    await db.insert(sprintEvents).values({
      backlogId: f.backlogA.id, sprintId: sprint.id, itemId: f.trashA.id, itemKey: f.trashA.key, itemTitle: f.trashA.title,
      actorId: f.actorA, requestCorrelationId: randomUUID(), eventType: "item_removed", removalReason: "deleted",
      previousEstimate: null, occurredAt: new Date("2026-10-20T22:30:00Z"),
    });
    const expected = [{ kind: "removed", key: f.trashA.key, title: f.trashA.title, points: null, day: "2026-10-21", actor: f.actorA }];
    expect((await read())!.sprint?.changes).toEqual(expected);
    await db.delete(items).where(eq(items.id, f.trashA.id));
    expect((await read())!.sprint?.changes).toEqual(expected);
  });

  it("averages exactly the latest three closed sprints using frozen completed points", async () => {
    await closedSprint(10, 2);
    await closedSprint(11, 4);
    await closedSprint(12, 8);
    await closedSprint(13, 40);
    await closedSprint(14, 900, 900, f.backlogB.id);
    await activeSprint();
    expect((await read())!.sprint?.velocity).toBe(17.33);
  });

  it("keeps legacy and zero/zero sprints in the three-sprint window but out of its average", async () => {
    await closedSprint(10, 100);
    await closedSprint(11, 6);
    await closedSprint(12, null);
    await closedSprint(13, 0);
    await activeSprint();
    expect((await read())!.sprint?.velocity).toBe(6);
  });

  it("keeps a genuine zero completed velocity and normalizes an empty goal", async () => {
    await closedSprint(10, 0, 5);
    const sprint = await activeSprint();
    await db.update(sprints).set({ goal: "   " }).where(eq(sprints.id, sprint.id));
    expect((await read())!.sprint).toMatchObject({ goal: null, changes: [], velocity: 0 });
  });

  it("uses a fixed number of reads when the scope journal grows", async () => {
    const sprint = await activeSprint();
    const querySpy = vi.spyOn(Client.prototype, "query");
    try {
      await read();
      const small = querySpy.mock.calls.length;
      await db.insert(sprintEvents).values(Array.from({ length: 100 }, (_, index) => ({
        backlogId: f.backlogA.id, sprintId: sprint.id, itemId: f.liveA.id, itemKey: f.liveA.key, itemTitle: f.liveA.title,
        actorId: f.actorA, requestCorrelationId: `scope-volume-${index}`, eventType: "item_added" as const,
        nextEstimate: 1, nextDone: false, occurredAt: new Date("2026-10-21T08:00:00Z"),
      })));
      querySpy.mockClear();
      expect((await read())!.sprint?.changes).toHaveLength(100);
      expect(querySpy.mock.calls.length).toBe(small);
    } finally {
      querySpy.mockRestore();
    }
  });
});
