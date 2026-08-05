import { ItemDetailPanel } from "@/components/items/item-detail-panel";
import { RecentItemTracker } from "@/components/items/recent-item-tracker";
import type { ItemType } from "@/lib/design/constants";
import { getBacklogByKey } from "@/lib/services/backlogs";
import { listComments } from "@/lib/services/comments";
import {
  getItemByKey,
  getItemLabelIds,
  listActivities,
  listItems,
  listLabelsForBacklog,
  listUsers,
} from "@/lib/services/items";
import { listLinksForItem } from "@/lib/services/links";
import { listRefsForItem } from "@/lib/services/refs";

type Backlog = NonNullable<Awaited<ReturnType<typeof getBacklogByKey>>>;
type Items = Awaited<ReturnType<typeof listItems>>;
type Labels = Awaited<ReturnType<typeof listLabelsForBacklog>>;
type Users = Awaited<ReturnType<typeof listUsers>>;
type Status = {
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
};

export async function ItemDetailContent({
  itemKey,
  backlog,
  users,
  statuses,
  labels,
  items,
  currentUserId,
  canWrite = true,
}: {
  itemKey: string;
  backlog: Backlog;
  users: Users;
  statuses: Status[];
  labels: Labels;
  items: Items;
  currentUserId: string;
  canWrite?: boolean;
}) {
  const detail = await getItemByKey(itemKey);
  if (!detail || detail.backlogId !== backlog.id) return null;

  const [activities, itemLabelIds, comments, links, refs] = await Promise.all([
    listActivities(detail.id),
    getItemLabelIds(detail.id),
    listComments(detail.id),
    listLinksForItem(detail.id),
    listRefsForItem(detail.id),
  ]);
  const candidates = items.map((item) => ({
    id: item.id,
    key: item.key,
    title: item.title,
    type: item.type as ItemType,
  }));
  const parentItem = detail.parentId
    ? items.find((item) => item.id === detail.parentId)
    : undefined;
  const parent = parentItem
    ? { key: parentItem.key, title: parentItem.title }
    : undefined;

  return (
    <>
      <RecentItemTracker itemKey={detail.key} />
      <ItemDetailPanel
        key={detail.id}
        detail={detail}
        activities={activities}
        comments={comments}
        currentUserId={currentUserId}
        itemLabelIds={itemLabelIds}
        backlogLabels={labels}
        users={users}
        statuses={statuses}
        backlogKey={backlog.key}
        links={links}
        candidates={candidates}
        refs={refs}
        parent={parent}
        canWrite={canWrite}
      />
    </>
  );
}
