import "server-only";
import { and, asc, eq, ilike, inArray, isNull, ne, notExists, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { binaryTextOrder } from "@/lib/db/order";
import { itemLinks, items } from "@/lib/db/schema/domain";
import type { ItemType } from "@/lib/design/constants";
import { toPrefixTsQuery } from "@/lib/items/search";

/** What a picker shows of an item: its identity and its type. */
export type ItemChoice = { id: string; key: string; type: ItemType; title: string };

/**
 * The most choices a picker lists at once (JIR-118): enough to pick from,
 * bounded whatever the backlog's size. A longer list is narrowed by typing.
 */
export const ITEM_CHOICE_LIMIT = 20;

/**
 * The levels that structure a backlog (Composant, Epic): few per backlog,
 * so the page still carries them for its Parent facet, the inline epic
 * picker and the first-steps guide. Tâches and Sous-tâches never ship whole.
 */
export const STRUCTURE_ITEM_TYPES = ["composant", "epic"] as const satisfies readonly ItemType[];

const choiceColumns = { id: items.id, key: items.key, type: items.type, title: items.title };

/** The backlog's own order: depth, then rank, then key (what the Arbre shows). */
function hierarchyOrder() {
  return [asc(items.depth), asc(binaryTextOrder(items.rank)), asc(items.key)];
}

/** A LIKE prefix where a typed `%`, `_` or `\` matches itself. */
function likePrefix(raw: string): string {
  return `${raw.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * The live Composants and Epics of a backlog, in hierarchy order. The
 * caller has checked the backlog is browsable.
 */
export function listBacklogStructure(backlogId: string): Promise<ItemChoice[]> {
  return db
    .select(choiceColumns)
    .from(items)
    .where(
      and(
        eq(items.backlogId, backlogId),
        isNull(items.deletedAt),
        inArray(items.type, [...STRUCTURE_ITEM_TYPES]),
      ),
    )
    .orderBy(...hierarchyOrder());
}

/**
 * The live items of a backlog a picker offers, at most `ITEM_CHOICE_LIMIT`:
 * without a query the first ones in hierarchy order, so an empty answer
 * means the backlog has no such item; with one, the keys starting with it
 * (or carrying its number) first, then the items whose words start with it
 * (the global search's prefix query on the title and description), each
 * group in hierarchy order. `types` narrows to the levels a field accepts;
 * `excludeIds` leaves out a few given items (the item itself); `excludeLinksOf`
 * leaves out that item and everything it is linked to, in either direction,
 * however many links it has. The caller has checked the backlog is browsable.
 */
export function searchBacklogItems(
  backlogId: string,
  options: {
    q?: string;
    types?: readonly ItemType[];
    excludeIds?: readonly string[];
    excludeLinksOf?: string;
  } = {},
): Promise<ItemChoice[]> {
  const conditions: SQL[] = [eq(items.backlogId, backlogId), isNull(items.deletedAt)];
  if (options.types && options.types.length > 0) {
    conditions.push(inArray(items.type, [...options.types]));
  }
  if (options.excludeIds && options.excludeIds.length > 0) {
    conditions.push(notInArray(items.id, [...options.excludeIds]));
  }
  if (options.excludeLinksOf) {
    const source = options.excludeLinksOf;
    conditions.push(
      ne(items.id, source),
      notExists(
        db
          .select({ id: itemLinks.id })
          .from(itemLinks)
          .where(
            or(
              and(eq(itemLinks.sourceId, source), eq(itemLinks.targetId, items.id)),
              and(eq(itemLinks.targetId, source), eq(itemLinks.sourceId, items.id)),
            ),
          ),
      ),
    );
  }
  const raw = (options.q ?? "").trim();
  if (raw === "") {
    return db
      .select(choiceColumns)
      .from(items)
      .where(and(...conditions))
      .orderBy(...hierarchyOrder())
      .limit(ITEM_CHOICE_LIMIT);
  }

  // Bound parameters only: the pattern and the tsquery are never concatenated.
  const keyLike = likePrefix(raw);
  const keyMatch: SQL = /^\d+$/.test(raw)
    ? sql`(${ilike(items.key, keyLike)} or ${ilike(items.key, `%-${raw}%`)})`
    : sql`${ilike(items.key, keyLike)}`;
  const tsq = toPrefixTsQuery(raw);
  const textMatch: SQL | null =
    tsq === "" ? null : sql`${items.search} @@ to_tsquery('french', ${tsq})`;
  conditions.push(textMatch ? sql`(${keyMatch} or ${textMatch})` : keyMatch);

  return db
    .select(choiceColumns)
    .from(items)
    .where(and(...conditions))
    .orderBy(sql`case when ${keyMatch} then 0 else 1 end`, ...hierarchyOrder())
    .limit(ITEM_CHOICE_LIMIT);
}
