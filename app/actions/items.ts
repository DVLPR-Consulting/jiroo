"use server";

import { revalidatePath } from "next/cache";
import { type Role, canWriteItems } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import type { ItemType } from "@/lib/design/constants";
import { createItem, restoreItem, softDeleteItem, updateItem } from "@/lib/services/items";

type CreateItemActionInput = {
  backlogKey: string;
  backlogId: string;
  type: ItemType;
  parentId: string | null;
  title: string;
  description?: string | null;
  statusId?: string;
  priority?: number;
  assigneeId?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
};

type UpdateItemActionInput = {
  backlogKey: string;
  id: string;
  title?: string;
  description?: string | null;
  statusId?: string;
  priority?: number;
  assigneeId?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
};

// Authz FIRST on every action; actorId from the session, never client input.
async function requireWriter(): Promise<string> {
  const session = await getSession();
  const role = (session?.user as { role?: Role } | undefined)?.role;
  if (!session || !role || !canWriteItems(role)) throw new Error("Forbidden");
  return session.user.id;
}

function mapCreateError(e: unknown): string {
  const s = String(e);
  if (s.includes("unique")) return "Cette clé est déjà utilisée.";
  if (s.includes("Hiérarchie")) return "Parent invalide pour ce type.";
  if (s.includes("autre backlog")) return "Le parent appartient à un autre backlog.";
  if (s.includes("Statut invalide")) return "Statut invalide pour ce backlog.";
  if (s.includes("ancêtre")) return "Un parent est supprimé.";
  if (s.includes("Parent")) return "Parent introuvable.";
  if (s.includes("label") || s.includes("Label")) return "Label invalide pour ce backlog.";
  return "Création impossible.";
}

export async function createItemAction(input: CreateItemActionInput) {
  const actorId = await requireWriter();
  const { backlogKey, ...data } = input;
  try {
    const item = await createItem(data, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, item };
  } catch (e) {
    return { ok: false as const, error: mapCreateError(e) };
  }
}

export async function updateItemAction(input: UpdateItemActionInput) {
  const actorId = await requireWriter();
  const { backlogKey, ...data } = input;
  try {
    const item = await updateItem(data, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, item };
  } catch (e) {
    const s = String(e);
    const error = s.includes("Statut invalide")
      ? "Statut invalide pour ce backlog."
      : s.includes("label") || s.includes("Label")
        ? "Label invalide pour ce backlog."
        : "Mise à jour impossible.";
    return { ok: false as const, error };
  }
}

export async function softDeleteItemAction(input: { id: string; backlogKey: string }) {
  const actorId = await requireWriter();
  await softDeleteItem({ id: input.id }, actorId);
  revalidatePath(`/b/${input.backlogKey}`);
  revalidatePath("/trash");
  return { ok: true as const };
}

export async function restoreItemAction(input: { id: string; backlogKey: string }) {
  const actorId = await requireWriter();
  await restoreItem({ id: input.id }, actorId);
  revalidatePath(`/b/${input.backlogKey}`);
  revalidatePath("/trash");
  return { ok: true as const };
}
