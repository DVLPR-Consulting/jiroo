import "server-only";
import { runWithActor, type Actor } from "@/lib/auth/actor-context";
import { requireItemPermission } from "@/lib/auth/action-authorization";
import { checkPermission } from "@/lib/auth/authorization";
import { notifyUsers, publishBacklogChange } from "@/lib/realtime/publish";
import { addComment } from "@/lib/services/comments";

/**
 * The authorized use cases of the comments (JIR-155), shared by the Server
 * Actions, the REST API and the MCP server. They throw: the caller maps the
 * error to its own medium.
 */

export type AddCommentUseCaseInput = {
  itemId: string;
  body: string;
  mentionIds: string[];
};

export type AddedComment = Omit<Awaited<ReturnType<typeof addComment>>, "notifyUserIds">;

/**
 * Keeps the mentioned users who may read the backlog: a mention must not
 * notify someone about an item they cannot open, nor tell the author whether
 * a user id exists (security audit, JIR-160).
 */
async function readableMentions(mentionIds: string[], backlogId: string): Promise<string[]> {
  const unique = [...new Set(mentionIds)];
  const decisions = await Promise.all(unique.map(async (userId) => {
    try {
      const decision = await checkPermission({
        actorId: userId,
        permission: "browse_backlog",
        scope: { type: "backlog", backlogId },
      });
      return decision.allowed ? userId : null;
    } catch {
      return null;
    }
  }));
  return decisions.filter((userId): userId is string => userId !== null);
}

export async function addCommentUseCase(
  actor: Actor,
  input: AddCommentUseCaseInput,
): Promise<{ comment: AddedComment; backlogId: string }> {
  return runWithActor(actor, async () => {
    const { actorId } = actor;
    const authorization = await requireItemPermission({
      actorId,
      itemId: input.itemId,
      permission: "add_comments",
    });
    const mentionIds = await readableMentions(input.mentionIds, authorization.backlogId);
    const { notifyUserIds, ...comment } = await addComment({ ...input, mentionIds }, actorId);
    await publishBacklogChange({
      kind: "item",
      backlogId: authorization.backlogId,
      itemIds: [input.itemId],
      actorId,
    });
    await notifyUsers(notifyUserIds, actorId);
    return { comment, backlogId: authorization.backlogId };
  });
}
