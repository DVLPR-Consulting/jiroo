import "dotenv/config";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { backlogs, sprints } from "@/lib/db/schema/domain";
import { createReadVisibilityFixture, deleteReadVisibilityFixture, type ReadVisibilityFixture } from "@/lib/services/read-visibility.integration-fixture";
import { loadSprintsForPeriod } from "@/lib/services/presence-page";

vi.mock("server-only", () => ({}));
const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("presence sprint periods", () => {
  let f: ReadVisibilityFixture;
  beforeEach(async () => { f = await createReadVisibilityFixture("Presence sprints"); });
  afterEach(async () => { vi.restoreAllMocks(); await deleteReadVisibilityFixture(f); });
  const read = (backlogId = f.backlogA.id) => loadSprintsForPeriod({ actorId: f.actorA, backlogId, from: "2026-10-10", to: "2026-10-20" });
  async function sprint(state: "planned" | "active" | "completed", start: string | null, end: string | null, backlogId = f.backlogA.id) {
    const id = randomUUID();
    const [row] = await db.insert(sprints).values({ id, backlogId, name: `Sprint ${id}`, rank: id, state, createdBy: f.admin,
      startedAt: state !== "planned" && start ? new Date(start) : null,
      plannedStartAt: start ? new Date(start) : null,
      plannedEndAt: end ? new Date(end) : null,
      completedAt: state === "completed" && end ? new Date(end) : null,
    }).returning();
    return row!;
  }
  it("includes planned, active and closed overlaps, with inclusive Paris dates", async () => {
    const before = await sprint("completed", "2026-10-01T08:00:00Z", "2026-10-09T08:00:00Z");
    const closed = await sprint("completed", "2026-10-01T08:00:00Z", "2026-10-09T22:30:00Z");
    const active = await sprint("active", "2026-10-15T08:00:00Z", "2026-10-30T17:00:00Z");
    const planned = await sprint("planned", "2026-10-19T22:30:00Z", "2026-10-25T17:00:00Z");
    const after = await sprint("planned", "2026-10-21T08:00:00Z", "2026-10-30T17:00:00Z");
    const spy = vi.spyOn(Client.prototype, "query");
    const result = await read();
    expect(spy.mock.calls.length).toBe(1); spy.mockRestore();
    expect(result.map((row) => row.id)).toEqual([closed.id, active.id, planned.id]);
    expect(result.map((row) => row.id)).not.toContain(before.id); expect(result.map((row) => row.id)).not.toContain(after.id);
    expect(result[0]).toEqual({ id: closed.id, name: closed.name, state: "completed", start: "2026-10-01", end: "2026-10-10" });
    expect(result[2]).toMatchObject({ start: "2026-10-20", end: "2026-10-25" });
  });
  it("prefers actual start and completion over planned dates", async () => {
    const closed = await sprint("completed", "2026-10-12T08:00:00Z", "2026-10-19T17:00:00Z");
    await db.update(sprints).set({ plannedStartAt: new Date("2026-09-01T08:00:00Z"), plannedEndAt: new Date("2026-09-30T17:00:00Z") }).where(eq(sprints.id, closed.id));
    expect((await read())[0]).toMatchObject({ start: "2026-10-12", end: "2026-10-19" });
  });
  it("keeps an unknown end null and omits sprints without any start", async () => {
    const active = await sprint("active", "2026-10-01T08:00:00Z", null);
    await sprint("planned", null, null);
    expect(await read()).toEqual([{ id: active.id, name: active.name, state: "active", start: "2026-10-01", end: null }]);
  });
  it("conceals missing, hidden and archived backlogs and validates the period", async () => {
    await sprint("planned", "2026-10-01T08:00:00Z", "2026-10-20T17:00:00Z", f.backlogB.id);
    expect(await read(f.backlogB.id)).toEqual([]); expect(await read(randomUUID())).toEqual([]);
    await sprint("planned", "2026-10-01T08:00:00Z", "2026-10-20T17:00:00Z");
    await db.update(backlogs).set({ archivedAt: new Date() }).where(eq(backlogs.id, f.backlogA.id));
    expect(await read()).toEqual([]);
    await expect(loadSprintsForPeriod({ actorId: f.actorA, backlogId: f.backlogA.id, from: "2026-02-30", to: "2026-10-20" })).rejects.toThrow();
  });
});
