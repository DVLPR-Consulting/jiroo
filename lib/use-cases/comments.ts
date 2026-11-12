import "server-only";
import { runWithActor, type Actor } from "@/lib/auth/actor-context";
import { requireItemPermission } from "@/lib/auth/action-authorization";
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
    const { notifyUserIds, ...comment } = await addComment(input, actorId);
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
