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
import { ViewBar } from "@/components/shell/view-bar";
import { ItemList } from "@/components/items/item-list";
import { ItemDetailPanel } from "@/components/items/item-detail-panel";
import { NewItemButton } from "@/components/items/new-item-dialog";

export default async function BacklogPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const { key } = await params;
  const { item: itemKey } = await searchParams;
  const backlog = await getBacklogByKey(key);
  if (!backlog || backlog.archivedAt) notFound();

  const items = await listItems(backlog.id);
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
        newItemSlot={
          <NewItemButton
            backlogId={backlog.id}
            backlogKey={backlog.key}
            items={items.map((i) => ({ id: i.id, key: i.key, type: i.type, title: i.title }))}
            statuses={statusRows.map((s) => ({ id: s.id, name: s.name }))}
          />
        }
      />
      <ItemList
        items={items}
        statuses={statusMap}
        backlogKey={key}
        selectedKey={itemKey}
      />
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
