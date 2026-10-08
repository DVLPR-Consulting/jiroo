import { z } from "zod";

// ---------------------------------------------------------------------------
// commentBodySchema
// ---------------------------------------------------------------------------

export const COMMENT_BODY_MAX = 5000;

export const commentBodySchema = z
  .string()
  .trim()
  .min(1, "Le commentaire ne peut pas être vide.")
  .max(COMMENT_BODY_MAX);

// ---------------------------------------------------------------------------
// addCommentInput
// ---------------------------------------------------------------------------

/**
 * Input schema for adding a new comment to an item.
 * Note: mention IDs are better-auth user ids (text, not UUIDs).
 */
export const addCommentInput = z.object({
  itemId: z.string().uuid(),
  body: commentBodySchema,
  mentionIds: z.array(z.string()).default([]),
});

export type AddCommentInput = z.infer<typeof addCommentInput>;

// ---------------------------------------------------------------------------
// editCommentInput
// ---------------------------------------------------------------------------

/**
 * Input schema for editing an existing comment.
 * Note: mention IDs are better-auth user ids (text, not UUIDs).
 */
export const editCommentInput = z.object({
  id: z.string().uuid(),
  body: commentBodySchema,
  mentionIds: z.array(z.string()).default([]),
});

export type EditCommentInput = z.infer<typeof editCommentInput>;

// ---------------------------------------------------------------------------
// dedupeMentionIds
// ---------------------------------------------------------------------------

/**
 * Deduplicates mention IDs preserving first-seen order.
 * Drops empty/falsy strings.
 */
export function dedupeMentionIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of ids) {
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

// ---------------------------------------------------------------------------
// notifyTargets
// ---------------------------------------------------------------------------

/**
 * Returns the distinct list of user IDs to notify for a comment's mentions.
 * Deduplicates mention IDs and excludes the comment author (self-mention
 * must not trigger a notification).
 */
export function notifyTargets(mentionIds: string[], authorId: string): string[] {
  return dedupeMentionIds(mentionIds).filter((id) => id !== authorId);
}
