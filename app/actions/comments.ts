"use server";

import { revalidatePath } from "next/cache";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import {
  requireCommentPermission,
  requireItemPermission,
} from "@/lib/auth/action-authorization";
import { getSession } from "@/lib/auth/session";
import { addComment, editComment, softDeleteComment } from "@/lib/services/comments";

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

// Surface French service messages verbatim; generic fallback for unexpected errors.
function mapError(e: unknown): string {
  const s = String(e);
  if (s.includes("Action réservée à l'auteur du commentaire.")) return "Action réservée à l'auteur du commentaire.";
  if (s.includes("Commentaire introuvable.")) return "Commentaire introuvable.";
  if (s.includes("Commentaire supprimé.")) return "Commentaire supprimé.";
  if (s.includes("Item introuvable.")) return "Item introuvable.";
  if (s.includes("Le commentaire ne peut pas être vide.")) return "Le commentaire ne peut pas être vide.";
  return "Action impossible sur le commentaire.";
}

export async function addCommentAction(input: {
  backlogKey: string;
  itemId: string;
  body: string;
  mentionIds: string[];
}) {
  const actorId = await authenticatedActorId();
  const { backlogKey, itemId, body, mentionIds } = input;
  try {
    await requireItemPermission({
      actorId,
      itemId: input.itemId,
      permission: "add_comments",
    });
    const comment = await addComment({ itemId, body, mentionIds }, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, comment };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapError(e) };
  }
}

export async function editCommentAction(input: {
  backlogKey: string;
  id: string;
  body: string;
  mentionIds: string[];
}) {
  const actorId = await authenticatedActorId();
  const { backlogKey, id, body, mentionIds } = input;
  try {
    await requireCommentPermission({
      actorId,
      commentId: input.id,
      ownPermission: "edit_own_comments",
    });
    const comment = await editComment(id, { body, mentionIds }, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, comment };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapError(e) };
  }
}

export async function deleteCommentAction(input: {
  backlogKey: string;
  id: string;
}) {
  const actorId = await authenticatedActorId();
  const { backlogKey, id } = input;
  try {
    const authorization = await requireCommentPermission({
      actorId,
      commentId: input.id,
      ownPermission: "delete_own_comments",
      otherPermission: "delete_all_comments",
    });
    await softDeleteComment(id, actorId, {
      allowAny: authorization.authorId !== actorId,
    });
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapError(e) };
  }
}
