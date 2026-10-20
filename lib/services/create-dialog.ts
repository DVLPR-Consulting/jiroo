import "server-only";
import { asc, eq } from "drizzle-orm";
import { resolveBacklogAccess } from "@/lib/auth/accessible-backlogs";
import { listAssignableUsersForBacklog } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { statuses } from "@/lib/db/schema/domain";
import type { NewItemDialogData } from "@/components/items/new-item-dialog";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { listLabelsForBacklog, listLiveParentCandidates } from "@/lib/services/items";
import { listReleaseSummaries } from "@/lib/services/releases";
import { listSprintsForBacklog } from "@/lib/services/sprints";

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

  const [parents, statusRows, labels, sprintSnapshot, releaseSummaries, assigneeCandidates] =
    await Promise.all([
      listLiveParentCandidates(backlog.id),
      db
        .select({ id: statuses.id, name: statuses.name, category: statuses.category })
        .from(statuses)
        .where(eq(statuses.backlogId, backlog.id))
        .orderBy(asc(statuses.order), asc(statuses.id)),
      listLabelsForBacklog(backlog.id),
      listSprintsForBacklog(backlog.id),
      listReleaseSummaries(backlog.id),
      canBrowseUsers ? listAssignableUsersForBacklog(backlog.id) : Promise.resolve([]),
    ]);

  return {
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
      sprints: sprintSnapshot.sprints
        .filter((sprint) => sprint.state !== "completed")
        .map((sprint) => ({ id: sprint.id, name: sprint.name })),
      labels: labels.map(({ id, name, color }) => ({ id, name, color })),
    },
  };
}
