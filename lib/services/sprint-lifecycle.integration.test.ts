import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  backlogs,
  items,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import {
  completeSprint,
  IncompleteSprintSubtasksError,
  startSprint,
} from "@/lib/services/sprint-lifecycle";
import { assignItemsToSprint, createSprint } from "@/lib/services/sprints";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

async function fixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: `LC${suffix}`, name: "Cycle de sprint", color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  const [todo, done] = await db
    .insert(statuses)
    .values([
      {
        backlogId: backlog.id,
        name: "À faire",
        category: "todo" as const,
        order: 0,
        color: "#9aa0a6",
      },
      {
        backlogId: backlog.id,
        name: "Terminé",
        category: "done" as const,
        order: 1,
        color: "#22c55e",
      },
    ])
    .returning();
  if (!todo || !done) throw new Error("Fixture statuts impossible.");
  return { actor, backlog, todo, done };
}

async function insertTask(
  f: Awaited<ReturnType<typeof fixture>>,
  title: string,
  estimatePoints: number | null,
  statusId = f.todo.id,
) {
  const id = randomUUID();
  const [task] = await db
    .insert(items)
    .values({
      id,
      key: `${f.backlog.key}-${title.replaceAll(" ", "").slice(0, 10)}`,
      type: "tache",
      backlogId: f.backlog.id,
      title,
      statusId,
      estimatePoints,
      reporterId: f.actor.id,
      rank: `a${randomUUID().replaceAll("-", "")}`,
      path: `root.${id.replaceAll("-", "")}`,
    })
    .returning();
  if (!task) throw new Error("Fixture tâche impossible.");
  return task;
}

async function insertSubtask(
  f: Awaited<ReturnType<typeof fixture>>,
  parent: Awaited<ReturnType<typeof insertTask>>,
  title: string,
  statusId = f.todo.id,
) {
  const id = randomUUID();
  const [subtask] = await db
    .insert(items)
    .values({
      id,
      key: `${f.backlog.key}-${title.replaceAll(" ", "").slice(0, 10)}`,
      type: "soustache",
      backlogId: f.backlog.id,
      title,
      parentId: parent.id,
      statusId,
      reporterId: f.actor.id,
      rank: `a${randomUUID().replaceAll("-", "")}`,
      path: `${parent.path}.${id.replaceAll("-", "")}`,
      depth: parent.depth + 1,
    })
    .returning();
  if (!subtask) throw new Error("Fixture sous-tâche impossible.");
  return subtask;
}

function startInput(backlogId: string, sprintId: string, capacityPoints: number | null = 5) {
  return {
    id: sprintId,
    backlogId,
    name: "Sprint engagé",
    goal: "Livrer le flux critique",
    startAt: "2026-08-05T09:00:00.000Z",
    endAt: "2026-08-19T09:00:00.000Z",
    capacityPoints,
  };
}

async function startWithTasks(
  f: Awaited<ReturnType<typeof fixture>>,
  taskIds: string[],
) {
  const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
  if (taskIds.length > 0) {
    await assignItemsToSprint(
      { backlogId: f.backlog.id, itemIds: taskIds, sprintId: sprint.id },
      f.actor.id,
    );
  }
  await startSprint(startInput(f.backlog.id, sprint.id, 20), f.actor.id);
  return sprint;
}

describeDb("sprint lifecycle", () => {
  it("starts over capacity and snapshots estimated and unestimated commitments", async () => {
    const f = await fixture();
    try {
      const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const estimated = await insertTask(f, "Estimée", 8);
      const unestimated = await insertTask(f, "Sans estimation", null);
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [estimated.id, unestimated.id],
          sprintId: sprint.id,
        },
        f.actor.id,
      );

      await expect(
        startSprint(startInput(f.backlog.id, sprint.id), f.actor.id),
      ).resolves.toEqual({
        sprintId: sprint.id,
        committedItemCount: 2,
        committedPoints: 8,
        unestimatedCount: 1,
      });

      const [storedSprint] = await db
        .select()
        .from(sprints)
        .where(eq(sprints.id, sprint.id));
      expect(storedSprint).toMatchObject({
        name: "Sprint engagé",
        goal: "Livrer le flux critique",
        state: "active",
        capacityPoints: 5,
        startedAt: new Date("2026-08-05T09:00:00.000Z"),
        plannedEndAt: new Date("2026-08-19T09:00:00.000Z"),
      });
      const snapshots = await db
        .select({ itemId: sprintItems.itemId, estimateAtStart: sprintItems.estimateAtStart })
        .from(sprintItems)
        .where(and(eq(sprintItems.sprintId, sprint.id), isNull(sprintItems.leftAt)))
        .orderBy(asc(sprintItems.itemId));
      expect(snapshots).toEqual(
        expect.arrayContaining([
          { itemId: estimated.id, estimateAtStart: 8 },
          { itemId: unestimated.id, estimateAtStart: null },
        ]),
      );
      const commitments = await db
        .select({ itemId: activities.itemId, newValue: activities.newValue })
        .from(activities)
        .where(eq(activities.field, "sprint_commitment"));
      expect(commitments).toEqual(
        expect.arrayContaining([
          { itemId: estimated.id, newValue: "Sprint engagé" },
          { itemId: unestimated.id, newValue: "Sprint engagé" },
        ]),
      );
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("allows an empty zero-capacity sprint and rejects starting it twice", async () => {
    const f = await fixture();
    try {
      const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      await expect(
        startSprint(startInput(f.backlog.id, sprint.id, 0), f.actor.id),
      ).resolves.toEqual({
        sprintId: sprint.id,
        committedItemCount: 0,
        committedPoints: 0,
        unestimatedCount: 0,
      });
      await expect(
        startSprint(startInput(f.backlog.id, sprint.id, 0), f.actor.id),
      ).rejects.toThrow("Seul un sprint planifié peut être démarré.");
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("allows only one concurrent active sprint per backlog", async () => {
    const f = await fixture();
    try {
      const first = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const second = await createSprint({ backlogId: f.backlog.id }, f.actor.id);

      const attempts = await Promise.allSettled([
        startSprint(startInput(f.backlog.id, first.id), f.actor.id),
        startSprint(startInput(f.backlog.id, second.id), f.actor.id),
      ]);
      expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(
        attempts.some(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof Error &&
            result.reason.message === "Un sprint est déjà actif pour ce backlog.",
        ),
      ).toBe(true);
      const active = await db
        .select({ id: sprints.id })
        .from(sprints)
        .where(and(eq(sprints.backlogId, f.backlog.id), eq(sprints.state, "active")));
      expect(active).toHaveLength(1);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("completes done work and carries incomplete work to the Backlog without changing statuses", async () => {
    const f = await fixture();
    try {
      const doneTask = await insertTask(f, "Travail terminé", 3, f.done.id);
      const openTask = await insertTask(f, "Travail ouvert", 5, f.todo.id);
      const active = await startWithTasks(f, [doneTask.id, openTask.id]);

      await expect(
        completeSprint(
          {
            id: active.id,
            backlogId: f.backlog.id,
            destination: { type: "backlog" },
          },
          f.actor.id,
        ),
      ).resolves.toEqual({
        sprintId: active.id,
        completedItemCount: 1,
        carriedItemCount: 1,
        destinationSprintId: null,
      });

      const history = await db
        .select({
          itemId: sprintItems.itemId,
          leftAt: sprintItems.leftAt,
          outcome: sprintItems.outcome,
          destinationSprintId: sprintItems.destinationSprintId,
        })
        .from(sprintItems)
        .where(eq(sprintItems.sprintId, active.id));
      expect(history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            itemId: doneTask.id,
            outcome: "completed",
            destinationSprintId: null,
          }),
          expect.objectContaining({
            itemId: openTask.id,
            outcome: "carried_to_backlog",
            destinationSprintId: null,
          }),
        ]),
      );
      expect(history.every((membership) => membership.leftAt instanceof Date)).toBe(true);
      const storedItems = await db
        .select({ id: items.id, statusId: items.statusId })
        .from(items)
        .where(inArray(items.id, [doneTask.id, openTask.id]));
      expect(storedItems).toEqual(
        expect.arrayContaining([
          { id: doneTask.id, statusId: f.done.id },
          { id: openTask.id, statusId: f.todo.id },
        ]),
      );
      const [storedSprint] = await db
        .select({ state: sprints.state, completedAt: sprints.completedAt })
        .from(sprints)
        .where(eq(sprints.id, active.id));
      expect(storedSprint?.state).toBe("completed");
      expect(storedSprint?.completedAt).toBeInstanceOf(Date);
      const [carryActivity] = await db
        .select({ oldValue: activities.oldValue, newValue: activities.newValue })
        .from(activities)
        .where(
          and(
            eq(activities.itemId, openTask.id),
            eq(activities.field, "sprint"),
            isNull(activities.newValue),
          ),
        )
        .orderBy(asc(activities.at));
      expect(carryActivity).toEqual({ oldValue: "Sprint engagé", newValue: null });
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("carries every incomplete item to one existing planned sprint", async () => {
    const f = await fixture();
    try {
      const openTask = await insertTask(f, "Vers futur", 8);
      const active = await startWithTasks(f, [openTask.id]);
      const future = await createSprint({ backlogId: f.backlog.id }, f.actor.id);

      const result = await completeSprint(
        {
          id: active.id,
          backlogId: f.backlog.id,
          destination: { type: "existing_sprint", sprintId: future.id },
        },
        f.actor.id,
      );
      expect(result.destinationSprintId).toBe(future.id);

      const memberships = await db
        .select({
          sprintId: sprintItems.sprintId,
          leftAt: sprintItems.leftAt,
          outcome: sprintItems.outcome,
          destinationSprintId: sprintItems.destinationSprintId,
          estimateAtJoin: sprintItems.estimateAtJoin,
        })
        .from(sprintItems)
        .where(eq(sprintItems.itemId, openTask.id))
        .orderBy(asc(sprintItems.joinedAt));
      expect(memberships).toHaveLength(2);
      expect(memberships[0]).toMatchObject({
        sprintId: active.id,
        outcome: "carried_to_sprint",
        destinationSprintId: future.id,
      });
      expect(memberships[1]).toEqual({
        sprintId: future.id,
        leftAt: null,
        outcome: null,
        destinationSprintId: null,
        estimateAtJoin: 8,
      });
      const [stored] = await db
        .select({ statusId: items.statusId })
        .from(items)
        .where(eq(items.id, openTask.id));
      expect(stored?.statusId).toBe(f.todo.id);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("creates one planned destination sprint and carries every incomplete item into it", async () => {
    const f = await fixture();
    try {
      const first = await insertTask(f, "Report un", 2);
      const second = await insertTask(f, "Report deux", null);
      const active = await startWithTasks(f, [first.id, second.id]);

      const result = await completeSprint(
        {
          id: active.id,
          backlogId: f.backlog.id,
          destination: { type: "new_sprint", name: "Sprint de report" },
        },
        f.actor.id,
      );
      expect(result.carriedItemCount).toBe(2);
      expect(result.destinationSprintId).toEqual(expect.any(String));
      const [destination] = await db
        .select({ id: sprints.id, name: sprints.name, state: sprints.state })
        .from(sprints)
        .where(eq(sprints.id, result.destinationSprintId!));
      expect(destination).toEqual({
        id: result.destinationSprintId,
        name: "Sprint de report",
        state: "planned",
      });
      const current = await db
        .select({ itemId: sprintItems.itemId })
        .from(sprintItems)
        .where(
          and(
            eq(sprintItems.sprintId, result.destinationSprintId!),
            isNull(sprintItems.leftAt),
          ),
        );
      expect(current).toEqual(
        expect.arrayContaining([{ itemId: first.id }, { itemId: second.id }]),
      );
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("blocks completion and returns incomplete subtask business keys", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Parent terminé", 3, f.done.id);
      const openSubtask = await insertSubtask(f, task, "Sous tâche ouverte");
      const active = await startWithTasks(f, [task.id]);

      await expect(
        completeSprint(
          {
            id: active.id,
            backlogId: f.backlog.id,
            destination: { type: "backlog" },
          },
          f.actor.id,
        ),
      ).rejects.toEqual(
        expect.objectContaining({
          name: "IncompleteSprintSubtasksError",
          itemKeys: [openSubtask.key],
        }),
      );
      expect(IncompleteSprintSubtasksError).toBeTypeOf("function");
      const [storedSprint] = await db
        .select({ state: sprints.state })
        .from(sprints)
        .where(eq(sprints.id, active.id));
      expect(storedSprint?.state).toBe("active");
      const [current] = await db
        .select({ leftAt: sprintItems.leftAt })
        .from(sprintItems)
        .where(and(eq(sprintItems.sprintId, active.id), isNull(sprintItems.leftAt)));
      expect(current?.leftAt).toBeNull();
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("rolls back completion for a foreign destination or duplicate new-sprint name", async () => {
    const f = await fixture();
    const foreign = await fixture();
    try {
      const openTask = await insertTask(f, "Ne bouge pas", 5);
      const active = await startWithTasks(f, [openTask.id]);
      const existing = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const foreignSprint = await createSprint(
        { backlogId: foreign.backlog.id },
        foreign.actor.id,
      );

      await expect(
        completeSprint(
          {
            id: active.id,
            backlogId: f.backlog.id,
            destination: { type: "existing_sprint", sprintId: foreignSprint.id },
          },
          f.actor.id,
        ),
      ).rejects.toThrow("Sprint de destination introuvable.");
      await expect(
        completeSprint(
          {
            id: active.id,
            backlogId: f.backlog.id,
            destination: { type: "new_sprint", name: existing.name.toUpperCase() },
          },
          f.actor.id,
        ),
      ).rejects.toThrow("Un sprint portant ce nom existe déjà.");

      const [storedSprint] = await db
        .select({ state: sprints.state })
        .from(sprints)
        .where(eq(sprints.id, active.id));
      expect(storedSprint?.state).toBe("active");
      const current = await db
        .select({ sprintId: sprintItems.sprintId })
        .from(sprintItems)
        .where(and(eq(sprintItems.itemId, openTask.id), isNull(sprintItems.leftAt)));
      expect(current).toEqual([{ sprintId: active.id }]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
      await db.delete(backlogs).where(eq(backlogs.id, foreign.backlog.id));
    }
  });
});
