import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activities,
  backlogs,
  items,
  sprintItems,
  sprints,
} from "@/lib/db/schema/domain";

export type SprintTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function assignItemsToSprintInTx(
  tx: SprintTx,
  input: { backlogId: string; itemIds: string[]; sprintId: string | null },
  actorId: string,
): Promise<{ changedCount: number; unchangedCount: number }> {
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

  const selected = await tx
    .select()
    .from(items)
    .where(and(inArray(items.id, input.itemIds), isNull(items.deletedAt)))
    .orderBy(asc(items.id))
    .for("update");
  if (selected.length !== input.itemIds.length) {
    throw new Error("Un ou plusieurs items sont introuvables.");
  }
  if (selected.some((row) => row.backlogId !== input.backlogId)) {
    throw new Error("Tous les items doivent appartenir au backlog.");
  }
  if (selected.some((row) => row.type !== "tache")) {
    throw new Error("Seules les tâches peuvent être planifiées dans un sprint.");
  }

  const currentRows = await tx
    .select()
    .from(sprintItems)
    .where(
      and(inArray(sprintItems.itemId, input.itemIds), isNull(sprintItems.leftAt)),
    )
    .orderBy(asc(sprintItems.itemId))
    .for("update");
  const currentByItem = new Map(currentRows.map((row) => [row.itemId, row]));
  const now = new Date();
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
    }
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
      oldValue: currentSprint?.name ?? null,
      newValue: destination?.name ?? null,
    });
    changedCount += 1;
  }

  return {
    changedCount,
    unchangedCount: selected.length - changedCount,
  };
}
