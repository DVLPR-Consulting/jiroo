import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getBacklogCapabilities } from "@/lib/auth/accessible-backlogs";
import {
  checkPermission,
  listAssignableUsersForBacklog,
} from "@/lib/auth/authorization";
import { projectBacklogCapabilities } from "@/lib/auth/capabilities";
import { items as itemRowsTable, statuses } from "@/lib/db/schema/domain";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import {
  listItemLabelPairs,
  listItems,
  listItemsWithAncestors,
  listLabelsForBacklog,
  listLiveItemTypes,
  listLiveParentCandidates,
  listUsers,
  listUsersByIds,
} from "@/lib/services/items";
import { blockedItemIds } from "@/lib/services/links";
import { listItemFixVersionPairs } from "@/lib/services/item-fix-versions";
import { listItemTemplates } from "@/lib/services/item-templates";
import { listReleaseSummaries } from "@/lib/services/releases";
import { moveItemAction, reparentItemAction } from "@/app/actions/items";
import {
  parseViewState,
  matchItem,
  isFiltersActive,
  groupItems,
  sortItems,
  withAncestors,
  enrichHierarchy,
  withKnownReleaseIds,
  type FilterItem,
} from "@/lib/items/filter";
import { PRIORITY_LABELS } from "@/lib/design/constants";
import { hierarchyStartStep } from "@/lib/tree/hierarchy";
import { requireAppPageSession } from "@/lib/auth/session";
import { getViewByIdForUser } from "@/lib/services/views";
import { hasSavableViewState } from "@/lib/items/filter-chips";
import { columnsToViewState, isViewDirty, type DisplayMode } from "@/lib/items/views";
import { PageHeader } from "@/components/shell/page-header";
import { PROJECT_VIEWS } from "@/lib/items/shell";
import { DisplayMenu } from "@/components/shell/display-menu";
import { FilterBar } from "@/components/shell/filter-bar";
import { ViewActions } from "@/components/shell/view-actions";
import { ItemList, ListColumnsMenu } from "@/components/items/item-list";
import { ItemBacklog } from "@/components/items/item-backlog";
import { ItemBoard } from "@/components/items/item-board";
import { ItemTree } from "@/components/items/item-tree";
import { ItemDetailDrawer } from "@/components/items/item-detail-sheet";
import { TopbarCreateItem } from "@/components/shell/create-item-trigger";
import { StatusManagerDialog } from "@/components/statuses/status-manager-dialog";
import {
  firstSearchParam,
  type RawSearchParams,
  type ViewUrlEntry,
} from "@/lib/items/view-url-params";
import { buildSprintSections } from "@/lib/items/sprint-planning";
import {
  orderSprintsForFilter,
  sprintIdsByItem,
  withKnownSprintIds,
} from "@/lib/items/sprint-filter";
import { pointsByStatusCategory } from "@/lib/items/status-points";
import { listSprintsForBacklog } from "@/lib/services/sprints";
import { loadItemDetailData } from "@/lib/services/item-detail";
import {
  getActiveSprintStartCommitment,
  getPreviousSprintsVelocityContext,
} from "@/lib/services/sprint-burndown";

const VIEW_STATE_PARAM_KEYS = [
  "q",
  "type",
  "status",
  "prio",
  "assignee",
  "label",
  "version",
  "sprint",
  "kind",
  "under",
  "group",
  "sort",
  "fvcol",
  "lblcol",
  "duecol",
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
  // Requested state from the URL; the Version filter is sanitized below once the
  // backlog's versions are known (deleted versions are ignored, D19).
  const requestedViewState = parseViewState(new URLSearchParams(viewStateEntries));

  const session = await requireAppPageSession();
  const userId = session.user.id;

  const VIEWS = ["backlog", "board", "list", "tree"] as const;
  const view = (VIEWS as readonly string[]).includes(rawView ?? "")
    ? (rawView as string)
    : "board";

  const backlog = await getBacklogByKeyForUser(key, userId);
  if (!backlog || backlog.archivedAt) notFound();
  const capabilities = await getBacklogCapabilities(userId, backlog.id);
  if (!capabilities) notFound();
  const productCapabilities = projectBacklogCapabilities(capabilities);

  // Load and validate the active saved view from ?v=.
  // A stale, foreign, or inaccessible view id is silently treated as "no active view".
  const v = firstSearchParam(sp.v);
  const rawActiveView = v ? await getViewByIdForUser(v, userId) : null;
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
      state: requestedViewState,
      displayMode: view as DisplayMode,
    });

  const [
    requestedReleaseItems,
    labelPairs,
    fixVersionPairs,
    releaseSummaries,
    blockedIds,
    statusRows,
    statusCountRows,
    sprintSnapshot,
    recentVelocity,
    activeSprintCommitment,
  ] = await Promise.all([
    listItems(backlog.id, { releaseIds: requestedViewState.filters.releaseIds }),
    listItemLabelPairs(backlog.id),
    listItemFixVersionPairs(backlog.id),
    listReleaseSummaries(backlog.id, { includeArchived: true }),
    blockedItemIds(backlog.id),
    db
      .select()
      .from(statuses)
      .where(eq(statuses.backlogId, backlog.id))
      .orderBy(asc(statuses.order), asc(statuses.id)),
    db
      .select({
        statusId: itemRowsTable.statusId,
        count: sql<number>`count(*)::int`,
      })
      .from(itemRowsTable)
      .where(eq(itemRowsTable.backlogId, backlog.id))
      .groupBy(itemRowsTable.statusId),
    listSprintsForBacklog(backlog.id),
    // Only the Backlog view renders planning comparisons; one backlog-level read
    // of the five latest completed sprints, compared by active and planned sprints.
    view === "backlog"
      ? getPreviousSprintsVelocityContext(backlog.id)
      : Promise.resolve(null),
    // The active sprint is compared at its commitment frozen at start (Jira's
    // velocity "Commitment"); one aggregate read, Backlog view only.
    view === "backlog"
      ? getActiveSprintStartCommitment(backlog.id)
      : Promise.resolve(null),
  ]);
  // The Sprint facet (JIR-81) is Jira's issue-search Sprint filter: it belongs
  // to Liste and Arbre. Board and Backlog are laid out by sprint already (and
  // hide completed sprints by design), so they ignore it.
  const sprintFilterEnabled = view === "list" || view === "tree";
  const knownSprintIds = new Set(sprintSnapshot.sprints.map((sprint) => sprint.id));
  const viewState = {
    ...requestedViewState,
    filters: withKnownSprintIds(
      withKnownReleaseIds(
        requestedViewState.filters,
        new Set(releaseSummaries.map((release) => release.id)),
      ),
      sprintFilterEnabled ? knownSprintIds : null,
    ),
  };
  // Saving from Board or Backlog keeps the (hidden) Sprint facet of the URL,
  // as the dirty check compares the requested state: an update made there
  // must not erase a saved view's sprint filter.
  const savableFilters = {
    ...viewState.filters,
    sprintIds: withKnownSprintIds(requestedViewState.filters, knownSprintIds).sprintIds,
  };
  // Only unknown versions were requested: show every item, not an empty list.
  const releaseFilteredItems =
    requestedViewState.filters.releaseIds.length > 0 && viewState.filters.releaseIds.length === 0
      ? await listItems(backlog.id)
      : requestedReleaseItems;
  const releaseMatchedIds = new Set(releaseFilteredItems.map((item) => item.id));
  const releaseFilterActive = viewState.filters.releaseIds.length > 0;
  const items = releaseFilterActive
    ? await listItemsWithAncestors(backlog.id, [...releaseMatchedIds])
    : releaseFilteredItems;

  // The first-steps guide (JIR-88) and creation (JIR-92) read the live
  // backlog, never the Version-filtered rows: a version without items must not
  // pass for a new backlog, nor hide the parents a new item can go under.
  // Only the Version filter narrows the rows loaded here; the other filters
  // are applied to them below, so without it no extra read is needed.
  const [liveItemTypes, parentCandidates] = releaseFilterActive
    ? await Promise.all([listLiveItemTypes(backlog.id), listLiveParentCandidates(backlog.id)])
    : [items.map((item) => item.type), items];
  const startStep = hierarchyStartStep(liveItemTypes.map((type) => ({ type })));
  const backlogHasItems = liveItemTypes.length > 0;

  // Set of item ids that are blocked by an unfinished item — used to drive the badge.
  const blockedSet = new Set(blockedIds);

  // Build a map from itemId to its array of label objects for quick lookup.
  const labelsByItem = new Map<string, { id: string; name: string; color: string }[]>();
  for (const p of labelPairs) {
    const arr = labelsByItem.get(p.itemId) ?? [];
    arr.push({ id: p.labelId, name: p.name, color: p.color });
    labelsByItem.set(p.itemId, arr);
  }

  const releaseOptions = releaseSummaries.map(({ id, name, released, archived }) => ({
    id,
    name,
    released,
    archived,
  }));
  const releaseById = new Map(releaseOptions.map((release) => [release.id, release]));
  const fixVersionIdsByItem = new Map<string, string[]>();
  const fixVersionsByItem = new Map<string, typeof releaseOptions>();
  for (const pair of fixVersionPairs) {
    const ids = fixVersionIdsByItem.get(pair.itemId) ?? [];
    ids.push(pair.releaseId);
    fixVersionIdsByItem.set(pair.itemId, ids);

    const release = releaseById.get(pair.releaseId);
    if (release) {
      const versions = fixVersionsByItem.get(pair.itemId) ?? [];
      versions.push(release);
      fixVersionsByItem.set(pair.itemId, versions);
    }
  }
  const selectedReleaseIds = new Set(viewState.filters.releaseIds);
  const assignableReleaseOptions = releaseOptions.filter((release) => !release.archived);
  const releaseFilterOptions = releaseOptions.filter(
    (release) => !release.archived || selectedReleaseIds.has(release.id),
  );

  const statusOrderById = new Map(statusRows.map((status) => [status.id, status.order]));
  const sprintIdsByItemId = sprintIdsByItem(sprintSnapshot.memberships, items);
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
    fixVersionIds: fixVersionIdsByItem.get(i.id) ?? [],
    sprintIds: sprintIdsByItemId.get(i.id) ?? [],
    kind: i.kind,
    statusOrder: statusOrderById.get(i.statusId) ?? 0,
  })));
  const filtersOn = isFiltersActive(viewState.filters);
  const nonReleaseFilters = { ...viewState.filters, releaseIds: [] };
  const matchedIds = new Set(
    filterRows
      .filter((r) =>
        (!releaseFilterActive || releaseMatchedIds.has(r.id))
        && matchItem(r, nonReleaseFilters),
      )
      .map((r) => r.id),
  );
  const isMatch = (id: string) => !filtersOn || matchedIds.has(id);

  // List view: sort then group the filtered rows.
  const listRows = filterRows.filter((r) => isMatch(r.id));
  const listSorted = viewState.sort ? sortItems(listRows, viewState.sort) : listRows;
  const listGroups: Array<[string, typeof listSorted]> = viewState.group
    ? groupItems(listSorted, viewState.group)
    : [["", listSorted]];

  const statusCategoryById = new Map(
    statusRows.map((status) => [status.id, status.category]),
  );
  const currentSprintItemIds = new Set(
    sprintSnapshot.memberships
      .filter((membership) => membership.leftAt === null)
      .map((membership) => membership.itemId),
  );
  const backlogResultCount = filterRows.filter(
    (item) =>
      item.type === "tache" &&
      isMatch(item.id) &&
      (currentSprintItemIds.has(item.id) ||
        statusCategoryById.get(item.statusId) !== "done"),
  ).length;
  const hasBacklogItems = filterRows.some(
    (item) =>
      item.type === "tache" &&
      statusCategoryById.get(item.statusId) !== "done",
  );

  const itemCountByStatus = new Map(
    statusCountRows.map(({ statusId, count }) => [statusId, Number(count)]),
  );
  const statusList = statusRows.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    category: s.category,
    order: s.order,
    itemCount: itemCountByStatus.get(s.id) ?? 0,
  }));
  const statusMap = Object.fromEntries(
    statusRows.map((s) => [s.id, { name: s.name, color: s.color }]),
  );

  const referencedUserIds = items.flatMap((item) =>
    [item.assigneeId, item.reporterId].filter((id): id is string => id !== null),
  );
  const browseUsersDecision = await checkPermission({
    actorId: userId,
    permission: "browse_users",
    scope: { type: "global" },
  });
  const [referencedUsers, rawDirectoryUsers, assigneeCandidates, backlogLabelRows, templates] = await Promise.all([
    listUsersByIds(referencedUserIds),
    browseUsersDecision.allowed ? listUsers() : Promise.resolve([]),
    browseUsersDecision.allowed
      ? listAssignableUsersForBacklog(backlog.id)
      : Promise.resolve([]),
    listLabelsForBacklog(backlog.id),
    capabilities.createItems ? listItemTemplates(backlog.id) : Promise.resolve([]),
  ]);
  const createDialogProps = {
    templates,
    backlogId: backlog.id,
    backlogColor: backlog.color,
    canScheduleItems: capabilities.scheduleItems,
    items: parentCandidates.map((item) => ({
      id: item.id,
      key: item.key,
      type: item.type,
      title: item.title,
    })),
    statuses: statusRows.map((status) => ({
      id: status.id,
      name: status.name,
      category: status.category,
    })),
    releaseOptions: assignableReleaseOptions,
    // The effective filters (unknown versions dropped, Sprint facet only in
    // Liste and Arbre): a create they leave out says so (JIR-92).
    viewFilters: viewState.filters,
    // Jira's Create screen: the fields the user may already set at creation.
    fieldOptions: {
      users: assigneeCandidates,
      canAssign: capabilities.assignItems,
      canBrowseUsers: browseUsersDecision.allowed,
      currentUserId: userId,
      sprints: sprintSnapshot.sprints
        .filter((sprint) => sprint.state !== "completed")
        .map((sprint) => ({ id: sprint.id, name: sprint.name })),
      labels: backlogLabelRows.map(({ id, name, color }) => ({ id, name, color })),
    },
  };
  const directoryUsers = rawDirectoryUsers.map(({ id, name }) => ({ id, name }));
  const displayUsers = [...new Map(
    [...referencedUsers, ...directoryUsers].map((candidate) => [candidate.id, candidate]),
  ).values()];
  const userName = new Map(displayUsers.map((u) => [u.id, u.name]));
  const estimateByItem = new Map(items.map((item) => [item.id, item.estimatePoints]));

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
  const itemById = new Map(items.map((item) => [item.id, item]));
  const parentPill = (parentId: string | null) => {
    const parent = parentId ? itemById.get(parentId) : undefined;
    return parent ? { key: parent.key, title: parent.title, type: parent.type } : null;
  };
  const planningItemById = new Map(
    items
      .filter((item) => item.type === "tache")
      .map((item) => [
        item.id,
        {
          id: item.id,
          key: item.key,
          title: item.title,
          type: "tache" as const,
          kind: item.kind,
          statusId: item.statusId,
          priority: item.priority,
          estimatePoints: item.estimatePoints,
          assigneeId: item.assigneeId,
          assigneeName: item.assigneeId ? (userName.get(item.assigneeId) ?? null) : null,
          rank: item.rank,
          blocked: blockedSet.has(item.id),
          done: statusCategoryById.get(item.statusId) === "done",
          fixVersions: fixVersionsByItem.get(item.id) ?? [],
          parent: parentPill(item.parentId),
        },
      ]),
  );
  const baseSprintSections = buildSprintSections({
    sprints: sprintSnapshot.sprints,
    memberships: sprintSnapshot.memberships,
    items: [...planningItemById.values()],
    recentVelocity,
    activeSprintCommitment,
  });
  const activeSection = baseSprintSections.find((section) => section.kind === "active") ?? null;
  const activeSprint = activeSection?.sprint ?? null;
  const activeSprintItemIds = new Set(
    activeSection?.items.map((item) => item.id) ?? [],
  );
  const planningSections = baseSprintSections.map((section) => {
    const sectionIds = new Set(section.items.map((item) => item.id));
    const rows = filterRows.filter(
      (row) => row.type === "tache" && sectionIds.has(row.id) && isMatch(row.id),
    );
    const sorted = viewState.sort ? sortItems(rows, viewState.sort) : rows.sort((left, right) => {
      const leftRank = itemById.get(left.id)?.rank ?? "";
      const rightRank = itemById.get(right.id)?.rank ?? "";
      return leftRank < rightRank ? -1 : leftRank > rightRank ? 1 : 0;
    });
    const groupedRows: Array<[string, typeof sorted]> = viewState.group
      ? groupItems(sorted, viewState.group)
      : [["", sorted]];
    const visibleItems = sorted.map((row) => planningItemById.get(row.id)!);
    return {
      ...section,
      // Like the section metrics, the status lozenges cover the whole section.
      statusPoints: pointsByStatusCategory(section.items, statusList),
      items: visibleItems,
      groups: groupedRows.map(([groupKey, groupRows]) => ({
        key: groupKey,
        label: groupLabel(groupKey),
        items: groupRows.map((row) => planningItemById.get(row.id)!),
      })),
    };
  });
  // Jira-style mono-level board: cards are the working level (Tâche) only. Sous-tâches stay
  // nested under their tâche (shown as the subCount badge); Composant/Epic are structure,
  // navigated in the tree/list — never sibling cards next to their own children.
  const boardCards = items
    .filter(
      (i) =>
        i.type === "tache" &&
        activeSprintItemIds.has(i.id) &&
        isMatch(i.id),
    )
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
      fixVersions: fixVersionsByItem.get(i.id) ?? [],
    }));
  const resultCount =
    view === "backlog"
      ? backlogResultCount
      : view === "board"
        ? boardCards.length
        : filtersOn
          ? matchedIds.size
          : items.length;

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
            fixVersions: fixVersionsByItem.get(i.id) ?? [],
          }))
      : [];

  // Bug 2: board status filter hides unselected columns — pass only the selected
  // statuses when a status filter is active; all statuses otherwise.
  const boardStatuses =
    viewState.filters.statusIds.length > 0
      ? statusList.filter((s) => viewState.filters.statusIds.includes(s.id))
      : statusList;
  const clearFiltersHref = `/b/${encodeURIComponent(key)}?${new URLSearchParams({ view }).toString()}`;
  const backlogParams = new URLSearchParams(viewStateEntries);
  backlogParams.set("view", "backlog");
  const backlogHref = `/b/${encodeURIComponent(key)}?${backlogParams.toString()}`;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={PROJECT_VIEWS.find((candidate) => candidate.id === view)?.label}
        actions={
          <>
            {view === "board" && productCapabilities.workflow.manage ? (
              <StatusManagerDialog
                key={statusList.map((status) => `${status.id}:${status.order}:${status.name}:${status.category}:${status.itemCount}`).join("|")}
                backlogId={backlog.id}
                backlogKey={backlog.key}
                statuses={statusList}
                capabilities={productCapabilities.workflow}
              />
            ) : null}
            {view === "list" ? (
              <ListColumnsMenu
                showLabels={viewState.filters.showLabels === true}
                showDueDate={viewState.filters.showDueDate === true}
                showFixVersions={viewState.filters.showFixVersions === true}
              />
            ) : null}
            <DisplayMenu view={view as DisplayMode} state={viewState} />
          </>
        }
      />
      {/* Always there, as Jira's Create: the Board adds to its active sprint
          when the user may plan it, the backlog otherwise. */}
      {capabilities.createItems ? (
        <TopbarCreateItem
          backlogKey={backlog.key}
          {...createDialogProps}
          {...(view === "board" && activeSprint && capabilities.scheduleItems
            ? { sprintId: activeSprint.id, contextLabel: activeSprint.name }
            : {})}
        />
      ) : null}
      <FilterBar
        state={viewState}
        statuses={statusList.map((s) => ({ id: s.id, name: s.name }))}
        users={referencedUsers}
        labels={backlogLabelRows.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
        releases={releaseFilterOptions}
        hierarchy={items.map((item) => ({
          id: item.id,
          key: item.key,
          title: item.title,
          type: item.type,
        }))}
        sprints={
          sprintFilterEnabled
            ? orderSprintsForFilter(sprintSnapshot.sprints).map(({ id, name, state }) => ({
                id,
                name,
                state,
              }))
            : undefined
        }
        resultCount={resultCount}
        actions={
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
            filters={savableFilters}
            group={viewState.group}
            sort={viewState.sort}
            showTrigger={activeViewRow !== null || hasSavableViewState(viewState)}
          />
        }
      />
      {view === "backlog" && (
        <ItemBacklog
          sections={planningSections}
          sprints={sprintSnapshot.sprints}
          recentVelocity={recentVelocity}
          activeSprintCommitment={activeSprintCommitment}
          createDialogProps={createDialogProps}
          grouped={viewState.group !== null}
          statuses={statusList}
          users={assigneeCandidates}
          canBrowseUsers={browseUsersDecision.allowed}
          backlogKey={key}
          backlogId={backlog.id}
          filtersActive={filtersOn}
          hasItems={hasBacklogItems}
          startStep={startStep}
          clearFiltersHref={clearFiltersHref}
          canCreateItems={capabilities.createItems}
          canEditItems={capabilities.editItems}
          canTransitionItems={capabilities.transitionItems}
          canAssignItems={capabilities.assignItems}
          canScheduleItems={capabilities.scheduleItems}
          canManageSprints={capabilities.manageSprints}
          canBulkChangeItems={capabilities.bulkChangeItems}
          itemCapabilities={productCapabilities.items}
          planningCapabilities={productCapabilities.planning}
          bulkCapabilities={productCapabilities.bulk}
          releaseOptions={assignableReleaseOptions}
          releaseCapabilities={productCapabilities.releases}
          manualOrder={viewState.sort === null && viewState.group === null}
        />
      )}
      {view === "list" && (
        <ItemList
          groups={listGroups.map(([key, rows]) => ({
            key,
            label: groupLabel(key),
            items: rows.map((r) => ({
              ...r,
              estimatePoints: estimateByItem.get(r.id) ?? null,
              assigneeName: r.assigneeId ? (userName.get(r.assigneeId) ?? null) : null,
              labels: labelsByItem.get(r.id) ?? [],
              fixVersions: fixVersionsByItem.get(r.id) ?? [],
              blocked: blockedSet.has(r.id),
              parent: parentPill(r.parentId),
            })),
          }))}
          grouped={viewState.group !== null}
          statuses={statusList}
          users={assigneeCandidates}
          canBrowseUsers={browseUsersDecision.allowed}
          backlogId={backlog.id}
          backlogKey={key}
          currentSort={viewState.sort}
          filtersActive={filtersOn}
          hasItems={backlogHasItems}
          startStep={startStep}
          clearFiltersHref={clearFiltersHref}
          createDialogProps={createDialogProps}
          canCreateItems={capabilities.createItems}
          canEditItems={capabilities.editItems}
          canTransitionItems={capabilities.transitionItems}
          canAssignItems={capabilities.assignItems}
          canBulkChangeItems={capabilities.bulkChangeItems}
          canScheduleItems={capabilities.scheduleItems}
          itemCapabilities={productCapabilities.items}
          planningCapabilities={productCapabilities.planning}
          bulkCapabilities={productCapabilities.bulk}
          releaseOptions={assignableReleaseOptions}
          releaseCapabilities={productCapabilities.releases}
          showFixVersions={viewState.filters.showFixVersions === true}
          showLabels={viewState.filters.showLabels === true}
          showDueDate={viewState.filters.showDueDate === true}
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
          createDialogProps={{
            ...createDialogProps,
            ...(activeSprint
              ? { sprintId: activeSprint.id, contextLabel: activeSprint.name }
              : {}),
          }}
          filtersActive={filtersOn}
          hasItems={(activeSection?.items.length ?? 0) > 0}
          clearFiltersHref={clearFiltersHref}
          canCreateItems={capabilities.createItems}
          canEditItems={capabilities.editItems}
          canTransitionItems={capabilities.transitionItems}
          canScheduleItems={capabilities.scheduleItems}
          itemCapabilities={productCapabilities.items}
          planningCapabilities={productCapabilities.planning}
          activeSprint={activeSprint}
          activeSprintMetrics={activeSection?.metrics ?? null}
          backlogHref={backlogHref}
        />
      )}
      {view === "tree" && (
        <ItemTree
          backlogKey={key}
          items={treeData}
          statuses={statusList}
          contextIds={[...contextIds]}
          reparentItemAction={reparentItemAction}
          moveItemAction={moveItemAction}
          filtersActive={filtersOn}
          hasItems={backlogHasItems}
          startStep={startStep}
          clearFiltersHref={clearFiltersHref}
          createDialogProps={createDialogProps}
          canCreateItems={capabilities.createItems}
          canScheduleItems={capabilities.scheduleItems}
          itemCapabilities={productCapabilities.items}
          planningCapabilities={productCapabilities.planning}
        />
      )}
      {/* Always rendered: the drawer opens on click with a skeleton (client
          side); the detail, loaded on its own, streams into it. */}
      <ItemDetailDrawer
        backlogKey={backlog.key}
        itemKey={itemKey ?? null}
        viewFilters={viewState.filters}
        detail={itemKey
          ? loadItemDetailData({ userId, backlogKey: backlog.key, itemKey })
          : null}
      />
    </div>
  );
}
