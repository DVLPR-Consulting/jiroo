import "dotenv/config";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { absences, items, permissionGrants, securityAuditEvents, sprints, statuses } from "@/lib/db/schema/domain";
import { listAssignableUsersForBacklog } from "@/lib/auth/authorization";
import { declareAbsence } from "@/lib/services/absences";
import { createReadVisibilityFixture, deleteReadVisibilityFixture, type ReadVisibilityFixture } from "@/lib/services/read-visibility.integration-fixture";
import { assignItemsToSprint, createSprint } from "@/lib/services/sprints";
import { startSprint, completeSprint } from "@/lib/services/sprint-lifecycle";
import { getSprintsReview } from "@/lib/services/sprint-reports";
import { withSprintHistoryCleanup } from "@/test-utils/sprint-history-cleanup";

vi.mock("server-only", () => ({}));
const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("getSprintsReview", () => {
  let f: ReadVisibilityFixture;
  beforeEach(async () => { f = await createReadVisibilityFixture("Review"); });
  afterEach(async () => {
    const client = await databasePool.connect();
    try {
      await client.query("begin");
      await withSprintHistoryCleanup(client, async () => {
        for (const table of ["sprint_report_items", "sprint_report_snapshots", "sprint_events"]) {
          await client.query(`delete from ${table} where backlog_id = any($1::uuid[])`, [[f.backlogA.id, f.backlogB.id]]);
        }
      });
      await client.query("commit");
    } finally { client.release(); }
    await deleteReadVisibilityFixture(f);
  });

  async function active(startAt = "2026-10-19T08:00:00Z", endAt = "2026-10-30T17:00:00Z") {
    const sprint = await createSprint({ backlogId: f.backlogA.id }, f.admin);
    await assignItemsToSprint({ backlogId: f.backlogA.id, sprintId: sprint.id, itemIds: [f.liveA.id] }, f.admin);
    await startSprint({ id: sprint.id, backlogId: f.backlogA.id, name: sprint.name, goal: null, startAt, endAt, capacityPoints: null }, f.admin);
    return sprint;
  }

  it("refuses foreign and missing backlogs, excluding planned sprints", async () => {
    expect(await getSprintsReview(f.backlogB.id, f.actorA)).toBeNull();
    expect(await getSprintsReview(randomUUID(), f.actorA)).toBeNull();
    await createSprint({ backlogId: f.backlogA.id }, f.admin);
    expect(await getSprintsReview(f.backlogA.id, f.actorA)).toEqual({ rows: [], limited: false });
  });

  it("keeps active and closed scope figures equal at completion and frozen after item changes", async () => {
    const [done] = await db.insert(statuses).values({ backlogId: f.backlogA.id, name: "Fini", category: "done", order: 1, color: "#22c55e" }).returning();
    await db.update(items).set({ kind: "bug", estimatePoints: 3, statusId: done!.id }).where(eq(items.id, f.liveA.id));
    const sprint = await active();
    // Leave/rejoin twice: ledger counts events, not unique participants.
    for (let i = 0; i < 2; i += 1) {
      await assignItemsToSprint({ backlogId: f.backlogA.id, sprintId: null, itemIds: [f.liveA.id] }, f.admin);
      await assignItemsToSprint({ backlogId: f.backlogA.id, sprintId: sprint.id, itemIds: [f.liveA.id] }, f.admin);
    }
    const activeRow = (await getSprintsReview(f.backlogA.id, f.actorA))!.rows[0]!;
    expect(activeRow).toMatchObject({ initial: 1, added: 2, removed: 2, completed: 1, completedPoints: 3, bugs: 1, finalCount: 1, percentage: 100, bugHeavy: true });
    await completeSprint({ id: sprint.id, backlogId: f.backlogA.id, destination: { type: "backlog" } }, f.admin);
    const closed = (await getSprintsReview(f.backlogA.id, f.actorA))!.rows[0]!;
    for (const key of ["initial", "added", "removed", "completed", "completedPoints", "bugs", "finalCount", "percentage"] as const) expect(closed[key]).toEqual(activeRow[key]);
    await db.update(items).set({ kind: "feature", title: "Changed", estimatePoints: 99, statusId: f.liveA.statusId, deletedAt: new Date() }).where(eq(items.id, f.liveA.id));
    expect((await getSprintsReview(f.backlogA.id, f.actorA))!.rows[0]).toEqual(closed);
    await db.delete(items).where(eq(items.id, f.liveA.id));
    expect((await getSprintsReview(f.backlogA.id, f.actorA))!.rows[0]).toEqual(closed);
  });

  it("subtracts overlapping absences of current assignable members and hides presence without browse_users", async () => {
    await active();
    const members = await listAssignableUsersForBacklog(f.backlogA.id);
    await db.insert(absences).values({ userId: f.admin, startDate: "2026-10-22", endDate: "2026-10-26", createdBy: f.admin });
    expect((await getSprintsReview(f.backlogA.id, f.actorA))!.rows[0]!.presence).toBe(members.length * 10 - 3);
    const grants = await db.delete(permissionGrants).where(and(eq(permissionGrants.scope, "global"), eq(permissionGrants.permissionKey, "browse_users"), eq(permissionGrants.principalType, "authenticated_user"))).returning();
    try {
      const row = (await getSprintsReview(f.backlogA.id, f.actorA))!.rows[0]!;
      expect(row.presence).toBeNull();
      expect(row.pointsPerPersonDay).toBeNull();
    } finally { if (grants.length > 0) await db.insert(permissionGrants).values(grants); }
  });

  it("counts the presence on the team's calendar: a holiday off, a declared half-day worth 0,5", async () => {
    // Monday 9 to Friday 13 November: four working days, the Armistice falling on the Wednesday.
    await active("2026-11-09T08:00:00Z", "2026-11-13T17:00:00Z");
    const members = await listAssignableUsersForBacklog(f.backlogA.id);
    expect((await getSprintsReview(f.backlogA.id, f.actorA))!.rows[0]!.presence).toBe(members.length * 4);
    await declareAbsence({ userId: f.admin, backlogId: f.backlogA.id, startDate: "2026-11-10", startHalf: "pm", endDate: "2026-11-10", endHalf: "pm" }, f.admin);
    try {
      expect((await getSprintsReview(f.backlogA.id, f.actorA))!.rows[0]!.presence).toBe(members.length * 4 - 0.5);
    } finally {
      await db.delete(securityAuditEvents).where(and(eq(securityAuditEvents.targetType, "absence"), eq(securityAuditEvents.actorId, f.admin)));
    }
  });

  it("leaves unknown legacy counts blank and caps closed sprints at fifty, active first", async () => {
    const sprint = await active();
    // A start before capture was deployed has no baseline fact.
    await db.execute((await import("drizzle-orm")).sql`update sprint_items set done_at_start = null where sprint_id = ${sprint.id}`);
    expect((await getSprintsReview(f.backlogA.id, f.actorA))!.rows[0]).toMatchObject({ initial: null, percentage: null, completed: 0 });
    const querySpy = vi.spyOn(Client.prototype, "query");
    await getSprintsReview(f.backlogA.id, f.actorA);
    const small = querySpy.mock.calls.length;
    querySpy.mockRestore();
    await db.insert(sprints).values(Array.from({ length: 51 }, (_, index) => ({ backlogId: f.backlogA.id, name: `Legacy ${index}`, rank: `z${index}`, state: "completed" as const, startedAt: new Date("2025-01-01T08:00:00Z"), completedAt: new Date(Date.UTC(2025, 0, index + 2)), createdBy: f.admin })));
    const largeSpy = vi.spyOn(Client.prototype, "query");
    let result;
    try {
      result = (await getSprintsReview(f.backlogA.id, f.actorA))!;
      expect(largeSpy.mock.calls.length).toBe(small);
    } finally { largeSpy.mockRestore(); }
    expect(result.limited).toBe(true);
    expect(result.rows).toHaveLength(51);
    expect(result.rows[0]!.state).toBe("active");
    expect(result.rows[1]!.name).toBe("Legacy 50");
    expect(result.rows.at(-1)!.name).toBe("Legacy 1");
    expect(result.rows[1]).toMatchObject({ initial: null, added: null, removed: null, completed: null, completedPoints: null, bugs: null, finalCount: null, percentage: null });
  });

  it("does not truncate bugs or events at the detailed report's page size", async () => {
    const sprint = await active();
    const tasks = Array.from({ length: 150 }, (_, index) => {
      const id = randomUUID();
      return { id, backlogId: f.backlogA.id, key: `${f.backlogA.key}-VOL${index}`, type: "tache" as const, kind: "bug" as const, title: "Bug", statusId: f.liveA.statusId, reporterId: f.admin, rank: `vol${index}`, path: `root.${id.replaceAll("-", "")}` };
    });
    await db.insert(items).values(tasks);
    await assignItemsToSprint({ backlogId: f.backlogA.id, sprintId: sprint.id, itemIds: tasks.map((item) => item.id) }, f.admin);
    await completeSprint({ id: sprint.id, backlogId: f.backlogA.id, destination: { type: "backlog" } }, f.admin);
    expect((await getSprintsReview(f.backlogA.id, f.actorA))!.rows[0]).toMatchObject({ bugs: 150, finalCount: 151, added: 150, initial: 1 });
  });
});
