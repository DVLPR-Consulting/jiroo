
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { activityAttribution } from "@/lib/auth/actor-context";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { nextItemRevision } from "@/lib/services/item-revision";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogs, items, statuses } from "@/lib/db/schema/domain";
import { bulkChangeItemFixVersionsInTx } from "@/lib/services/item-fix-versions";
import { assignItemsToSprintInTx } from "@/lib/services/sprint-membership";
import {
  normalizeRequestCorrelationId,
  recordActiveItemMutationsInTx,
  type ActiveItemMutation,
} from "@/lib/services/sprint-events";
import {
  bulkUpdateItemsSchema,
  type BulkItemPatch,
} from "@/lib/validation/bulk-item";

type ItemRow = typeof items.$inferSelect;
type ItemPatch = Partial<typeof items.$inferInsert>;

function valueString(value: number | string | null): string | null {
  return value === null ? null : String(value);
}

function activityForPatch(
  row: ItemRow,
  actorId: string,
  patch: BulkItemPatch,
): typeof activities.$inferInsert {
  switch (patch.field) {
    case "priority":
      return {
        itemId: row.id,
        actorId,
        action: "update",
        field: "priority",
        oldValue: String(row.priority),
        newValue: String(patch.value),
      };
    case "assigneeId":
      return {
        itemId: row.id,
        actorId,
        action: "update",
        field: "assignee",
        oldValue: row.assigneeId,
        newValue: patch.value,
      };
    case "estimatePoints":
      return {
        itemId: row.id,
        actorId,
        action: "update",
        field: "estimate_points",
        oldValue: valueString(row.estimatePoints),
        newValue: valueString(patch.value),
      };
    case "statusId":
      return {
        itemId: row.id,
        actorId,
        action: "status_change",
        field: "status",
        oldValue: row.statusId,
        newValue: patch.value,
      };
    case "sprintId":
      throw new Error("Le patch sprint doit utiliser la transaction d’appartenance.");
    case "fixVersionIds":
      throw new Error("Le patch de versions doit utiliser la transaction de versions.");
  }
}

export async function bulkUpdateItems(
  input: unknown,
  actorId: string,
  requestCorrelationId: string = randomUUID(),
) {
  const data = bulkUpdateItemsSchema.parse(input);
  const correlationId = normalizeRequestCorrelationId(requestCorrelationId);

  return db.transaction(async (tx) => {
    const [backlog] = await tx
      .select({ id: backlogs.id })
      .from(backlogs)
      .where(eq(backlogs.id, data.backlogId))
      .for("update");
    if (!backlog) throw new Error("Backlog introuvable.");

    if (data.patch.field === "sprintId") {
      return assignItemsToSprintInTx(
        tx,
        {
          backlogId: data.backlogId,
          itemIds: data.itemIds,
          sprintId: data.patch.value,
        },
        actorId,
        correlationId,
      );
    }

    const selected = await tx
      .select()
      .from(items)
      .where(and(
        eq(items.backlogId, data.backlogId),
        inArray(items.id, data.itemIds),
        isNull(items.deletedAt),
      ))
      .orderBy(asc(items.id))
      .for("update");
    if (selected.length !== data.itemIds.length) {
      throw new Error("Un ou plusieurs items sont introuvables.");
    }
    if (data.patch.field === "fixVersionIds") {
      return bulkChangeItemFixVersionsInTx(
        tx,
        {
          backlogId: data.backlogId,
          itemIds: data.itemIds,
          mode: data.patch.mode,
          releaseIds: data.patch.value,
        },
        actorId,
        correlationId,
      );
    }

    let destinationStatus:
      | { id: string; category: "todo" | "in_progress" | "done" }
      | undefined;
    let statusCategoryById = new Map<
      string,
      "todo" | "in_progress" | "done"
    >();
    if (data.patch.field === "statusId") {
      const [destination] = await tx
        .select({ id: statuses.id, category: statuses.category })
        .from(statuses)
        .where(
          and(
            eq(statuses.id, data.patch.value),
            eq(statuses.backlogId, data.backlogId),
          ),
        );
      if (!destination) throw new Error("Statut invalide pour ce backlog.");
      destinationStatus = destination;
      const currentStatusIds = [...new Set(selected.map((row) => row.statusId))];
      const currentStatuses = await tx
        .select({ id: statuses.id, category: statuses.category })
        .from(statuses)
        .where(inArray(statuses.id, currentStatusIds));
      statusCategoryById = new Map(
        currentStatuses.map((status) => [status.id, status.category]),
      );
    }

    if (data.patch.field === "assigneeId" && data.patch.value !== null) {
      const [assignee] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, data.patch.value));
      if (!assignee) throw new Error("Assigné introuvable.");
    }

    if (
      data.patch.field === "estimatePoints" &&
      selected.some((row) => row.type !== "tache")
    ) {
      throw new Error("Seules les tâches peuvent être estimées.");
    }

    const now = new Date();
    let changedCount = 0;
    const reportingMutations: ActiveItemMutation[] = [];
    for (const row of selected) {
      const patch: ItemPatch = {};
      let changed = false;
      const reportingMutation: ActiveItemMutation = {
        item: { id: row.id, key: row.key, title: row.title },
      };

      switch (data.patch.field) {
        case "priority":
          changed = row.priority !== data.patch.value;
          if (changed) patch.priority = data.patch.value;
          break;
        case "assigneeId":
          changed = row.assigneeId !== data.patch.value;
          if (changed) patch.assigneeId = data.patch.value;
          break;
        case "estimatePoints":
          changed = row.estimatePoints !== data.patch.value;
          if (changed) {
            patch.estimatePoints = data.patch.value;
            reportingMutation.estimate = {
              previous: row.estimatePoints,
              next: data.patch.value,
            };
          }
          break;
        case "statusId": {
          changed = row.statusId !== data.patch.value;
          if (!changed) break;
          patch.statusId = data.patch.value;
          const wasDone = statusCategoryById.get(row.statusId) === "done";
          const nowDone = destinationStatus?.category === "done";
          if (nowDone && !wasDone) patch.closedAt = now;
          if (!nowDone && wasDone) patch.closedAt = null;
          reportingMutation.done = {
            previous: wasDone,
            next: nowDone,
          };
          break;
        }
      }

      if (!changed) continue;
      await tx
        .update(items)
        .set({ ...patch, updatedAt: nextItemRevision() })
        .where(eq(items.id, row.id));
      await tx.insert(activities).values({
        ...activityAttribution(),
        ...activityForPatch(row, actorId, data.patch),
        requestCorrelationId: correlationId,
      });
      if (reportingMutation.estimate || reportingMutation.done) {
        reportingMutations.push(reportingMutation);
      }
      changedCount += 1;
    }

    await recordActiveItemMutationsInTx(tx, {
      backlogId: data.backlogId,
      actorId,
      correlationId,
      occurredAt: now,
      mutations: reportingMutations,
    });

    return {
      changedCount,
      unchangedCount: selected.length - changedCount,
    };
  });
}
