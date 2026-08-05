"use server";

import { revalidatePath } from "next/cache";
import { type Role, canWriteItems } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import type { ItemKind, ItemType } from "@/lib/design/constants";
import { mapZodActionError } from "@/lib/validation/action-error";
import { bulkUpdateItems } from "@/lib/services/item-bulk";
import type { BulkItemPatch } from "@/lib/validation/bulk-item";
import {
  createItem,
  moveItem,
  rankBacklogItem,
  reparentItem,
  restoreItem,
  softDeleteItem,
  updateItem,
} from "@/lib/services/items";

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
  kind?: ItemKind;
};

type UpdateItemActionInput = {
  backlogKey: string;
  id: string;
  title?: string;
  description?: string | null;
  statusId?: string;
  priority?: number;
  estimatePoints?: number | null;
  assigneeId?: string | null;
  reporterId?: string;
  dueDate?: string | null;
  labelIds?: string[];
  kind?: ItemKind;
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

const BULK_DOMAIN_ERRORS = [
  "Backlog introuvable.",
  "Un ou plusieurs items sont introuvables.",
  "Tous les items doivent appartenir au backlog.",
  "Statut invalide pour ce backlog.",
  "Assigné introuvable.",
  "Seules les tâches peuvent être estimées.",
] as const;

function mapBulkError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return BULK_DOMAIN_ERRORS.find((candidate) => candidate === message)
    ?? "Modification groupée impossible.";
}

export async function createItemAction(input: CreateItemActionInput) {
  const actorId = await requireWriter();
  const { backlogKey, ...data } = input;
  try {
    const item = await createItem(data, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, item };
  } catch (e) {
    const validationError = mapZodActionError(e);
    if (validationError) return { ok: false as const, ...validationError };
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
    const validationError = mapZodActionError(e);
    if (validationError) return { ok: false as const, ...validationError };
    const s = String(e);
    const error = s.includes("Statut invalide")
      ? "Statut invalide pour ce backlog."
      : s.includes("Seules les tâches")
        ? "Seules les tâches peuvent être estimées."
      : s.includes("label") || s.includes("Label")
        ? "Label invalide pour ce backlog."
        : "Mise à jour impossible.";
    return { ok: false as const, error };
  }
}

export async function bulkUpdateItemsAction(input: {
  backlogKey: string;
  backlogId: string;
  itemIds: string[];
  patch: BulkItemPatch;
}) {
  const actorId = await requireWriter();
  const { backlogKey, ...serviceInput } = input;
  try {
    const result = await bulkUpdateItems(serviceInput, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, ...result };
  } catch (error) {
    const validationError = mapZodActionError(error);
    if (validationError) return { ok: false as const, ...validationError };
    return { ok: false as const, error: mapBulkError(error) };
  }
}

export async function softDeleteItemAction(input: { id: string; backlogKey: string }) {
  const actorId = await requireWriter();
  try {
    const item = await softDeleteItem({ id: input.id }, actorId);
    if (!item) return { ok: false as const, error: "Item introuvable." };
    revalidatePath(`/b/${input.backlogKey}`);
    revalidatePath("/trash");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Suppression impossible." };
  }
}

export async function restoreItemAction(input: { id: string; backlogKey: string }) {
  const actorId = await requireWriter();
  let item: Awaited<ReturnType<typeof restoreItem>>;
  try {
    item = await restoreItem({ id: input.id }, actorId);
  } catch (e) {
    const error = String(e).includes("Délai de restauration dépassé")
      ? "Délai de restauration dépassé."
      : "Restauration impossible.";
    return { ok: false as const, error };
  }
  if (!item) return { ok: false as const, error: "Item introuvable." };
  revalidatePath(`/b/${input.backlogKey}`);
  revalidatePath("/trash");
  return { ok: true as const };
}

type MoveItemActionInput = {
  backlogKey: string;
  id: string;
  statusId?: string;
  beforeId?: string | null;
  afterId?: string | null;
};

type ReparentItemActionInput = {
  backlogKey: string;
  id: string;
  newParentId: string | null;
  beforeId?: string | null;
  afterId?: string | null;
};

type RankBacklogItemActionInput = {
  backlogKey: string;
  backlogId: string;
  id: string;
  beforeId: string | null;
  afterId: string | null;
};

const RANK_DOMAIN_ERRORS = [
  "Backlog introuvable.",
  "L’item appartient à un autre backlog.",
  "Seules les tâches du backlog peuvent être classées.",
  "Voisin invalide pour ce backlog.",
] as const;

export async function rankBacklogItemAction(input: RankBacklogItemActionInput) {
  const actorId = await requireWriter();
  const { backlogKey, ...data } = input;
  try {
    const item = await rankBacklogItem(data, actorId);
    if (!item) return { ok: false as const, error: "Item introuvable." };
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, item };
  } catch (error) {
    const validationError = mapZodActionError(error);
    if (validationError) return { ok: false as const, ...validationError };
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false as const,
      error:
        RANK_DOMAIN_ERRORS.find((candidate) => candidate === message) ??
        "Classement impossible.",
    };
  }
}

function mapMoveError(e: unknown): string {
  const s = String(e);
  if (s.includes("Statut invalide")) return "Statut invalide pour ce backlog.";
  if (s.includes("Cycle") || s.includes("sous-arbre")) return "Impossible : destination dans le sous-arbre déplacé.";
  if (s.includes("Hiérarchie")) return "Parent invalide pour ce type.";
  if (s.includes("autre backlog")) return "Le parent appartient à un autre backlog.";
  if (s.includes("ancêtre")) return "Un parent est supprimé.";
  if (s.includes("Parent")) return "Parent introuvable.";
  return "Déplacement impossible.";
}

export async function moveItemAction(input: MoveItemActionInput) {
  const actorId = await requireWriter();
  const { backlogKey, ...data } = input;
  try {
    const item = await moveItem(data, actorId);
    if (!item) return { ok: false as const, error: "Item introuvable." };
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, item };
  } catch (e) {
    return { ok: false as const, error: mapMoveError(e) };
  }
}

export async function reparentItemAction(input: ReparentItemActionInput) {
  const actorId = await requireWriter();
  const { backlogKey, ...data } = input;
  try {
    const item = await reparentItem(data, actorId);
    if (!item) return { ok: false as const, error: "Item introuvable." };
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, item };
  } catch (e) {
    return { ok: false as const, error: mapMoveError(e) };
  }
}
