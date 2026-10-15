import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, releases, sprints, statuses } from "@/lib/db/schema";
import { createItem, softDeleteItem } from "@/lib/services/items";
import { loadRoadmap } from "@/lib/services/roadmap";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(): string {
  return `RM${Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}`;
}

describeDb("loadRoadmap", () => {
  let backlogId: string;
  let actorId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    actorId = actor.id;
    const [backlog] = await db
      .insert(backlogs)
      .values({ key: randomBacklogKey(), name: "Roadmap", color: "#475569" })
      .returning();
    backlogId = backlog!.id;
    const [todo, done] = await db
      .insert(statuses)
      .values([
        { backlogId, name: "À faire", category: "todo", order: 0, color: "#9aa0a6" },
        { backlogId, name: "Terminé", category: "done", order: 1, color: "#16a34a" },
      ])
      .returning();
    const [active] = await db
      .insert(sprints)
      .values([
        {
          backlogId,
          name: "Sprint 1",
          state: "active",
          rank: "a0",
          createdBy: actorId,
          plannedStartAt: new Date("2026-10-12T07:00:00Z"),
          plannedEndAt: new Date("2026-10-25T16:00:00Z"),
          startedAt: new Date("2026-10-12T07:00:00Z"),
        },
        {
          backlogId,
          name: "Sprint 0",
          state: "completed",
          rank: "a1",
          createdBy: actorId,
          startedAt: new Date("2026-09-01T07:00:00Z"),
          completedAt: new Date("2026-09-14T16:00:00Z"),
        },
      ])
      .returning();
    await db.insert(releases).values([
      { backlogId, name: "v1", releaseDate: "2026-11-15", createdBy: actorId },
      {
        backlogId,
        name: "v0",
        releaseDate: "2026-09-01",
        createdBy: actorId,
        archivedAt: new Date(),
        archivedBy: actorId,
      },
    ]);

    const create = async (input: Record<string, unknown>) =>
      (await createItem({ backlogId, statusId: todo!.id, ...input }, actorId, randomUUID())).id;
    ids.component = await create({ type: "composant", parentId: null, title: "Composant" });
    ids.epic = await create({
      type: "epic",
      parentId: ids.component,
      title: "Epic",
      startDate: "2026-10-01",
      dueDate: "2026-12-31",
    });
    ids.task = await create({ type: "tache", parentId: ids.epic, title: "Tâche", sprintId: active!.id });
    await create({
      type: "tache",
      parentId: ids.epic,
      title: "Tâche terminée",
      statusId: done!.id,
      dueDate: "2026-10-05",
    });
    await create({ type: "soustache", parentId: ids.task, title: "Sous-tâche" });
    const deleted = await create({ type: "tache", parentId: ids.epic, title: "Supprimée" });
    await softDeleteItem({ id: deleted }, actorId, randomUUID());
  });

  afterAll(async () => {
    // Sprint events are append-only: bypass their guard for this backlog only,
    // then the backlog's deletion cascades to the rest (releases restrict it).
    const client = await databasePool.connect();
    try {
      await client.query("begin");
      await client.query("set local session_replication_role = 'replica'");
      await client.query("delete from sprint_events where backlog_id = $1", [backlogId]);
      await client.query("set local session_replication_role = 'origin'");
      await client.query("delete from releases where backlog_id = $1", [backlogId]);
      await client.query("delete from backlogs where id = $1", [backlogId]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  it("returns components, epics and tasks in tree order, without sub-tasks nor deleted items", async () => {
    const roadmap = await loadRoadmap(backlogId);
    expect(roadmap.items.map((item) => item.title)).toEqual([
      "Composant",
      "Epic",
      "Tâche",
      "Tâche terminée",
    ]);
  });

  it("carries days, status category and the current sprint", async () => {
    const roadmap = await loadRoadmap(backlogId);
    const byTitle = new Map(roadmap.items.map((item) => [item.title, item]));
    expect(byTitle.get("Epic")).toMatchObject({
      type: "epic",
      parentId: ids.component,
      start: "2026-10-01",
      due: "2026-12-31",
      category: "todo",
      sprintId: null,
    });
    expect(byTitle.get("Tâche")).toMatchObject({ parentId: ids.epic, sprintId: expect.any(String) });
    expect(byTitle.get("Tâche terminée")).toMatchObject({
      category: "done",
      due: "2026-10-05",
      closedAt: expect.any(Date),
    });
  });

  it("lists the open sprints with their planned instants", async () => {
    const roadmap = await loadRoadmap(backlogId);
    expect(roadmap.sprints).toEqual([
      {
        id: expect.any(String),
        name: "Sprint 1",
        state: "active",
        plannedStartAt: new Date("2026-10-12T07:00:00Z"),
        plannedEndAt: new Date("2026-10-25T16:00:00Z"),
      },
    ]);
    const task = roadmap.items.find((item) => item.title === "Tâche");
    expect(task?.sprintId).toBe(roadmap.sprints[0]?.id);
  });

  it("marks the releases that are not archived", async () => {
    const roadmap = await loadRoadmap(backlogId);
    expect(roadmap.releases).toEqual([
      { id: expect.any(String), name: "v1", day: "2026-11-15", released: false },
    ]);
  });
});
