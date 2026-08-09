import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activities,
  backlogs,
  items,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import {
  appendSprintEventsInTx,
  normalizeRequestCorrelationId,
  type SprintEventCommand,
} from "@/lib/services/sprint-events";

export type SprintTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function assignItemsToSprintInTx(
  tx: SprintTx,
  input: { backlogId: string; itemIds: string[]; sprintId: string | null },
  actorId: string,
  requestCorrelationId: string,
): Promise<{ changedCount: number; unchangedCount: number }> {
  const correlationId = normalizeRequestCorrelationId(requestCorrelationId);
  const [backlog] = await tx
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.id, input.backlogId))
    .for("update");
  if (!backlog) throw new Error("Backlog introuvable.");

  const currentProbe = await tx
    .select({ sprintId: sprintItems.sprintId })
    .from(sprintItems)
    .where(
      and(inArray(sprintItems.itemId, input.itemIds), isNull(sprintItems.leftAt)),
    );
  const sprintIds = [
    ...new Set([
      ...currentProbe.map((row) => row.sprintId),
      ...(input.sprintId ? [input.sprintId] : []),
    ]),
  ].sort();
  const lockedSprints = sprintIds.length
    ? await tx
        .select({
          id: sprints.id,
          backlogId: sprints.backlogId,
          name: sprints.name,
          state: sprints.state,
        })
        .from(sprints)
        .where(inArray(sprints.id, sprintIds))
        .orderBy(asc(sprints.id))
        .for("update")
    : [];
  const sprintById = new Map(lockedSprints.map((row) => [row.id, row]));
  const destination = input.sprintId ? sprintById.get(input.sprintId) : null;
  if (input.sprintId && !destination) throw new Error("Sprint introuvable.");
  if (destination?.backlogId !== undefined && destination.backlogId !== input.backlogId) {
    throw new Error("Le sprint appartient à un autre backlog.");
  }
  if (destination?.state === "completed") {
    throw new Error("Un sprint terminé ne peut plus recevoir d’items.");
  }

  const currentRows = await tx
    .select()
    .from(sprintItems)
    .where(
      and(inArray(sprintItems.itemId, input.itemIds), isNull(sprintItems.leftAt)),
    )
    .orderBy(asc(sprintItems.itemId))
    .for("update");

  const selected = await tx
    .select({
      id: items.id,
      backlogId: items.backlogId,
      key: items.key,
      title: items.title,
      type: items.type,
      estimatePoints: items.estimatePoints,
      statusBacklogId: statuses.backlogId,
      statusCategory: statuses.category,
    })
    .from(items)
    .innerJoin(statuses, eq(items.statusId, statuses.id))
    .where(and(inArray(items.id, input.itemIds), isNull(items.deletedAt)))
    .orderBy(asc(items.id))
    .for("update");
  if (selected.length !== input.itemIds.length) {
    throw new Error("Un ou plusieurs items sont introuvables.");
  }
  if (selected.some((row) => row.backlogId !== input.backlogId)) {
    throw new Error("Tous les items doivent appartenir au backlog.");
  }
  if (selected.some((row) => row.statusBacklogId !== input.backlogId)) {
    throw new Error("Le statut d’un item appartient à un autre backlog.");
  }
  if (selected.some((row) => row.type !== "tache")) {
    throw new Error("Seules les tâches peuvent être planifiées dans un sprint.");
  }

  const currentByItem = new Map(currentRows.map((row) => [row.itemId, row]));
  const now = new Date();
  const eventCommands: SprintEventCommand[] = [];
  const activityRows: (typeof activities.$inferInsert)[] = [];
  let changedCount = 0;

  for (const item of selected) {
    const current = currentByItem.get(item.id);
    if ((current?.sprintId ?? null) === input.sprintId) continue;
    const currentSprint = current ? sprintById.get(current.sprintId) : null;
    if (current && (!currentSprint || currentSprint.backlogId !== input.backlogId)) {
      throw new Error("L’appartenance sprint de l’item est incohérente.");
    }

    if (current) {
      await tx
        .update(sprintItems)
        .set({ leftAt: now, outcome: "removed" })
        .where(eq(sprintItems.id, current.id));
      if (currentSprint?.state === "active") {
        eventCommands.push({
          type: "item_removed",
          backlogId: input.backlogId,
          sprintId: currentSprint.id,
          membershipId: current.id,
          item: { id: item.id, key: item.key, title: item.title },
          previousEstimate: item.estimatePoints,
          reason: destination ? "moved" : "manual",
          relatedSprint: destination
            ? { id: destination.id, name: destination.name }
            : null,
          actorId,
          correlationId,
          occurredAt: now,
        });
      }
    }
    if (destination) {
      const [membership] = await tx
        .insert(sprintItems)
        .values({
          sprintId: destination.id,
          itemId: item.id,
          joinedAt: now,
          joinedBy: actorId,
          estimateAtJoin: item.estimatePoints,
          doneAtStart: destination.state === "active"
            ? item.statusCategory === "done"
            : null,
        })
        .returning({ id: sprintItems.id });
      if (!membership) throw new Error("Création de l’appartenance sprint impossible.");
      if (destination.state === "active") {
        eventCommands.push({
          type: "item_added",
          backlogId: input.backlogId,
          sprintId: destination.id,
          membershipId: membership.id,
          item: { id: item.id, key: item.key, title: item.title },
          nextEstimate: item.estimatePoints,
          nextDone: item.statusCategory === "done",
          relatedSprint: currentSprint
            ? { id: currentSprint.id, name: currentSprint.name }
            : null,
          actorId,
          correlationId,
          occurredAt: now,
        });
      }
    }
    activityRows.push({
      itemId: item.id,
      actorId,
      action: "update",
      field: "sprint",
      oldValue: currentSprint?.name ?? null,
      newValue: destination?.name ?? null,
      requestCorrelationId: correlationId,
    });
    changedCount += 1;
  }

  await appendSprintEventsInTx(tx, eventCommands);
  if (activityRows.length > 0) {
    await tx.insert(activities).values(activityRows);
  }

  return {
    changedCount,
    unchangedCount: selected.length - changedCount,
  };
}
