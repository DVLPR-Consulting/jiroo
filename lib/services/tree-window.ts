import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { itemLabels, items, labels } from "@/lib/db/schema/domain";
import type { Filters } from "@/lib/items/filter";
import { liveItemsOf, viewFilterCondition } from "@/lib/items/filter-sql";
import {
  TREE_WINDOW_SIZE,
  type TreeChildrenWindow,
  type TreeMatchCursor,
  type TreeMatchRow,
  type TreeMatchWindow,
  type TreeRow,
} from "@/lib/items/tree-window";
import { listUsersByIds } from "@/lib/services/items";

/**
 * The Arbre by windows (JIR-147, JIR-120 D5). Ranks are unique in a backlog
 * and compared bytewise, as the drag and drop compares them, so a rank (and
 * a depth with it) is a total keyset cursor: rows created, moved or deleted
 * meanwhile never shift a window as an offset would.
 */

/**
 * What a tree row shows of `ids`, in their order. An item deleted between
 * two reads is left out, never shown half-loaded. With `childCount`, each row
 * also counts its live children.
 */
async function treeRowsByIds(
  backlogId: string,
  ids: string[],
  options: { childCount: boolean },
): Promise<TreeRow[]> {
  if (ids.length === 0) return [];
  const [itemRows, labelRows, countRows] = await Promise.all([
    db
      .select({
        id: items.id,
        key: items.key,
        type: items.type,
        title: items.title,
        parentId: items.parentId,
        statusId: items.statusId,
        priority: items.priority,
        depth: items.depth,
        rank: items.rank,
        path: items.path,
        assigneeId: items.assigneeId,
      })
      .from(items)
      .where(and(liveItemsOf(backlogId), inArray(items.id, ids))),
    db
      .select({ itemId: itemLabels.itemId, id: labels.id, name: labels.name, color: labels.color })
      .from(itemLabels)
      .innerJoin(labels, eq(labels.id, itemLabels.labelId))
      .where(inArray(itemLabels.itemId, ids)),
    options.childCount
      ? db
          .select({ parentId: items.parentId, count: sql<number>`count(*)::int` })
          .from(items)
          .where(and(liveItemsOf(backlogId), inArray(items.parentId, ids)))
          .groupBy(items.parentId)
      : Promise.resolve([]),
  ]);
  const childCount = new Map(countRows.map((row) => [row.parentId, Number(row.count)]));
  const users = await listUsersByIds(itemRows.flatMap((row) => (row.assigneeId ? [row.assigneeId] : [])));
  const userName = new Map(users.map((user) => [user.id, user.name]));
  const labelsByItem = new Map<string, TreeRow["labels"]>();
  for (const { itemId, ...label } of labelRows) {
    labelsByItem.set(itemId, [...(labelsByItem.get(itemId) ?? []), label]);
  }
  const byId = new Map(itemRows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [{
      ...row,
      labels: labelsByItem.get(id) ?? [],
      assigneeName: row.assigneeId ? (userName.get(row.assigneeId) ?? null) : null,
      ...(options.childCount ? { childCount: childCount.get(id) ?? 0 } : {}),
    }];
  });
}

/**
 * One window of a parent's live children, in rank order, after the rank
 * `cursor` (the last child shown). A parent of another backlog has none.
 */
export async function loadTreeChildren(
  backlogId: string,
  parentId: string,
  options: { cursor: string | null; limit?: number },
): Promise<TreeChildrenWindow> {
  const limit = options.limit ?? TREE_WINDOW_SIZE;
  const after = options.cursor === null ? sql`` : sql`where rank collate "C" > ${options.cursor}`;
  const result = await db.execute<{ id: string; rank: string; total: string }>(sql`
    with children as (
      select ${items.id} as id, ${items.rank} as rank, count(*) over () as total
      from ${items}
      where ${and(liveItemsOf(backlogId), eq(items.parentId, parentId))}
    )
    select id, rank, total from children
    ${after}
    order by rank collate "C" asc
    limit ${limit + 1}`);
  const found = result.rows;
  const page = found.slice(0, limit);
  const total = found[0]
    ? Number(found[0].total)
    : await db
        .select({ count: sql<number>`count(*)::int` })
        .from(items)
        .where(and(liveItemsOf(backlogId), eq(items.parentId, parentId)))
        .then(([row]) => row?.count ?? 0);
  return {
    parentId,
    total,
    rows: await treeRowsByIds(backlogId, page.map((row) => row.id), { childCount: true }),
    nextCursor: found.length > limit ? page.at(-1)!.rank : null,
  };
}

/**
 * One window of the filtered tree: the next `limit` matches in hierarchy
 * order (depth, then rank) after `cursor`, with their live ancestors the
 * filters leave out (shown dimmed), all in hierarchy order. A matching
 * ancestor is less deep than its match, so it came in this window or an
 * earlier one: only non-matching ancestors are added, and the client drops
 * those it already has.
 */
export async function loadTreeMatchWindow(
  backlogId: string,
  filters: Filters,
  options: { cursor: TreeMatchCursor | null; limit?: number },
): Promise<TreeMatchWindow> {
  const limit = options.limit ?? TREE_WINDOW_SIZE;
  const cursor = options.cursor;
  const after = cursor === null
    ? sql``
    : sql`where depth > ${cursor.depth} or (depth = ${cursor.depth} and rank collate "C" > ${cursor.rank})`;
  const result = await db.execute<{ id: string; depth: number; rank: string; total: string }>(sql`
    with matched as (
      select ${items.id} as id, ${items.depth} as depth, ${items.rank} as rank,
        count(*) over () as total
      from ${items}
      where ${and(liveItemsOf(backlogId), viewFilterCondition(backlogId, filters))}
    )
    select id, depth, rank, total from matched
    ${after}
    order by depth asc, rank collate "C" asc
    limit ${limit + 1}`);
  const found = result.rows;
  const page = found.slice(0, limit);
  if (page.length === 0) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(items)
      .where(and(liveItemsOf(backlogId), viewFilterCondition(backlogId, filters)));
    return { total: row?.count ?? 0, rows: [], nextCursor: null };
  }
  const pageIds = page.map((row) => row.id);

  // The page's live ancestors (named by its paths, checked as ancestors like
  // `treeViewRows`) that do not match, then everything in hierarchy order.
  const ordered = await db.execute<{ id: string; matched: boolean }>(sql`
    with page as (
      select ${items.id} as id, ${items.path} as path from ${items}
      where ${and(liveItemsOf(backlogId), inArray(items.id, pageIds))}
    ), ancestors as (
      select distinct tree_row.id
      from page
      cross join lateral unnest(string_to_array(ltree2text(subpath(page.path, 1)), '.')::uuid[]) as label(id)
      inner join ${items} tree_row on tree_row.id = label.id
      where tree_row.backlog_id = ${backlogId}
        and tree_row.deleted_at is null
        and tree_row.path @> page.path
        and tree_row.id <> page.id
        and not exists (
          select 1 from ${items}
          where ${items.id} = tree_row.id
            and ${and(liveItemsOf(backlogId), viewFilterCondition(backlogId, filters))}
        )
    ), shown as (
      select id, true as matched from page
      union all
      select id, false as matched from ancestors
    )
    select shown.id, shown.matched
    from shown
    inner join ${items} tree_row on tree_row.id = shown.id
    order by tree_row.depth asc, tree_row.rank collate "C" asc`);
  const matchedById = new Map(ordered.rows.map((row) => [row.id, row.matched]));
  const rows = await treeRowsByIds(backlogId, ordered.rows.map((row) => row.id), { childCount: false });
  const last = page.at(-1)!;
  return {
    total: Number(page[0]!.total),
    rows: rows.map((row): TreeMatchRow => ({ ...row, matched: matchedById.get(row.id) ?? false })),
    nextCursor: found.length > limit ? { depth: Number(last.depth), rank: last.rank } : null,
  };
}
