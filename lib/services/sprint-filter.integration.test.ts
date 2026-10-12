import "dotenv/config";

import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import { NO_SPRINT, sprintIdsByItem } from "@/lib/items/sprint-filter";
import { completeSprint, startSprint } from "@/lib/services/sprint-lifecycle";
import { getSprintReport } from "@/lib/services/sprint-reports";
import {
  assignItemsToSprint,
  createSprint,
  listSprintsForBacklog,
} from "@/lib/services/sprints";
import { withSprintHistoryCleanup } from "@/test-utils/sprint-history-cleanup";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

async function cleanupBacklog(backlogId: string) {
  const client = await databasePool.connect();
  await client.query("begin");
  try {
    await withSprintHistoryCleanup(client, async () => {
      await client.query("delete from sprint_report_items where backlog_id = $1", [backlogId]);
      await client.query("delete from sprint_report_snapshots where backlog_id = $1", [backlogId]);
      await client.query("delete from sprint_events where backlog_id = $1", [backlogId]);
    });
    await client.query("delete from backlogs where id = $1", [backlogId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function fixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: `SF${suffix}`, name: "Filtre sprint", color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  const [todo, done] = await db
    .insert(statuses)
    .values([
      { backlogId: backlog.id, name: "À faire", category: "todo" as const, order: 0, color: "#9aa0a6" },
      { backlogId: backlog.id, name: "Terminé", category: "done" as const, order: 1, color: "#22c55e" },
    ])
    .returning();
  if (!todo || !done) throw new Error("Fixture statuts impossible.");

  async function insertItem(
    title: string,
    statusId: string,
    parent: { id: string; path: string } | null = null,
  ) {
    const id = randomUUID();
    const segment = id.replaceAll("-", "");
    const [row] = await db
      .insert(items)
      .values({
        id,
        key: `${backlog!.key}-${title}`,
        type: parent ? "soustache" : "tache",
        backlogId: backlog!.id,
        title,
        statusId,
        estimatePoints: parent ? null : 3,
        reporterId: actor!.id,
        parentId: parent?.id ?? null,
        rank: `a${segment}`,
        path: parent ? `${parent.path}.${segment}` : `root.${segment}`,
        depth: parent ? 1 : 0,
      })
      .returning();
    if (!row) throw new Error("Fixture item impossible.");
    return row;
  }

  return { actor, backlog, todo, done, insertItem };
}

describeDb("sprint filter membership (JIR-81)", () => {
  it("matches a completed sprint's final scope, carried-over items included, like its sprint report", async () => {
    const f = await fixture();
    try {
      const finished = await f.insertItem("Fini", f.done.id);
      const carried = await f.insertItem("Reporte", f.todo.id);
      // Open sous-tâches block completion; a done one still follows its carried parent.
      const subtask = await f.insertItem("SousTache", f.done.id, carried);
      const removed = await f.insertItem("Retire", f.todo.id);
      const added = await f.insertItem("Ajoute", f.todo.id);
      const loose = await f.insertItem("HorsSprint", f.todo.id);

      const closed = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [finished.id, carried.id, removed.id], sprintId: closed.id },
        f.actor.id,
      );
      await startSprint(
        {
          id: closed.id,
          backlogId: f.backlog.id,
          name: closed.name,
          goal: null,
          startAt: "2026-08-05T09:00:00.000Z",
          endAt: "2026-08-19T09:00:00.000Z",
          capacityPoints: 20,
        },
        f.actor.id,
      );
      // Scope churn during the sprint: one item taken out, one added.
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [removed.id], sprintId: null },
        f.actor.id,
      );
      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [added.id], sprintId: closed.id },
        f.actor.id,
      );
      const next = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      await completeSprint(
        {
          id: closed.id,
          backlogId: f.backlog.id,
          destination: { type: "existing_sprint", sprintId: next.id },
        },
        f.actor.id,
      );

      const snapshot = await listSprintsForBacklog(f.backlog.id);
      const allItems = [finished, carried, subtask, removed, added, loose];
      const sprintIds = sprintIdsByItem(snapshot.memberships, allItems);
      const itemsOf = (sprintId: string) =>
        allItems
          .filter((item) =>
            sprintId === NO_SPRINT
              ? (sprintIds.get(item.id) ?? []).length === 0
              : (sprintIds.get(item.id) ?? []).includes(sprintId),
          )
          .map((item) => item.title)
          .sort();

      expect(itemsOf(closed.id)).toEqual(["Ajoute", "Fini", "Reporte", "SousTache"]);
      expect(itemsOf(next.id)).toEqual(["Ajoute", "Reporte", "SousTache"]);
      expect(itemsOf(NO_SPRINT)).toEqual(["HorsSprint", "Retire"]);
      expect(sprintIds.get(carried.id)).toEqual([closed.id, next.id]);

      // Same split as the Sprint report: everything but « Retirés du sprint ».
      const report = await getSprintReport(f.backlog.id, closed.id, {
        itemPage: 1,
        eventPage: 1,
        pageSize: 50,
      });
      expect(report?.kind).toBe("completed");
      if (report?.kind !== "completed") return;
      const reportedInScope = report.items.rows
        .filter((row) => row.section !== "removed")
        .map((row) => row.itemId);
      const filteredTaches = [finished, carried, added, removed]
        .filter((item) => (sprintIds.get(item.id) ?? []).includes(closed.id))
        .map((item) => item.id);
      expect(new Set(reportedInScope)).toEqual(new Set(filteredTaches));
      expect(
        report.items.rows.filter((row) => row.section === "removed").map((row) => row.itemId),
      ).toEqual([removed.id]);
    } finally {
      await cleanupBacklog(f.backlog.id);
    }
  });
});
