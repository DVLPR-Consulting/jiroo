import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { statuses } from "@/lib/db/schema/domain";
import { getBacklogByKey } from "@/lib/services/backlogs";
import {
  getItemByKey,
  getItemLabelIds,
  listActivities,
  listItems,
  listLabelsForBacklog,
  listUsers,
} from "@/lib/services/items";
import { moveItemAction, reparentItemAction } from "@/app/actions/items";
import {
  parseViewState,
  matchItem,
  isFiltersActive,
  type FilterItem,
} from "@/lib/items/filter";
import { ViewBar } from "@/components/shell/view-bar";
import { ItemList } from "@/components/items/item-list";
import { ItemBoard } from "@/components/items/item-board";
import { ItemTree } from "@/components/items/item-tree";
import { ItemDetailPanel } from "@/components/items/item-detail-panel";
import { NewItemButton } from "@/components/items/new-item-dialog";

export default async function BacklogPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  const itemKey = sp.item;
  const rawView = sp.view;
  const viewState = parseViewState(
    new URLSearchParams(
      Object.entries(sp).filter(
        (entry): entry is [string, string] => entry[1] != null,
      ),
    ),
  );
  const backlog = await getBacklogByKey(key);
  if (!backlog || backlog.archivedAt) notFound();

  const VIEWS = ["board", "list", "tree"] as const;
  const view = (VIEWS as readonly string[]).includes(rawView ?? "")
    ? (rawView as string)
    : "board";

  const items = await listItems(backlog.id);

  const filterRows: FilterItem[] = items.map((i) => ({
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
    dueDate: i.dueDate,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    rank: i.rank,
  }));
  const filtersOn = isFiltersActive(viewState.filters);
  const matchedIds = new Set(
    filterRows
      .filter((r) => matchItem(r, viewState.filters))
      .map((r) => r.id),
  );
  const isMatch = (id: string) => !filtersOn || matchedIds.has(id);

  const statusRows = await db
    .select()
    .from(statuses)
    .where(eq(statuses.backlogId, backlog.id))
    .orderBy(asc(statuses.order));

  const statusList = statusRows.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    category: s.category,
  }));
  const statusMap = Object.fromEntries(
    statusRows.map((s) => [s.id, { name: s.name, color: s.color }]),
  );

  // Board cards: in-memory subCount per parent + assignee names resolved from a users map.
  const childCount = new Map<string, number>();
  for (const i of items) {
    if (i.parentId) childCount.set(i.parentId, (childCount.get(i.parentId) ?? 0) + 1);
  }
  const needsAssignees =
    (view === "board" || view === "tree") && items.some((i) => i.assigneeId);
  const usersForBoard = needsAssignees ? await listUsers() : [];
  const userName = new Map(usersForBoard.map((u) => [u.id, u.name]));
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
      assigneeName: i.assigneeId ? (userName.get(i.assigneeId) ?? null) : null,
      subCount: childCount.get(i.id) ?? 0,
    }));

  // Tree rows: the flat item list (already ordered depth,rank,key) reshaped for ItemTree.
  const treeData =
    view === "tree"
      ? items.map((i) => ({
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
          assigneeName: i.assigneeId ? (userName.get(i.assigneeId) ?? null) : null,
        }))
      : [];

  const detail = itemKey ? await getItemByKey(itemKey) : null;
  const showPanel = detail && detail.backlogId === backlog.id;

  const [activities, itemLabelIds, backlogLabels, users] = showPanel
    ? await Promise.all([
        listActivities(detail.id),
        getItemLabelIds(detail.id),
        listLabelsForBacklog(backlog.id),
        listUsers(),
      ])
    : [[], [], [], []];

  return (
    <div className="flex h-full flex-col">
      <ViewBar
        view={view}
        backlogKey={key}
        itemKey={itemKey}
        newItemSlot={
          <NewItemButton
            backlogId={backlog.id}
            backlogKey={backlog.key}
            items={items.map((i) => ({ id: i.id, key: i.key, type: i.type, title: i.title }))}
            statuses={statusRows.map((s) => ({ id: s.id, name: s.name }))}
          />
        }
      />
      {view === "list" && (
        <ItemList
          items={items.filter((i) => isMatch(i.id))}
          statuses={statusMap}
          backlogKey={key}
          selectedKey={itemKey}
        />
      )}
      {view === "board" && (
        <ItemBoard
          backlogKey={key}
          items={boardCards}
          statuses={statusList}
          moveItemAction={moveItemAction}
        />
      )}
      {view === "tree" && (
        <ItemTree
          backlogKey={key}
          items={treeData}
          selectedKey={itemKey}
          statuses={statusMap}
          reparentItemAction={reparentItemAction}
          moveItemAction={moveItemAction}
        />
      )}
      {showPanel && (
        <ItemDetailPanel
          detail={detail}
          activities={activities}
          itemLabelIds={itemLabelIds}
          backlogLabels={backlogLabels}
          users={users}
          statuses={statusList}
          backlogKey={key}
        />
      )}
    </div>
  );
}
