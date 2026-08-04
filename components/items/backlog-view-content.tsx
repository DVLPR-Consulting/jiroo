import { Suspense } from "react";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { statuses } from "@/lib/db/schema/domain";
import { getBacklogByKey } from "@/lib/services/backlogs";
import {
  listItemLabelPairs,
  listItems,
  listLabelsForBacklog,
  listUsers,
} from "@/lib/services/items";
import { blockedItemIds } from "@/lib/services/links";
import { moveItemAction, reparentItemAction } from "@/app/actions/items";
import {
  parseViewState,
  matchItem,
  isFiltersActive,
  groupItems,
  sortItems,
  withAncestors,
  enrichHierarchy,
  type FilterItem,
} from "@/lib/items/filter";
import { PRIORITY_LABELS } from "@/lib/design/constants";
import { getSession } from "@/lib/auth/session";
import { getViewById } from "@/lib/services/views";
import { columnsToViewState, isViewDirty, type DisplayMode } from "@/lib/items/views";
import { ViewBar } from "@/components/shell/view-bar";
import { GroupControl } from "@/components/shell/group-control";
import { FilterBar } from "@/components/shell/filter-bar";
import { ViewActions } from "@/components/shell/view-actions";
import { ItemList } from "@/components/items/item-list";
import { ItemBoard } from "@/components/items/item-board";
import { ItemTree } from "@/components/items/item-tree";
import { ItemDetailContent } from "@/components/items/item-detail-content";
import { DetailPanelSkeleton } from "@/components/items/view-skeletons";
import { NewItemButton } from "@/components/items/new-item-dialog";
import {
  firstSearchParam,
  type RawSearchParams,
  type ViewUrlEntry,
} from "@/lib/items/view-url-params";

const VIEW_STATE_PARAM_KEYS = [
  "q",
  "type",
  "status",
  "prio",
  "assignee",
  "label",
  "kind",
  "under",
  "group",
  "sort",
] as const;

export async function BacklogViewContent({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ key: string }>;
  searchParamsPromise: Promise<RawSearchParams>;
}) {
  const { key } = await paramsPromise;
  const sp = await searchParamsPromise;
  const itemKey = firstSearchParam(sp.item);
  const rawView = firstSearchParam(sp.view);
  const viewStateEntries: ViewUrlEntry[] = VIEW_STATE_PARAM_KEYS.flatMap((name) => {
    const value = firstSearchParam(sp[name]);
    return value === undefined ? [] : [[name, value]];
  });
  const viewState = parseViewState(new URLSearchParams(viewStateEntries));

  const session = await getSession();
  const userId = session?.user.id ?? "";

  const VIEWS = ["board", "list", "tree"] as const;
  const view = (VIEWS as readonly string[]).includes(rawView ?? "")
    ? (rawView as string)
    : "board";

  const backlog = await getBacklogByKey(key);
  if (!backlog || backlog.archivedAt) notFound();

  // Load and validate the active saved view from ?v=.
  // A stale, foreign, or inaccessible view id is silently treated as "no active view".
  const v = firstSearchParam(sp.v);
  const rawActiveView = v ? await getViewById(v) : null;
  const activeViewRow =
    rawActiveView &&
    rawActiveView.backlogId === backlog.id &&
    (rawActiveView.ownerId === userId || rawActiveView.shared)
      ? rawActiveView
      : null;

  const isOwner = activeViewRow !== null && activeViewRow.ownerId === userId;
  const dirty =
    activeViewRow !== null &&
    isViewDirty(columnsToViewState(activeViewRow), {
      state: viewState,
      displayMode: view as DisplayMode,
    });

  const [items, labelPairs, blockedIds, statusRows] = await Promise.all([
    listItems(backlog.id),
    listItemLabelPairs(backlog.id),
    blockedItemIds(backlog.id),
    db
      .select()
      .from(statuses)
      .where(eq(statuses.backlogId, backlog.id))
      .orderBy(asc(statuses.order)),
  ]);

  // Set of item ids that are blocked by an unfinished item — used to drive the badge.
  const blockedSet = new Set(blockedIds);

  // Build a map from itemId to its array of label objects for quick lookup.
  const labelsByItem = new Map<string, { id: string; name: string; color: string }[]>();
  for (const p of labelPairs) {
    const arr = labelsByItem.get(p.itemId) ?? [];
    arr.push({ id: p.labelId, name: p.name, color: p.color });
    labelsByItem.set(p.itemId, arr);
  }

  const statusOrderById = new Map(statusRows.map((status) => [status.id, status.order]));
  const filterRows: FilterItem[] = enrichHierarchy(items.map((i) => ({
    id: i.id,
    key: i.key,
    type: i.type,
    title: i.title,
    description: i.description,
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
    labelIds: (labelsByItem.get(i.id) ?? []).map((l) => l.id),
    kind: i.kind,
    statusOrder: statusOrderById.get(i.statusId) ?? 0,
  })));
  const filtersOn = isFiltersActive(viewState.filters);
  const matchedIds = new Set(
    filterRows
      .filter((r) => matchItem(r, viewState.filters))
      .map((r) => r.id),
  );
  const isMatch = (id: string) => !filtersOn || matchedIds.has(id);

  // List view: sort then group the filtered rows.
  const listRows = filterRows.filter((r) => isMatch(r.id));
  const listSorted = viewState.sort ? sortItems(listRows, viewState.sort) : listRows;
  const listGroups: Array<[string, typeof listSorted]> = viewState.group
    ? groupItems(listSorted, viewState.group)
    : [["", listSorted]];

  const statusList = statusRows.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    category: s.category,
    order: s.order,
  }));
  const statusMap = Object.fromEntries(
    statusRows.map((s) => [s.id, { name: s.name, color: s.color }]),
  );
  const createDialogProps = {
    backlogId: backlog.id,
    items: items.map((item) => ({
      id: item.id,
      key: item.key,
      type: item.type,
      title: item.title,
    })),
    statuses: statusRows.map((status) => ({ id: status.id, name: status.name })),
  };

  const resultCount = filtersOn ? matchedIds.size : items.length;

  // Single user fetch reused by both the filter bar facet and assignee-name resolution.
  // Backlog labels fetched once and reused by the filter facet and (when open) the detail panel.
  const [usersForFilter, backlogLabelRows] = await Promise.all([
    listUsers(),
    listLabelsForBacklog(backlog.id),
  ]);
  const userName = new Map(usersForFilter.map((u) => [u.id, u.name]));

  const groupLabel = (key: string): string => {
    if (!viewState.group || key === "") return "";
    if (key === "none") {
      if (viewState.group === "assignee") return "Non assigné";
      if (viewState.group === "component") return "Sans composant";
      if (viewState.group === "parent") return "Sans parent";
      return key; // priority/status never emit "none"
    }
    switch (viewState.group) {
      case "status":
        return statusMap[key]?.name ?? key;
      case "assignee":
        return userName.get(key) ?? key;
      case "priority":
        return PRIORITY_LABELS[Number(key) as 0 | 1 | 2 | 3 | 4] ?? key;
      case "component":
        return items.find((i) => i.id === key)?.title ?? key;
      case "parent":
        return items.find((i) => i.id === key)?.title ?? key;
    }
  };

  // Board cards: in-memory subCount per parent + assignee names resolved from the users map.
  const childCount = new Map<string, number>();
  for (const i of items) {
    if (i.parentId) childCount.set(i.parentId, (childCount.get(i.parentId) ?? 0) + 1);
  }
  const filterRowById = new Map(filterRows.map((row) => [row.id, row]));
  // Jira-style mono-level board: cards are the working level (Tâche) only. Sous-tâches stay
  // nested under their tâche (shown as the subCount badge); Composant/Epic are structure,
  // navigated in the tree/list — never sibling cards next to their own children.
  const boardCards = items
    .filter((i) => i.type === "tache" && isMatch(i.id))
    .map((i) => ({
      id: i.id,
      key: i.key,
      type: i.type,
      title: i.title,
      statusId: i.statusId,
      priority: i.priority,
      rank: i.rank,
      assigneeId: i.assigneeId,
      parentId: i.parentId,
      componentId: filterRowById.get(i.id)?.componentId ?? null,
      assigneeName: i.assigneeId ? (userName.get(i.assigneeId) ?? null) : null,
      subCount: childCount.get(i.id) ?? 0,
      labels: labelsByItem.get(i.id) ?? [],
      blocked: blockedSet.has(i.id),
      kind: i.kind,
      dueDate: i.dueDate,
    }));

  // Board swimlanes: status is the columns, so it never groups the board. Build
  // the label for each band key the same way the board partitions its cards.
  const boardGroup =
    viewState.group === "assignee" ||
    viewState.group === "priority" ||
    viewState.group === "component" ||
    viewState.group === "parent"
      ? viewState.group
      : null;
  const groupLabels: Record<string, string> = {};
  if (boardGroup) {
    for (const c of boardCards) {
      const k =
        boardGroup === "assignee"
          ? (c.assigneeId ?? "none")
          : boardGroup === "priority"
            ? String(c.priority)
            : boardGroup === "component"
              ? (c.componentId ?? "none")
              : (c.parentId ?? "none");
      groupLabels[k] =
        k === "none"
          ? boardGroup === "assignee"
            ? "Non assigné"
            : boardGroup === "component"
              ? "Sans composant"
              : "Sans parent"
            : boardGroup === "assignee"
            ? (c.assigneeName ?? k)
            : boardGroup === "priority"
              ? PRIORITY_LABELS[Number(k) as 0 | 1 | 2 | 3 | 4]
              : (items.find((i) => i.id === k)?.title ?? k);
    }
  }

  // Tree rows: the flat item list (already ordered depth,rank,key) reshaped for ItemTree.
  // When filters are active, restrict to matched items + their ancestors (context). Ancestors
  // are passed separately so the tree can render them dimmed and non-interactive.
  const treeVisibleIds = filtersOn ? withAncestors(filterRows, matchedIds) : null;
  const contextIds = filtersOn
    ? new Set([...treeVisibleIds!].filter((id) => !matchedIds.has(id)))
    : new Set<string>();
  const treeData =
    view === "tree"
      ? items
          .filter((i) => treeVisibleIds === null || treeVisibleIds.has(i.id))
          .map((i) => ({
            id: i.id,
            key: i.key,
            type: i.type,
            title: i.title,
            parentId: i.parentId,
            statusId: i.statusId,
            priority: i.priority,
            depth: i.depth,
            rank: i.rank,
            path: i.path,
            labels: labelsByItem.get(i.id) ?? [],
            assigneeId: i.assigneeId,
            assigneeName: i.assigneeId ? (userName.get(i.assigneeId) ?? null) : null,
          }))
      : [];

  // Bug 2: board status filter hides unselected columns — pass only the selected
  // statuses when a status filter is active; all statuses otherwise.
  const boardStatuses =
    viewState.filters.statusIds.length > 0
      ? statusList.filter((s) => viewState.filters.statusIds.includes(s.id))
      : statusList;
  const clearFiltersHref = `/b/${encodeURIComponent(key)}?${new URLSearchParams({ view }).toString()}`;

  return (
    <div className="flex h-full flex-col">
      <ViewBar
        view={view}
        groupControlSlot={
          <GroupControl
            view={view as DisplayMode}
            state={viewState}
          />
        }
        viewActionsSlot={
          <ViewActions
            backlogKey={key}
            backlogId={backlog.id}
            activeView={
              activeViewRow
                ? { id: activeViewRow.id, name: activeViewRow.name, shared: activeViewRow.shared }
                : null
            }
            isOwner={isOwner}
            dirty={dirty}
            displayMode={view as DisplayMode}
            filters={viewState.filters}
            group={viewState.group}
            sort={viewState.sort}
          />
        }
        newItemSlot={
          <NewItemButton
            backlogKey={backlog.key}
            {...createDialogProps}
            enableShortcut
          />
        }
      />
      <FilterBar
        state={viewState}
        statuses={statusList.map((s) => ({ id: s.id, name: s.name }))}
        users={usersForFilter.map((u) => ({ id: u.id, name: u.name }))}
        labels={backlogLabelRows.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
        hierarchy={items.map((item) => ({
          id: item.id,
          key: item.key,
          title: item.title,
          type: item.type,
        }))}
        resultCount={resultCount}
      />
      {view === "list" && (
        <ItemList
          groups={listGroups.map(([key, rows]) => ({
            key,
            label: groupLabel(key),
            items: rows.map((r) => ({
              ...r,
              dueDate: r.dueDate?.toISOString() ?? null,
              assigneeName: r.assigneeId ? (userName.get(r.assigneeId) ?? null) : null,
              labels: labelsByItem.get(r.id) ?? [],
              blocked: blockedSet.has(r.id),
            })),
          }))}
          grouped={viewState.group !== null}
          statuses={statusList}
          users={usersForFilter.map((user) => ({ id: user.id, name: user.name }))}
          backlogKey={key}
          selectedKey={itemKey}
          currentSort={viewState.sort}
          filtersActive={filtersOn}
          hasItems={items.length > 0}
          clearFiltersHref={clearFiltersHref}
          createDialogProps={createDialogProps}
        />
      )}
      {view === "board" && (
        <ItemBoard
          backlogKey={key}
          items={boardCards}
          statuses={boardStatuses}
          statusDomain={statusList}
          group={boardGroup}
          groupLabels={groupLabels}
          moveItemAction={moveItemAction}
          createDialogProps={createDialogProps}
          filtersActive={filtersOn}
          hasItems={items.length > 0}
          clearFiltersHref={clearFiltersHref}
        />
      )}
      {view === "tree" && (
        <ItemTree
          backlogKey={key}
          items={treeData}
          selectedKey={itemKey}
          statuses={statusList}
          contextIds={[...contextIds]}
          reparentItemAction={reparentItemAction}
          moveItemAction={moveItemAction}
          filtersActive={filtersOn}
          hasItems={items.length > 0}
          clearFiltersHref={clearFiltersHref}
          createDialogProps={createDialogProps}
        />
      )}
      {itemKey && (
        <Suspense fallback={<DetailPanelSkeleton />}>
          <ItemDetailContent
            itemKey={itemKey}
            backlog={backlog}
            currentUserId={userId}
            labels={backlogLabelRows}
            users={usersForFilter}
            statuses={statusList}
            items={items}
          />
        </Suspense>
      )}
    </div>
  );
}
