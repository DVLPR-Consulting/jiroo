import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { binaryTextOrder } from "@/lib/db/order";
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
  buildCompletedParticipantRows,
  calculateSprintScopeMetrics,
  type CompletedParticipantEvent,
  type SprintScopeEvent,
} from "@/lib/reports/sprint-calculations";
import { rankLast } from "@/lib/tree/rank";
import {
  appendSprintEventsInTx,
  normalizeRequestCorrelationId,
} from "@/lib/services/sprint-events";
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
  requestCorrelationId: string = randomUUID(),
): Promise<StartSprintResult> {
  const data = startSprintSchema.parse(input);
  const correlationId = normalizeRequestCorrelationId(requestCorrelationId);
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
                statusBacklogId: statuses.backlogId,
                statusCategory: statuses.category,
              })
              .from(items)
              .innerJoin(statuses, eq(items.statusId, statuses.id))
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
          (item) =>
            item.backlogId !== data.backlogId ||
            item.statusBacklogId !== data.backlogId ||
            item.type !== "tache",
        )
      ) {
        throw new Error("Le contenu du sprint est incohérent.");
      }

      const estimateByItem = new Map(
        committedItems.map((item) => [item.id, item.estimatePoints]),
      );
      const doneByItem = new Map(
        committedItems.map((item) => [item.id, item.statusCategory === "done"]),
      );
      if (memberships.length > 0) {
        const estimateCases = sql.join(
          memberships.map(
            (membership) =>
              sql`when ${sprintItems.itemId} = ${membership.itemId} then ${estimateByItem.get(membership.itemId) ?? null}::numeric(5, 2)`,
          ),
          sql.raw(" "),
        );
        const doneCases = sql.join(
          memberships.map(
            (membership) =>
              sql`when ${sprintItems.itemId} = ${membership.itemId} then ${doneByItem.get(membership.itemId) ?? false}::boolean`,
          ),
          sql.raw(" "),
        );
        await tx
          .update(sprintItems)
          .set({
            estimateAtStart: sql`case ${estimateCases} else null::numeric(5, 2) end`,
            doneAtStart: sql`case ${doneCases} else null::boolean end`,
          })
          .where(inArray(sprintItems.id, memberships.map((membership) => membership.id)));
      }
      const startedAt = new Date(data.startAt);
      await appendSprintEventsInTx(tx, [
        {
          type: "sprint_started",
          backlogId: data.backlogId,
          sprintId: sprint.id,
          actorId,
          correlationId,
          occurredAt: startedAt,
        },
      ]);
      if (committedItems.length > 0) {
        await tx.insert(activities).values(
          committedItems.map((item) => ({
            itemId: item.id,
            actorId,
            action: "update" as const,
            field: "sprint_commitment",
            oldValue: null,
            newValue: data.name,
            requestCorrelationId: correlationId,
          })),
        );
      }

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
  requestCorrelationId: string = randomUUID(),
): Promise<CompleteSprintResult> {
  const data = completeSprintSchema.parse(input);
  const correlationId = normalizeRequestCorrelationId(requestCorrelationId);
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

    const allMemberships = await tx
      .select()
      .from(sprintItems)
      .where(eq(sprintItems.sprintId, sprint.id))
      .orderBy(asc(sprintItems.itemId), asc(sprintItems.id))
      .for("update");
    const memberships = allMemberships.filter(
      (membership) => membership.leftAt === null,
    );
    const participantIds = [...new Set(allMemberships.map((membership) => membership.itemId))];
    const participantItems =
      participantIds.length === 0
        ? []
        : await tx
            .select({
              id: items.id,
              backlogId: items.backlogId,
              key: items.key,
              title: items.title,
              type: items.type,
              kind: items.kind,
              statusId: items.statusId,
              statusBacklogId: statuses.backlogId,
              statusCategory: statuses.category,
              estimatePoints: items.estimatePoints,
            })
            .from(items)
            .innerJoin(statuses, eq(statuses.id, items.statusId))
            .where(inArray(items.id, participantIds))
            .orderBy(asc(items.id))
            .for("update");
    if (
      participantItems.length !== participantIds.length ||
      participantItems.some(
        (item) =>
          item.backlogId !== data.backlogId ||
          item.statusBacklogId !== data.backlogId ||
          item.type !== "tache",
      )
    ) {
      throw new Error("Le contenu du sprint est incohérent.");
    }

    const currentMemberIds = memberships.map((membership) => membership.itemId);
    const incompleteSubtasks =
      currentMemberIds.length === 0
        ? []
        : await tx
            .select({ key: items.key, statusCategory: statuses.category })
            .from(items)
            .innerJoin(statuses, eq(statuses.id, items.statusId))
            .where(
              and(
                inArray(items.parentId, currentMemberIds),
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

    const events = await tx
      .select()
      .from(sprintEvents)
      .where(eq(sprintEvents.sprintId, sprint.id))
      .orderBy(asc(sprintEvents.occurredAt), asc(sprintEvents.sequence))
      .for("update");

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

    if (!sprint.startedAt) {
      throw new Error("Le contenu historique du sprint est incohérent.");
    }
    const itemById = new Map(participantItems.map((item) => [item.id, item]));
    const membershipById = new Map(
      allMemberships.map((membership) => [membership.id, membership]),
    );
    const now = new Date();
    const participantEvents: CompletedParticipantEvent[] = [];
    for (const event of events) {
      if (
        event.eventType === "sprint_started" ||
        event.eventType === "sprint_completed"
      ) {
        continue;
      }
      const sourceMembership = event.sourceMembershipId
        ? membershipById.get(event.sourceMembershipId)
        : undefined;
      const sourceItem = sourceMembership
        ? itemById.get(sourceMembership.itemId)
        : undefined;
      if (
        !sourceMembership ||
        !sourceItem ||
        !event.itemId ||
        event.itemId !== sourceItem.id ||
        !event.itemKey ||
        event.itemKey !== sourceItem.key
      ) {
        throw new Error("Le contenu historique du sprint est incohérent.");
      }
      if (event.eventType !== "item_added" && event.eventType !== "item_removed") {
        continue;
      }
      if (event.eventType === "item_added") {
        participantEvents.push({
          type: "item_added",
          membershipId: sourceMembership.id,
          itemKey: sourceItem.key,
          occurredAt: event.occurredAt,
          nextEstimate: event.nextEstimate,
        });
      } else {
        participantEvents.push({
          type: "item_removed",
          membershipId: sourceMembership.id,
          itemKey: sourceItem.key,
          occurredAt: event.occurredAt,
          previousEstimate: event.previousEstimate,
        });
      }
    }
    let participantRows;
    try {
      participantRows = buildCompletedParticipantRows({
        startedAt: sprint.startedAt,
        completedAt: now,
        participants: allMemberships.map((membership) => {
          const item = itemById.get(membership.itemId);
          if (!item) throw new Error("missing participant");
          return {
            membershipId: membership.id,
            itemKey: item.key,
            joinedAt: membership.joinedAt,
            leftAt: membership.leftAt,
            estimateAtJoin: membership.estimateAtJoin,
            estimateAtStart: membership.estimateAtStart,
            doneAtStart: membership.doneAtStart,
            currentEstimate: item.estimatePoints,
            completionOutcome:
              item.statusCategory === "done"
                ? "completed" as const
                : destination
                  ? "carried_to_sprint" as const
                  : "carried_to_backlog" as const,
          };
        }),
        events: participantEvents,
      });
    } catch {
      throw new Error("Le contenu historique du sprint est incohérent.");
    }
    const participantRowByKey = new Map(
      participantRows.map((row) => [row.itemKey, row]),
    );
    if (participantRowByKey.size !== participantRows.length) {
      throw new Error("Le contenu historique du sprint est incohérent.");
    }
    const itemByKey = new Map(participantItems.map((item) => [item.key, item]));

    const scopeEvents: SprintScopeEvent[] = [];
    for (const event of events) {
      switch (event.eventType) {
        case "item_added":
          scopeEvents.push({ type: "item_added", nextEstimate: event.nextEstimate });
          break;
        case "item_removed":
          scopeEvents.push({
            type: "item_removed",
            previousEstimate: event.previousEstimate,
          });
          break;
        case "estimate_changed":
          scopeEvents.push({
            type: "estimate_changed",
            previousEstimate: event.previousEstimate,
            nextEstimate: event.nextEstimate,
          });
          break;
        case "item_completed":
        case "item_reopened":
          scopeEvents.push({ type: event.eventType });
          break;
        case "sprint_started":
        case "sprint_completed":
          break;
      }
    }
    const metrics = calculateSprintScopeMetrics({
      initial: participantRows
        .filter((row) => row.initialCommitment)
        .map((row) => ({ estimateAtStart: row.estimateAtStart })),
      current: memberships.map((membership) => {
        const item = itemById.get(membership.itemId);
        if (!item) throw new Error("Le contenu historique du sprint est incohérent.");
        return {
          estimate: item.estimatePoints,
          done: item.statusCategory === "done",
        };
      }),
      events: scopeEvents,
    });
    const snapshotId = randomUUID();
    const reportItemValues = participantRows.map((row) => {
      const item = itemByKey.get(row.itemKey);
      if (!item) throw new Error("Le contenu historique du sprint est incohérent.");
      return {
        snapshotId,
        backlogId: data.backlogId,
        sprintId: sprint.id,
        sourceItemId: item.id,
        itemKey: item.key,
        itemTitle: item.title,
        itemType: item.type,
        itemKind: item.kind,
        firstJoinedAt: row.firstJoinedAt,
        finalLeftAt: row.finalLeftAt,
        initialCommitment: row.initialCommitment,
        addedAfterStart: row.addedAfterStart,
        removedAfterStart: row.removedAfterStart,
        doneAtStart: row.doneAtStart,
        estimateAtStart: row.estimateAtStart,
        estimateAtFinalParticipation: row.estimateAtFinalParticipation,
        estimateAtCompletion: row.estimateAtCompletion,
        finalStatusCategory: item.statusCategory,
        finalOutcome: row.finalOutcome,
        destinationSprintId:
          row.finalOutcome === "carried_to_sprint" ? destination?.id ?? null : null,
        destinationSprintName:
          row.finalOutcome === "carried_to_sprint" ? destination?.name ?? null : null,
      };
    });
    for (let index = 0; index < reportItemValues.length; index += 1_000) {
      await tx.insert(sprintReportItems).values(
        reportItemValues.slice(index, index + 1_000),
      );
    }
    const carriedItemCount = memberships.filter((membership) => {
      const item = itemById.get(membership.itemId);
      return item?.statusCategory !== "done";
    }).length;
    const finalDestinationSummary = destination
      ? {
          backlog: 0,
          sprints: carriedItemCount === 0
            ? []
            : [{ id: destination.id, name: destination.name, count: carriedItemCount }],
        }
      : { backlog: carriedItemCount, sprints: [] };
    await tx.insert(sprintReportSnapshots).values({
      id: snapshotId,
      backlogId: data.backlogId,
      sprintId: sprint.id,
      sprintName: sprint.name,
      sprintGoal: sprint.goal,
      plannedStartAt: sprint.plannedStartAt,
      plannedEndAt: sprint.plannedEndAt,
      startedAt: sprint.startedAt,
      completedAt: now,
      createdAt: now,
      createdBy: actorId,
      initialItemCount: metrics.initialItemCount,
      committedPoints: metrics.committedPoints,
      initialUnestimatedCount: metrics.initialUnestimatedCount,
      finalItemCount: metrics.currentItemCount,
      completedItemCount: metrics.completedItemCount,
      completedPoints: metrics.completedPoints,
      finalUnestimatedCount: metrics.currentUnestimatedCount,
      grossPointsAdded: metrics.grossAddedPoints,
      grossPointsRemoved: metrics.grossRemovedPoints,
      netEstimateDelta: metrics.netEstimateDelta,
      scopeEventCount: metrics.scopeEventCount,
      finalDestinationSummary,
      requestCorrelationId: correlationId,
    });
    await appendSprintEventsInTx(tx, [
      {
        type: "sprint_completed",
        backlogId: data.backlogId,
        sprintId: sprint.id,
        actorId,
        correlationId,
        occurredAt: now,
      },
    ]);

    let completedItemCount = 0;
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
        requestCorrelationId: correlationId,
      });
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
