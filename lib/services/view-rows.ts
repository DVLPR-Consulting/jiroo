import "server-only";

import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { binaryTextOrder } from "@/lib/db/order";
import { items, sprintItems, sprints, statuses } from "@/lib/db/schema/domain";
import { EMPTY_SUMMARY, type Filters, type ViewGroupSummary, type ViewState } from "@/lib/items/filter";
import {
  groupKeyExpression,
  hierarchyOrder,
  liveItemsOf,
  viewFilterCondition,
  viewOrder,
} from "@/lib/items/filter-sql";

/**
 * What the Liste, Backlog, Arbre and Board show, filtered, sorted, grouped and
 * counted by PostgreSQL (JIR-143, JIR-120 D1) instead of in memory. Every row
 * is still returned (windows come with JIR-120 W1 to W3); the page joins these
 * ids to the rows it loads for display.
 */

export type ViewRowsState = Pick<ViewState, "filters" | "sort" | "group">;

export type { ViewGroupSummary };

export type ListViewRows = {
  total: number;
  /** In first-seen order; a single `""` group when the view is not grouped. */
  groups: Array<{ key: string; itemIds: string[]; summary: ViewGroupSummary }>;
};

export type BacklogViewRows = {
  /** The Backlog's result count: filtered tasks in a sprint or not done. */
  total: number;
  /** By section (a sprint id, or `"backlog"`); only sections and groups with rows. */
  sections: Map<string, Array<{ key: string; itemIds: string[] }>>;
};

export type TreeViewRows = {
  /** Filtered items, in hierarchy order. */
  matchedIds: string[];
  /** Their ancestors the filters leave out, shown dimmed, in hierarchy order. */
  contextIds: string[];
};

function orderList(order: SQL[]): SQL {
  return sql.join(order, sql`, `);
}

/** Exact decimal sums (numeric) back to numbers, as `pointsByStatusCategory` rounds. */
function points(value: string | number | null): number {
  return value === null ? 0 : Number(value);
}

/**
 * The Liste's group figures over the whole filtered set: count, tasks without
 * an estimate and task points per status category, for the groups `keys`
 * names (every group when null).
 */
export async function viewGroupSummaries(
  backlogId: string,
  state: ViewRowsState,
  keys: string[] | null,
): Promise<Map<string, ViewGroupSummary>> {
  if (keys !== null && keys.length === 0) return new Map();
  const where = and(liveItemsOf(backlogId), viewFilterCondition(backlogId, state.filters));
  const groupKey = groupKeyExpression(backlogId, state.group);
  const counted = db
    .select({
      groupKey: groupKey.as("group_key"),
      type: items.type,
      estimatePoints: items.estimatePoints,
      category: statuses.category,
    })
    .from(items)
    .leftJoin(statuses, and(eq(statuses.id, items.statusId), eq(statuses.backlogId, backlogId)))
    .where(where)
    .as("counted");
  const estimatedTask = sql`${counted.type} = 'tache' and ${counted.estimatePoints} is not null`;
  // An unknown status counts as to do, as in `pointsByCategory`.
  const summaryRows = await db
    .select({
      groupKey: counted.groupKey,
      count: sql<number>`count(*)::int`,
      unestimated: sql<number>`(count(*) filter (where ${counted.type} = 'tache' and ${counted.estimatePoints} is null))::int`,
      todo: sql<string | null>`sum(${counted.estimatePoints}) filter (where ${estimatedTask}
        and ${counted.category} is distinct from 'done' and ${counted.category} is distinct from 'in_progress')`,
      inProgress: sql<string | null>`sum(${counted.estimatePoints}) filter (where ${estimatedTask} and ${counted.category} = 'in_progress')`,
      done: sql<string | null>`sum(${counted.estimatePoints}) filter (where ${estimatedTask} and ${counted.category} = 'done')`,
    })
    .from(counted)
    .where(keys === null ? undefined : inArray(counted.groupKey, keys))
    .groupBy(counted.groupKey);

  return new Map(summaryRows.map((row): [string, ViewGroupSummary] => [row.groupKey, {
    count: row.count,
    unestimated: row.unestimated,
    points: { todo: points(row.todo), inProgress: points(row.inProgress), done: points(row.done) },
  }]));
}

export async function listViewRows(backlogId: string, state: ViewRowsState): Promise<ListViewRows> {
  const where = and(liveItemsOf(backlogId), viewFilterCondition(backlogId, state.filters));
  const groupKey = groupKeyExpression(backlogId, state.group);

  // The statuses join keeps every column qualified (see `lib/items/filter-sql.ts`).
  const ranked = db
    .select({
      id: items.id,
      groupKey: groupKey.as("group_key"),
      position: sql<number>`row_number() over (order by ${orderList(viewOrder(backlogId, state.sort))})`.as("position"),
    })
    .from(items)
    .leftJoin(statuses, and(eq(statuses.id, items.statusId), eq(statuses.backlogId, backlogId)))
    .where(where)
    .as("ranked");
  // Groups in first-seen order: by their first row's position.
  const rowsQuery = db
    .select({ id: ranked.id, groupKey: ranked.groupKey })
    .from(ranked)
    .orderBy(sql`min(${ranked.position}) over (partition by ${ranked.groupKey})`, asc(ranked.position));

  const [rows, summaries] = await Promise.all([rowsQuery, viewGroupSummaries(backlogId, state, null)]);

  const groups: ListViewRows["groups"] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.key === row.groupKey) last.itemIds.push(row.id);
    else groups.push({ key: row.groupKey, itemIds: [row.id], summary: summaries.get(row.groupKey) ?? EMPTY_SUMMARY });
  }
  // The ungrouped Liste always has its one card, even empty.
  if (state.group === null && groups.length === 0) {
    groups.push({ key: "", itemIds: [], summary: EMPTY_SUMMARY });
  }
  return { total: rows.length, groups };
}

export async function backlogViewRows(backlogId: string, state: ViewRowsState): Promise<BacklogViewRows> {
  const current = alias(sprintItems, "current_sprint_item");
  const currentSprint = alias(sprints, "current_sprint");
  // A task sits in its current sprint, else in the Backlog section unless done.
  const section = sql<string | null>`coalesce((
    select ${current.sprintId}::text from ${sprintItems} ${current}
    inner join ${sprints} ${currentSprint} on ${currentSprint.id} = ${current.sprintId}
    where ${current.itemId} = ${items.id}
      and ${current.leftAt} is null
      and ${currentSprint.backlogId} = ${backlogId}
  ), case when ${statuses.category} is distinct from 'done' then 'backlog' end)`;
  // Without a sort, the manual order: rank alone, as the drag and drop sees it.
  const order = state.sort ? viewOrder(backlogId, state.sort) : [asc(binaryTextOrder(items.rank))];

  const ranked = db
    .select({
      id: items.id,
      section: section.as("section"),
      groupKey: groupKeyExpression(backlogId, state.group).as("group_key"),
      position: sql<number>`row_number() over (partition by ${section} order by ${orderList(order)})`.as("position"),
    })
    .from(items)
    .leftJoin(statuses, and(eq(statuses.id, items.statusId), eq(statuses.backlogId, backlogId)))
    .where(and(
      liveItemsOf(backlogId),
      eq(items.type, "tache"),
      viewFilterCondition(backlogId, state.filters),
    ))
    .as("ranked");
  const rows = await db
    .select({ id: ranked.id, section: ranked.section, groupKey: ranked.groupKey })
    .from(ranked)
    .where(sql`${ranked.section} is not null`)
    .orderBy(
      asc(ranked.section),
      sql`min(${ranked.position}) over (partition by ${ranked.section}, ${ranked.groupKey})`,
      asc(ranked.position),
    );

  const sections: BacklogViewRows["sections"] = new Map();
  for (const row of rows) {
    const groups = sections.get(row.section!) ?? [];
    const last = groups.at(-1);
    if (last && last.key === row.groupKey) last.itemIds.push(row.id);
    else groups.push({ key: row.groupKey, itemIds: [row.id] });
    sections.set(row.section!, groups);
  }
  return { total: rows.length, sections };
}

export async function treeViewRows(backlogId: string, filters: Filters): Promise<TreeViewRows> {
  // Each match and its ancestors, found by the ids its path names (primary
  // key), each checked as a live ancestor of the match like `withAncestors`.
  const rows = await db.execute<{ id: string; matched: boolean }>(sql`
    with matched as (
      select ${items.id} as id, ${items.path} as path from ${items}
      where ${and(liveItemsOf(backlogId), viewFilterCondition(backlogId, filters))}
    ), visible as (
      select distinct tree_row.id
      from matched
      cross join lateral unnest(string_to_array(ltree2text(subpath(matched.path, 1)), '.')::uuid[]) as label(id)
      inner join ${items} tree_row on tree_row.id = label.id
      where tree_row.backlog_id = ${backlogId}
        and tree_row.deleted_at is null
        and tree_row.path @> matched.path
    )
    select tree_row.id, matched.id is not null as matched
    from ${items} tree_row
    inner join visible on visible.id = tree_row.id
    left join matched on matched.id = tree_row.id
    order by tree_row.depth asc, tree_row.rank collate "C" asc, tree_row.key asc`);
  return {
    matchedIds: rows.rows.filter((row) => row.matched).map((row) => row.id),
    contextIds: rows.rows.filter((row) => !row.matched).map((row) => row.id),
  };
}

/** The tasks the filters keep, in hierarchy order: the Board's candidate cards. */
export async function matchingTaskIds(backlogId: string, filters: Filters): Promise<string[]> {
  const rows = await db
    .select({ id: items.id })
    .from(items)
    .where(and(liveItemsOf(backlogId), eq(items.type, "tache"), viewFilterCondition(backlogId, filters)))
    .orderBy(...hierarchyOrder());
  return rows.map((row) => row.id);
}
