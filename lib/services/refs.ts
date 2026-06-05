import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { itemRefs, items } from "@/lib/db/schema/domain";
import { addRefInput, parseGithubRef } from "@/lib/items/github-ref";

// ---------------------------------------------------------------------------
// listRefsForItem
// ---------------------------------------------------------------------------

export type RefRow = {
  id: string;
  url: string;
  kind: typeof itemRefs.$inferSelect.kind;
  createdAt: Date;
};

/**
 * Returns all GitHub refs attached to an item, ordered by createdAt ascending.
 */
export async function listRefsForItem(itemId: string): Promise<RefRow[]> {
  const rows = await db
    .select({
      id: itemRefs.id,
      url: itemRefs.url,
      kind: itemRefs.kind,
      createdAt: itemRefs.createdAt,
    })
    .from(itemRefs)
    .where(eq(itemRefs.itemId, itemId))
    .orderBy(asc(itemRefs.createdAt));

  return rows;
}

// ---------------------------------------------------------------------------
// addRef
// ---------------------------------------------------------------------------

/**
 * Validates and inserts a GitHub ref for an item.
 * Throws "Item introuvable." if the item does not exist or is soft-deleted.
 * Throws a Zod validation error if the input is invalid (including
 * "URL GitHub invalide." for non-GitHub URLs).
 */
export async function addRef(
  input: unknown,
  actorId: string,
): Promise<typeof itemRefs.$inferSelect> {
  // Validate input (Zod will throw on failure).
  const data = addRefInput.parse(input);

  // Verify the item exists and is not soft-deleted.
  const [liveItem] = await db
    .select({ id: items.id, deletedAt: items.deletedAt })
    .from(items)
    .where(eq(items.id, data.itemId))
    .limit(1);

  if (!liveItem || liveItem.deletedAt !== null) {
    throw new Error("Item introuvable.");
  }

  // Compute kind from the validated URL.
  const meta = parseGithubRef(data.url)!;

  const [row] = await db
    .insert(itemRefs)
    .values({
      itemId: data.itemId,
      url: data.url,
      kind: meta.kind,
      createdBy: actorId,
    })
    .returning();

  return row!;
}

// ---------------------------------------------------------------------------
// removeRef
// ---------------------------------------------------------------------------

/**
 * Removes a GitHub ref by id. Idempotent — no error if already gone.
 */
export async function removeRef(id: string): Promise<void> {
  await db.delete(itemRefs).where(eq(itemRefs.id, id));
}
