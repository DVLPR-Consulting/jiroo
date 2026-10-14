import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, itemWebLinks } from "@/lib/db/schema/domain";
import { addWebLinkInput } from "@/lib/items/web-links";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type WebLinkRow = {
  id: string;
  url: string;
  title: string | null;
  createdAt: Date;
};

/** The web links of an item (JIR-99), in their order of addition. */
export async function listWebLinksForItem(itemId: string): Promise<WebLinkRow[]> {
  return db
    .select({
      id: itemWebLinks.id,
      url: itemWebLinks.url,
      title: itemWebLinks.title,
      createdAt: itemWebLinks.createdAt,
    })
    .from(itemWebLinks)
    .where(eq(itemWebLinks.itemId, itemId))
    .orderBy(asc(itemWebLinks.createdAt), asc(itemWebLinks.id));
}

/**
 * Validates and adds a web link to a live item.
 * Throws "Item introuvable." for a missing or soft-deleted item, and a Zod
 * error ("URL invalide (http ou https).") for anything but an http(s) URL.
 */
export async function addWebLink(
  input: unknown,
  actorId: string,
): Promise<typeof itemWebLinks.$inferSelect> {
  const data = addWebLinkInput.parse(input);

  return db.transaction(async (tx: Tx) => {
    // Lock the item row so a concurrent soft delete can't slip in between.
    const [liveItem] = await tx
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.id, data.itemId), isNull(items.deletedAt)))
      .for("update");
    if (!liveItem) throw new Error("Item introuvable.");

    const [row] = await tx
      .insert(itemWebLinks)
      .values({ itemId: data.itemId, url: data.url, title: data.title, createdBy: actorId })
      .returning();
    return row!;
  });
}

/** Removes a web link. Idempotent — no error if it is already gone. */
export async function removeWebLink(id: string): Promise<void> {
  await db.delete(itemWebLinks).where(eq(itemWebLinks.id, id));
}
