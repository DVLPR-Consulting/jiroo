import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { activities, backlogs, itemLabels, items, labels, statuses } from "@/lib/db/schema/domain";
import { user } from "@/lib/db/schema/auth";
import { nextItemKey } from "@/lib/items/key";
import { ROOT_LABEL, buildPath, childDepth } from "@/lib/tree/path";
import { isValidParenting } from "@/lib/tree/hierarchy";
import { rankBetween, rankFirst, rankLast } from "@/lib/tree/rank";
import { createItemSchema, idInputSchema, moveItemSchema, reparentItemSchema, updateItemSchema } from "@/lib/validation/item";

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

export function listLabelsForBacklog(backlogId: string) {
  return db
    .select()
    .from(labels)
    .where(or(eq(labels.backlogId, backlogId), isNull(labels.backlogId)))
    .orderBy(asc(labels.name));
}

export async function getItemLabelIds(itemId: string): Promise<string[]> {
  const rows = await db.select({ labelId: itemLabels.labelId }).from(itemLabels).where(eq(itemLabels.itemId, itemId));
  return rows.map((r) => r.labelId);
}

export function listUsers() {
  return db.select({ id: user.id, name: user.name, email: user.email }).from(user);
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

const RETRYABLE_PG_CODES = new Set(["40P01", "40001", "23505"]);

// Retry a transaction on Postgres deadlock (40P01), serialization (40001),
// or unique-violation (23505 — used by the rank-collision re-midpoint path).
export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code && RETRYABLE_PG_CODES.has(code) && attempt < tries - 1) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Extracted from updateItem's status-change block (used by updateItem AND moveItem).
// Returns null on a no-op (same status). closed_at follows the DONE CATEGORY of the
// OLD vs NEW status (never closed_at!=null).
async function applyStatusChange(
  tx: Tx,
  cur: typeof items.$inferSelect,
  statusId: string,
  actorId: string,
): Promise<{ patch: Partial<typeof items.$inferInsert>; act: typeof activities.$inferInsert } | null> {
  if (statusId === cur.statusId) return null;
  const s = await resolveStatusInBacklog(tx, statusId, cur.backlogId);
  const wasDone = await isDoneStatus(tx, cur.statusId);
  const nowDone = s.category === "done";
  const patch: Partial<typeof items.$inferInsert> = { statusId: s.id };
  if (nowDone && !wasDone) patch.closedAt = new Date();
  else if (!nowDone && wasDone) patch.closedAt = null;
  return { patch, act: activityRow(cur.id, actorId, "status_change", "status", cur.statusId, s.id) };
}

// Server-authoritative drop rank. Client passes neighbor ids (never a rank). Locks the named
// neighbors FOR UPDATE (rank ASC = stable lock order), re-derives a missing bound from the DB,
// normalizes inverted neighbors, and appends against the LIVE group tail for collapsed/empty
// cases. parentId is the sibling group (board: cur.parentId unchanged; reparent: the NEW parent).
export async function rankAtDrop(
  tx: Tx,
  backlogId: string,
  parentId: string | null,
  movedId: string,
  beforeId: string | null,
  afterId: string | null,
): Promise<string> {
  const parentFilter = parentId === null ? isNull(items.parentId) : eq(items.parentId, parentId);
  const groupBase = and(
    eq(items.backlogId, backlogId),
    parentFilter,
    isNull(items.deletedAt),
    ne(items.id, movedId),
  );

  const wanted = [beforeId, afterId].filter((x): x is string => x !== null && x !== movedId);
  const byId = new Map<string, string>();
  if (wanted.length > 0) {
    const rows = await tx
      .select({ id: items.id, rank: items.rank })
      .from(items)
      .where(and(groupBase, inArray(items.id, wanted)))
      .orderBy(asc(items.rank))
      .for("update");
    for (const r of rows) byId.set(r.id, r.rank);
  }
  let before = beforeId ? (byId.get(beforeId) ?? null) : null;
  let after = afterId ? (byId.get(afterId) ?? null) : null;

  // D3: re-derive a missing bound from the DB (a forgotten interior neighbor self-heals).
  if (before === null && after !== null) {
    const [r] = await tx
      .select({ rank: items.rank })
      .from(items)
      .where(and(groupBase, sql`${items.rank} < ${after}`))
      .orderBy(desc(items.rank))
      .limit(1)
      .for("update");
    before = r?.rank ?? null;
  } else if (after === null && before !== null) {
    const [r] = await tx
      .select({ rank: items.rank })
      .from(items)
      .where(and(groupBase, sql`${items.rank} > ${before}`))
      .orderBy(asc(items.rank))
      .limit(1)
      .for("update");
    after = r?.rank ?? null;
  }

  // D2: normalize inverted client neighbors.
  if (before !== null && after !== null && before > after) {
    const tmp = before;
    before = after;
    after = tmp;
  }

  // Append against the LIVE group tail (collapsed or no-bounds): strictly-increasing serialized appends.
  async function appendLast(): Promise<string> {
    const [last] = await tx
      .select({ rank: items.rank })
      .from(items)
      .where(groupBase)
      .orderBy(desc(items.rank))
      .limit(1)
      .for("update");
    return rankLast(last?.rank ?? null);
  }

  if (before !== null && after !== null) {
    if (before === after) return appendLast();
    // Self-heal under concurrent same-gap drops: a winner may have committed a rank strictly
    // inside (before, after). Tighten to the nearest in-gap live sibling so a withRetry attempt
    // lands at a fresh adjacent rank instead of deterministically re-colliding on the unique index.
    const [mid] = await tx
      .select({ rank: items.rank })
      .from(items)
      .where(and(groupBase, sql`${items.rank} > ${before}`, sql`${items.rank} < ${after}`))
      .orderBy(asc(items.rank))
      .limit(1)
      .for("update");
    if (mid) return rankBetween(before, mid.rank);
    return rankBetween(before, after);
  }
  if (after !== null) return rankFirst(after);
  if (before !== null) return rankLast(before);
  return appendLast(); // empty group → rankLast(null) = "a0"
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

// ---- updateItem: field-diff → tx(update + per-field activity) ----
export async function updateItem(input: unknown, actorId: string) {
  const data = updateItemSchema.parse(input);
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(items)
      .where(and(eq(items.id, data.id), isNull(items.deletedAt)))
      .for("update");
    if (!cur) return null;

    const patch: Partial<typeof items.$inferInsert> = {};
    const acts: (typeof activities.$inferInsert)[] = [];

    if (data.title !== undefined && data.title !== cur.title) {
      patch.title = data.title;
      acts.push(activityRow(cur.id, actorId, "update", "title", cur.title, data.title));
    }
    if (data.description !== undefined && (data.description ?? null) !== cur.description) {
      patch.description = data.description ?? null;
      acts.push(activityRow(cur.id, actorId, "update", "description", cur.description, data.description ?? null));
    }
    if (data.priority !== undefined && data.priority !== cur.priority) {
      patch.priority = data.priority;
      acts.push(activityRow(cur.id, actorId, "update", "priority", String(cur.priority), String(data.priority)));
    }
    if (data.assigneeId !== undefined && (data.assigneeId ?? null) !== cur.assigneeId) {
      patch.assigneeId = data.assigneeId ?? null;
      acts.push(activityRow(cur.id, actorId, "update", "assignee", cur.assigneeId, data.assigneeId ?? null));
    }
    if (data.dueDate !== undefined) {
      const newDue = data.dueDate ?? null;
      const curT = cur.dueDate ? cur.dueDate.getTime() : null;
      const newT = newDue ? newDue.getTime() : null;
      if (curT !== newT) {
        patch.dueDate = newDue;
        acts.push(
          activityRow(
            cur.id,
            actorId,
            "update",
            "due_date",
            cur.dueDate ? cur.dueDate.toISOString() : null,
            newDue ? newDue.toISOString() : null,
          ),
        );
      }
    }
    if (data.statusId !== undefined) {
      const sc = await applyStatusChange(tx, cur, data.statusId, actorId);
      if (sc) {
        Object.assign(patch, sc.patch);
        acts.push(sc.act);
      }
    }
    if (data.labelIds !== undefined) {
      if (data.labelIds.length > 0) {
        const valid = await tx
          .select({ id: labels.id })
          .from(labels)
          .where(
            and(
              inArray(labels.id, data.labelIds),
              or(eq(labels.backlogId, cur.backlogId), isNull(labels.backlogId)),
            ),
          );
        if (valid.length !== data.labelIds.length) {
          throw new Error("Un ou plusieurs labels n'appartiennent pas à ce backlog.");
        }
      }
      const current = await tx
        .select({ labelId: itemLabels.labelId })
        .from(itemLabels)
        .where(eq(itemLabels.itemId, cur.id));
      const curSet = new Set(current.map((r) => r.labelId));
      const newSet = new Set(data.labelIds);
      const toAdd = data.labelIds.filter((l) => !curSet.has(l));
      const toRemove = [...curSet].filter((l) => !newSet.has(l));
      if (toAdd.length > 0 || toRemove.length > 0) {
        if (toRemove.length > 0) {
          await tx
            .delete(itemLabels)
            .where(and(eq(itemLabels.itemId, cur.id), inArray(itemLabels.labelId, toRemove)));
        }
        if (toAdd.length > 0) {
          await tx.insert(itemLabels).values(toAdd.map((labelId) => ({ itemId: cur.id, labelId })));
        }
        const oldCsv = [...curSet].sort().join(",") || null;
        const newCsv = [...newSet].sort().join(",") || null;
        acts.push(activityRow(cur.id, actorId, "update", "labels", oldCsv, newCsv));
      }
    }

    if (acts.length === 0) return cur;

    const [updated] = await tx
      .update(items)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(items.id, cur.id))
      .returning();
    await tx.insert(activities).values(acts);
    return updated!;
  });
}

// Board drag: status change and/or reorder WITHIN cur's OWN (backlogId, parentId) sibling group.
// NEVER touches path/depth/parentId — the board column is a STATUS, not a parent, so the ltree
// path is invariant and the path CHECK is never exposed.
export async function moveItem(input: unknown, actorId: string) {
  const data = moveItemSchema.parse(input);
  return withRetry(() =>
    db.transaction(async (tx) => {
      const [cur] = await tx
        .select()
        .from(items)
        .where(and(eq(items.id, data.id), isNull(items.deletedAt)))
        .for("update");
      if (!cur) return null;

      const patch: Partial<typeof items.$inferInsert> = {};
      const acts: (typeof activities.$inferInsert)[] = [];

      if (data.statusId !== undefined) {
        const sc = await applyStatusChange(tx, cur, data.statusId, actorId);
        if (sc) {
          Object.assign(patch, sc.patch);
          acts.push(sc.act);
        }
      }

      const newRank = await rankAtDrop(tx, cur.backlogId, cur.parentId, cur.id, data.beforeId, data.afterId);
      if (newRank !== cur.rank) {
        patch.rank = newRank;
        acts.push(activityRow(cur.id, actorId, "move", "rank", cur.rank, newRank));
      }

      if (acts.length === 0) return cur;

      const [updated] = await tx
        .update(items)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(items.id, cur.id))
        .returning();
      await tx.insert(activities).values(acts);
      return updated!;
    }),
  );
}

// ---- softDeleteItem: subtree lock → cascade soft-delete + per-node activity ----
export async function softDeleteItem(input: unknown, actorId: string) {
  const { id } = idInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(items)
      .where(and(eq(items.id, id), isNull(items.deletedAt)))
      .for("update");
    if (!target) return null;

    const subtree = and(
      eq(items.backlogId, target.backlogId),
      sql`${items.path} <@ ${target.path}::ltree`,
      isNull(items.deletedAt),
    );
    // lock the whole live subtree so concurrent creates under it block
    await tx.select({ id: items.id }).from(items).where(subtree).for("update");

    const now = new Date();
    const affected = await tx
      .update(items)
      .set({ deletedAt: now })
      .where(subtree)
      .returning({ id: items.id });

    if (affected.length > 0) {
      await tx
        .insert(activities)
        .values(
          affected.map((r) => activityRow(r.id, actorId, "delete", "deleted_at", null, now.toISOString())),
        );
    }
    return target;
  });
}

// ---- restoreItem: orphan guard → cascade restore + inverted activity ----
export async function restoreItem(input: unknown, actorId: string) {
  const { id } = idInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(items)
      .where(and(eq(items.id, id), isNotNull(items.deletedAt)))
      .for("update");
    if (!target) return null;

    if (target.parentId) {
      const [parent] = await tx
        .select({ id: items.id, deletedAt: items.deletedAt })
        .from(items)
        .where(eq(items.id, target.parentId))
        .for("update");
      if (!parent || parent.deletedAt) throw new Error("Parent supprimé : restaurez-le d'abord.");
    }

    const subtree = and(
      eq(items.backlogId, target.backlogId),
      sql`${items.path} <@ ${target.path}::ltree`,
      isNotNull(items.deletedAt),
    );
    const affected = await tx
      .update(items)
      .set({ deletedAt: null })
      .where(subtree)
      .returning({ id: items.id });

    if (affected.length > 0) {
      await tx
        .insert(activities)
        .values(affected.map((r) => activityRow(r.id, actorId, "delete", "deleted_at", "deleted", null)));
    }
    return target;
  });
}

// Tree reparent: change parentId + rewrite the ltree path/depth of the node AND its whole subtree.
// NEVER touches statusId. The path-rewrite splices against the PARENT path at offset oldLevels-1
// (the naive subpath(path, oldLevels) THROWS `invalid positions` on the node's own row — verified).
export async function reparentItem(input: unknown, actorId: string) {
  const data = reparentItemSchema.parse(input);
  return withRetry(() =>
    db.transaction(async (tx) => {
      const [node] = await tx
        .select()
        .from(items)
        .where(and(eq(items.id, data.id), isNull(items.deletedAt)))
        .for("update");
      if (!node) return null;

      const sameParent = (node.parentId ?? null) === (data.newParentId ?? null);

      let parentPath: string | null = null;
      let parentDepth: number | null = null;
      if (data.newParentId !== null) {
        if (data.newParentId === node.id) throw new Error("Cycle : un item ne peut pas être son propre parent.");
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
          .where(eq(items.id, data.newParentId))
          .for("update");
        if (!parent || parent.deletedAt) throw new Error("Parent introuvable.");
        if (parent.backlogId !== node.backlogId) throw new Error("Le parent appartient à un autre backlog.");
        if (!isValidParenting(node.type, parent.type)) throw new Error("Hiérarchie invalide pour ce type.");
        // cycle guard: the new parent must NOT be the node or a descendant of it (self-inclusive <@)
        const cyc = await tx
          .select({ one: sql`1` })
          .from(items)
          .where(and(eq(items.id, parent.id), sql`${items.path} <@ ${node.path}::ltree`))
          .limit(1);
        if (cyc.length > 0) throw new Error("Cycle : le nouveau parent est dans le sous-arbre déplacé.");
        // ancestor-deleted guard
        const ancDel = await tx
          .select({ one: sql`1` })
          .from(items)
          .where(and(sql`${items.path} @> ${parent.path}::ltree`, isNotNull(items.deletedAt)))
          .limit(1);
        if (ancDel.length > 0) throw new Error("Un ancêtre est supprimé.");
        parentPath = parent.path;
        parentDepth = parent.depth;
      } else if (!isValidParenting(node.type, null)) {
        throw new Error("Hiérarchie invalide pour ce type.");
      }

      if (!sameParent) {
        // lock the whole moved subtree (asc(path)) before the rewrite
        const subtree = and(
          eq(items.backlogId, node.backlogId),
          sql`${items.path} <@ ${node.path}::ltree`,
          isNull(items.deletedAt),
        );
        await tx.select({ id: items.id }).from(items).where(subtree).orderBy(asc(items.path)).for("update");

        const oldLevels = node.path.split(".").length; // = nlevel(node.path)
        const newNodeDepth = childDepth(parentDepth);
        const depthDelta = newNodeDepth - node.depth;
        const newBase = parentPath ?? ROOT_LABEL;

        await tx
          .update(items)
          .set({
            path: sql`(${newBase}::ltree || subpath(${items.path}, ${oldLevels - 1}))`,
            depth: sql`${items.depth} + ${depthDelta}`,
            updatedAt: new Date(),
          })
          .where(subtree);
      }

      // rank under the NEW (or same) parent group
      const newRank = await rankAtDrop(tx, node.backlogId, data.newParentId, node.id, data.beforeId, data.afterId);

      const patch: Partial<typeof items.$inferInsert> = {};
      const acts: (typeof activities.$inferInsert)[] = [];
      if (!sameParent) {
        patch.parentId = data.newParentId;
        patch.rank = newRank;
        acts.push(activityRow(node.id, actorId, "move", "parent", node.parentId ?? null, data.newParentId ?? null));
      } else {
        if (newRank === node.rank) return node; // same-parent no-op
        patch.rank = newRank;
        acts.push(activityRow(node.id, actorId, "move", "rank", node.rank, newRank));
      }

      const [updated] = await tx.update(items).set({ ...patch, updatedAt: new Date() }).where(eq(items.id, node.id)).returning();
      await tx.insert(activities).values(acts);
      return updated!;
    }),
  );
}
