import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { activities, backlogs, itemLabels, items, labels, statuses } from "@/lib/db/schema/domain";
import { nextItemKey } from "@/lib/items/key";
import { buildPath, childDepth } from "@/lib/tree/path";
import { isValidParenting } from "@/lib/tree/hierarchy";
import { rankLast } from "@/lib/tree/rank";
import { createItemSchema } from "@/lib/validation/item";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---- reads (no tx) ----
export function listItems(backlogId: string) {
  return db
    .select()
    .from(items)
    .where(and(eq(items.backlogId, backlogId), isNull(items.deletedAt)))
    .orderBy(asc(items.depth), asc(items.rank), asc(items.key));
}

export async function getItemById(id: string) {
  const [row] = await db.select().from(items).where(and(eq(items.id, id), isNull(items.deletedAt)));
  return row ?? null;
}

export async function getItemByKey(key: string) {
  const [row] = await db.select().from(items).where(and(eq(items.key, key), isNull(items.deletedAt)));
  return row ?? null;
}

export function listActivities(itemId: string) {
  return db
    .select()
    .from(activities)
    .where(eq(activities.itemId, itemId))
    .orderBy(asc(activities.at), asc(activities.id));
}

// ---- private helpers (tx) ----
function activityRow(
  itemId: string,
  actorId: string,
  action: typeof activities.$inferInsert.action,
  field: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null,
): typeof activities.$inferInsert {
  return { itemId, actorId, action, field, oldValue, newValue };
}

async function isDoneStatus(tx: Tx, statusId: string): Promise<boolean> {
  const [s] = await tx.select({ category: statuses.category }).from(statuses).where(eq(statuses.id, statusId));
  if (!s) throw new Error("Statut introuvable.");
  return s.category === "done";
}

async function resolveDefaultStatusId(tx: Tx, backlogId: string): Promise<string> {
  const [s] = await tx
    .select({ id: statuses.id })
    .from(statuses)
    .where(and(eq(statuses.backlogId, backlogId), eq(statuses.category, "todo")))
    .orderBy(asc(statuses.order))
    .limit(1);
  if (!s) throw new Error("Aucun statut par défaut pour ce backlog.");
  return s.id;
}

async function resolveStatusInBacklog(
  tx: Tx,
  statusId: string,
  backlogId: string,
): Promise<{ id: string; category: "todo" | "in_progress" | "done" }> {
  const [s] = await tx
    .select({ id: statuses.id, category: statuses.category })
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.backlogId, backlogId)));
  if (!s) throw new Error("Statut invalide pour ce backlog.");
  return s;
}

// ---- createItem: validate → tx(mutate + activity) ----
export async function createItem(input: unknown, actorId: string) {
  const data = createItemSchema.parse(input);
  return db.transaction(async (tx) => {
    const [backlog] = await tx
      .select({ id: backlogs.id, key: backlogs.key })
      .from(backlogs)
      .where(eq(backlogs.id, data.backlogId));
    if (!backlog) throw new Error("Backlog introuvable.");

    let parentPath: string | null = null;
    let parentDepth: number | null = null;
    if (data.parentId) {
      const [parent] = await tx
        .select({
          id: items.id,
          type: items.type,
          path: items.path,
          depth: items.depth,
          backlogId: items.backlogId,
          deletedAt: items.deletedAt,
        })
        .from(items)
        .where(eq(items.id, data.parentId))
        .for("update");
      if (!parent || parent.deletedAt) throw new Error("Parent introuvable.");
      if (parent.backlogId !== data.backlogId) throw new Error("Le parent appartient à un autre backlog.");
      if (!isValidParenting(data.type, parent.type)) throw new Error("Hiérarchie invalide pour ce type.");
      const ancestorDeleted = await tx
        .select({ one: sql`1` })
        .from(items)
        .where(and(sql`${items.path} @> ${parent.path}::ltree`, isNotNull(items.deletedAt)))
        .limit(1);
      if (ancestorDeleted.length > 0) throw new Error("Un ancêtre est supprimé.");
      parentPath = parent.path;
      parentDepth = parent.depth;
    }

    let statusId: string;
    let category: "todo" | "in_progress" | "done";
    if (data.statusId) {
      const s = await resolveStatusInBacklog(tx, data.statusId, data.backlogId);
      statusId = s.id;
      category = s.category;
    } else {
      statusId = await resolveDefaultStatusId(tx, data.backlogId);
      category = "todo";
    }

    const id = randomUUID();
    const path = buildPath(parentPath, id);
    const depth = childDepth(parentDepth);
    const key = await nextItemKey(tx, backlog.key);

    const [lastSibling] = await tx
      .select({ rank: items.rank })
      .from(items)
      .where(
        and(
          eq(items.backlogId, data.backlogId),
          data.parentId ? eq(items.parentId, data.parentId) : isNull(items.parentId),
          isNull(items.deletedAt),
        ),
      )
      .orderBy(desc(items.rank))
      .limit(1)
      .for("update");
    const rank = rankLast(lastSibling?.rank ?? null);

    const closedAt = category === "done" ? new Date() : null;

    const [item] = await tx
      .insert(items)
      .values({
        id,
        key,
        type: data.type,
        backlogId: data.backlogId,
        title: data.title,
        description: data.description ?? null,
        parentId: data.parentId,
        statusId,
        priority: data.priority,
        assigneeId: data.assigneeId ?? null,
        reporterId: actorId,
        rank,
        path,
        depth,
        dueDate: data.dueDate ?? null,
        closedAt,
      })
      .returning();

    if (data.labelIds.length > 0) {
      // Reject labels that belong to ANOTHER backlog (the FK only checks existence).
      // Global labels (backlogId IS NULL) are usable everywhere.
      const valid = await tx
        .select({ id: labels.id })
        .from(labels)
        .where(
          and(
            inArray(labels.id, data.labelIds),
            or(eq(labels.backlogId, data.backlogId), isNull(labels.backlogId)),
          ),
        );
      if (valid.length !== data.labelIds.length) {
        throw new Error("Un ou plusieurs labels n'appartiennent pas à ce backlog.");
      }
      await tx.insert(itemLabels).values(data.labelIds.map((labelId) => ({ itemId: id, labelId })));
    }

    await tx.insert(activities).values(activityRow(id, actorId, "create", null, null, key));

    return item!;
  });
}
