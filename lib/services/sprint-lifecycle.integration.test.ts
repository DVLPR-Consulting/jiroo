import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  backlogs,
  items,
  sprintEvents,
  sprintItems,
  sprintReportItems,
  sprintReportSnapshots,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import {
  completeSprint,
  IncompleteSprintSubtasksError,
  startSprint,
} from "@/lib/services/sprint-lifecycle";
import { updateItem } from "@/lib/services/items";
import { assignItemsToSprint, createSprint } from "@/lib/services/sprints";
import { withSprintHistoryCleanup } from "@/test-utils/sprint-history-cleanup";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

async function cleanupBacklogs(...backlogIds: string[]) {
  const client = await databasePool.connect();
  await client.query("begin");
  try {
    await withSprintHistoryCleanup(client, async () => {
      await client.query("delete from sprint_report_items where backlog_id = any($1::uuid[])", [backlogIds]);
      await client.query("delete from sprint_report_snapshots where backlog_id = any($1::uuid[])", [backlogIds]);
      await client.query("delete from sprint_events where backlog_id = any($1::uuid[])", [backlogIds]);
    });
    await client.query("delete from backlogs where id = any($1::uuid[])", [backlogIds]);
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
  it("starts over capacity and snapshots estimated, done, and unestimated commitments", async () => {
    const f = await fixture();
    try {
      const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const estimated = await insertTask(f, "Estimée", 8);
      const completed = await insertTask(f, "Terminée", 3, f.done.id);
      const unestimated = await insertTask(f, "Sans estimation", null);
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [estimated.id, completed.id, unestimated.id],
          sprintId: sprint.id,
        },
        f.actor.id,
      );

      await expect(
        startSprint(startInput(f.backlog.id, sprint.id), f.actor.id),
      ).resolves.toEqual({
        sprintId: sprint.id,
        committedItemCount: 3,
        committedPoints: 11,
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
        .select({
          itemId: sprintItems.itemId,
          estimateAtStart: sprintItems.estimateAtStart,
          doneAtStart: sprintItems.doneAtStart,
        })
        .from(sprintItems)
        .where(and(eq(sprintItems.sprintId, sprint.id), isNull(sprintItems.leftAt)))
        .orderBy(asc(sprintItems.itemId));
      expect(snapshots).toEqual(
        expect.arrayContaining([
          { itemId: estimated.id, estimateAtStart: 8, doneAtStart: false },
          { itemId: completed.id, estimateAtStart: 3, doneAtStart: true },
          { itemId: unestimated.id, estimateAtStart: null, doneAtStart: false },
        ]),
      );
      const commitments = await db
        .select({ itemId: activities.itemId, newValue: activities.newValue })
        .from(activities)
        .where(eq(activities.field, "sprint_commitment"));
      expect(commitments).toEqual(
        expect.arrayContaining([
          { itemId: estimated.id, newValue: "Sprint engagé" },
          { itemId: completed.id, newValue: "Sprint engagé" },
          { itemId: unestimated.id, newValue: "Sprint engagé" },
        ]),
      );
    } finally {
      await cleanupBacklogs(f.backlog.id);
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
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("ignores membership churn that finished while the sprint was still planned", async () => {
    const f = await fixture();
    try {
      const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const task = await insertTask(f, "Retirée avant départ", null);
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [task.id],
          sprintId: sprint.id,
        },
        f.actor.id,
      );
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [task.id],
          sprintId: null,
        },
        f.actor.id,
      );
      await startSprint(startInput(f.backlog.id, sprint.id, 0), f.actor.id);

      await expect(
        completeSprint(
          {
            id: sprint.id,
            backlogId: f.backlog.id,
            destination: { type: "backlog" },
          },
          f.actor.id,
        ),
      ).resolves.toMatchObject({
        completedItemCount: 0,
        carriedItemCount: 0,
      });
      const [snapshot] = await db
        .select({ initialItemCount: sprintReportSnapshots.initialItemCount })
        .from(sprintReportSnapshots)
        .where(eq(sprintReportSnapshots.sprintId, sprint.id));
      expect(snapshot).toEqual({ initialItemCount: 0 });
      expect(
        await db
          .select({ id: sprintReportItems.id })
          .from(sprintReportItems)
          .where(eq(sprintReportItems.sprintId, sprint.id)),
      ).toEqual([]);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("keeps scope events emitted before a future selected start", async () => {
    const f = await fixture();
    try {
      const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const initialEstimated = await insertTask(f, "Initial avant date", 4);
      const initialUnestimated = await insertTask(f, "Initial sans date", null);
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [initialEstimated.id, initialUnestimated.id],
          sprintId: sprint.id,
        },
        f.actor.id,
      );
      const selectedStart = new Date(Date.now() + 2_000);
      const selectedEnd = new Date(selectedStart.getTime() + 86_400_000);
      await startSprint(
        {
          id: sprint.id,
          backlogId: f.backlog.id,
          name: "Sprint futur",
          goal: null,
          startAt: selectedStart.toISOString(),
          endAt: selectedEnd.toISOString(),
          capacityPoints: null,
        },
        f.actor.id,
      );
      const kept = await insertTask(f, "Ajout avant date", 3);
      const removed = await insertTask(f, "Retrait avant date", 2);
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [kept.id, removed.id],
          sprintId: sprint.id,
        },
        f.actor.id,
        "future-add",
      );
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [removed.id, initialEstimated.id, initialUnestimated.id],
          sprintId: null,
        },
        f.actor.id,
        "future-remove",
      );
      const scopeEvents = await db
        .select({ occurredAt: sprintEvents.occurredAt })
        .from(sprintEvents)
        .where(
          and(
            eq(sprintEvents.sprintId, sprint.id),
            inArray(sprintEvents.eventType, ["item_added", "item_removed"]),
          ),
        );
      expect(scopeEvents).toHaveLength(5);
      expect(scopeEvents.every((event) => event.occurredAt < selectedStart)).toBe(true);

      const waitMs = Math.max(0, selectedStart.getTime() - Date.now() + 25);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      await completeSprint(
        {
          id: sprint.id,
          backlogId: f.backlog.id,
          destination: { type: "backlog" },
        },
        f.actor.id,
      );

      const [snapshot] = await db
        .select()
        .from(sprintReportSnapshots)
        .where(eq(sprintReportSnapshots.sprintId, sprint.id));
      expect(snapshot).toMatchObject({
        initialItemCount: 2,
        committedPoints: 4,
        initialUnestimatedCount: 1,
        finalItemCount: 1,
        grossPointsAdded: 5,
        grossPointsRemoved: 6,
        scopeEventCount: 5,
      });
      const rows = await db
        .select({
          itemKey: sprintReportItems.itemKey,
          initialCommitment: sprintReportItems.initialCommitment,
          addedAfterStart: sprintReportItems.addedAfterStart,
          removedAfterStart: sprintReportItems.removedAfterStart,
          estimateAtStart: sprintReportItems.estimateAtStart,
          doneAtStart: sprintReportItems.doneAtStart,
          finalOutcome: sprintReportItems.finalOutcome,
        })
        .from(sprintReportItems)
        .where(eq(sprintReportItems.sprintId, sprint.id));
      expect(rows).toEqual(
        expect.arrayContaining([
          {
            itemKey: kept.key,
            initialCommitment: false,
            addedAfterStart: true,
            removedAfterStart: false,
            estimateAtStart: null,
            doneAtStart: null,
            finalOutcome: "carried_to_backlog",
          },
          {
            itemKey: removed.key,
            initialCommitment: false,
            addedAfterStart: true,
            removedAfterStart: true,
            estimateAtStart: null,
            doneAtStart: null,
            finalOutcome: "removed",
          },
          {
            itemKey: initialEstimated.key,
            initialCommitment: true,
            addedAfterStart: false,
            removedAfterStart: true,
            estimateAtStart: 4,
            doneAtStart: false,
            finalOutcome: "removed",
          },
          {
            itemKey: initialUnestimated.key,
            initialCommitment: true,
            addedAfterStart: false,
            removedAfterStart: true,
            estimateAtStart: null,
            doneAtStart: false,
            finalOutcome: "removed",
          },
        ]),
      );
    } finally {
      await cleanupBacklogs(f.backlog.id);
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
      await cleanupBacklogs(f.backlog.id);
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
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("atomically freezes completion metrics, participant rows, and the completion event", async () => {
    const f = await fixture();
    const correlationId = `complete-${randomUUID()}`;
    try {
      const doneTask = await insertTask(f, "Snapshot terminé", 3, f.done.id);
      const openTask = await insertTask(f, "Snapshot ouvert", 5, f.todo.id);
      const active = await startWithTasks(f, [doneTask.id, openTask.id]);

      await completeSprint(
        {
          id: active.id,
          backlogId: f.backlog.id,
          destination: { type: "backlog" },
        },
        f.actor.id,
        correlationId,
      );

      const [snapshot] = await db
        .select()
        .from(sprintReportSnapshots)
        .where(eq(sprintReportSnapshots.sprintId, active.id));
      expect(snapshot).toMatchObject({
        backlogId: f.backlog.id,
        sprintId: active.id,
        sprintName: "Sprint engagé",
        sprintGoal: "Livrer le flux critique",
        startedAt: new Date("2026-08-05T09:00:00.000Z"),
        createdBy: f.actor.id,
        initialItemCount: 2,
        committedPoints: 8,
        initialUnestimatedCount: 0,
        finalItemCount: 2,
        completedItemCount: 1,
        completedPoints: 3,
        finalUnestimatedCount: 0,
        grossPointsAdded: 0,
        grossPointsRemoved: 0,
        netEstimateDelta: 0,
        scopeEventCount: 0,
        finalDestinationSummary: { backlog: 1, sprints: [] },
        requestCorrelationId: correlationId,
      });
      expect(snapshot?.completedAt).toBeInstanceOf(Date);
      expect(snapshot?.createdAt).toEqual(snapshot?.completedAt);

      expect(
        await db
          .select({
            itemKey: sprintReportItems.itemKey,
            itemTitle: sprintReportItems.itemTitle,
            initialCommitment: sprintReportItems.initialCommitment,
            doneAtStart: sprintReportItems.doneAtStart,
            estimateAtStart: sprintReportItems.estimateAtStart,
            estimateAtFinalParticipation:
              sprintReportItems.estimateAtFinalParticipation,
            estimateAtCompletion: sprintReportItems.estimateAtCompletion,
            finalOutcome: sprintReportItems.finalOutcome,
            destinationSprintId: sprintReportItems.destinationSprintId,
            destinationSprintName: sprintReportItems.destinationSprintName,
          })
          .from(sprintReportItems)
          .where(eq(sprintReportItems.sprintId, active.id))
          .orderBy(asc(sprintReportItems.itemKey)),
      ).toEqual(
        [
          {
            itemKey: doneTask.key,
            itemTitle: doneTask.title,
            initialCommitment: true,
            estimateAtStart: 3,
            doneAtStart: true,
            estimateAtFinalParticipation: 3,
            estimateAtCompletion: 3,
            finalOutcome: "completed",
            destinationSprintId: null,
            destinationSprintName: null,
          },
          {
            itemKey: openTask.key,
            itemTitle: openTask.title,
            initialCommitment: true,
            estimateAtStart: 5,
            doneAtStart: false,
            estimateAtFinalParticipation: 5,
            estimateAtCompletion: null,
            finalOutcome: "carried_to_backlog",
            destinationSprintId: null,
            destinationSprintName: null,
          },
        ].sort((left, right) => left.itemKey.localeCompare(right.itemKey)),
      );
      expect(
        await db
          .select({
            eventType: sprintEvents.eventType,
            correlationId: sprintEvents.requestCorrelationId,
          })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, correlationId)),
      ).toEqual([{ eventType: "sprint_completed", correlationId }]);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("freezes complex scope churn as one row per stable item key", async () => {
    const f = await fixture();
    try {
      const initialDone = await insertTask(f, "Initial terminé", 3, f.done.id);
      const initialUnestimated = await insertTask(f, "Initial sans points", null);
      const active = await startWithTasks(f, [initialDone.id, initialUnestimated.id]);
      const destination = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const addedDone = await insertTask(f, "Ajout terminé", 5);
      const churned = await insertTask(f, "Ajout retour", 2);

      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [addedDone.id],
          sprintId: active.id,
        },
        f.actor.id,
        "add-completed",
      );
      await updateItem(
        { id: addedDone.id, estimatePoints: 8, statusId: f.done.id },
        f.actor.id,
        "finish-added",
      );
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [churned.id],
          sprintId: active.id,
        },
        f.actor.id,
        "add-churned",
      );
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [churned.id],
          sprintId: null,
        },
        f.actor.id,
        "remove-churned",
      );
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [churned.id],
          sprintId: active.id,
        },
        f.actor.id,
        "readd-churned",
      );

      const intervalsBeforeCompletion = await db
        .select({
          itemId: sprintItems.itemId,
          joinedAt: sprintItems.joinedAt,
          leftAt: sprintItems.leftAt,
        })
        .from(sprintItems)
        .where(eq(sprintItems.sprintId, active.id))
        .orderBy(asc(sprintItems.joinedAt), asc(sprintItems.id));

      await completeSprint(
        {
          id: active.id,
          backlogId: f.backlog.id,
          destination: {
            type: "existing_sprint",
            sprintId: destination.id,
          },
        },
        f.actor.id,
        "complete-complex",
      );

      const [snapshot] = await db
        .select()
        .from(sprintReportSnapshots)
        .where(eq(sprintReportSnapshots.sprintId, active.id));
      expect(snapshot).toMatchObject({
        initialItemCount: 2,
        committedPoints: 3,
        initialUnestimatedCount: 1,
        finalItemCount: 4,
        completedItemCount: 2,
        completedPoints: 11,
        finalUnestimatedCount: 1,
        grossPointsAdded: 9,
        grossPointsRemoved: 2,
        netEstimateDelta: 3,
        scopeEventCount: 5,
        finalDestinationSummary: {
          backlog: 0,
          sprints: [{ id: destination.id, name: destination.name, count: 2 }],
        },
      });

      const reportRows = await db
        .select({
          itemKey: sprintReportItems.itemKey,
          firstJoinedAt: sprintReportItems.firstJoinedAt,
          finalLeftAt: sprintReportItems.finalLeftAt,
          initialCommitment: sprintReportItems.initialCommitment,
          addedAfterStart: sprintReportItems.addedAfterStart,
          removedAfterStart: sprintReportItems.removedAfterStart,
          estimateAtStart: sprintReportItems.estimateAtStart,
          doneAtStart: sprintReportItems.doneAtStart,
          estimateAtFinalParticipation:
            sprintReportItems.estimateAtFinalParticipation,
          estimateAtCompletion: sprintReportItems.estimateAtCompletion,
          finalOutcome: sprintReportItems.finalOutcome,
          destinationSprintId: sprintReportItems.destinationSprintId,
        })
        .from(sprintReportItems)
        .where(eq(sprintReportItems.sprintId, active.id))
        .orderBy(asc(sprintReportItems.itemKey));
      expect(reportRows).toHaveLength(4);
      expect(new Set(reportRows.map((row) => row.itemKey)).size).toBe(4);
      expect(reportRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            itemKey: initialDone.key,
            initialCommitment: true,
            addedAfterStart: false,
            removedAfterStart: false,
            estimateAtStart: 3,
            doneAtStart: true,
            estimateAtFinalParticipation: 3,
            estimateAtCompletion: 3,
            finalOutcome: "completed",
            destinationSprintId: null,
          }),
          expect.objectContaining({
            itemKey: initialUnestimated.key,
            initialCommitment: true,
            estimateAtStart: null,
            doneAtStart: false,
            estimateAtFinalParticipation: null,
            estimateAtCompletion: null,
            finalOutcome: "carried_to_sprint",
            destinationSprintId: destination.id,
          }),
          expect.objectContaining({
            itemKey: addedDone.key,
            initialCommitment: false,
            addedAfterStart: true,
            estimateAtStart: null,
            doneAtStart: null,
            estimateAtFinalParticipation: 8,
            estimateAtCompletion: 8,
            finalOutcome: "completed",
            destinationSprintId: null,
          }),
          expect.objectContaining({
            itemKey: churned.key,
            initialCommitment: false,
            addedAfterStart: true,
            removedAfterStart: true,
            estimateAtStart: null,
            doneAtStart: null,
            estimateAtFinalParticipation: 2,
            estimateAtCompletion: null,
            finalOutcome: "carried_to_sprint",
            destinationSprintId: destination.id,
          }),
        ]),
      );
      const churnIntervals = intervalsBeforeCompletion.filter(
        (interval) => interval.itemId === churned.id,
      );
      const churnRow = reportRows.find((row) => row.itemKey === churned.key);
      expect(churnIntervals).toHaveLength(2);
      expect(churnRow?.firstJoinedAt).toEqual(churnIntervals[0]?.joinedAt);
      expect(churnRow?.finalLeftAt).toEqual(snapshot?.completedAt);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("keeps copied report values stable after the source item changes and is purged", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Valeurs historiques", 3, f.done.id);
      const active = await startWithTasks(f, [task.id]);
      await completeSprint(
        {
          id: active.id,
          backlogId: f.backlog.id,
          destination: { type: "backlog" },
        },
        f.actor.id,
        "complete-stable",
      );
      const [before] = await db
        .select({
          sourceItemId: sprintReportItems.sourceItemId,
          itemKey: sprintReportItems.itemKey,
          itemTitle: sprintReportItems.itemTitle,
          itemKind: sprintReportItems.itemKind,
          estimateAtFinalParticipation:
            sprintReportItems.estimateAtFinalParticipation,
          finalStatusCategory: sprintReportItems.finalStatusCategory,
          finalOutcome: sprintReportItems.finalOutcome,
        })
        .from(sprintReportItems)
        .where(eq(sprintReportItems.sprintId, active.id));

      await db
        .update(items)
        .set({
          title: "Titre remplacé",
          kind: "bug",
          estimatePoints: 13,
          statusId: f.todo.id,
          deletedAt: new Date(),
        })
        .where(eq(items.id, task.id));
      await db.delete(items).where(eq(items.id, task.id));

      const [after] = await db
        .select({
          sourceItemId: sprintReportItems.sourceItemId,
          itemKey: sprintReportItems.itemKey,
          itemTitle: sprintReportItems.itemTitle,
          itemKind: sprintReportItems.itemKind,
          estimateAtFinalParticipation:
            sprintReportItems.estimateAtFinalParticipation,
          finalStatusCategory: sprintReportItems.finalStatusCategory,
          finalOutcome: sprintReportItems.finalOutcome,
        })
        .from(sprintReportItems)
        .where(eq(sprintReportItems.sprintId, active.id));
      expect(before).toEqual({
        sourceItemId: task.id,
        itemKey: task.key,
        itemTitle: task.title,
        itemKind: "feature",
        estimateAtFinalParticipation: 3,
        finalStatusCategory: "done",
        finalOutcome: "completed",
      });
      expect(after).toEqual({ ...before, sourceItemId: null });
      expect(
        await db
          .select({ id: sprintReportSnapshots.id })
          .from(sprintReportSnapshots)
          .where(eq(sprintReportSnapshots.sprintId, active.id)),
      ).toHaveLength(1);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("aborts completion when a closed participant lacks its removal event", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Historique cassé", 3);
      const active = await startWithTasks(f, [task.id]);
      await db
        .update(sprintItems)
        .set({ leftAt: new Date(), outcome: "removed" })
        .where(
          and(
            eq(sprintItems.sprintId, active.id),
            eq(sprintItems.itemId, task.id),
            isNull(sprintItems.leftAt),
          ),
        );

      await expect(
        completeSprint(
          {
            id: active.id,
            backlogId: f.backlog.id,
            destination: { type: "backlog" },
          },
          f.actor.id,
          "complete-broken-history",
        ),
      ).rejects.toThrow("Le contenu historique du sprint est incohérent.");

      expect(
        await db
          .select({ id: sprintReportSnapshots.id })
          .from(sprintReportSnapshots)
          .where(eq(sprintReportSnapshots.sprintId, active.id)),
      ).toEqual([]);
      const [storedSprint] = await db
        .select({ state: sprints.state })
        .from(sprints)
        .where(eq(sprints.id, active.id));
      expect(storedSprint?.state).toBe("active");
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("aborts completion when a participant source was purged after removal", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Source purgée", 3);
      const active = await startWithTasks(f, [task.id]);
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [task.id],
          sprintId: null,
        },
        f.actor.id,
        "remove-before-purge",
      );
      await db.delete(items).where(eq(items.id, task.id));

      await expect(
        completeSprint(
          {
            id: active.id,
            backlogId: f.backlog.id,
            destination: { type: "backlog" },
          },
          f.actor.id,
          "complete-purged-history",
        ),
      ).rejects.toThrow("Le contenu historique du sprint est incohérent.");
      expect(
        await db
          .select({ id: sprintReportSnapshots.id })
          .from(sprintReportSnapshots)
          .where(eq(sprintReportSnapshots.sprintId, active.id)),
      ).toEqual([]);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("serializes concurrent completion into one snapshot and one success", async () => {
    const f = await fixture();
    try {
      const task = await insertTask(f, "Clôture concurrente", 3, f.done.id);
      const active = await startWithTasks(f, [task.id]);
      const input = {
        id: active.id,
        backlogId: f.backlog.id,
        destination: { type: "backlog" as const },
      };

      const attempts = await Promise.allSettled([
        completeSprint(input, f.actor.id, "complete-concurrent-a"),
        completeSprint(input, f.actor.id, "complete-concurrent-b"),
      ]);
      expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
      expect(
        attempts.filter(
          (attempt) =>
            attempt.status === "rejected" &&
            attempt.reason instanceof Error &&
            attempt.reason.message === "Seul un sprint actif peut être clôturé.",
        ),
      ).toHaveLength(1);
      expect(
        await db
          .select({ id: sprintReportSnapshots.id })
          .from(sprintReportSnapshots)
          .where(eq(sprintReportSnapshots.sprintId, active.id)),
      ).toHaveLength(1);
      expect(
        await db
          .select({ id: sprintEvents.id })
          .from(sprintEvents)
          .where(
            and(
              eq(sprintEvents.sprintId, active.id),
              eq(sprintEvents.eventType, "sprint_completed"),
            ),
          ),
      ).toHaveLength(1);
    } finally {
      await cleanupBacklogs(f.backlog.id);
    }
  });

  it("rolls back every completion write when the final sprint update fails", async () => {
    const f = await fixture();
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `fail_sprint_completion_${suffix}`;
    const triggerName = `fail_sprint_completion_${suffix}`;
    let triggerInstalled = false;
    try {
      const task = await insertTask(f, "Rollback final", 5);
      const active = await startWithTasks(f, [task.id]);
      const destination = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      await databasePool.query(`
        create function "${functionName}"() returns trigger
        language plpgsql as $$
        begin
          if new.id = '${active.id}'::uuid and new.state = 'completed' then
            raise exception 'injected final sprint update failure';
          end if;
          return new;
        end;
        $$
      `);
      await databasePool.query(`
        create trigger "${triggerName}"
        before update on sprints
        for each row execute function "${functionName}"()
      `);
      triggerInstalled = true;

      await expect(
        completeSprint(
          {
            id: active.id,
            backlogId: f.backlog.id,
            destination: {
              type: "existing_sprint",
              sprintId: destination.id,
            },
          },
          f.actor.id,
          "complete-rollback",
        ),
      ).rejects.toThrow('update "sprints" set "state"');

      expect(
        await db
          .select({ id: sprintReportSnapshots.id })
          .from(sprintReportSnapshots)
          .where(eq(sprintReportSnapshots.sprintId, active.id)),
      ).toEqual([]);
      expect(
        await db
          .select({ id: sprintReportItems.id })
          .from(sprintReportItems)
          .where(eq(sprintReportItems.sprintId, active.id)),
      ).toEqual([]);
      expect(
        await db
          .select({ id: sprintEvents.id })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, "complete-rollback")),
      ).toEqual([]);
      expect(
        await db
          .select({ sprintId: sprintItems.sprintId, leftAt: sprintItems.leftAt })
          .from(sprintItems)
          .where(eq(sprintItems.itemId, task.id)),
      ).toEqual([{ sprintId: active.id, leftAt: null }]);
      const [storedSprint] = await db
        .select({ state: sprints.state })
        .from(sprints)
        .where(eq(sprints.id, active.id));
      expect(storedSprint?.state).toBe("active");
    } finally {
      if (triggerInstalled) {
        await databasePool.query(`drop trigger "${triggerName}" on sprints`);
      }
      await databasePool.query(`drop function if exists "${functionName}"()`);
      await cleanupBacklogs(f.backlog.id);
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
      const [snapshot] = await db
        .select({ summary: sprintReportSnapshots.finalDestinationSummary })
        .from(sprintReportSnapshots)
        .where(eq(sprintReportSnapshots.sprintId, active.id));
      expect(snapshot?.summary).toEqual({
        backlog: 0,
        sprints: [{ id: future.id, name: future.name, count: 1 }],
      });
    } finally {
      await cleanupBacklogs(f.backlog.id);
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
      const [snapshot] = await db
        .select({ summary: sprintReportSnapshots.finalDestinationSummary })
        .from(sprintReportSnapshots)
        .where(eq(sprintReportSnapshots.sprintId, active.id));
      expect(snapshot?.summary).toEqual({
        backlog: 0,
        sprints: [
          {
            id: result.destinationSprintId,
            name: "Sprint de report",
            count: 2,
          },
        ],
      });
    } finally {
      await cleanupBacklogs(f.backlog.id);
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
      await cleanupBacklogs(f.backlog.id);
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
      await cleanupBacklogs(f.backlog.id, foreign.backlog.id);
    }
  });
});
