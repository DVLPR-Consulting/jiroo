import {
  ItemDetailPanel,
  type DetailCreateDialog,
} from "@/components/items/item-detail-panel";
import { ItemDetailNotFound } from "@/components/items/item-detail-sheet";
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
  listUsersByIds,
} from "@/lib/services/items";
import { listLinksForItem } from "@/lib/services/links";
import { listRefsForItem } from "@/lib/services/refs";
import type {
  ItemCapabilities,
  PlanningCapabilities,
  ReleaseCapabilities,
} from "@/lib/auth/capabilities";
import type { FixVersionOption } from "@/components/items/fix-version-picker";

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
  assigneeCandidates,
  reporterCandidates,
  statuses,
  labels,
  items,
  currentUserId,
  sprints = [],
  sprintId = null,
  canEditItems = true,
  canTransitionItems = true,
  canAssignItems = true,
  itemCapabilities,
  planningCapabilities,
  fixVersions = [],
  releaseOptions = [],
  releaseCapabilities,
  createDialog,
}: {
  itemKey: string;
  backlog: Backlog;
  users: Users;
  assigneeCandidates: Users;
  reporterCandidates: Users;
  statuses: Status[];
  labels: Labels;
  items: Items;
  currentUserId: string;
  sprints?: { id: string; name: string }[];
  sprintId?: string | null;
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
  itemCapabilities?: ItemCapabilities;
  planningCapabilities?: PlanningCapabilities;
  fixVersions?: FixVersionOption[];
  releaseOptions?: FixVersionOption[];
  releaseCapabilities?: ReleaseCapabilities;
  /** « Nouvel item » data, to create a child from the drawer. */
  createDialog?: DetailCreateDialog;
}) {
  const detail = await getItemByKeyForBacklog(itemKey, backlog.id);
  // The drawer is already open: explain the miss instead of an empty panel.
  if (!detail) return <ItemDetailNotFound itemKey={itemKey} />;

  const [activities, itemLabelIds, comments, links, refs] = await Promise.all([
    listActivities(detail.id),
    getItemLabelIds(detail.id),
    listComments(detail.id),
    listLinksForItem(detail.id),
    listRefsForItem(detail.id),
  ]);
  const detailReferencedUsers = await listUsersByIds([
    detail.assigneeId,
    detail.reporterId,
    ...activities.map((activity) => activity.actorId),
    ...comments.map((comment) => comment.authorId),
  ].filter((id): id is string => typeof id === "string"));
  const displayUsers = [...new Map(
    [...users, ...detailReferencedUsers].map((candidate) => [candidate.id, candidate]),
  ).values()];
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
    ? { key: parentItem.key, title: parentItem.title, type: parentItem.type as ItemType }
    : undefined;
  // The view's items are ordered depth, rank, key: children keep their rank.
  const childItems = items
    .filter((item) => item.parentId === detail.id)
    .map((item) => ({
      id: item.id,
      key: item.key,
      title: item.title,
      type: item.type as ItemType,
      statusId: item.statusId,
    }));

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
        users={displayUsers}
        assigneeCandidates={assigneeCandidates}
        reporterCandidates={reporterCandidates}
        statuses={statuses}
        backlogKey={backlog.key}
        links={links}
        candidates={candidates}
        refs={refs}
        parent={parent}
        childItems={childItems}
        createDialog={createDialog}
        sprints={sprints}
        sprintId={sprintId}
        canEditItems={canEditItems}
        canTransitionItems={canTransitionItems}
        canAssignItems={canAssignItems}
        itemCapabilities={itemCapabilities}
        planningCapabilities={planningCapabilities}
        fixVersions={fixVersions}
        releaseOptions={releaseOptions}
        releaseCapabilities={releaseCapabilities}
      />
    </>
  );
}
