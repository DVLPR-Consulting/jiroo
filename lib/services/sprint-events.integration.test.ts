import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  backlogs,
  items,
  sprintEvents,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import { bulkUpdateItems } from "@/lib/services/item-bulk";
import { moveItem, restoreItem, softDeleteItem, updateItem } from "@/lib/services/items";
import { startSprint } from "@/lib/services/sprint-lifecycle";
import { assignItemsToSprint } from "@/lib/services/sprints";
import { withSprintHistoryCleanup } from "@/test-utils/sprint-history-cleanup";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

async function fixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: `EV${suffix}`, name: "Événements sprint", color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  const [todo, done] = await db
    .insert(statuses)
    .values([
      {
        backlogId: backlog.id,
        name: "À faire",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      },
      {
        backlogId: backlog.id,
        name: "Terminé",
        category: "done",
        order: 1,
        color: "#22c55e",
      },
    ])
    .returning();
  if (!todo || !done) throw new Error("Fixture statut impossible.");
  return { actor, backlog, todo, done };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function cleanup(f: Fixture) {
  const client = await databasePool.connect();
  await client.query("begin");
  try {
    await withSprintHistoryCleanup(client, async () => {
      await client.query("delete from sprint_events where backlog_id = $1", [f.backlog.id]);
    });
    await client.query("delete from backlogs where id = $1", [f.backlog.id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function insertSprint(
  f: Fixture,
  name: string,
  state: "planned" | "active" = "planned",
) {
  const [sprint] = await db
    .insert(sprints)
    .values({
      backlogId: f.backlog.id,
      name,
      state,
      startedAt: state === "active" ? new Date("2026-08-01T09:00:00.000Z") : null,
      rank: `sprint-${randomUUID()}`,
      createdBy: f.actor.id,
    })
    .returning();
  if (!sprint) throw new Error("Fixture sprint impossible.");
  return sprint;
}

async function insertItem(
  f: Fixture,
  title: string,
  estimatePoints: number | null,
  options: {
    type?: "composant" | "tache" | "soustache";
    parent?: typeof items.$inferSelect;
    statusId?: string;
  } = {},
) {
  const id = randomUUID();
  const parent = options.parent;
  const [item] = await db
    .insert(items)
    .values({
      id,
      key: `${f.backlog.key}-${randomUUID().slice(0, 6)}`,
      type: options.type ?? "tache",
      backlogId: f.backlog.id,
      title,
      parentId: parent?.id ?? null,
      statusId: options.statusId ?? f.todo.id,
      estimatePoints,
      reporterId: f.actor.id,
      rank: `item-${randomUUID()}`,
      path: parent
        ? `${parent.path}.${id.replaceAll("-", "")}`
        : `root.${id.replaceAll("-", "")}`,
      depth: parent ? parent.depth + 1 : 0,
    })
    .returning();
  if (!item) throw new Error("Fixture item impossible.");
  return item;
}

async function addMembership(
  f: Fixture,
  sprintId: string,
  itemId: string,
  estimateAtJoin: number | null,
) {
  const [membership] = await db
    .insert(sprintItems)
    .values({
      sprintId,
      itemId,
      joinedBy: f.actor.id,
      estimateAtJoin,
    })
    .returning();
  if (!membership) throw new Error("Fixture membership impossible.");
  return membership;
}

describeDb("sprint reporting events", () => {
  it("removes cascaded fixture rows after privileged history cleanup", async () => {
    const f = await fixture();
    const sprint = await insertSprint(f, "Sprint de nettoyage", "active");
    const item = await insertItem(f, "Contrat de nettoyage cascade", 3);
    await assignItemsToSprint(
      { backlogId: f.backlog.id, itemIds: [item.id], sprintId: sprint.id },
      f.actor.id,
      `cleanup-${randomUUID()}`,
    );
    const [membership] = await db
      .select({ id: sprintItems.id })
      .from(sprintItems)
      .where(eq(sprintItems.itemId, item.id));
    const [activity] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.itemId, item.id));
    if (!membership || !activity) throw new Error("Fixture de nettoyage incomplète.");

    await cleanup(f);

    const [storedStatuses, storedSprints, storedItems, storedMemberships, storedActivities] =
      await Promise.all([
        db.select({ id: statuses.id }).from(statuses).where(eq(statuses.id, f.todo.id)),
        db.select({ id: sprints.id }).from(sprints).where(eq(sprints.id, sprint.id)),
        db.select({ id: items.id }).from(items).where(eq(items.id, item.id)),
        db
          .select({ id: sprintItems.id })
          .from(sprintItems)
          .where(eq(sprintItems.id, membership.id)),
        db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.id, activity.id)),
      ]);
    expect({
      statuses: storedStatuses,
      sprints: storedSprints,
      items: storedItems,
      memberships: storedMemberships,
      activities: storedActivities,
    }).toEqual({
      statuses: [],
      sprints: [],
      items: [],
      memberships: [],
      activities: [],
    });
  });

  it.each([
    {
      label: "planned → active",
      sourceState: "planned" as const,
      destinationState: "active" as const,
      eventType: "item_added" as const,
      reason: null,
    },
    {
      label: "active → backlog",
      sourceState: "active" as const,
      destinationState: null,
      eventType: "item_removed" as const,
      reason: "manual" as const,
    },
    {
      label: "active → planned",
      sourceState: "active" as const,
      destinationState: "planned" as const,
      eventType: "item_removed" as const,
      reason: "moved" as const,
    },
    {
      label: "planned → planned",
      sourceState: "planned" as const,
      destinationState: "planned" as const,
      eventType: null,
      reason: null,
    },
  ])("records only active-sprint scope for $label", async (testCase) => {
    const f = await fixture();
    const correlationId = `scope-${randomUUID()}`;
    try {
      const source = await insertSprint(f, "Sprint source", testCase.sourceState);
      const destination = testCase.destinationState
        ? await insertSprint(f, "Sprint destination", testCase.destinationState)
        : null;
      const item = await insertItem(f, "Périmètre", 8);
      const sourceMembership = await addMembership(f, source.id, item.id, 3);

      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [item.id],
          sprintId: destination?.id ?? null,
        },
        f.actor.id,
        `  ${correlationId}  `,
      );

      const events = await db
        .select()
        .from(sprintEvents)
        .where(eq(sprintEvents.requestCorrelationId, correlationId));
      expect(
        await db
          .select({ correlationId: activities.requestCorrelationId })
          .from(activities)
          .where(and(eq(activities.itemId, item.id), eq(activities.field, "sprint"))),
      ).toEqual([{ correlationId }]);
      if (!testCase.eventType) {
        expect(events).toEqual([]);
        return;
      }
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        backlogId: f.backlog.id,
        sprintId: testCase.eventType === "item_added" ? destination!.id : source.id,
        eventType: testCase.eventType,
        sourceMembershipId:
          testCase.eventType === "item_added"
            ? expect.any(String)
            : sourceMembership.id,
        itemId: item.id,
        itemKey: item.key,
        itemTitle: item.title,
        actorId: f.actor.id,
        requestCorrelationId: correlationId,
        previousEstimate: testCase.eventType === "item_removed" ? 8 : null,
        nextEstimate: testCase.eventType === "item_added" ? 8 : null,
        removalReason: testCase.reason,
        relatedSprintId:
          testCase.eventType === "item_added" ? source.id : destination?.id ?? null,
        relatedSprintName:
          testCase.eventType === "item_added" ? source.name : destination?.name ?? null,
      });
    } finally {
      await cleanup(f);
    }
  });

  it("records one correlated start event with commitment snapshots including null", async () => {
    const f = await fixture();
    const correlationId = `start-${randomUUID()}`;
    try {
      const sprint = await insertSprint(f, "Sprint à démarrer");
      const estimated = await insertItem(f, "Estimée", 5);
      const completed = await insertItem(f, "Déjà terminée", 3, { statusId: f.done.id });
      const unestimated = await insertItem(f, "Sans estimation", null);
      await addMembership(f, sprint.id, estimated.id, 5);
      await addMembership(f, sprint.id, completed.id, 3);
      await addMembership(f, sprint.id, unestimated.id, null);

      await startSprint(
        {
          id: sprint.id,
          backlogId: f.backlog.id,
          name: "Sprint engagé",
          goal: null,
          startAt: "2026-08-05T09:00:00.000Z",
          endAt: "2026-08-19T09:00:00.000Z",
          capacityPoints: 8,
        },
        f.actor.id,
        correlationId,
      );

      expect(
        await db
          .select({
            itemId: sprintItems.itemId,
            estimateAtStart: sprintItems.estimateAtStart,
            doneAtStart: sprintItems.doneAtStart,
          })
          .from(sprintItems)
          .where(eq(sprintItems.sprintId, sprint.id))
          .orderBy(asc(sprintItems.itemId)),
      ).toEqual(
        [
          { itemId: estimated.id, estimateAtStart: 5, doneAtStart: false },
          { itemId: completed.id, estimateAtStart: 3, doneAtStart: true },
          { itemId: unestimated.id, estimateAtStart: null, doneAtStart: false },
        ].sort((left, right) => left.itemId.localeCompare(right.itemId)),
      );
      expect(
        await db
          .select({
            eventType: sprintEvents.eventType,
            occurredAt: sprintEvents.occurredAt,
            correlationId: sprintEvents.requestCorrelationId,
          })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, correlationId)),
      ).toEqual([
        {
          eventType: "sprint_started",
          occurredAt: new Date("2026-08-05T09:00:00.000Z"),
          correlationId,
        },
      ]);
      expect(
        await db
          .select({ correlationId: activities.requestCorrelationId })
          .from(activities)
          .where(
            and(
              eq(activities.field, "sprint_commitment"),
              eq(activities.requestCorrelationId, correlationId),
            ),
          ),
      ).toEqual([{ correlationId }, { correlationId }, { correlationId }]);
    } finally {
      await cleanup(f);
    }
  });

  it("captures todo and done state in active-sprint additions", async () => {
    const f = await fixture();
    try {
      const active = await insertSprint(f, "Sprint actif", "active");
      const todoItem = await insertItem(f, "Ajout à faire", 3);
      const doneItem = await insertItem(f, "Ajout terminé", 5, { statusId: f.done.id });

      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [todoItem.id, doneItem.id], sprintId: active.id },
        f.actor.id,
        "done-at-entry",
      );

      expect(
        await db
          .select({ itemId: sprintItems.itemId, doneAtStart: sprintItems.doneAtStart })
          .from(sprintItems)
          .where(eq(sprintItems.sprintId, active.id))
          .orderBy(asc(sprintItems.itemId)),
      ).toEqual(
        [
          { itemId: todoItem.id, doneAtStart: false },
          { itemId: doneItem.id, doneAtStart: true },
        ].sort((left, right) => left.itemId.localeCompare(right.itemId)),
      );
      expect(
        await db
          .select({ itemId: sprintEvents.itemId, nextDone: sprintEvents.nextDone })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, "done-at-entry"))
          .orderBy(asc(sprintEvents.itemId)),
      ).toEqual(
        [
          { itemId: todoItem.id, nextDone: false },
          { itemId: doneItem.id, nextDone: true },
        ].sort((left, right) => left.itemId!.localeCompare(right.itemId!)),
      );
    } finally {
      await cleanup(f);
    }
  });

  it("records estimate and done-boundary changes across single, bulk, and drag paths", async () => {
    const f = await fixture();
    const correlationId = "the-request-correlation";
    try {
      const [done] = await db
        .insert(statuses)
        .values({
          backlogId: f.backlog.id,
          name: "Terminé",
          category: "done",
          order: 1,
          color: "#16a34a",
        })
        .returning();
      if (!done) throw new Error("Fixture statut terminé impossible.");

      const sprint = await insertSprint(f, "Sprint actif", "active");
      const item = await insertItem(f, "Mutation suivie", null);
      await addMembership(f, sprint.id, item.id, null);

      await updateItem(
        { id: item.id, estimatePoints: 5, statusId: done.id },
        f.actor.id,
        correlationId,
      );
      await bulkUpdateItems(
        {
          backlogId: f.backlog.id,
          itemIds: [item.id],
          patch: { field: "statusId", value: f.todo.id },
        },
        f.actor.id,
        correlationId,
      );
      await moveItem(
        { id: item.id, statusId: done.id, beforeId: null, afterId: null },
        f.actor.id,
        correlationId,
      );

      const events = await db
        .select({
          eventType: sprintEvents.eventType,
          correlationId: sprintEvents.requestCorrelationId,
          previousEstimate: sprintEvents.previousEstimate,
          nextEstimate: sprintEvents.nextEstimate,
          previousDone: sprintEvents.previousDone,
          nextDone: sprintEvents.nextDone,
        })
        .from(sprintEvents)
        .where(eq(sprintEvents.sprintId, sprint.id))
        .orderBy(asc(sprintEvents.sequence));
      expect(events.map((event) => event.eventType)).toEqual([
        "estimate_changed",
        "item_completed",
        "item_reopened",
        "item_completed",
      ]);
      expect(events.map((event) => event.correlationId)).toEqual([
        correlationId,
        correlationId,
        correlationId,
        correlationId,
      ]);
      expect(events).toEqual([
        {
          eventType: "estimate_changed",
          correlationId,
          previousEstimate: null,
          nextEstimate: 5,
          previousDone: null,
          nextDone: null,
        },
        {
          eventType: "item_completed",
          correlationId,
          previousEstimate: null,
          nextEstimate: null,
          previousDone: false,
          nextDone: true,
        },
        {
          eventType: "item_reopened",
          correlationId,
          previousEstimate: null,
          nextEstimate: null,
          previousDone: true,
          nextDone: false,
        },
        {
          eventType: "item_completed",
          correlationId,
          previousEstimate: null,
          nextEstimate: null,
          previousDone: false,
          nextDone: true,
        },
      ]);
    } finally {
      await cleanup(f);
    }
  });

  it("keeps rank-only drag activity without emitting a sprint event", async () => {
    const f = await fixture();
    try {
      const sprint = await insertSprint(f, "Sprint actif", "active");
      const item = await insertItem(f, "Classement seul", 2);
      await addMembership(f, sprint.id, item.id, 2);

      await moveItem(
        { id: item.id, beforeId: null, afterId: null },
        f.actor.id,
        "rank-only-drag",
      );

      expect(
        await db
          .select({ id: sprintEvents.id })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, "rank-only-drag")),
      ).toEqual([]);
      expect(
        await db
          .select({
            action: activities.action,
            field: activities.field,
            correlationId: activities.requestCorrelationId,
          })
          .from(activities)
          .where(eq(activities.requestCorrelationId, "rank-only-drag")),
      ).toEqual([
        { action: "move", field: "rank", correlationId: "rank-only-drag" },
      ]);
    } finally {
      await cleanup(f);
    }
  });

  it("records every estimate boundary and ignores value and category no-ops", async () => {
    const f = await fixture();
    try {
      const [inProgress, review, done, verified] = await db
        .insert(statuses)
        .values([
          {
            backlogId: f.backlog.id,
            name: "En cours",
            category: "in_progress",
            order: 1,
            color: "#ca8a04",
          },
          {
            backlogId: f.backlog.id,
            name: "En revue",
            category: "in_progress",
            order: 2,
            color: "#7c3aed",
          },
          {
            backlogId: f.backlog.id,
            name: "Terminé",
            category: "done",
            order: 3,
            color: "#16a34a",
          },
          {
            backlogId: f.backlog.id,
            name: "Vérifié",
            category: "done",
            order: 4,
            color: "#15803d",
          },
        ])
        .returning();
      if (!inProgress || !review || !done || !verified) {
        throw new Error("Fixture de statuts impossible.");
      }
      const sprint = await insertSprint(f, "Sprint actif", "active");
      const item = await insertItem(f, "Frontières", 5);
      await addMembership(f, sprint.id, item.id, 5);

      await updateItem({ id: item.id, estimatePoints: null }, f.actor.id, "estimate-null");
      await bulkUpdateItems(
        {
          backlogId: f.backlog.id,
          itemIds: [item.id],
          patch: { field: "estimatePoints", value: 8 },
        },
        f.actor.id,
        "estimate-up",
      );
      await updateItem({ id: item.id, estimatePoints: 3 }, f.actor.id, "estimate-down");
      await updateItem({ id: item.id, estimatePoints: 3 }, f.actor.id, "estimate-noop");
      await updateItem({ id: item.id, statusId: inProgress.id }, f.actor.id, "todo-progress");
      await bulkUpdateItems(
        {
          backlogId: f.backlog.id,
          itemIds: [item.id],
          patch: { field: "statusId", value: review.id },
        },
        f.actor.id,
        "progress-review",
      );
      await updateItem({ id: item.id, statusId: done.id }, f.actor.id, "done-boundary");
      await bulkUpdateItems(
        {
          backlogId: f.backlog.id,
          itemIds: [item.id],
          patch: { field: "statusId", value: verified.id },
        },
        f.actor.id,
        "done-verified",
      );

      expect(
        await db
          .select({
            eventType: sprintEvents.eventType,
            previousEstimate: sprintEvents.previousEstimate,
            nextEstimate: sprintEvents.nextEstimate,
            correlationId: sprintEvents.requestCorrelationId,
          })
          .from(sprintEvents)
          .where(eq(sprintEvents.sprintId, sprint.id))
          .orderBy(asc(sprintEvents.sequence)),
      ).toEqual([
        {
          eventType: "estimate_changed",
          previousEstimate: 5,
          nextEstimate: null,
          correlationId: "estimate-null",
        },
        {
          eventType: "estimate_changed",
          previousEstimate: null,
          nextEstimate: 8,
          correlationId: "estimate-up",
        },
        {
          eventType: "estimate_changed",
          previousEstimate: 8,
          nextEstimate: 3,
          correlationId: "estimate-down",
        },
        {
          eventType: "item_completed",
          previousEstimate: null,
          nextEstimate: null,
          correlationId: "done-boundary",
        },
      ]);
      expect(
        await db
          .select({ correlationId: activities.requestCorrelationId })
          .from(activities)
          .where(
            inArray(activities.requestCorrelationId, [
              "todo-progress",
              "progress-review",
              "done-verified",
            ]),
          )
          .orderBy(asc(activities.requestCorrelationId)),
      ).toEqual([
        { correlationId: "done-verified" },
        { correlationId: "progress-review" },
        { correlationId: "todo-progress" },
      ]);
    } finally {
      await cleanup(f);
    }
  });

  it("records only the mixed bulk rows that cross the done boundary", async () => {
    const f = await fixture();
    try {
      const [inProgress, done] = await db
        .insert(statuses)
        .values([
          {
            backlogId: f.backlog.id,
            name: "En cours",
            category: "in_progress",
            order: 1,
            color: "#ca8a04",
          },
          {
            backlogId: f.backlog.id,
            name: "Terminé",
            category: "done",
            order: 2,
            color: "#16a34a",
          },
        ])
        .returning();
      if (!inProgress || !done) throw new Error("Fixture de statuts impossible.");
      const sprint = await insertSprint(f, "Sprint actif", "active");
      const todoItem = await insertItem(f, "À faire", 1);
      const progressItem = await insertItem(f, "En cours", 2);
      const doneItem = await insertItem(f, "Déjà terminé", 3);
      await db.update(items).set({ statusId: inProgress.id }).where(eq(items.id, progressItem.id));
      await db
        .update(items)
        .set({ statusId: done.id, closedAt: new Date("2026-08-02T09:00:00.000Z") })
        .where(eq(items.id, doneItem.id));
      await addMembership(f, sprint.id, todoItem.id, 1);
      await addMembership(f, sprint.id, progressItem.id, 2);
      await addMembership(f, sprint.id, doneItem.id, 3);

      await bulkUpdateItems(
        {
          backlogId: f.backlog.id,
          itemIds: [todoItem.id, progressItem.id, doneItem.id],
          patch: { field: "statusId", value: done.id },
        },
        f.actor.id,
        "bulk-mixed-statuses",
      );

      expect(
        await db
          .select({ itemId: sprintEvents.itemId, eventType: sprintEvents.eventType })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, "bulk-mixed-statuses"))
          .orderBy(asc(sprintEvents.itemId)),
      ).toEqual(
        [todoItem.id, progressItem.id]
          .sort((left, right) => left.localeCompare(right))
          .map((itemId) => ({ itemId, eventType: "item_completed" })),
      );
    } finally {
      await cleanup(f);
    }
  });

  it("rolls back single and bulk item changes when report event validation fails", async () => {
    const f = await fixture();
    try {
      const [done] = await db
        .insert(statuses)
        .values({
          backlogId: f.backlog.id,
          name: "Terminé",
          category: "done",
          order: 1,
          color: "#16a34a",
        })
        .returning();
      if (!done) throw new Error("Fixture statut terminé impossible.");
      const sprint = await insertSprint(f, "Sprint actif", "active");
      const first = await insertItem(f, "Première", 1);
      const second = await insertItem(f, "Deuxième", 2);
      await addMembership(f, sprint.id, first.id, 1);
      await addMembership(f, sprint.id, second.id, 2);

      await expect(
        updateItem(
          { id: first.id, estimatePoints: 5, statusId: done.id },
          f.actor.id,
          "x".repeat(129),
        ),
      ).rejects.toThrow("correlation");
      await expect(
        bulkUpdateItems(
          {
            backlogId: f.backlog.id,
            itemIds: [first.id, second.id],
            patch: { field: "estimatePoints", value: 8 },
          },
          f.actor.id,
          "x".repeat(129),
        ),
      ).rejects.toThrow("correlation");

      expect(
        await db
          .select({
            id: items.id,
            statusId: items.statusId,
            estimatePoints: items.estimatePoints,
            closedAt: items.closedAt,
          })
          .from(items)
          .where(inArray(items.id, [first.id, second.id]))
          .orderBy(asc(items.id)),
      ).toEqual(
        [
          { id: first.id, statusId: f.todo.id, estimatePoints: 1, closedAt: null },
          { id: second.id, statusId: f.todo.id, estimatePoints: 2, closedAt: null },
        ].sort((left, right) => left.id.localeCompare(right.id)),
      );
      expect(
        await db
          .select({ id: activities.id })
          .from(activities)
          .where(inArray(activities.itemId, [first.id, second.id])),
      ).toEqual([]);
      expect(
        await db
          .select({ id: sprintEvents.id })
          .from(sprintEvents)
          .where(eq(sprintEvents.sprintId, sprint.id)),
      ).toEqual([]);
    } finally {
      await cleanup(f);
    }
  });

  it("bulk-inserts active membership events once under one correlation", async () => {
    const f = await fixture();
    const correlationId = `bulk-${randomUUID()}`;
    try {
      const sprint = await insertSprint(f, "Sprint actif", "active");
      const first = await insertItem(f, "Première", 2);
      const second = await insertItem(f, "Deuxième", null);
      const querySpy = vi.spyOn(Client.prototype, "query");
      try {
        await assignItemsToSprint(
          {
            backlogId: f.backlog.id,
            itemIds: [first.id, second.id],
            sprintId: sprint.id,
          },
          f.actor.id,
          correlationId,
        );
        const eventInserts = querySpy.mock.calls.filter(([query]) => {
          const candidate: unknown = query;
          const text =
            typeof candidate === "string"
              ? candidate
              : typeof candidate === "object" && candidate !== null && "text" in candidate
                ? String(candidate.text)
                : "";
          return text?.includes('insert into "sprint_events"');
        });
        expect(eventInserts).toHaveLength(1);
      } finally {
        querySpy.mockRestore();
      }

      expect(
        await db
          .select({
            itemId: sprintEvents.itemId,
            nextEstimate: sprintEvents.nextEstimate,
            correlationId: sprintEvents.requestCorrelationId,
          })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, correlationId))
          .orderBy(asc(sprintEvents.itemId)),
      ).toEqual(
        [
          { itemId: first.id, nextEstimate: 2, correlationId },
          { itemId: second.id, nextEstimate: null, correlationId },
        ].sort((left, right) => left.itemId.localeCompare(right.itemId)),
      );
    } finally {
      await cleanup(f);
    }
  });

  it("uses one active-membership lookup and one event insert for 500 bulk mutations", async () => {
    const f = await fixture();
    try {
      const sprint = await insertSprint(f, "Sprint actif", "active");
      const itemRows = Array.from({ length: 500 }, (_, index) => {
        const id = randomUUID();
        return {
          id,
          key: `${f.backlog.key}-${index + 1}`,
          type: "tache" as const,
          backlogId: f.backlog.id,
          title: `Mutation ${index + 1}`,
          statusId: f.todo.id,
          estimatePoints: null,
          reporterId: f.actor.id,
          rank: `bulk-${String(index).padStart(3, "0")}`,
          path: `root.${id.replaceAll("-", "")}`,
          depth: 0,
        };
      });
      await db.insert(items).values(itemRows);
      await db.insert(sprintItems).values(
        itemRows.map((item) => ({
          sprintId: sprint.id,
          itemId: item.id,
          joinedBy: f.actor.id,
          estimateAtJoin: null,
        })),
      );

      const querySpy = vi.spyOn(Client.prototype, "query");
      try {
        await bulkUpdateItems(
          {
            backlogId: f.backlog.id,
            itemIds: itemRows.map((item) => item.id),
            patch: { field: "estimatePoints", value: 1 },
          },
          f.actor.id,
          "bulk-report-query-bound",
        );
        const queryTexts = querySpy.mock.calls.map(([query]) => {
          const candidate: unknown = query;
          return typeof candidate === "string"
            ? candidate
            : typeof candidate === "object" && candidate !== null && "text" in candidate
              ? String(candidate.text)
              : "";
        });
        expect(
          queryTexts.filter(
            (text) =>
              text.includes('from "sprint_items"') &&
              text.includes('inner join "sprints"'),
          ),
        ).toHaveLength(1);
        expect(
          queryTexts.filter((text) => text.includes('insert into "sprint_events"')),
        ).toHaveLength(1);
      } finally {
        querySpy.mockRestore();
      }

      expect(
        await db
          .select({ itemId: sprintEvents.itemId })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, "bulk-report-query-bound")),
      ).toHaveLength(500);
    } finally {
      await cleanup(f);
    }
  });

  it("emits neither an activity nor an event for a no-op assignment", async () => {
    const f = await fixture();
    const correlationId = `noop-${randomUUID()}`;
    try {
      const sprint = await insertSprint(f, "Sprint actif", "active");
      const item = await insertItem(f, "Stable", 3);
      await addMembership(f, sprint.id, item.id, 3);

      await expect(
        assignItemsToSprint(
          { backlogId: f.backlog.id, itemIds: [item.id], sprintId: sprint.id },
          f.actor.id,
          correlationId,
        ),
      ).resolves.toEqual({ changedCount: 0, unchangedCount: 1 });
      expect(
        await db
          .select({ id: sprintEvents.id })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, correlationId)),
      ).toEqual([]);
      expect(
        await db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.requestCorrelationId, correlationId)),
      ).toEqual([]);
    } finally {
      await cleanup(f);
    }
  });

  it("closes active subtree membership on delete and restore requires an explicit re-add", async () => {
    const f = await fixture();
    const deleteCorrelation = `delete-${randomUUID()}`;
    const readdCorrelation = `readd-${randomUUID()}`;
    try {
      const sprint = await insertSprint(f, "Sprint actif", "active");
      const component = await insertItem(f, "Composant", null, { type: "composant" });
      const task = await insertItem(f, "Tâche membre", 5, { parent: component });
      await insertItem(f, "Sous-tâche hors sprint", null, {
        type: "soustache",
        parent: task,
      });
      const membership = await addMembership(f, sprint.id, task.id, 5);

      await softDeleteItem({ id: component.id }, f.actor.id, deleteCorrelation);

      const [closed] = await db
        .select({ leftAt: sprintItems.leftAt, outcome: sprintItems.outcome })
        .from(sprintItems)
        .where(eq(sprintItems.id, membership.id));
      expect(closed).toMatchObject({ leftAt: expect.any(Date), outcome: "removed" });
      expect(
        await db
          .select({
            itemId: sprintEvents.itemId,
            eventType: sprintEvents.eventType,
            reason: sprintEvents.removalReason,
          })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, deleteCorrelation)),
      ).toEqual([{ itemId: task.id, eventType: "item_removed", reason: "deleted" }]);

      await restoreItem({ id: component.id }, f.actor.id);
      expect(
        await db
          .select({ id: sprintItems.id })
          .from(sprintItems)
          .where(and(eq(sprintItems.itemId, task.id), isNull(sprintItems.leftAt))),
      ).toEqual([]);

      await assignItemsToSprint(
        { backlogId: f.backlog.id, itemIds: [task.id], sprintId: sprint.id },
        f.actor.id,
        readdCorrelation,
      );
      expect(
        await db
          .select({ eventType: sprintEvents.eventType })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, readdCorrelation)),
      ).toEqual([{ eventType: "item_added" }]);
    } finally {
      await cleanup(f);
    }
  });

  it("rolls back membership facts and events when a late activity write fails", async () => {
    const f = await fixture();
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `fail_membership_activity_${suffix}`;
    const triggerName = `fail_membership_activity_${suffix}`;
    const correlationId = "membership-late-rollback";
    let triggerInstalled = false;
    try {
      const active = await insertSprint(f, "Sprint actif", "active");
      const item = await insertItem(f, "À conserver", 3);
      await databasePool.query(`
        create function "${functionName}"() returns trigger
        language plpgsql as $$
        begin
          if new.request_correlation_id = '${correlationId}' then
            raise exception 'injected late membership activity failure';
          end if;
          return new;
        end;
        $$
      `);
      await databasePool.query(`
        create trigger "${triggerName}"
        before insert on activities
        for each row execute function "${functionName}"()
      `);
      triggerInstalled = true;
      await expect(
        assignItemsToSprint(
          { backlogId: f.backlog.id, itemIds: [item.id], sprintId: active.id },
          f.actor.id,
          correlationId,
        ),
      ).rejects.toThrow('insert into "activities"');
      expect(
        await db
          .select({ id: sprintItems.id, doneAtStart: sprintItems.doneAtStart })
          .from(sprintItems)
          .where(and(eq(sprintItems.itemId, item.id), isNull(sprintItems.leftAt))),
      ).toEqual([]);
      expect(
        await db
          .select({ id: sprintEvents.id })
          .from(sprintEvents)
          .where(eq(sprintEvents.requestCorrelationId, correlationId)),
      ).toEqual([]);
    } finally {
      if (triggerInstalled) {
        await databasePool.query(`drop trigger "${triggerName}" on activities`);
      }
      await databasePool.query(`drop function if exists "${functionName}"()`);
      await cleanup(f);
    }
  });

  it("rolls back item deletion and active membership when event validation fails", async () => {
    const f = await fixture();
    try {
      const active = await insertSprint(f, "Sprint actif", "active");
      const item = await insertItem(f, "À ne pas supprimer", 3);
      const membership = await addMembership(f, active.id, item.id, 3);
      await expect(
        softDeleteItem({ id: item.id }, f.actor.id, " "),
      ).rejects.toThrow("correlation");

      const [storedItem] = await db
        .select({ deletedAt: items.deletedAt })
        .from(items)
        .where(eq(items.id, item.id));
      expect(storedItem?.deletedAt).toBeNull();
      const [storedMembership] = await db
        .select({ leftAt: sprintItems.leftAt, outcome: sprintItems.outcome })
        .from(sprintItems)
        .where(eq(sprintItems.id, membership.id));
      expect(storedMembership).toEqual({ leftAt: null, outcome: null });
    } finally {
      await cleanup(f);
    }
  });
});
