import "dotenv/config";

import { randomInt, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { absences, backlogs, securityAuditEvents } from "@/lib/db/schema/domain";
import {
  ABSENCE_NOT_FOUND_MESSAGE,
  ABSENCE_OVERLAP_MESSAGE,
  declareAbsence,
  getAbsenceOwner,
  listAbsences,
  removeAbsence,
} from "@/lib/services/absences";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const run = randomUUID();
const ana = `abs-ana-${run}`;
const bo = `abs-bo-${run}`;
const letters = (count: number) =>
  Array.from({ length: count }, () => String.fromCharCode(65 + randomInt(26))).join("");

describeDb("absences (JIR-124)", () => {
  let backlogId: string;

  beforeAll(async () => {
    await db.insert(user).values([ana, bo].map((id) => ({
      id, name: id, email: `${id}@example.test`, emailVerified: true, role: "contributor",
    })));
    const [backlog] = await db.insert(backlogs).values({ key: `A${letters(5)}`, name: "Absences" }).returning();
    backlogId = backlog!.id;
  });

  afterAll(async () => {
    await db.delete(securityAuditEvents).where(inArray(securityAuditEvents.actorId, [ana, bo]));
    await db.delete(absences).where(inArray(absences.userId, [ana, bo]));
    await db.delete(backlogs).where(eq(backlogs.id, backlogId));
    await db.delete(user).where(inArray(user.id, [ana, bo]));
  });

  it("declares whole days, refuses an overlap, lists by period and removes, each move audited", async () => {
    const first = await declareAbsence({ userId: ana, backlogId, startDate: "2026-11-03", endDate: "2026-11-07" }, ana);
    expect(first).toMatchObject({ userId: ana, startDate: "2026-11-03", endDate: "2026-11-07", createdBy: ana });

    await expect(declareAbsence({ userId: ana, backlogId, startDate: "2026-11-07", endDate: "2026-11-10" }, bo))
      .rejects.toThrow(ABSENCE_OVERLAP_MESSAGE);
    // Someone else's days, or the day after, do not overlap.
    const second = await declareAbsence({ userId: ana, backlogId, startDate: "2026-11-09", endDate: "2026-11-09" }, bo);
    await declareAbsence({ userId: bo, backlogId, startDate: "2026-11-05", endDate: "2026-11-05" }, bo);

    const november = await listAbsences({ userIds: [ana, bo], startDate: "2026-11-01", endDate: "2026-11-30" });
    expect(november.map((absence) => [absence.userId, absence.startDate, absence.endDate])).toEqual([
      [ana, "2026-11-03", "2026-11-07"],
      [ana, "2026-11-09", "2026-11-09"],
      [bo, "2026-11-05", "2026-11-05"],
    ]);
    // A period touches an absence when any day is shared, both ends included.
    expect((await listAbsences({ userIds: [ana], startDate: "2026-11-07", endDate: "2026-11-08" })).map((a) => a.id)).toEqual([first.id]);
    expect(await listAbsences({ userIds: [ana], startDate: "2026-11-10", endDate: "2026-11-30" })).toEqual([]);
    expect(await listAbsences({ userIds: [], startDate: "2026-11-01", endDate: "2026-11-30" })).toEqual([]);

    expect(await getAbsenceOwner(second.id)).toBe(ana);
    expect(await removeAbsence({ id: second.id, backlogId }, bo)).toMatchObject({ id: second.id });
    expect(await getAbsenceOwner(second.id)).toBeNull();
    await expect(removeAbsence({ id: second.id, backlogId }, bo)).rejects.toThrow(ABSENCE_NOT_FOUND_MESSAGE);

    const events = await db
      .select({ action: securityAuditEvents.action, targetId: securityAuditEvents.targetId, actorId: securityAuditEvents.actorId, newValue: securityAuditEvents.newValue, oldValue: securityAuditEvents.oldValue })
      .from(securityAuditEvents)
      .where(and(eq(securityAuditEvents.targetType, "absence"), inArray(securityAuditEvents.actorId, [ana, bo])));
    expect(events.filter((event) => event.action === "absence.declare")).toHaveLength(3);
    const removal = events.find((event) => event.action === "absence.remove");
    expect(removal).toMatchObject({ targetId: second.id, actorId: bo, newValue: null, oldValue: { userId: ana, startDate: "2026-11-09", endDate: "2026-11-09" } });
  });

  it("validates before touching the database", async () => {
    await expect(declareAbsence({ userId: ana, backlogId, startDate: "2026-11-07", endDate: "2026-11-03" }, ana))
      .rejects.toThrow("La fin de l’absence précède son début.");
    await expect(removeAbsence({ id: "not-an-id", backlogId }, ana)).rejects.toThrow();
  });
});
