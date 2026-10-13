import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  browseAccessPredicate,
  listAccessibleBacklogs,
  type AccessibleBacklogDto,
} from "@/lib/auth/accessible-backlogs";
import { ResourceNotFoundError } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogStars, backlogs, items, statuses } from "@/lib/db/schema/domain";
import { STATUS_CATEGORY, type StatusId } from "@/lib/design/constants";
import { planItemKeyRewrite } from "@/lib/items/backlog-key";
import { provisionBacklogAuthorization } from "@/lib/services/authorization-seed";
import {
  listActiveSprintProgress,
  type ActiveSprintProgress,
} from "@/lib/services/sprint-burndown";
import {
  createBacklogSchema,
  setBacklogStarSchema,
  updateBacklogSchema,
} from "@/lib/validation/backlog";

// The 4 fixed statuses every backlog gets at creation.
export const DEFAULT_STATUSES: { id: StatusId; name: string; color: string }[] = [
  { id: "todo", name: "À faire", color: "#9aa0a6" },
  { id: "doing", name: "En cours", color: "#d99a2b" },
  { id: "review", name: "En revue", color: "#8b5cf6" },
  { id: "done", name: "Terminé", color: "#3aa675" },
];

export function listBacklogsForUser(
  userId: string,
  opts?: { includeArchived?: boolean },
) {
  return listAccessibleBacklogs(userId, opts);
}

/** The user's star on the current backlog row, as a boolean column. */
function starredByUser(userId: string) {
  return sql<boolean>`exists (
    select 1 from ${backlogStars}
    where ${backlogStars.backlogId} = ${backlogs.id}
      and ${backlogStars.userId} = ${userId}
  )`;
}

export type StarredBacklogDto = AccessibleBacklogDto & { starred: boolean };

/**
 * Accessible, non-archived backlogs for the backlog selector (JIR-82):
 * favourites first, then by name, like Jira's starred projects.
 */
export async function listBacklogsWithStarsForUser(
  userId: string,
): Promise<StarredBacklogDto[]> {
  const starred = starredByUser(userId);
  return db
    .select({
      id: backlogs.id,
      key: backlogs.key,
      name: backlogs.name,
      color: backlogs.color,
      archivedAt: backlogs.archivedAt,
      starred,
    })
    .from(backlogs)
    .where(and(isNull(backlogs.archivedAt), browseAccessPredicate(userId)))
    .orderBy(desc(starred), asc(backlogs.name), asc(backlogs.key));
}

/** Backlogs listed in Administration → Backlogs, archived included, with their lead. */
export function listAdminBacklogsForUser(userId: string) {
  return db
    .select({
      id: backlogs.id,
      key: backlogs.key,
      name: backlogs.name,
      color: backlogs.color,
      archivedAt: backlogs.archivedAt,
      leadUserId: backlogs.leadUserId,
    })
    .from(backlogs)
    .where(browseAccessPredicate(userId))
    .orderBy(asc(backlogs.name));
}

export type BacklogOverviewRow = {
  id: string;
  key: string;
  name: string;
  color: string;
  starred: boolean;
  /** Non-deleted items whose status is not in the done category. */
  openItemCount: number;
  activeSprint: Omit<ActiveSprintProgress, "backlogId"> | null;
  lead: { id: string; name: string } | null;
};

/**
 * The home page's « Backlogs » list (JIR-82): accessible, non-archived
 * backlogs with their counters, favourites first then by name. Two aggregate
 * queries whatever the number of backlogs.
 */
export async function listBacklogOverviewForUser(
  userId: string,
): Promise<BacklogOverviewRow[]> {
  const starred = starredByUser(userId);
  const rows = await db
    .select({
      id: backlogs.id,
      key: backlogs.key,
      name: backlogs.name,
      color: backlogs.color,
      starred,
      openItemCount: sql<number>`(
        select count(*) from ${items} open_item
        join ${statuses} open_status on open_status.id = open_item.status_id
        where open_item.backlog_id = ${backlogs.id}
          and open_item.deleted_at is null
          and open_status.category <> 'done'
      )::int`,
      leadId: user.id,
      leadName: user.name,
    })
    .from(backlogs)
    .leftJoin(user, eq(user.id, backlogs.leadUserId))
    .where(and(isNull(backlogs.archivedAt), browseAccessPredicate(userId)))
    .orderBy(desc(starred), asc(backlogs.name), asc(backlogs.key));

  const sprintsByBacklog = new Map(
    (await listActiveSprintProgress(rows.map((row) => row.id))).map(
      ({ backlogId, ...sprint }) => [backlogId, sprint],
    ),
  );
  return rows.map(({ leadId, leadName, ...row }) => ({
    ...row,
    openItemCount: Number(row.openItemCount),
    activeSprint: sprintsByBacklog.get(row.id) ?? null,
    lead: leadId && leadName !== null ? { id: leadId, name: leadName } : null,
  }));
}

/**
 * Stars or unstars a backlog for the user (JIR-82). Idempotent: the request
 * states the wanted state. Only a backlog the user can browse, not archived;
 * otherwise reported as not found so nothing leaks about it.
 */
export async function setBacklogStar(
  input: unknown,
  userId: string,
): Promise<{ starred: boolean }> {
  const data = setBacklogStarSchema.parse(input);
  return db.transaction(async (tx) => {
    const [backlog] = await tx
      .select({ id: backlogs.id })
      .from(backlogs)
      .where(
        and(
          eq(backlogs.id, data.backlogId),
          isNull(backlogs.archivedAt),
          browseAccessPredicate(userId),
        ),
      )
      .limit(1);
    if (!backlog) throw new ResourceNotFoundError("backlog", data.backlogId);

    if (data.starred) {
      await tx
        .insert(backlogStars)
        .values({ userId, backlogId: backlog.id })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(backlogStars)
        .where(and(eq(backlogStars.userId, userId), eq(backlogStars.backlogId, backlog.id)));
    }
    return { starred: data.starred };
  });
}

export async function getBacklogByKeyForUser(key: string, userId: string) {
  const [b] = await db
    .select({
      id: backlogs.id,
      key: backlogs.key,
      name: backlogs.name,
      color: backlogs.color,
      archivedAt: backlogs.archivedAt,
    })
    .from(backlogs)
    .where(
      and(
        eq(backlogs.key, key.toUpperCase()),
        browseAccessPredicate(userId),
      ),
    )
    .limit(1);
  return b ?? null;
}

/**
 * Name and key of a backlog the caller has already authorized (settings
 * pages): no visibility filter, so a platform administrator's bypass holds.
 */
export async function getBacklogSummary(id: string) {
  const [backlog] = await db
    .select({ id: backlogs.id, key: backlogs.key, name: backlogs.name })
    .from(backlogs)
    .where(eq(backlogs.id, id))
    .limit(1);
  return backlog ?? null;
}

export async function createBacklog(input: unknown, creatorId: string) {
  const data = createBacklogSchema.parse(input);
  return db.transaction(async (tx) => {
    const [backlog] = await tx.insert(backlogs).values(data).returning();
    await tx.insert(statuses).values(
      DEFAULT_STATUSES.map((s, i) => ({
        backlogId: backlog!.id,
        name: s.name,
        category: STATUS_CATEGORY[s.id],
        order: i,
        color: s.color,
      })),
    );
    await provisionBacklogAuthorization(tx, {
      backlogId: backlog!.id,
      administratorIds: [creatorId],
    });
    return backlog!;
  });
}

export async function updateBacklog(input: unknown, actorId: string) {
  const data = updateBacklogSchema.parse(input);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(backlogs)
      .where(eq(backlogs.id, data.id))
      .for("update");
    if (!current) return null;

    if (data.leadUserId) {
      const [lead] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, data.leadUserId))
        .limit(1);
      if (!lead) throw new Error("Responsable introuvable.");
    }

    const backlogItems = await tx
      .select({ id: items.id, key: items.key })
      .from(items)
      .where(eq(items.backlogId, data.id))
      .for("update");
    const rewrites = planItemKeyRewrite(backlogItems, current.key, data.key);

    const [backlog] = await tx
      .update(backlogs)
      .set({
        key: data.key,
        name: data.name,
        color: data.color,
        ...(data.leadUserId !== undefined ? { leadUserId: data.leadUserId } : {}),
      })
      .where(eq(backlogs.id, data.id))
      .returning();

    for (const rewrite of rewrites) {
      await tx.update(items).set({ key: rewrite.newKey }).where(eq(items.id, rewrite.id));
    }

    if (rewrites.length > 0) {
      await tx.insert(activities).values(
        rewrites.map((rewrite) => ({
          itemId: rewrite.id,
          actorId,
          action: "update" as const,
          field: "key",
          oldValue: rewrite.oldKey,
          newValue: rewrite.newKey,
        })),
      );
    }

    return { backlog: backlog!, previousKey: current.key };
  });
}

export async function archiveBacklog(id: string) {
  const [b] = await db
    .update(backlogs)
    .set({ archivedAt: new Date() })
    .where(and(eq(backlogs.id, id), isNull(backlogs.archivedAt)))
    .returning();
  return b ?? null;
}
