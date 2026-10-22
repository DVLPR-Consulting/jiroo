import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { resolveBacklogAccess } from "@/lib/auth/accessible-backlogs";
import { listAssignableUsersForBacklog } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { sprints, statuses } from "@/lib/db/schema/domain";
import { binaryTextOrder } from "@/lib/db/order";
import type { NewItemDialogData } from "@/components/items/new-item-dialog";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { listLabelsForBacklog, listLiveParentCandidates } from "@/lib/services/items";
import { listItemTemplates } from "@/lib/services/item-templates";
import { listReleaseSummaries } from "@/lib/services/releases";

export type BacklogCreateDialog = NewItemDialogData & { backlogKey: string };

/**
 * The « Nouvel item » dialog of a backlog page that is not one of its views
 * (Roadmap, Releases, Rapports, Paramètres): Jira keeps « Create » in the top
 * bar everywhere. Null when the backlog is not browsable, archived, or the
 * user may not create items there.
 */
export async function loadBacklogCreateDialog({
  userId,
  backlogKey,
}: {
  userId: string;
  backlogKey: string;
}): Promise<BacklogCreateDialog | null> {
  const backlog = await getBacklogByKeyForUser(backlogKey, userId);
  if (!backlog || backlog.archivedAt) return null;
  const access = await resolveBacklogAccess(userId, backlog.id, ["browse_users"]);
  const { capabilities } = access;
  if (!capabilities?.createItems) return null;
  const canBrowseUsers = access.globalDecisions.get("browse_users")?.allowed === true;

  const [parents, statusRows, labels, openSprints, releaseSummaries, assigneeCandidates, templates] =
    await Promise.all([
      listLiveParentCandidates(backlog.id),
      db
        .select({ id: statuses.id, name: statuses.name, category: statuses.category })
        .from(statuses)
        .where(eq(statuses.backlogId, backlog.id))
        .orderBy(asc(statuses.order), asc(statuses.id)),
      listLabelsForBacklog(backlog.id),
      // Sprint headers only: their membership history is not needed here.
      db
        .select({ id: sprints.id, name: sprints.name })
        .from(sprints)
        .where(and(eq(sprints.backlogId, backlog.id), ne(sprints.state, "completed")))
        .orderBy(asc(binaryTextOrder(sprints.rank))),
      listReleaseSummaries(backlog.id),
      canBrowseUsers ? listAssignableUsersForBacklog(backlog.id) : Promise.resolve([]),
      listItemTemplates(backlog.id),
    ]);

  return {
    templates,
    backlogId: backlog.id,
    backlogKey: backlog.key,
    backlogColor: backlog.color,
    canScheduleItems: capabilities.scheduleItems,
    items: parents.map(({ id, key, type, title }) => ({ id, key, type, title })),
    statuses: statusRows,
    releaseOptions: releaseSummaries
      .filter((release) => !release.archived)
      .map(({ id, name, released, archived }) => ({ id, name, released, archived })),
    fieldOptions: {
      users: assigneeCandidates,
      canAssign: capabilities.assignItems,
      canBrowseUsers,
      currentUserId: userId,
      sprints: openSprints,
      labels: labels.map(({ id, name, color }) => ({ id, name, color })),
    },
  };
}
