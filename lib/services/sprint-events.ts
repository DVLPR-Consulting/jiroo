import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  items,
  sprintEvents,
  sprintItems,
  sprints,
} from "@/lib/db/schema/domain";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type SprintLifecycleEventCommand = {
  type: "sprint_started" | "sprint_completed";
  backlogId: string;
  sprintId: string;
  actorId: string;
  correlationId: string;
  occurredAt: Date;
};

type SprintItemEventBase = {
  backlogId: string;
  sprintId: string;
  membershipId: string;
  item: { id: string; key: string; title: string };
  actorId: string;
  correlationId: string;
  occurredAt: Date;
};

export type SprintEventCommand =
  | SprintLifecycleEventCommand
  | (SprintItemEventBase & {
      type: "item_added";
      nextEstimate: number | null;
      relatedSprint: { id: string; name: string } | null;
    })
  | (SprintItemEventBase & {
      type: "item_removed";
      previousEstimate: number | null;
      reason: "manual" | "moved" | "deleted";
      relatedSprint: { id: string; name: string } | null;
    })
  | (SprintItemEventBase & {
      type: "estimate_changed";
      previousEstimate: number | null;
      nextEstimate: number | null;
    })
  | (SprintItemEventBase & {
      type: "item_completed" | "item_reopened";
    });

function correlationId(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 128) {
    throw new Error("La correlation de requête doit contenir entre 1 et 128 caractères.");
  }
  return normalized;
}

function eventRow(command: SprintEventCommand): typeof sprintEvents.$inferInsert {
  const requestCorrelationId = correlationId(command.correlationId);
  const base = {
    backlogId: command.backlogId,
    sprintId: command.sprintId,
    eventType: command.type,
    actorId: command.actorId,
    requestCorrelationId,
    occurredAt: command.occurredAt,
  };

  switch (command.type) {
    case "sprint_started":
    case "sprint_completed":
      return base;
    case "item_added":
      return {
        ...base,
        sourceMembershipId: command.membershipId,
        itemId: command.item.id,
        itemKey: command.item.key,
        itemTitle: command.item.title,
        nextEstimate: command.nextEstimate,
        relatedSprintId: command.relatedSprint?.id ?? null,
        relatedSprintName: command.relatedSprint?.name ?? null,
      };
    case "item_removed":
      return {
        ...base,
        sourceMembershipId: command.membershipId,
        itemId: command.item.id,
        itemKey: command.item.key,
        itemTitle: command.item.title,
        previousEstimate: command.previousEstimate,
        relatedSprintId: command.relatedSprint?.id ?? null,
        relatedSprintName: command.relatedSprint?.name ?? null,
        removalReason: command.reason,
      };
    case "estimate_changed":
      return {
        ...base,
        sourceMembershipId: command.membershipId,
        itemId: command.item.id,
        itemKey: command.item.key,
        itemTitle: command.item.title,
        previousEstimate: command.previousEstimate,
        nextEstimate: command.nextEstimate,
      };
    case "item_completed":
      return {
        ...base,
        sourceMembershipId: command.membershipId,
        itemId: command.item.id,
        itemKey: command.item.key,
        itemTitle: command.item.title,
        previousDone: false,
        nextDone: true,
      };
    case "item_reopened":
      return {
        ...base,
        sourceMembershipId: command.membershipId,
        itemId: command.item.id,
        itemKey: command.item.key,
        itemTitle: command.item.title,
        previousDone: true,
        nextDone: false,
      };
  }
}

export async function appendSprintEventsInTx(
  tx: Tx,
  commands: SprintEventCommand[],
): Promise<void> {
  if (commands.length === 0) return;
  const rows = commands.map(eventRow);
  await tx.insert(sprintEvents).values(rows);
}

export async function removeDeletedItemsFromActiveSprintsInTx(
  tx: Tx,
  input: {
    backlogId: string;
    itemIds: string[];
    actorId: string;
    requestCorrelationId: string;
    occurredAt: Date;
  },
): Promise<void> {
  const activeSprints = await tx
    .select({ id: sprints.id, name: sprints.name })
    .from(sprints)
    .where(and(eq(sprints.backlogId, input.backlogId), eq(sprints.state, "active")))
    .orderBy(asc(sprints.id))
    .for("update");

  const activeSprintIds = activeSprints.map((sprint) => sprint.id);
  const memberships = activeSprintIds.length === 0 || input.itemIds.length === 0
    ? []
    : await tx
        .select()
        .from(sprintItems)
        .where(
          and(
            inArray(sprintItems.sprintId, activeSprintIds),
            inArray(sprintItems.itemId, input.itemIds),
            isNull(sprintItems.leftAt),
          ),
        )
        .orderBy(asc(sprintItems.itemId), asc(sprintItems.id))
        .for("update");

  const lockedItems = input.itemIds.length === 0
    ? []
    : await tx
        .select({
          id: items.id,
          key: items.key,
          title: items.title,
          estimatePoints: items.estimatePoints,
        })
        .from(items)
        .where(
          and(
            eq(items.backlogId, input.backlogId),
            inArray(items.id, input.itemIds),
            isNull(items.deletedAt),
          ),
        )
        .orderBy(asc(items.id))
        .for("update");

  if (memberships.length === 0) return;
  const membershipIds = memberships.map((membership) => membership.id);
  await tx
    .update(sprintItems)
    .set({ leftAt: input.occurredAt, outcome: "removed" })
    .where(inArray(sprintItems.id, membershipIds));

  const sprintById = new Map(activeSprints.map((sprint) => [sprint.id, sprint]));
  const itemById = new Map(lockedItems.map((item) => [item.id, item]));
  await appendSprintEventsInTx(
    tx,
    memberships.map((membership) => {
      const sprint = sprintById.get(membership.sprintId);
      const item = itemById.get(membership.itemId);
      if (!sprint || !item) throw new Error("L’appartenance sprint de l’item est incohérente.");
      return {
        type: "item_removed" as const,
        backlogId: input.backlogId,
        sprintId: sprint.id,
        membershipId: membership.id,
        item: { id: item.id, key: item.key, title: item.title },
        previousEstimate: item.estimatePoints,
        reason: "deleted" as const,
        relatedSprint: null,
        actorId: input.actorId,
        correlationId: input.requestCorrelationId,
        occurredAt: input.occurredAt,
      };
    }),
  );
}
