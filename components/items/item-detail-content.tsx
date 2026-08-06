import { ItemDetailPanel } from "@/components/items/item-detail-panel";
import { RecentItemTracker } from "@/components/items/recent-item-tracker";
import type { ItemType } from "@/lib/design/constants";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { listComments } from "@/lib/services/comments";
import {
  getItemByKeyForBacklog,
  getItemLabelIds,
  listActivities,
  listItems,
  listLabelsForBacklog,
  listUsers,
} from "@/lib/services/items";
import { listLinksForItem } from "@/lib/services/links";
import { listRefsForItem } from "@/lib/services/refs";

type Backlog = NonNullable<Awaited<ReturnType<typeof getBacklogByKeyForUser>>>;
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
  canEditItems = true,
  canTransitionItems = true,
  canAssignItems = true,
}: {
  itemKey: string;
  backlog: Backlog;
  users: Users;
  statuses: Status[];
  labels: Labels;
  items: Items;
  currentUserId: string;
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
}) {
  const detail = await getItemByKeyForBacklog(itemKey, backlog.id);
  if (!detail) return null;

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
        canEditItems={canEditItems}
        canTransitionItems={canTransitionItems}
        canAssignItems={canAssignItems}
      />
    </>
  );
}
