"use server";

import { revalidatePath } from "next/cache";
import { type Role, canWriteItems } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import { addComment, editComment, softDeleteComment } from "@/lib/services/comments";

// Authz FIRST on every action; actorId from the session, never client input.
async function requireWriter(): Promise<string> {
  const session = await getSession();
  const role = (session?.user as { role?: Role } | undefined)?.role;
  if (!session || !role || !canWriteItems(role)) throw new Error("Forbidden");
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
  const actorId = await requireWriter();
  const { backlogKey, itemId, body, mentionIds } = input;
  try {
    const comment = await addComment({ itemId, body, mentionIds }, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, comment };
  } catch (e) {
    return { ok: false as const, error: mapError(e) };
  }
}

export async function editCommentAction(input: {
  backlogKey: string;
  id: string;
  body: string;
  mentionIds: string[];
}) {
  const actorId = await requireWriter();
  const { backlogKey, id, body, mentionIds } = input;
  try {
    const comment = await editComment(id, { body, mentionIds }, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, comment };
  } catch (e) {
    return { ok: false as const, error: mapError(e) };
  }
}

export async function deleteCommentAction(input: {
  backlogKey: string;
  id: string;
}) {
  const actorId = await requireWriter();
  const { backlogKey, id } = input;
  try {
    await softDeleteComment(id, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: mapError(e) };
  }
}
