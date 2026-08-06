"use server";

import { revalidatePath } from "next/cache";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import { requireBacklogPermissionById } from "@/lib/auth/action-authorization";
import { getSession } from "@/lib/auth/session";
import { createLabel } from "@/lib/services/labels";

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

function mapError(e: unknown): string {
  const s = String(e);
  // Surface a name-length hint when Zod rejects the name field.
  if (s.includes("max") || s.includes("50")) return "Le nom du label ne peut pas dépasser 50 caractères.";
  if (s.includes("min") || s.includes("Required") || s.includes("trop court")) return "Le nom du label ne peut pas être vide.";
  return "Création du label impossible.";
}

export async function createLabelAction(input: {
  backlogKey: string;
  backlogId: string;
  name: string;
}) {
  const actorId = await authenticatedActorId();
  try {
    await requireBacklogPermissionById({
      actorId,
      backlogId: input.backlogId,
      permission: "edit_items",
    });
    const label = await createLabel({ backlogId: input.backlogId, name: input.name });
    revalidatePath(`/b/${input.backlogKey}`);
    return { ok: true as const, label };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapError(e) };
  }
}
