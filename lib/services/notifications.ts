import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { backlogs, comments, items, notifications } from "@/lib/db/schema/domain";
import { user } from "@/lib/db/schema/auth";

// ---- reads (no tx) ----

/** Count of unread notifications for a user. */
export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.value ?? 0);
}

/** Shape of a row returned by {@link listRecentNotifications}. */
export type NotificationRow = {
  id: string;
  type: string;
  read: boolean;
  createdAt: Date;
  itemKey: string | null;
  itemTitle: string | null;
  backlogKey: string | null;
  actorName: string | null;
  snippet: string;
};

/**
 * Recent notifications for a user, joined for display.
 *
 * NOTE: notifications.itemId / commentId carry ON DELETE CASCADE FKs, so
 * deleting a comment or item cascades to delete the notification row too —
 * a dangling itemId/commentId cannot exist in practice. The LEFT JOINs are
 * kept as a defensive belt-and-suspenders measure (and the mapping is
 * null-safe regardless). Soft-deleted comments DO persist (deletedAt set);
 * their snippet is blanked below for tombstone privacy.
 */
export async function listRecentNotifications(
  userId: string,
  limit = 15,
): Promise<NotificationRow[]> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      // Comment fields
      commentBody: comments.body,
      commentDeletedAt: comments.deletedAt,
      // Actor (comment author)
      actorName: user.name,
      // Item fields
      itemKey: items.key,
      itemTitle: items.title,
      // Backlog field
      backlogKey: backlogs.key,
    })
    .from(notifications)
    .leftJoin(comments, eq(notifications.commentId, comments.id))
    .leftJoin(user, eq(comments.authorId, user.id))
    .leftJoin(items, eq(notifications.itemId, items.id))
    .leftJoin(backlogs, eq(items.backlogId, backlogs.id))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((row) => {
    // Blank the snippet for deleted comments (tombstone privacy)
    let snippet = "";
    if (row.commentBody && !row.commentDeletedAt) {
      snippet = row.commentBody.trim().slice(0, 80);
    }

    return {
      id: row.id,
      type: row.type,
      read: row.readAt != null,
      createdAt: row.createdAt,
      itemKey: row.itemKey ?? null,
      itemTitle: row.itemTitle ?? null,
      backlogKey: row.backlogKey ?? null,
      actorName: row.actorName ?? null,
      snippet,
    };
  });
}

// ---- writes ----

/**
 * Mark a single notification as read.
 * Own-only: the WHERE scopes to both id AND userId so a user cannot
 * mark another user's notification. Idempotent (already-read → no-op).
 */
export async function markRead(id: string, userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
}

/**
 * Mark all of a user's unread notifications as read.
 * Idempotent (no unread notifications → no-op).
 */
export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
