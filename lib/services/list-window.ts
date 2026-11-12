import "server-only";

import { and, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  itemFixVersions,
  itemLabels,
  itemLinks,
  items,
  labels,
  statuses,
} from "@/lib/db/schema/domain";
import { PRIORITY_LABELS } from "@/lib/design/constants";
import { EMPTY_SUMMARY, type GroupKey } from "@/lib/items/filter";
import {
  afterSortValues,
  groupKeyExpression,
  liveItemsOf,
  orderTerm,
  viewFilterCondition,
  viewOrderColumns,
  type ViewOrderColumn,
} from "@/lib/items/filter-sql";
import {
  LIST_WINDOW_SIZE,
  type ListCursor,
  type ListWindow,
  type ListWindowRow,
} from "@/lib/items/list-window";
import { listUsersByIds } from "@/lib/services/items";
import { listReleaseSummaries } from "@/lib/services/releases";
import { viewGroupSummaries, type ViewRowsState } from "@/lib/services/view-rows";

/**
 * The Liste by windows (JIR-145, JIR-120 D2, D3). A window is a slice of the
 * one ordered, filtered and grouped set `listViewRows` computes: groups in
 * first-seen order, rows in the view's sort inside them. The next window
 * starts strictly after the cursor's sort values (keyset), so rows created,
 * moved or deleted meanwhile never shift it as an offset would.
 */

export type ListWindowIds = {
  total: number;
  rows: Array<{ id: string; groupKey: string }>;
  nextCursor: ListCursor | null;
};

const ref = (name: string): SQL => sql.raw(`"${name}"`);

export type WindowOptions = {
  cursor: ListCursor | null;
  limit?: number;
  /** Narrows the rows to one part of the view (the Backlog section, JIR-146). */
  scope?: SQL;
  /** The order inside a group; the view's sort by default. Must be total. */
  columns?: ViewOrderColumn[];
};

const list = (terms: SQL[]) => sql.join(terms, sql`, `);

/**
 * The view's rows as a `ranked` common table: each row's id, key, group,
 * own sort values (`c0`…) and its group's first sort values (`f0`…), with
 * the filtered total. `viewRowsOrder` orders it as `listViewRows` does.
 */
function rankedViewRows(
  backlogId: string,
  state: ViewRowsState,
  columns: ViewOrderColumn[],
  scope: SQL | undefined,
): SQL {
  const where = and(liveItemsOf(backlogId), viewFilterCondition(backlogId, state.filters), scope);
  const own = columns.map((_, index) => ref(`c${index}`));
  const first = columns.map((_, index) => ref(`f${index}`));
  return sql`with base as (
      select ${items.id} as id, ${items.key} as key, ${groupKeyExpression(backlogId, state.group)} as group_key,
        ${list(columns.map((column, index) => sql`${column.expression} as ${own[index]}`))}
      from ${items}
      where ${where}
    ), ranked as (
      select base.*, count(*) over () as total,
        ${list(columns.map((_, index) => sql`first_value(${own[index]}) over grp as ${first[index]}`))}
      from base
      window grp as (partition by group_key order by ${list(columns.map((column, index) => orderTerm(column, own[index])))})
    )`;
}

/** Groups in first-seen order, rows in the view's sort inside them. */
function viewRowsOrder(columns: ViewOrderColumn[]): SQL {
  return list([
    ...columns.map((column, index) => orderTerm(column, ref(`f${index}`))),
    ...columns.map((column, index) => orderTerm(column, ref(`c${index}`))),
  ]);
}

/** The keys before and after one item in the view's order (JIR-153). */
export type ViewNeighbors = {
  /** False when the filters (or the scope) leave the item out. */
  inView: boolean;
  previous: string | null;
  next: string | null;
};

/**
 * The item's neighbors over the whole view, loaded or not: the drawer's
 * previous / next buttons (K / J) for an item opened outside the rows shown
 * (JIR-153). Same set and order as the windows, so no window is read.
 */
export async function viewNeighbors(
  backlogId: string,
  state: ViewRowsState,
  itemKey: string,
  options: Pick<WindowOptions, "scope" | "columns"> = {},
): Promise<ViewNeighbors> {
  const columns = options.columns ?? viewOrderColumns(backlogId, state.sort);
  const order = viewRowsOrder(columns);
  const result = await db.execute<{ previous: string | null; next: string | null }>(sql`
    ${rankedViewRows(backlogId, state, columns, options.scope)}, around as (
      select key, lag(key) over (order by ${order}) as previous, lead(key) over (order by ${order}) as next
      from ranked
    )
    select previous, next from around where key = ${itemKey}`);
  const row = result.rows[0];
  return row
    ? { inView: true, previous: row.previous, next: row.next }
    : { inView: false, previous: null, next: null };
}

/** The ids of one window, with the filtered total and the next cursor. */
export async function listWindowIds(
  backlogId: string,
  state: ViewRowsState,
  options: WindowOptions,
): Promise<ListWindowIds> {
  const limit = options.limit ?? LIST_WINDOW_SIZE;
  const columns = options.columns ?? viewOrderColumns(backlogId, state.sort);
  const cursor = options.cursor;
  // A cursor of another sort (a stale page) has nothing to compare with.
  if (cursor && (cursor.first.length !== columns.length || cursor.last.length !== columns.length)) {
    throw new Error("Curseur de fenêtre invalide.");
  }
  const own = columns.map((_, index) => ref(`c${index}`));
  const first = columns.map((_, index) => ref(`f${index}`));

  // Each row carries its group's first row (first-seen order) and its own
  // sort values; ordering by both is `listViewRows`' order.
  const after = cursor
    ? sql`where (group_key <> ${cursor.group} and ${afterSortValues(columns, first, cursor.first)})
        or (group_key = ${cursor.group} and ${afterSortValues(columns, own, cursor.last)})`
    : sql``;
  const result = await db.execute<Record<string, string | null> & { id: string; group_key: string; total: string }>(sql`
    ${rankedViewRows(backlogId, state, columns, options.scope)}
    select id, group_key, total,
      ${list(columns.map((_, index) => sql`${own[index]}::text as ${ref(`c${index}_text`)}, ${first[index]}::text as ${ref(`f${index}_text`)}`))}
    from ranked
    ${after}
    order by ${viewRowsOrder(columns)}
    limit ${limit + 1}`);

  const found = result.rows;
  const rows = found.slice(0, limit);
  const last = rows.at(-1);
  const total = found[0]
    ? Number(found[0].total)
    : await countMatches(backlogId, state, options.scope);
  return {
    total,
    rows: rows.map((row) => ({ id: row.id, groupKey: row.group_key })),
    nextCursor: found.length > limit && last
      ? {
          group: last.group_key,
          first: columns.map((_, index) => last[`f${index}_text`] ?? null),
          last: columns.map((_, index) => last[`c${index}_text`] ?? null),
        }
      : null,
  };
}

/** The filtered total when a window comes back empty (past the last row). */
async function countMatches(backlogId: string, state: ViewRowsState, scope?: SQL): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(items)
    .leftJoin(statuses, and(eq(statuses.id, items.statusId), eq(statuses.backlogId, backlogId)))
    .where(and(liveItemsOf(backlogId), viewFilterCondition(backlogId, state.filters), scope));
  return row?.count ?? 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The names of the groups `keys`, as the Liste headers show them. */
export async function groupLabels(
  backlogId: string,
  group: GroupKey | null,
  keys: string[],
): Promise<Map<string, string>> {
  const labelsByKey = new Map<string, string>();
  if (!group) return labelsByKey;
  const none = group === "assignee" ? "Non assigné" : group === "component" ? "Sans composant" : "Sans parent";
  const named = keys.filter((key) => key !== "none");
  for (const key of keys) if (key === "none") labelsByKey.set(key, none);
  if (group === "priority") {
    for (const key of named) {
      labelsByKey.set(key, PRIORITY_LABELS[Number(key) as 0 | 1 | 2 | 3 | 4] ?? key);
    }
    return labelsByKey;
  }
  // User ids are text; statuses and items are uuids.
  const ids = group === "assignee" ? named : named.filter((key) => UUID.test(key));
  const rows: Array<{ id: string; name: string }> = ids.length === 0
    ? []
    : group === "assignee"
      ? await listUsersByIds(ids)
      : group === "status"
        ? await db
            .select({ id: statuses.id, name: statuses.name })
            .from(statuses)
            .where(and(eq(statuses.backlogId, backlogId), inArray(statuses.id, ids)))
        : await db
            .select({ id: items.id, name: items.title })
            .from(items)
            .where(and(eq(items.backlogId, backlogId), isNull(items.deletedAt), inArray(items.id, ids)));
  const names = new Map(rows.map((row) => [row.id, row.name]));
  for (const key of named) labelsByKey.set(key, names.get(key) ?? key);
  return labelsByKey;
}

/**
 * What a Liste row shows of the window's items, in the window's order, with
 * their rank (the Backlog's rows carry it, JIR-146).
 */
export async function listRowsByIds(
  backlogId: string,
  window: ListWindowIds["rows"],
): Promise<Array<ListWindowRow & { rank: string }>> {
  const ids = window.map((row) => row.id);
  if (ids.length === 0) return [];
  const parent = alias(items, "row_parent");
  const blocker = alias(items, "row_blocker");
  const [itemRows, labelRows, versionRows, blockedRows, releases] = await Promise.all([
    db
      .select({
        id: items.id,
        key: items.key,
        type: items.type,
        kind: items.kind,
        title: items.title,
        statusId: items.statusId,
        priority: items.priority,
        estimatePoints: items.estimatePoints,
        depth: items.depth,
        dueDate: items.dueDate,
        assigneeId: items.assigneeId,
        rank: items.rank,
        parentKey: parent.key,
        parentTitle: parent.title,
        parentType: parent.type,
      })
      .from(items)
      .leftJoin(parent, and(eq(parent.id, items.parentId), isNull(parent.deletedAt)))
      .where(and(liveItemsOf(backlogId), inArray(items.id, ids))),
    db
      .select({ itemId: itemLabels.itemId, id: labels.id, name: labels.name, color: labels.color })
      .from(itemLabels)
      .innerJoin(labels, eq(labels.id, itemLabels.labelId))
      .where(inArray(itemLabels.itemId, ids)),
    db
      .select({ itemId: itemFixVersions.itemId, releaseId: itemFixVersions.releaseId })
      .from(itemFixVersions)
      .where(and(eq(itemFixVersions.backlogId, backlogId), inArray(itemFixVersions.itemId, ids))),
    // Blocked by an unfinished live item of the backlog, as `blockedItemIds`.
    db
      .selectDistinct({ targetId: itemLinks.targetId })
      .from(itemLinks)
      .innerJoin(blocker, eq(blocker.id, itemLinks.sourceId))
      .innerJoin(statuses, eq(statuses.id, blocker.statusId))
      .where(and(
        eq(itemLinks.type, "blocks"),
        inArray(itemLinks.targetId, ids),
        eq(blocker.backlogId, backlogId),
        isNull(blocker.deletedAt),
        ne(statuses.category, "done"),
      )),
    listReleaseSummaries(backlogId, { includeArchived: true }),
  ]);
  const users = await listUsersByIds(itemRows.flatMap((row) => (row.assigneeId ? [row.assigneeId] : [])));
  const userName = new Map(users.map((user) => [user.id, user.name]));
  const releaseById = new Map(releases.map(({ id, name, released, archived }) =>
    [id, { id, name, released, archived }]));
  const labelsByItem = new Map<string, ListWindowRow["labels"]>();
  for (const { itemId, ...label } of labelRows) {
    labelsByItem.set(itemId, [...(labelsByItem.get(itemId) ?? []), label]);
  }
  const versionsByItem = new Map<string, ListWindowRow["fixVersions"]>();
  for (const { itemId, releaseId } of versionRows) {
    const release = releaseById.get(releaseId);
    if (release) versionsByItem.set(itemId, [...(versionsByItem.get(itemId) ?? []), release]);
  }
  const blocked = new Set(blockedRows.map((row) => row.targetId));
  const byId = new Map(itemRows.map((row) => [row.id, row]));

  // An item deleted between the two reads is left out, never shown half-loaded.
  return window.flatMap(({ id, groupKey }) => {
    const row = byId.get(id);
    if (!row) return [];
    const { parentKey, parentTitle, parentType, ...item } = row;
    return [{
      ...item,
      assigneeName: item.assigneeId ? (userName.get(item.assigneeId) ?? null) : null,
      labels: labelsByItem.get(id) ?? [],
      fixVersions: versionsByItem.get(id) ?? [],
      blocked: blocked.has(id),
      parent: parentKey !== null && parentTitle !== null && parentType !== null
        ? { key: parentKey, title: parentTitle, type: parentType }
        : null,
      groupKey,
    }];
  });
}

/**
 * One Liste window ready to show: its rows, the groups they belong to with
 * their names and figures over the whole filtered group, the filtered total
 * and where the next window starts.
 */
export async function loadListWindow(
  backlogId: string,
  state: ViewRowsState,
  options: { cursor: ListCursor | null; limit?: number },
): Promise<ListWindow> {
  const window = await listWindowIds(backlogId, state, options);
  const keys = [...new Set(window.rows.map((row) => row.groupKey))];
  const [rankedRows, summaries, names] = await Promise.all([
    listRowsByIds(backlogId, window.rows),
    viewGroupSummaries(backlogId, state, keys),
    groupLabels(backlogId, state.group, keys),
  ]);
  // The Liste's rows do not carry the rank.
  const rows = rankedRows.map(({ rank, ...row }) => {
    void rank;
    return row;
  });
  return {
    total: window.total,
    rows,
    groups: keys.map((key) => ({
      key,
      label: names.get(key) ?? "",
      summary: summaries.get(key) ?? EMPTY_SUMMARY,
    })),
    nextCursor: window.nextCursor,
  };
}
