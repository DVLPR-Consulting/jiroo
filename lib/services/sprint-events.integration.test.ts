import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
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
import { restoreItem, softDeleteItem } from "@/lib/services/items";
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
  const [todo] = await db
    .insert(statuses)
    .values({
      backlogId: backlog.id,
      name: "À faire",
      category: "todo",
      order: 0,
      color: "#9aa0a6",
    })
    .returning();
  if (!todo) throw new Error("Fixture statut impossible.");
  return { actor, backlog, todo };
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
  options: { type?: "composant" | "tache" | "soustache"; parent?: typeof items.$inferSelect } = {},
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
      statusId: f.todo.id,
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
      const unestimated = await insertItem(f, "Sans estimation", null);
      await addMembership(f, sprint.id, estimated.id, 5);
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
          .select({ itemId: sprintItems.itemId, estimateAtStart: sprintItems.estimateAtStart })
          .from(sprintItems)
          .where(eq(sprintItems.sprintId, sprint.id))
          .orderBy(asc(sprintItems.itemId)),
      ).toEqual(
        [
          { itemId: estimated.id, estimateAtStart: 5 },
          { itemId: unestimated.id, estimateAtStart: null },
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
      ).toEqual([{ correlationId }, { correlationId }]);
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

  it("rolls back membership changes when event validation fails", async () => {
    const f = await fixture();
    try {
      const active = await insertSprint(f, "Sprint actif", "active");
      const item = await insertItem(f, "À conserver", 3);
      await expect(
        assignItemsToSprint(
          { backlogId: f.backlog.id, itemIds: [item.id], sprintId: active.id },
          f.actor.id,
          "x".repeat(129),
        ),
      ).rejects.toThrow("correlation");
      expect(
        await db
          .select({ id: sprintItems.id })
          .from(sprintItems)
          .where(and(eq(sprintItems.itemId, item.id), isNull(sprintItems.leftAt))),
      ).toEqual([]);
    } finally {
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
