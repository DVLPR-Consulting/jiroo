import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { binaryTextOrder } from "@/lib/db/order";
import {
  activities,
  backlogs,
  items,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import { rankLast } from "@/lib/tree/rank";
import {
  completeSprintSchema,
  startSprintSchema,
} from "@/lib/validation/sprint";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type StartSprintResult = {
  sprintId: string;
  committedItemCount: number;
  committedPoints: number;
  unestimatedCount: number;
};

export type CompleteSprintResult = {
  sprintId: string;
  completedItemCount: number;
  carriedItemCount: number;
  destinationSprintId: string | null;
};

export class IncompleteSprintSubtasksError extends Error {
  readonly itemKeys: string[];

  constructor(itemKeys: string[]) {
    super("Terminez les sous-tâches avant de clôturer le sprint.");
    this.name = "IncompleteSprintSubtasksError";
    this.itemKeys = itemKeys;
  }
}

async function lockBacklog(tx: Tx, backlogId: string) {
  const [backlog] = await tx
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.id, backlogId))
    .for("update");
  if (!backlog) throw new Error("Backlog introuvable.");
}

function isUniqueActiveSprintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  if (
    candidate.code === "23505" &&
    candidate.constraint === "sprints_one_active_per_backlog_idx"
  ) {
    return true;
  }
  return candidate.cause !== undefined && isUniqueActiveSprintViolation(candidate.cause);
}

export async function startSprint(
  input: unknown,
  actorId: string,
): Promise<StartSprintResult> {
  const data = startSprintSchema.parse(input);
  try {
    return await db.transaction(async (tx) => {
      await lockBacklog(tx, data.backlogId);
      const [sprint] = await tx
        .select()
        .from(sprints)
        .where(
          and(
            eq(sprints.id, data.id),
            eq(sprints.backlogId, data.backlogId),
          ),
        )
        .for("update");
      if (!sprint) throw new Error("Sprint introuvable.");
      if (sprint.state !== "planned") {
        throw new Error("Seul un sprint planifié peut être démarré.");
      }

      const [active] = await tx
        .select({ id: sprints.id })
        .from(sprints)
        .where(
          and(
            eq(sprints.backlogId, data.backlogId),
            eq(sprints.state, "active"),
          ),
        )
        .limit(1)
        .for("update");
      if (active) throw new Error("Un sprint est déjà actif pour ce backlog.");

      const memberships = await tx
        .select()
        .from(sprintItems)
        .where(
          and(
            eq(sprintItems.sprintId, sprint.id),
            isNull(sprintItems.leftAt),
          ),
        )
        .orderBy(asc(sprintItems.itemId))
        .for("update");
      const committedItems =
        memberships.length === 0
          ? []
          : await tx
              .select({
                id: items.id,
                backlogId: items.backlogId,
                type: items.type,
                estimatePoints: items.estimatePoints,
              })
              .from(items)
              .where(
                and(
                  inArray(
                    items.id,
                    memberships.map((membership) => membership.itemId),
                  ),
                  isNull(items.deletedAt),
                ),
              )
              .orderBy(asc(items.id))
              .for("update");
      if (
        committedItems.length !== memberships.length ||
        committedItems.some(
          (item) => item.backlogId !== data.backlogId || item.type !== "tache",
        )
      ) {
        throw new Error("Le contenu du sprint est incohérent.");
      }

      const estimateByItem = new Map(
        committedItems.map((item) => [item.id, item.estimatePoints]),
      );
      for (const membership of memberships) {
        await tx
          .update(sprintItems)
          .set({ estimateAtStart: estimateByItem.get(membership.itemId) ?? null })
          .where(eq(sprintItems.id, membership.id));
      }
      if (committedItems.length > 0) {
        await tx.insert(activities).values(
          committedItems.map((item) => ({
            itemId: item.id,
            actorId,
            action: "update" as const,
            field: "sprint_commitment",
            oldValue: null,
            newValue: data.name,
          })),
        );
      }

      const startedAt = new Date(data.startAt);
      await tx
        .update(sprints)
        .set({
          name: data.name,
          goal: data.goal,
          capacityPoints: data.capacityPoints,
          plannedStartAt: startedAt,
          plannedEndAt: new Date(data.endAt),
          state: "active",
          startedAt,
          updatedAt: new Date(),
        })
        .where(eq(sprints.id, sprint.id));

      return {
        sprintId: sprint.id,
        committedItemCount: committedItems.length,
        committedPoints: committedItems.reduce(
          (sum, item) => sum + (item.estimatePoints ?? 0),
          0,
        ),
        unestimatedCount: committedItems.filter(
          (item) => item.estimatePoints === null,
        ).length,
      };
    });
  } catch (error) {
    if (isUniqueActiveSprintViolation(error)) {
      throw new Error("Un sprint est déjà actif pour ce backlog.");
    }
    throw error;
  }
}

export async function completeSprint(
  input: unknown,
  actorId: string,
): Promise<CompleteSprintResult> {
  const data = completeSprintSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const [sprint] = await tx
      .select()
      .from(sprints)
      .where(
        and(
          eq(sprints.id, data.id),
          eq(sprints.backlogId, data.backlogId),
        ),
      )
      .for("update");
    if (!sprint) throw new Error("Sprint introuvable.");
    if (sprint.state !== "active") {
      throw new Error("Seul un sprint actif peut être clôturé.");
    }

    const memberships = await tx
      .select()
      .from(sprintItems)
      .where(
        and(
          eq(sprintItems.sprintId, sprint.id),
          isNull(sprintItems.leftAt),
        ),
      )
      .orderBy(asc(sprintItems.itemId))
      .for("update");
    const memberIds = memberships.map((membership) => membership.itemId);
    const memberItems =
      memberIds.length === 0
        ? []
        : await tx
            .select({
              id: items.id,
              backlogId: items.backlogId,
              type: items.type,
              statusId: items.statusId,
              statusBacklogId: statuses.backlogId,
              statusCategory: statuses.category,
              estimatePoints: items.estimatePoints,
            })
            .from(items)
            .innerJoin(statuses, eq(statuses.id, items.statusId))
            .where(and(inArray(items.id, memberIds), isNull(items.deletedAt)))
            .orderBy(asc(items.id))
            .for("update");
    if (
      memberItems.length !== memberships.length ||
      memberItems.some(
        (item) =>
          item.backlogId !== data.backlogId ||
          item.statusBacklogId !== data.backlogId ||
          item.type !== "tache",
      )
    ) {
      throw new Error("Le contenu du sprint est incohérent.");
    }

    const incompleteSubtasks =
      memberIds.length === 0
        ? []
        : await tx
            .select({ key: items.key, statusCategory: statuses.category })
            .from(items)
            .innerJoin(statuses, eq(statuses.id, items.statusId))
            .where(
              and(
                inArray(items.parentId, memberIds),
                eq(items.type, "soustache"),
                isNull(items.deletedAt),
                eq(statuses.backlogId, data.backlogId),
              ),
            )
            .orderBy(asc(items.key))
            .for("update");
    const blockingKeys = incompleteSubtasks
      .filter((subtask) => subtask.statusCategory !== "done")
      .map((subtask) => subtask.key);
    if (blockingKeys.length > 0) {
      throw new IncompleteSprintSubtasksError(blockingKeys);
    }

    let destination: typeof sprints.$inferSelect | null = null;
    if (data.destination.type === "existing_sprint") {
      const [existing] = await tx
        .select()
        .from(sprints)
        .where(
          and(
            eq(sprints.id, data.destination.sprintId),
            eq(sprints.backlogId, data.backlogId),
            eq(sprints.state, "planned"),
          ),
        )
        .for("update");
      if (!existing) throw new Error("Sprint de destination introuvable.");
      destination = existing;
    } else if (data.destination.type === "new_sprint") {
      const [duplicate] = await tx
        .select({ id: sprints.id })
        .from(sprints)
        .where(
          and(
            eq(sprints.backlogId, data.backlogId),
            sql`lower(${sprints.name}) = lower(${data.destination.name})`,
          ),
        )
        .limit(1);
      if (duplicate) throw new Error("Un sprint portant ce nom existe déjà.");
      const [last] = await tx
        .select({ rank: sprints.rank })
        .from(sprints)
        .where(eq(sprints.backlogId, data.backlogId))
        .orderBy(desc(binaryTextOrder(sprints.rank)))
        .limit(1)
        .for("update");
      const [created] = await tx
        .insert(sprints)
        .values({
          backlogId: data.backlogId,
          name: data.destination.name,
          rank: rankLast(last?.rank ?? null),
          createdBy: actorId,
        })
        .returning();
      destination = created!;
    }

    const itemById = new Map(memberItems.map((item) => [item.id, item]));
    const now = new Date();
    let completedItemCount = 0;
    let carriedItemCount = 0;
    for (const membership of memberships) {
      const item = itemById.get(membership.itemId)!;
      if (item.statusCategory === "done") {
        await tx
          .update(sprintItems)
          .set({ leftAt: now, outcome: "completed" })
          .where(eq(sprintItems.id, membership.id));
        completedItemCount += 1;
        continue;
      }

      await tx
        .update(sprintItems)
        .set({
          leftAt: now,
          outcome: destination ? "carried_to_sprint" : "carried_to_backlog",
          destinationSprintId: destination?.id ?? null,
        })
        .where(eq(sprintItems.id, membership.id));
      if (destination) {
        await tx.insert(sprintItems).values({
          sprintId: destination.id,
          itemId: item.id,
          joinedAt: now,
          joinedBy: actorId,
          estimateAtJoin: item.estimatePoints,
        });
      }
      await tx.insert(activities).values({
        itemId: item.id,
        actorId,
        action: "update",
        field: "sprint",
        oldValue: sprint.name,
        newValue: destination?.name ?? null,
      });
      carriedItemCount += 1;
    }

    await tx
      .update(sprints)
      .set({ state: "completed", completedAt: now, updatedAt: now })
      .where(eq(sprints.id, sprint.id));

    return {
      sprintId: sprint.id,
      completedItemCount,
      carriedItemCount,
      destinationSprintId: destination?.id ?? null,
    };
  });
}
