import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { resolveBacklogAccess } from "@/lib/auth/accessible-backlogs";
import { checkPermission, listAssignableUsersForBacklog } from "@/lib/auth/authorization";
import { projectBacklogCapabilities } from "@/lib/auth/capabilities";
import { db } from "@/lib/db";
import { repoConnections, statuses } from "@/lib/db/schema/domain";
import type { ItemType } from "@/lib/design/constants";
import type { ItemDetailData } from "@/lib/items/item-detail-data";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { listComments } from "@/lib/services/comments";
import { listItemFixVersionPairs } from "@/lib/services/item-fix-versions";
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
import { listWebLinksForItem } from "@/lib/services/web-links";
import { listReleaseSummaries } from "@/lib/services/releases";
import { listSprintsForBacklog } from "@/lib/services/sprints";

/**
 * Loads everything the item detail drawer shows, on its own: the server
 * render of a deep link and the drawer's client-side fetch both use it, so
 * opening an item no longer re-renders the whole backlog view.
 *
 * Returns null when the backlog is unknown, archived or not browsable by the
 * user (the same checks as the backlog page). An item missing from an
 * accessible backlog (deleted or mistyped key) is reported as `not-found`.
 */
export async function loadItemDetailData({
  userId,
  backlogKey,
  itemKey,
}: {
  userId: string;
  backlogKey: string;
  itemKey: string;
}): Promise<ItemDetailData | null> {
  const backlog = await getBacklogByKeyForUser(backlogKey, userId);
  if (!backlog || backlog.archivedAt) return null;

  // The backlog query already enforced browse access; the reads below run
  // alongside the capability checks and are discarded unless browse holds.
  const [
    access,
    detail,
    backlogItems,
    statusRows,
    labels,
    sprintSnapshot,
    releaseSummaries,
    fixVersionPairs,
  ] = await Promise.all([
    // browse_users joins the capabilities' global batch.
    resolveBacklogAccess(userId, backlog.id, ["browse_users"]),
    getItemByKeyForBacklog(itemKey, backlog.id),
    listItems(backlog.id),
    db
      .select()
      .from(statuses)
      .where(eq(statuses.backlogId, backlog.id))
      .orderBy(asc(statuses.order), asc(statuses.id)),
    listLabelsForBacklog(backlog.id),
    listSprintsForBacklog(backlog.id),
    listReleaseSummaries(backlog.id, { includeArchived: true }),
    listItemFixVersionPairs(backlog.id),
  ]);
  const { capabilities } = access;
  if (!capabilities) return null;
  const canBrowseUsers = access.globalDecisions.get("browse_users")?.allowed === true;
  // The drawer is already open: explain the miss instead of an empty panel.
  if (!detail) return { kind: "not-found", itemKey };

  const [
    activities,
    itemLabelIds,
    comments,
    links,
    refs,
    enabledConnections,
    administerDecision,
    webLinks,
    directoryUsers,
    assigneeCandidates,
  ] = await Promise.all([
    listActivities(detail.id),
    getItemLabelIds(detail.id),
    listComments(detail.id),
    listLinksForItem(detail.id),
    listRefsForItem(detail.id),
    db
      .select({ id: repoConnections.id })
      .from(repoConnections)
      .where(and(eq(repoConnections.backlogId, backlog.id), eq(repoConnections.enabled, true)))
      .limit(1),
    checkPermission({
      actorId: userId,
      permission: "administer_backlog",
      scope: { type: "backlog", backlogId: backlog.id },
    }),
    listWebLinksForItem(detail.id),
    canBrowseUsers ? listUsers() : Promise.resolve([]),
    canBrowseUsers ? listAssignableUsersForBacklog(backlog.id) : Promise.resolve([]),
  ]);
  // Names shown in the drawer: the directory (when browsable) plus everyone
  // the backlog and this item reference, so no name falls back to an id. The
  // whole directory already names everyone: look the others up only without it.
  const referencedUsers = canBrowseUsers ? [] : await listUsersByIds([
    ...backlogItems.flatMap((item) => [item.assigneeId, item.reporterId]),
    detail.assigneeId,
    detail.reporterId,
    ...activities.map((activity) => activity.actorId),
    ...comments.map((comment) => comment.authorId),
  ].filter((id): id is string => typeof id === "string"));
  const directory = directoryUsers.map(({ id, name }) => ({ id, name }));
  const users = [...new Map(
    [...referencedUsers, ...directory].map((candidate) => [candidate.id, candidate]),
  ).values()];

  const productCapabilities = projectBacklogCapabilities(capabilities);
  const releaseOptions = releaseSummaries.map(({ id, name, released, archived }) => ({
    id,
    name,
    released,
    archived,
  }));
  const releaseById = new Map(releaseOptions.map((release) => [release.id, release]));
  const assignableReleaseOptions = releaseOptions.filter((release) => !release.archived);
  const fixVersions = fixVersionPairs.flatMap((pair) => {
    const release = pair.itemId === detail.id ? releaseById.get(pair.releaseId) : undefined;
    return release ? [release] : [];
  });
  const openSprints = sprintSnapshot.sprints
    .filter((sprint) => sprint.state !== "completed")
    .map((sprint) => ({ id: sprint.id, name: sprint.name }));
  const sprintId = sprintSnapshot.memberships.find(
    (membership) => membership.itemId === detail.id && membership.leftAt === null,
  )?.sprintId ?? null;

  const candidates = backlogItems.map((item) => ({
    id: item.id,
    key: item.key,
    title: item.title,
    type: item.type as ItemType,
  }));
  const parentItem = detail.parentId
    ? backlogItems.find((item) => item.id === detail.parentId)
    : undefined;
  // The backlog's items are ordered depth, rank, key: children keep their rank.
  const childItems = backlogItems
    .filter((item) => item.parentId === detail.id)
    .map((item) => ({
      id: item.id,
      key: item.key,
      title: item.title,
      type: item.type as ItemType,
      statusId: item.statusId,
    }));

  return {
    kind: "item",
    panel: {
      detail,
      activities,
      comments,
      currentUserId: userId,
      itemLabelIds,
      backlogLabels: labels,
      users,
      assigneeCandidates,
      reporterCandidates: directory,
      statuses: statusRows.map(({ id, name, color, category, order }) => ({
        id,
        name,
        color,
        category,
        order,
      })),
      backlogKey: backlog.key,
      links,
      candidates,
      refs,
      hasRepoConnection: enabledConnections.length > 0,
      canAdministerBacklog: administerDecision.allowed,
      webLinks,
      parent: parentItem
        ? { key: parentItem.key, title: parentItem.title, type: parentItem.type as ItemType }
        : undefined,
      childItems,
      // The drawer may show an item the view's filter left out: its child
      // creation picks parents among the whole backlog.
      createDialog: capabilities.createItems
        ? {
            backlogId: backlog.id,
            canScheduleItems: capabilities.scheduleItems,
            items: backlogItems.map((item) => ({
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
            // Jira's Create screen: the fields the user may already set at creation.
            fieldOptions: {
              users: assigneeCandidates,
              canAssign: capabilities.assignItems,
              currentUserId: userId,
              sprints: openSprints,
              labels: labels.map(({ id, name, color }) => ({ id, name, color })),
            },
          }
        : undefined,
      sprints: openSprints,
      sprintId,
      canEditItems: capabilities.editItems,
      canTransitionItems: capabilities.transitionItems,
      canAssignItems: capabilities.assignItems,
      itemCapabilities: productCapabilities.items,
      planningCapabilities: productCapabilities.planning,
      fixVersions,
      releaseOptions: assignableReleaseOptions,
      releaseCapabilities: productCapabilities.releases,
    },
  };
}
