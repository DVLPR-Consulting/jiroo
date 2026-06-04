"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type Role } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import { purgeItem, restoreItem } from "@/lib/services/items";

// Admin gate: throws if there is no session or the user is not an admin.
// Returns the admin's userId so callers can pass it to service functions.
async function requireAdmin(): Promise<string> {
  const session = await getSession();
  requireRole(session as { user: { id: string; role: Role } } | null, "admin");
  return (session as { user: { id: string } }).user.id;
}

function mapTrashError(e: unknown): string {
  const s = String(e);
  // Surface the two meaningful French service errors verbatim.
  if (s.includes("Parent supprimé")) return "Parent supprimé : restaurez-le d'abord.";
  if (s.includes("introuvable dans la corbeille")) return "Item introuvable dans la corbeille.";
  return "Action impossible.";
}

export async function restoreTrashedItemAction(input: { id: string }) {
  const actorId = await requireAdmin();
  try {
    await restoreItem({ id: input.id }, actorId);
    revalidatePath("/trash");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: mapTrashError(e) };
  }
}

export async function purgeItemAction(input: { id: string }) {
  await requireAdmin();
  try {
    await purgeItem(input.id);
    revalidatePath("/trash");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: mapTrashError(e) };
  }
}
