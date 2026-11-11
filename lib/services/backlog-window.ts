import "server-only";

import { and, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { items, sprintItems, sprints, statuses } from "@/lib/db/schema/domain";
import {
  groupKeyExpression,
  liveItemsOf,
  viewFilterCondition,
  viewOrderColumns,
  type ViewOrderColumn,
} from "@/lib/items/filter-sql";
import type { BacklogWindow, BacklogWindowRow } from "@/lib/items/backlog-window";
import { LIST_WINDOW_SIZE, type ListCursor } from "@/lib/items/list-window";
import { groupLabels, listRowsByIds, listWindowIds } from "@/lib/services/list-window";
import type { ViewRowsState } from "@/lib/services/view-rows";

/**
 * The Backlog's « Backlog » section by windows (JIR-146, JIR-120 D4): a
 * window is a slice of the section `backlogViewRows` used to send whole,
 * in the same order and groups, read from a keyset cursor (never an offset).
 */

/**
 * A task of the backlog in its « Backlog » section: in no current sprint of
 * the backlog, and not done (a status of another backlog, never expected,
 * counts as not done, as before).
 */
export function backlogSectionCondition(backlogId: string): SQL {
  const current = alias(sprintItems, "section_sprint_item");
  const currentSprint = alias(sprints, "section_sprint");
  const category = alias(statuses, "section_status");
  return and(
    sql`${items.type} = 'tache'`,
    sql`not exists (
      select 1 from ${sprintItems} ${current}
      inner join ${sprints} ${currentSprint} on ${currentSprint.id} = ${current.sprintId}
      where ${current.itemId} = ${items.id}
        and ${current.leftAt} is null
        and ${currentSprint.backlogId} = ${backlogId}
    )`,
    sql`(select ${category.category} from ${statuses} ${category}
      where ${category.id} = ${items.statusId} and ${category.backlogId} = ${backlogId}) is distinct from 'done'`,
  )!;
}

/**
 * The section's order inside a group: the view's sort when there is one,
 * else the manual order, the rank alone (unique in a backlog), bytewise as
 * the drag and drop compares it.
 */
function sectionOrder(backlogId: string, state: ViewRowsState): ViewOrderColumn[] {
  return state.sort
    ? viewOrderColumns(backlogId, state.sort)
    : [{ expression: sql`${items.rank}`, direction: "asc", nullsLast: false, type: "text", collation: "C" }];
}

/** The section's tasks per group the filters keep, for the groups `keys`. */
async function groupCounts(
  backlogId: string,
  state: ViewRowsState,
  keys: string[],
): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const where = and(liveItemsOf(backlogId), viewFilterCondition(backlogId, state.filters), backlogSectionCondition(backlogId));
  const result = await db.execute<{ group_key: string; count: number }>(sql`
    select group_key, count(*)::int as count
    from (select ${groupKeyExpression(backlogId, state.group)} as group_key from ${items} where ${where}) grouped
    where group_key in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
    group by group_key`);
  return new Map(result.rows.map((row) => [row.group_key, Number(row.count)]));
}

/**
 * One window of the Backlog section: its rows, the groups they belong to with
 * their whole count, the filtered total of the section and where the next
 * window starts.
 */
export async function loadBacklogWindow(
  backlogId: string,
  state: ViewRowsState,
  options: { cursor: ListCursor | null; limit?: number },
): Promise<BacklogWindow> {
  const window = await listWindowIds(backlogId, state, {
    cursor: options.cursor,
    limit: options.limit ?? LIST_WINDOW_SIZE,
    scope: backlogSectionCondition(backlogId),
    columns: sectionOrder(backlogId, state),
  });
  const keys = [...new Set(window.rows.map((row) => row.groupKey))];
  const [rows, counts, names] = await Promise.all([
    listRowsByIds(backlogId, window.rows),
    state.group ? groupCounts(backlogId, state, keys) : Promise.resolve(new Map([["", window.total]])),
    groupLabels(backlogId, state.group, keys),
  ]);
  return {
    total: window.total,
    rows: rows.flatMap((row): BacklogWindowRow[] => row.type === "tache"
      ? [{
          id: row.id,
          key: row.key,
          title: row.title,
          type: row.type,
          kind: row.kind,
          statusId: row.statusId,
          priority: row.priority,
          estimatePoints: row.estimatePoints,
          assigneeId: row.assigneeId,
          assigneeName: row.assigneeName,
          rank: row.rank,
          blocked: row.blocked,
          fixVersions: row.fixVersions,
          parent: row.parent,
          groupKey: row.groupKey,
        }]
      : []),
    groups: keys.map((key) => ({ key, label: names.get(key) ?? "", count: counts.get(key) ?? 0 })),
    nextCursor: window.nextCursor,
  };
}
