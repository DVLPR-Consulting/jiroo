/**
 * The in-memory computation the Liste, Backlog, Arbre and Board views made
 * before JIR-143, kept verbatim as the parity oracle of `lib/services/view-rows`:
 * same inputs as the page had (the loaded rows, their labels, Fix versions,
 * sprint memberships and statuses), same output shapes as the SQL service.
 */
import {
  enrichHierarchy,
  groupItems,
  isFiltersActive,
  matchItem,
  sortItems,
  withAncestors,
  type FilterItem,
  type ViewState,
} from "@/lib/items/filter";
import { buildSprintSections, type SprintSummary } from "@/lib/items/sprint-planning";
import { sprintIdsByItem } from "@/lib/items/sprint-filter";
import { pointsByStatusCategory } from "@/lib/items/status-points";
import type { ItemType } from "@/lib/design/constants";
import type {
  BacklogViewRows,
  ListViewRows,
  TreeViewRows,
  ViewGroupSummary,
} from "@/lib/services/view-rows";

export type LegacyItemRow = {
  id: string;
  key: string;
  type: ItemType;
  kind: FilterItem["kind"];
  title: string;
  statusId: string;
  priority: number;
  estimatePoints: number | null;
  assigneeId: string | null;
  parentId: string | null;
  path: string;
  depth: number;
  dueDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  rank: string;
};

export type LegacyViewInput = {
  /** The rows the page loaded: every live item, or the Version matches and their ancestors. */
  items: LegacyItemRow[];
  /** The Version matches when the (effective) Version filter is on, `null` otherwise. */
  releaseMatchedIds: ReadonlySet<string> | null;
  labelPairs: ReadonlyArray<{ itemId: string; labelId: string }>;
  fixVersionPairs: ReadonlyArray<{ itemId: string; releaseId: string }>;
  sprints: SprintSummary[];
  memberships: Parameters<typeof sprintIdsByItem>[0];
  statuses: ReadonlyArray<{ id: string; order: number; category: "todo" | "in_progress" | "done" }>;
  state: ViewState;
};

function prepare(input: LegacyViewInput) {
  const { items, statuses, state } = input;
  const labelIdsByItem = new Map<string, string[]>();
  for (const pair of input.labelPairs) {
    const ids = labelIdsByItem.get(pair.itemId) ?? [];
    ids.push(pair.labelId);
    labelIdsByItem.set(pair.itemId, ids);
  }
  const fixVersionIdsByItem = new Map<string, string[]>();
  for (const pair of input.fixVersionPairs) {
    const ids = fixVersionIdsByItem.get(pair.itemId) ?? [];
    ids.push(pair.releaseId);
    fixVersionIdsByItem.set(pair.itemId, ids);
  }
  const statusOrderById = new Map(statuses.map((status) => [status.id, status.order]));
  const sprintIdsByItemId = sprintIdsByItem(input.memberships, items);
  const filterRows: FilterItem[] = enrichHierarchy(items.map((i) => ({
    id: i.id,
    key: i.key,
    type: i.type,
    title: i.title,
    statusId: i.statusId,
    priority: i.priority,
    assigneeId: i.assigneeId,
    parentId: i.parentId,
    path: i.path,
    depth: i.depth,
    dueDate: i.dueDate,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    rank: i.rank,
    labelIds: labelIdsByItem.get(i.id) ?? [],
    fixVersionIds: fixVersionIdsByItem.get(i.id) ?? [],
    sprintIds: sprintIdsByItemId.get(i.id) ?? [],
    kind: i.kind,
    statusOrder: statusOrderById.get(i.statusId) ?? 0,
  })));
  const filtersOn = isFiltersActive(state.filters);
  const releaseFilterActive = input.releaseMatchedIds !== null;
  const nonReleaseFilters = { ...state.filters, releaseIds: [] };
  const matchedIds = new Set(
    filterRows
      .filter((r) =>
        (!releaseFilterActive || input.releaseMatchedIds!.has(r.id))
        && matchItem(r, nonReleaseFilters),
      )
      .map((r) => r.id),
  );
  const isMatch = (id: string) => !filtersOn || matchedIds.has(id);
  return { filterRows, filtersOn, matchedIds, isMatch };
}

function summarize(rows: FilterItem[], input: LegacyViewInput): ViewGroupSummary {
  const estimateById = new Map(input.items.map((item) => [item.id, item.estimatePoints]));
  // ItemList's `estimateOf`: only tasks are estimated.
  const estimateOf = (row: FilterItem) =>
    row.type === "tache" ? (estimateById.get(row.id) ?? null) : undefined;
  return {
    count: rows.length,
    unestimated: rows.filter((row) => estimateOf(row) === null).length,
    points: pointsByStatusCategory(
      rows.map((row) => ({ statusId: row.statusId, estimatePoints: estimateOf(row) ?? null })),
      input.statuses,
    ),
  };
}

export function legacyListRows(input: LegacyViewInput): ListViewRows {
  const { filterRows, isMatch } = prepare(input);
  const { state } = input;
  const listRows = filterRows.filter((r) => isMatch(r.id));
  const listSorted = state.sort ? sortItems(listRows, state.sort) : listRows;
  const listGroups: Array<[string, typeof listSorted]> = state.group
    ? groupItems(listSorted, state.group)
    : [["", listSorted]];
  return {
    total: listRows.length,
    groups: listGroups.map(([key, rows]) => ({
      key,
      itemIds: rows.map((row) => row.id),
      summary: summarize(rows, input),
    })),
  };
}

export function legacyBacklogRows(input: LegacyViewInput): BacklogViewRows {
  const { filterRows, isMatch } = prepare(input);
  const { state, items } = input;
  const statusCategoryById = new Map(input.statuses.map((status) => [status.id, status.category]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const currentSprintItemIds = new Set(
    input.memberships
      .filter((membership) => membership.leftAt === null)
      .map((membership) => membership.itemId),
  );
  const total = filterRows.filter(
    (item) =>
      item.type === "tache" &&
      isMatch(item.id) &&
      (currentSprintItemIds.has(item.id) ||
        statusCategoryById.get(item.statusId) !== "done"),
  ).length;
  const baseSections = buildSprintSections({
    sprints: input.sprints,
    memberships: [...input.memberships],
    items: items
      .filter((item) => item.type === "tache")
      .map((item) => ({
        id: item.id,
        type: item.type,
        rank: item.rank,
        estimatePoints: item.estimatePoints,
        done: statusCategoryById.get(item.statusId) === "done",
      })),
  });
  const sections = new Map<string, Array<{ key: string; itemIds: string[] }>>();
  for (const section of baseSections) {
    const sectionIds = new Set(section.items.map((item) => item.id));
    const rows = filterRows.filter(
      (row) => row.type === "tache" && sectionIds.has(row.id) && isMatch(row.id),
    );
    const sorted = state.sort ? sortItems(rows, state.sort) : rows.sort((left, right) => {
      const leftRank = itemById.get(left.id)?.rank ?? "";
      const rightRank = itemById.get(right.id)?.rank ?? "";
      return leftRank < rightRank ? -1 : leftRank > rightRank ? 1 : 0;
    });
    const groupedRows: Array<[string, typeof sorted]> = state.group
      ? groupItems(sorted, state.group)
      : [["", sorted]];
    // The service lists only sections and groups that hold rows.
    const groups = groupedRows
      .map(([key, groupRows]) => ({ key, itemIds: groupRows.map((row) => row.id) }))
      .filter((group) => group.itemIds.length > 0);
    if (groups.length > 0) sections.set(section.id, groups);
  }
  return { total, sections };
}

export function legacyTreeRows(input: LegacyViewInput): TreeViewRows {
  const { filterRows, matchedIds } = prepare(input);
  const visible = withAncestors(filterRows, matchedIds);
  return {
    matchedIds: filterRows.filter((row) => matchedIds.has(row.id)).map((row) => row.id),
    contextIds: filterRows
      .filter((row) => visible.has(row.id) && !matchedIds.has(row.id))
      .map((row) => row.id),
  };
}

/** The Board's cards: tasks the filters keep (it then narrows to the active sprint). */
export function legacyMatchingTaskIds(input: LegacyViewInput): string[] {
  const { filterRows, isMatch } = prepare(input);
  return filterRows
    .filter((row) => row.type === "tache" && isMatch(row.id))
    .map((row) => row.id);
}
