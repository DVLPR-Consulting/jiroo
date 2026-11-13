import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { activityAttribution } from "@/lib/auth/actor-context";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { nextItemRevision } from "@/lib/services/item-revision";
import { binaryTextOrder } from "@/lib/db/order";
import {
  activities,
  backlogs,
  items,
  sprintItems,
  sprints,
} from "@/lib/db/schema/domain";
import { rankAtDrop } from "@/lib/services/items";
import { rankBetween, rankFirst, rankLast } from "@/lib/tree/rank";
import { assignItemsToSprintInTx } from "@/lib/services/sprint-membership";
import { normalizeRequestCorrelationId } from "@/lib/services/sprint-events";
import {
  assignSprintItemsSchema,
  createSprintSchema,
  moveSprintItemSchema,
  reorderSprintSchema,
  updateSprintSchema,
} from "@/lib/validation/sprint";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockBacklog(tx: Tx, backlogId: string) {
  const [backlog] = await tx
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.id, backlogId))
    .for("update");
  if (!backlog) throw new Error("Backlog introuvable.");
}

async function assertUniqueSprintName(
  tx: Tx,
  backlogId: string,
  name: string,
  exceptId?: string,
) {
  const [duplicate] = await tx
    .select({ id: sprints.id })
    .from(sprints)
    .where(
      and(
        eq(sprints.backlogId, backlogId),
        sql`lower(${sprints.name}) = lower(${name})`,
        exceptId ? ne(sprints.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (duplicate) throw new Error("Un sprint portant ce nom existe déjà.");
}

function nextSprintName(existingNames: string[]): string {
  const normalized = new Set(existingNames.map((name) => name.toLocaleLowerCase("fr")));
  for (let number = 1; ; number += 1) {
    const candidate = `Sprint ${number}`;
    if (!normalized.has(candidate.toLocaleLowerCase("fr"))) return candidate;
  }
}

export async function listSprintsForBacklog(backlogId: string) {
  const [sprintRows, memberships] = await Promise.all([
    db
      .select()
      .from(sprints)
      .where(eq(sprints.backlogId, backlogId))
      .orderBy(asc(binaryTextOrder(sprints.rank))),
    db
      .select({
        id: sprintItems.id,
        sprintId: sprintItems.sprintId,
        itemId: sprintItems.itemId,
        joinedAt: sprintItems.joinedAt,
        joinedBy: sprintItems.joinedBy,
        estimateAtJoin: sprintItems.estimateAtJoin,
        estimateAtStart: sprintItems.estimateAtStart,
        leftAt: sprintItems.leftAt,
        outcome: sprintItems.outcome,
        destinationSprintId: sprintItems.destinationSprintId,
      })
      .from(sprintItems)
      .innerJoin(sprints, eq(sprints.id, sprintItems.sprintId))
      .where(eq(sprints.backlogId, backlogId))
      .orderBy(asc(sprintItems.joinedAt)),
  ]);
  return { sprints: sprintRows, memberships };
}

export async function createSprint(input: unknown, actorId: string) {
  const data = createSprintSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const existing = await tx
      .select({ name: sprints.name, rank: sprints.rank })
      .from(sprints)
      .where(eq(sprints.backlogId, data.backlogId))
      .orderBy(desc(binaryTextOrder(sprints.rank)));
    const name = nextSprintName(existing.map((row) => row.name));
    const [created] = await tx
      .insert(sprints)
      .values({
        backlogId: data.backlogId,
        name,
        rank: rankLast(existing[0]?.rank ?? null),
        createdBy: actorId,
      })
      .returning();
    return created!;
  });
}

export async function updateSprint(input: unknown, actorId: string) {
  void actorId;
  const data = updateSprintSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const [current] = await tx
      .select()
      .from(sprints)
      .where(
        and(
          eq(sprints.id, data.id),
          eq(sprints.backlogId, data.backlogId),
        ),
      )
      .for("update");
    if (!current) throw new Error("Sprint introuvable.");

    const planningFieldsChanged =
      data.plannedStartAt !== undefined ||
      data.plannedEndAt !== undefined ||
      data.capacityPoints !== undefined;
    if (current.state === "completed" && planningFieldsChanged) {
      throw new Error("Un sprint terminé permet uniquement de modifier son nom et son objectif.");
    }
    if (data.name !== undefined) {
      await assertUniqueSprintName(tx, data.backlogId, data.name, data.id);
    }

    const patch: Partial<typeof sprints.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) patch.name = data.name;
    if (data.goal !== undefined) patch.goal = data.goal;
    if (data.plannedStartAt !== undefined) {
      patch.plannedStartAt = data.plannedStartAt
        ? new Date(data.plannedStartAt)
        : null;
    }
    if (data.plannedEndAt !== undefined) {
      patch.plannedEndAt = data.plannedEndAt
        ? new Date(data.plannedEndAt)
        : null;
    }
    if (data.capacityPoints !== undefined) {
      patch.capacityPoints = data.capacityPoints;
    }

    const [updated] = await tx
      .update(sprints)
      .set(patch)
      .where(eq(sprints.id, current.id))
      .returning();
    return updated!;
  });
}

export async function reorderSprint(input: unknown, actorId: string) {
  void actorId;
  const data = reorderSprintSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const rows = await tx
      .select()
      .from(sprints)
      .where(eq(sprints.backlogId, data.backlogId))
      .orderBy(asc(sprints.id))
      .for("update");
    const current = rows.find((row) => row.id === data.id);
    if (!current) throw new Error("Sprint introuvable.");
    if (current.state !== "planned") {
      throw new Error("Seul un sprint planifié peut être réordonné.");
    }

    const planned = rows
      .filter((row) => row.state === "planned" && row.id !== current.id)
      .sort((left, right) =>
        left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0,
      );
    const beforeIndex = data.beforeId
      ? planned.findIndex((row) => row.id === data.beforeId)
      : -1;
    const afterIndex = data.afterId
      ? planned.findIndex((row) => row.id === data.afterId)
      : -1;
    if (
      (data.beforeId && beforeIndex < 0) ||
      (data.afterId && afterIndex < 0) ||
      (data.beforeId && data.afterId && beforeIndex + 1 !== afterIndex) ||
      (data.beforeId && !data.afterId && beforeIndex !== planned.length - 1) ||
      (!data.beforeId && data.afterId && afterIndex !== 0)
    ) {
      throw new Error("Voisin invalide pour ce backlog.");
    }

    const before = beforeIndex >= 0 ? planned[beforeIndex]! : null;
    const after = afterIndex >= 0 ? planned[afterIndex]! : null;
    let rank = before
      ? after
        ? rankBetween(before.rank, after.rank)
        : rankLast(before.rank)
      : after
        ? rankFirst(after.rank)
        : rankLast(null);
    // Ranks are unique across all lifecycle states, not only planned sprints.
    const occupied = new Set(rows.filter((row) => row.id !== current.id).map((row) => row.rank));
    while (occupied.has(rank)) {
      rank = after ? rankBetween(rank, after.rank) : rankLast(rank);
    }
    if (rank === current.rank) return current;

    const [updated] = await tx
      .update(sprints)
      .set({ rank, updatedAt: new Date() })
      .where(eq(sprints.id, current.id))
      .returning();
    return updated!;
  });
}

export async function assignItemsToSprint(
  input: unknown,
  actorId: string,
  requestCorrelationId: string = randomUUID(),
) {
  const data = assignSprintItemsSchema.parse(input);
  return db.transaction((tx) =>
    assignItemsToSprintInTx(tx, data, actorId, requestCorrelationId),
  );
}

export async function moveItemToSprint(
  input: unknown,
  actorId: string,
  requestCorrelationId: string = randomUUID(),
) {
  const data = moveSprintItemSchema.parse(input);
  const correlationId = normalizeRequestCorrelationId(requestCorrelationId);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);

    const [currentProbe] = await tx
      .select({ id: items.id, backlogId: items.backlogId, type: items.type })
      .from(items)
      .where(and(eq(items.id, data.itemId), isNull(items.deletedAt)));
    if (!currentProbe) throw new Error("Item introuvable.");
    if (currentProbe.backlogId !== data.backlogId || currentProbe.type !== "tache") {
      throw new Error("Seules les tâches du backlog peuvent être déplacées.");
    }

    await assignItemsToSprintInTx(
      tx,
      {
        backlogId: data.backlogId,
        itemIds: [data.itemId],
        sprintId: data.sprintId,
      },
      actorId,
      correlationId,
    );

    const neighborIds = [data.beforeId, data.afterId].filter(
      (id): id is string => id !== null,
    );
    const lockedIds = [...new Set([data.itemId, ...neighborIds])].sort();
    const lockedItems = await tx
      .select()
      .from(items)
      .where(and(inArray(items.id, lockedIds), isNull(items.deletedAt)))
      .orderBy(asc(items.id))
      .for("update");
    const itemById = new Map(lockedItems.map((item) => [item.id, item]));
    const current = itemById.get(data.itemId);
    if (!current) throw new Error("Item introuvable.");
    if (current.backlogId !== data.backlogId || current.type !== "tache") {
      throw new Error("Seules les tâches du backlog peuvent être déplacées.");
    }
    for (const neighborId of neighborIds) {
      const neighbor = itemById.get(neighborId);
      if (
        !neighbor ||
        neighbor.backlogId !== data.backlogId ||
        neighbor.type !== "tache"
      ) {
        throw new Error("Voisin invalide pour ce backlog.");
      }
    }

    if (neighborIds.length > 0) {
      const memberships = await tx
        .select({ itemId: sprintItems.itemId, sprintId: sprintItems.sprintId })
        .from(sprintItems)
        .where(
          and(
            inArray(sprintItems.itemId, neighborIds),
            isNull(sprintItems.leftAt),
          ),
        )
        .for("update");
      const sprintByItem = new Map(
        memberships.map((membership) => [membership.itemId, membership.sprintId]),
      );
      if (
        neighborIds.some(
          (neighborId) => (sprintByItem.get(neighborId) ?? null) !== data.sprintId,
        )
      ) {
        throw new Error("Le voisin n’appartient pas à la section cible.");
      }
    }

    const rank = await rankAtDrop(
      tx,
      data.backlogId,
      data.itemId,
      data.beforeId,
      data.afterId,
    );
    if (rank === current.rank) return current;

    const [updated] = await tx
      .update(items)
      .set({ rank, updatedAt: nextItemRevision() })
      .where(eq(items.id, current.id))
      .returning();
    await tx.insert(activities).values({
      ...activityAttribution(),
      itemId: current.id,
      actorId,
      action: "move",
      field: "rank",
      oldValue: current.rank,
      newValue: rank,
      requestCorrelationId: correlationId,
    });
    return updated!;
  });
}
