import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, comments, items, notifications } from "@/lib/db/schema/domain";
import { user } from "@/lib/db/schema/auth";
import { addCommentInput, dedupeMentionIds, editCommentInput, notifyTargets } from "@/lib/items/comments";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---- reads (no tx) ----

export async function listComments(itemId: string) {
  const rows = await db
    .select({
      id: comments.id,
      authorId: comments.authorId,
      authorName: user.name,
      body: comments.body,
      mentions: comments.mentions,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      deletedAt: comments.deletedAt,
    })
    .from(comments)
    .innerJoin(user, eq(comments.authorId, user.id))
    .where(eq(comments.itemId, itemId))
    .orderBy(asc(comments.createdAt));

  // Tombstone privacy: blank body and mentions for soft-deleted comments
  // so deleted comment text and mentions are never leaked to the client.
  return rows.map((row) => {
    const deleted = row.deletedAt != null;
    return {
      ...row,
      body: deleted ? "" : row.body,
      mentions: deleted ? [] : row.mentions,
      deleted,
    };
  });
}

/**
 * Canonical shape of a row returned by {@link listComments}. Derived from the
 * function's return type so it can never drift from the actual query result;
 * the client thread/panel import this single source of truth.
 */
export type CommentRow = Awaited<ReturnType<typeof listComments>>[number];

// ---- private helpers (tx) ----

/**
 * Validates that mention IDs refer to real users in the DB.
 * Unknown IDs are silently dropped (defensive: the mention picker should
 * only yield real IDs, but we protect against stale/forged data).
 */
async function validateMentionIds(tx: Tx, mentionIds: string[]): Promise<string[]> {
  if (mentionIds.length === 0) return [];
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.id, mentionIds));
  const validSet = new Set(rows.map((r) => r.id));
  return mentionIds.filter((id) => validSet.has(id));
}

// ---- addComment: validate → tx(insert comment + notifications + activity) ----

export async function addComment(input: unknown, authorId: string) {
  const data = addCommentInput.parse(input);
  return db.transaction(async (tx) => {
    // Verify the item exists and is not soft-deleted
    const [item] = await tx
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.id, data.itemId), isNull(items.deletedAt)));
    if (!item) throw new Error("Item introuvable.");

    // Validate mention IDs (drop unknowns defensively)
    const validatedMentionIds = await validateMentionIds(tx, data.mentionIds);
    const mentions = dedupeMentionIds(validatedMentionIds);

    // Insert the comment
    const [comment] = await tx
      .insert(comments)
      .values({
        itemId: data.itemId,
        authorId,
        body: data.body,
        mentions,
      })
      .returning();

    // Insert mention notifications (excluding author self-mention)
    const targets = notifyTargets(mentions, authorId);
    if (targets.length > 0) {
      await tx.insert(notifications).values(
        targets.map((userId) => ({
          userId,
          type: "mention" as const,
          itemId: data.itemId,
          commentId: comment!.id,
          readAt: null,
        })),
      );
    }

    // Log activity
    await tx.insert(activities).values({
      itemId: data.itemId,
      actorId: authorId,
      action: "comment" as const,
      field: null,
      oldValue: null,
      newValue: null,
    });

    return { ...comment!, notifyUserIds: targets };
  });
}

// ---- editComment: validate → tx(update comment) ----
// No new notifications on edit (v1).

export async function editComment(id: string, input: unknown, actorId: string) {
  const data = editCommentInput.parse({ ...(input as object), id });
  return db.transaction(async (tx) => {
    // Load the comment
    const [comment] = await tx
      .select()
      .from(comments)
      .where(eq(comments.id, id));
    if (!comment) throw new Error("Commentaire introuvable.");
    if (comment.deletedAt != null) throw new Error("Commentaire supprimé.");
    if (comment.authorId !== actorId) throw new Error("Action réservée à l'auteur du commentaire.");

    // Validate mention IDs (drop unknowns defensively)
    const validatedMentionIds = await validateMentionIds(tx, data.mentionIds);
    const mentions = dedupeMentionIds(validatedMentionIds);

    const [updated] = await tx
      .update(comments)
      .set({
        body: data.body,
        mentions,
        editedAt: new Date(),
      })
      .where(eq(comments.id, id))
      .returning();

    return updated!;
  });
}

// ---- softDeleteComment: validate → ownership policy → tx(set deletedAt) ----

export async function softDeleteComment(
  id: string,
  actorId: string,
  options: { allowAny: boolean } = { allowAny: false },
) {
  return db.transaction(async (tx) => {
    const [comment] = await tx
      .select()
      .from(comments)
      .where(eq(comments.id, id));
    if (!comment) throw new Error("Commentaire introuvable.");
    if (comment.authorId !== actorId && !options.allowAny) {
      throw new Error("Action réservée à l'auteur du commentaire.");
    }

    const [updated] = await tx
      .update(comments)
      .set({ deletedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();

    return updated!;
  });
}
