import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, backlogs, items, statuses } from "@/lib/db/schema/domain";
import {
  createStatusSchema,
  deleteStatusSchema,
  reorderStatusesSchema,
  updateStatusSchema,
} from "@/lib/validation/status";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class StatusReplacementRequiredError extends Error {
  constructor(public readonly currentItemCount: number) {
    super("Choisissez un statut de destination pour les items existants.");
    this.name = "StatusReplacementRequiredError";
  }
}

export type StatusIdsByCategory = {
  todo: string[];
  inProgress: string[];
  done: string[];
};

export async function listStatusIdsByCategory(
  backlogId: string,
): Promise<StatusIdsByCategory> {
  const rows = await db
    .select({ id: statuses.id, category: statuses.category })
    .from(statuses)
    .where(eq(statuses.backlogId, backlogId))
    .orderBy(asc(statuses.order), asc(statuses.id));
  return {
    todo: rows.filter(({ category }) => category === "todo").map(({ id }) => id),
    inProgress: rows
      .filter(({ category }) => category === "in_progress")
      .map(({ id }) => id),
    done: rows.filter(({ category }) => category === "done").map(({ id }) => id),
  };
}

export function buildStatusMigrationActivities(
  affected: Array<{ id: string }>,
  current: { id: string; name: string },
  replacement: { id: string; name: string },
  actorId: string,
) {
  return affected.map(({ id }) => ({
    itemId: id,
    actorId,
    action: "status_change" as const,
    field: "status",
    // The source status is deleted in this transaction. Persist its business
    // label so the activity remains readable after the id can no longer resolve.
    oldValue: current.name,
    newValue: replacement.name,
  }));
}

async function lockBacklog(tx: Tx, backlogId: string) {
  const [backlog] = await tx
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.id, backlogId))
    .for("update");
  if (!backlog) throw new Error("Backlog introuvable.");
}

async function assertUniqueName(
  tx: Tx,
  backlogId: string,
  statusName: string,
  exceptId?: string,
) {
  const [duplicate] = await tx
    .select({ id: statuses.id })
    .from(statuses)
    .where(
      and(
        eq(statuses.backlogId, backlogId),
        sql`lower(${statuses.name}) = lower(${statusName})`,
        exceptId ? ne(statuses.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (duplicate) throw new Error("Un statut portant ce nom existe déjà.");
}

export async function createStatus(input: unknown) {
  const data = createStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    await assertUniqueName(tx, data.backlogId, data.name);
    const [last] = await tx
      .select({ order: statuses.order })
      .from(statuses)
      .where(eq(statuses.backlogId, data.backlogId))
      .orderBy(desc(statuses.order))
      .limit(1);
    const [created] = await tx
      .insert(statuses)
      .values({ ...data, order: (last?.order ?? -1) + 1 })
      .returning();
    return created!;
  });
}

export async function updateStatus(input: unknown, actorId: string) {
  const data = updateStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const [current] = await tx
      .select()
      .from(statuses)
      .where(and(eq(statuses.id, data.id), eq(statuses.backlogId, data.backlogId)))
      .for("update");
    if (!current) throw new Error("Statut introuvable.");
    await assertUniqueName(tx, data.backlogId, data.name, data.id);

    if (current.category !== data.category) {
      const sameCategoryCount = await tx
        .select({ id: statuses.id })
        .from(statuses)
        .where(
          and(
            eq(statuses.backlogId, data.backlogId),
            eq(statuses.category, current.category),
          ),
        );
      if (current.category === "todo" && sameCategoryCount.length <= 1) {
        throw new Error("Le workflow doit conserver au moins un statut initial.");
      }
      if (current.category === "done" && sameCategoryCount.length <= 1) {
        throw new Error("Le workflow doit conserver au moins un statut terminé.");
      }
    }

    const [updated] = await tx
      .update(statuses)
      .set({ name: data.name, category: data.category, color: data.color })
      .where(eq(statuses.id, data.id))
      .returning();

    if (current.category !== data.category) {
      const affected = await tx
        .select({ id: items.id })
        .from(items)
        .where(eq(items.statusId, data.id));
      if (current.category !== "done" && data.category === "done") {
        await tx.update(items).set({ closedAt: new Date() }).where(eq(items.statusId, data.id));
      } else if (current.category === "done" && data.category !== "done") {
        await tx.update(items).set({ closedAt: null }).where(eq(items.statusId, data.id));
      }
      if (affected.length > 0) {
        await tx.insert(activities).values(
          affected.map(({ id }) => ({
            itemId: id,
            actorId,
            action: "update" as const,
            field: "status_category",
            oldValue: current.category,
            newValue: data.category,
          })),
        );
      }
    }
    return updated!;
  });
}

export async function reorderStatuses(input: unknown) {
  const data = reorderStatusesSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const current = await tx
      .select({ id: statuses.id })
      .from(statuses)
      .where(eq(statuses.backlogId, data.backlogId))
      .orderBy(asc(statuses.order))
      .for("update");
    const currentIds = new Set(current.map(({ id }) => id));
    if (
      current.length !== data.statusIds.length ||
      data.statusIds.some((id) => !currentIds.has(id))
    ) {
      throw new Error("La liste des statuts est incomplète.");
    }
    for (const [order, id] of data.statusIds.entries()) {
      await tx.update(statuses).set({ order }).where(eq(statuses.id, id));
    }
    return data.statusIds;
  });
}

export async function deleteStatus(input: unknown, actorId: string) {
  const data = deleteStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const statusRows = await tx
      .select()
      .from(statuses)
      .where(eq(statuses.backlogId, data.backlogId))
      .orderBy(asc(statuses.order))
      .for("update");
    const current = statusRows.find(({ id }) => id === data.id);
    if (!current) throw new Error("Statut introuvable.");
    if (statusRows.length <= 1) throw new Error("Le workflow doit conserver au moins un statut.");
    if (
      current.category === "todo" &&
      statusRows.filter(({ category }) => category === "todo").length <= 1
    ) {
      throw new Error("Le workflow doit conserver au moins un statut initial.");
    }
    if (
      current.category === "done" &&
      statusRows.filter(({ category }) => category === "done").length <= 1
    ) {
      throw new Error("Le workflow doit conserver au moins un statut terminé.");
    }

    const affected = await tx
      .select({ id: items.id })
      .from(items)
      .where(eq(items.statusId, current.id))
      .for("update");
    const replacement = data.replacementStatusId
      ? statusRows.find(({ id }) => id === data.replacementStatusId)
      : null;
    if (data.replacementStatusId && !replacement) {
      throw new Error("Statut de destination introuvable.");
    }
    if (affected.length > 0 && !replacement) {
      throw new StatusReplacementRequiredError(affected.length);
    }

    if (replacement && affected.length > 0) {
      const closedAtPatch =
        current.category !== "done" && replacement.category === "done"
          ? { closedAt: new Date() }
          : current.category === "done" && replacement.category !== "done"
            ? { closedAt: null }
            : {};
      await tx
        .update(items)
        .set({ statusId: replacement.id, ...closedAtPatch })
        .where(eq(items.statusId, current.id));
      await tx
        .insert(activities)
        .values(buildStatusMigrationActivities(affected, current, replacement, actorId));
    }

    // Any earlier transition to or from this status would otherwise expose an
    // unresolvable UUID after deletion. Freeze those references as the visible
    // business name before removing the status row.
    await tx
      .update(activities)
      .set({ oldValue: current.name })
      .where(
        and(
          eq(activities.action, "status_change"),
          eq(activities.oldValue, current.id),
        ),
      );
    await tx
      .update(activities)
      .set({ newValue: current.name })
      .where(
        and(
          eq(activities.action, "status_change"),
          eq(activities.newValue, current.id),
        ),
      );

    await tx.delete(statuses).where(eq(statuses.id, current.id));
    const remaining = statusRows.filter(({ id }) => id !== current.id);
    for (const [order, status] of remaining.entries()) {
      await tx.update(statuses).set({ order }).where(eq(statuses.id, status.id));
    }
    return { deletedId: current.id, migratedItems: affected.length };
  });
}
