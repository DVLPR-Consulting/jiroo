import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { itemLinks, items, statuses } from "@/lib/db/schema/domain";
import { addLinkInput, isDuplicateLink, wouldCreateDirectCycle } from "@/lib/items/links";
import type { LinkType } from "@/lib/items/links";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---- reads (no tx) ----

export type LinkWithOther = {
  id: string;
  sourceId: string;
  targetId: string;
  type: LinkType;
  other: {
    id: string;
    key: string;
    title: string;
    type: typeof items.$inferSelect.type;
    statusId: string;
    statusName: string;
    statusColor: string;
    statusCategory: typeof statuses.$inferSelect.category;
  };
};

/**
 * Returns all links for a given item (as source OR target), excluding links
 * whose other side is soft-deleted. Each result includes an `other` object
 * describing the other item (key, title, type, status). Ordered by createdAt.
 */
export async function listLinksForItem(itemId: string): Promise<LinkWithOther[]> {
  // Two selects: one for links where itemId is the source (other = target),
  // one for links where itemId is the target (other = source).
  // Filter out links where the other item is soft-deleted.

  const asSource = await db
    .select({
      id: itemLinks.id,
      sourceId: itemLinks.sourceId,
      targetId: itemLinks.targetId,
      type: itemLinks.type,
      createdAt: itemLinks.createdAt,
      otherId: items.id,
      otherKey: items.key,
      otherTitle: items.title,
      otherType: items.type,
      otherStatusId: items.statusId,
      otherStatusName: statuses.name,
      otherStatusColor: statuses.color,
      otherStatusCategory: statuses.category,
    })
    .from(itemLinks)
    .innerJoin(items, eq(items.id, itemLinks.targetId))
    .innerJoin(statuses, eq(statuses.id, items.statusId))
    .where(and(eq(itemLinks.sourceId, itemId), isNull(items.deletedAt)));

  const asTarget = await db
    .select({
      id: itemLinks.id,
      sourceId: itemLinks.sourceId,
      targetId: itemLinks.targetId,
      type: itemLinks.type,
      createdAt: itemLinks.createdAt,
      otherId: items.id,
      otherKey: items.key,
      otherTitle: items.title,
      otherType: items.type,
      otherStatusId: items.statusId,
      otherStatusName: statuses.name,
      otherStatusColor: statuses.color,
      otherStatusCategory: statuses.category,
    })
    .from(itemLinks)
    .innerJoin(items, eq(items.id, itemLinks.sourceId))
    .innerJoin(statuses, eq(statuses.id, items.statusId))
    .where(and(eq(itemLinks.targetId, itemId), isNull(items.deletedAt)));

  const combined = [...asSource, ...asTarget].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  return combined.map((row) => ({
    id: row.id,
    sourceId: row.sourceId,
    targetId: row.targetId,
    type: row.type,
    other: {
      id: row.otherId,
      key: row.otherKey,
      title: row.otherTitle,
      type: row.otherType,
      statusId: row.otherStatusId,
      statusName: row.otherStatusName,
      statusColor: row.otherStatusColor,
      statusCategory: row.otherStatusCategory,
    },
  }));
}

// ---- mutations (tx) ----

/**
 * Adds a directed link between two items.
 * Validates: parse input, both items exist + live, same backlog, no duplicate,
 * no direct blocks-cycle.
 */
export async function addLink(
  input: unknown,
  actorId: string,
): Promise<typeof itemLinks.$inferSelect> {
  const data = addLinkInput.parse(input);

  return db.transaction(async (tx: Tx) => {
    // Load both items; both must be live.
    const [source] = await tx
      .select({ id: items.id, backlogId: items.backlogId, deletedAt: items.deletedAt })
      .from(items)
      .where(and(eq(items.id, data.sourceId), isNull(items.deletedAt)));
    if (!source) throw new Error("Item introuvable.");

    const [target] = await tx
      .select({ id: items.id, backlogId: items.backlogId, deletedAt: items.deletedAt })
      .from(items)
      .where(and(eq(items.id, data.targetId), isNull(items.deletedAt)));
    if (!target) throw new Error("Item introuvable.");

    // Both items must belong to the same backlog.
    if (source.backlogId !== target.backlogId) {
      throw new Error("Les deux items doivent appartenir au même backlog.");
    }

    // Load all existing links between this pair (both directions).
    const existing = await tx
      .select({
        id: itemLinks.id,
        sourceId: itemLinks.sourceId,
        targetId: itemLinks.targetId,
        type: itemLinks.type,
      })
      .from(itemLinks)
      .where(
        or(
          and(eq(itemLinks.sourceId, data.sourceId), eq(itemLinks.targetId, data.targetId)),
          and(eq(itemLinks.sourceId, data.targetId), eq(itemLinks.targetId, data.sourceId)),
        ),
      );

    if (isDuplicateLink(existing, data.sourceId, data.targetId, data.type)) {
      throw new Error("Ce lien existe déjà.");
    }

    if (data.type === "blocks" && wouldCreateDirectCycle(existing, data.sourceId, data.targetId)) {
      throw new Error("Cycle : ces deux items se bloqueraient mutuellement.");
    }

    const [row] = await tx
      .insert(itemLinks)
      .values({
        sourceId: data.sourceId,
        targetId: data.targetId,
        type: data.type,
        createdBy: actorId,
      })
      .returning();

    return row!;
  });
}

/**
 * Removes a link by id. Idempotent — no error if the link is already gone.
 * Any writer may delete any link in their accessible backlogs (enforced at action layer).
 */
export async function removeLink(id: string) {
  const [removed] = await db.delete(itemLinks).where(eq(itemLinks.id, id)).returning();
  return removed;
}

/**
 * Returns the distinct targetIds of `blocks` links in `backlogId` where the
 * source (blocker) item is live and NOT in a "done" status category.
 * Used by the UI to render "bloqué" badges.
 */
export async function blockedItemIds(backlogId: string): Promise<string[]> {
  // Join itemLinks (blocks) → source items → source statuses.
  // Filter: source in backlog, source not deleted, source status category != 'done'.
  // Return distinct targetIds.
  const rows = await db
    .selectDistinct({ targetId: itemLinks.targetId })
    .from(itemLinks)
    .innerJoin(items, eq(items.id, itemLinks.sourceId))
    .innerJoin(statuses, eq(statuses.id, items.statusId))
    .where(
      and(
        eq(itemLinks.type, "blocks"),
        eq(items.backlogId, backlogId),
        isNull(items.deletedAt),
        ne(statuses.category, "done"),
      ),
    );

  return rows.map((r) => r.targetId);
}
