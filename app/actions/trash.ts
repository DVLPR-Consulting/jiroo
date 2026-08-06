"use server";

import { revalidatePath } from "next/cache";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import { requireItemPermission } from "@/lib/auth/action-authorization";
import { getSession } from "@/lib/auth/session";
import { purgeItem, restoreItem } from "@/lib/services/items";

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

function mapTrashError(e: unknown): string {
  const s = String(e);
  // Surface meaningful French service errors verbatim.
  if (s.includes("Délai de restauration dépassé")) return "Délai de restauration dépassé.";
  if (s.includes("Parent supprimé")) return "Parent supprimé : restaurez-le d'abord.";
  if (s.includes("introuvable dans la corbeille")) return "Item introuvable dans la corbeille.";
  return "Action impossible.";
}

export async function restoreTrashedItemAction(input: { id: string }) {
  const actorId = await authenticatedActorId();
  try {
    await requireItemPermission({ actorId, itemId: input.id, permission: "restore_items" });
    await restoreItem({ id: input.id }, actorId);
    revalidatePath("/trash");
    return { ok: true as const };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapTrashError(e) };
  }
}

export async function purgeItemAction(input: { id: string }) {
  const actorId = await authenticatedActorId();
  try {
    await requireItemPermission({ actorId, itemId: input.id, permission: "restore_items" });
    await purgeItem(input.id);
    revalidatePath("/trash");
    return { ok: true as const };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapTrashError(e) };
  }
}
