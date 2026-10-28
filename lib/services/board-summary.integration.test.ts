import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, sprintItems, sprints, statuses } from "@/lib/db/schema/domain";
import { loadBoardSummary } from "@/lib/services/board-summary";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(): string {
  return `R${randomUUID().replace(/[^a-f]/gi, "").slice(0, 5).toUpperCase()}`;
}

describeDb("loadBoardSummary", () => {
  let actorId = "";
  let backlogId = "";
  let backlogKey = "";
  let otherBacklogId = "";
  let todoId = "";
  let doneId = "";
  let number = 0;

  async function task(
    statusId: string,
    estimatePoints: number | null,
    options: { type?: "tache" | "soustache"; deleted?: boolean } = {},
  ) {
    const id = randomUUID();
    number += 1;
    await db.insert(items).values({
      id,
      key: `${backlogKey}-${number}`,
      type: options.type ?? "tache",
      backlogId,
      title: `Tâche ${number}`,
      statusId,
      reporterId: actorId,
      rank: `a${String(number).padStart(3, "0")}`,
      path: `root.${id.replaceAll("-", "")}`,
      depth: 0,
      estimatePoints,
      deletedAt: options.deleted ? new Date() : null,
    });
    return id;
  }

  beforeAll(async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    actorId = actor.id;
    const [backlog] = await db
      .insert(backlogs)
      .values({ key: randomBacklogKey(), name: "Résumé du board", color: "#475569" })
      .returning();
    backlogId = backlog!.id;
    backlogKey = backlog!.key;
    const [other] = await db
      .insert(backlogs)
      .values({ key: randomBacklogKey(), name: "Autre backlog", color: "#475569" })
      .returning();
    otherBacklogId = other!.id;
    const [todo] = await db
      .insert(statuses)
      .values({ backlogId, name: "À faire", category: "todo", order: 0, color: "#9aa0a6" })
      .returning();
    const [done] = await db
      .insert(statuses)
      .values({ backlogId, name: "Terminé", category: "done", order: 1, color: "#1a7f37" })
      .returning();
    todoId = todo!.id;
    doneId = done!.id;
  });

  afterAll(async () => {
    if (backlogId) await db.delete(backlogs).where(eq(backlogs.id, backlogId));
    if (otherBacklogId) await db.delete(backlogs).where(eq(backlogs.id, otherBacklogId));
  });

  it("answers nothing without an active sprint", async () => {
    await db.insert(sprints).values({ backlogId, name: "Planifié", state: "planned", rank: "a0", createdBy: actorId });
    expect(await loadBoardSummary(backlogId)).toEqual({ activeSprintId: null, metrics: null });
  });

  it("sums the live tasks of the active sprint, done ones by status category, as the Board renders them", async () => {
    const [sprint] = await db
      .insert(sprints)
      .values({ backlogId, name: "Actif", state: "active", rank: "a1", capacityPoints: 10, startedAt: new Date(), createdBy: actorId })
      .returning();
    const open = await task(todoId, 3);
    const finished = await task(doneId, 5);
    const unestimated = await task(todoId, null);
    const gone = await task(todoId, 8);
    const deleted = await task(todoId, 13, { deleted: true });
    const subtask = await task(todoId, 21, { type: "soustache" });
    await db.insert(sprintItems).values([
      { sprintId: sprint!.id, itemId: open, joinedBy: actorId },
      { sprintId: sprint!.id, itemId: finished, joinedBy: actorId },
      { sprintId: sprint!.id, itemId: unestimated, joinedBy: actorId },
      // Left the sprint: no longer counted.
      { sprintId: sprint!.id, itemId: gone, joinedBy: actorId, leftAt: new Date(), outcome: "removed" },
      { sprintId: sprint!.id, itemId: deleted, joinedBy: actorId },
      { sprintId: sprint!.id, itemId: subtask, joinedBy: actorId },
    ]);

    const summary = await loadBoardSummary(backlogId);
    expect(summary.activeSprintId).toBe(sprint!.id);
    expect(summary.metrics).toMatchObject({
      itemCount: 3,
      estimatedPoints: 8,
      completedPoints: 5,
      remainingPoints: 3,
      unestimatedCount: 1,
      capacityPoints: 10,
    });
    // Another backlog never sees this sprint.
    expect(await loadBoardSummary(otherBacklogId)).toEqual({ activeSprintId: null, metrics: null });
  });
});
