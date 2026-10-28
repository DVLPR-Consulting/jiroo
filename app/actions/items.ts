"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import {
  requireBacklogPermissionById,
  requireItemPermission,
  requireSprintPermission,
  requireStatusPermission,
  type AuthorizedResource,
} from "@/lib/auth/action-authorization";
import {
  checkPermission,
  PermissionDeniedError,
  requirePermission,
  ResourceNotFoundError,
} from "@/lib/auth/authorization";
import type { BacklogPermissionKey } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { invalidateBacklog, publishBacklogChange } from "@/lib/realtime/publish";
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
  startDate?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
  kind?: ItemKind;
  sprintId?: string | null;
  fixVersionIds?: string[];
  estimatePoints?: number | null;
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
  startDate?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
  kind?: ItemKind;
  fixVersionIds?: string[];
};

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

function hasOwnField<T extends object>(input: T, field: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function assertSameBacklog(
  expected: AuthorizedResource,
  actual: AuthorizedResource,
  resourceType: string,
): void {
  if (expected.backlogId !== actual.backlogId) {
    throw new ResourceNotFoundError(resourceType, actual.resourceId);
  }
}

function assertStoredBacklog(
  resource: AuthorizedResource,
  backlogId: string,
): void {
  if (resource.backlogId !== backlogId) {
    throw new ResourceNotFoundError("backlog", backlogId);
  }
}

async function requireAssignableUser(input: {
  assigneeId: string | null | undefined;
  backlogId: string;
}): Promise<void> {
  if (!input.assigneeId) return;
  const decision = await checkPermission({
    actorId: input.assigneeId,
    permission: "assignable_user",
    scope: { type: "backlog", backlogId: input.backlogId },
  });
  if (!decision.allowed) throw new PermissionDeniedError(decision);
}

async function authorizeParent(input: {
  actorId: string;
  parentId: string | null;
  childBacklog: AuthorizedResource;
}): Promise<void> {
  if (!input.parentId) return;
  const parent = await requireItemPermission({
    actorId: input.actorId,
    itemId: input.parentId,
    permission: "browse_backlog",
  });
  assertSameBacklog(input.childBacklog, parent, "item");
  await requireItemPermission({
    actorId: input.actorId,
    itemId: input.parentId,
    permission: "schedule_items",
  });
}

async function authorizeItemUpdate(
  actorId: string,
  input: UpdateItemActionInput,
): Promise<AuthorizedResource> {
  const item = await requireItemPermission({
    actorId,
    itemId: input.id,
    permission: "edit_items",
  });
  if (hasOwnField(input, "statusId")) {
    await requireItemPermission({
      actorId,
      itemId: input.id,
      permission: "transition_items",
    });
    if (input.statusId) {
      const status = await requireStatusPermission({
        actorId,
        statusId: input.statusId,
        permission: "transition_items",
      });
      assertSameBacklog(item, status, "status");
    }
  }
  if (hasOwnField(input, "assigneeId")) {
    await requireItemPermission({
      actorId,
      itemId: input.id,
      permission: "assign_items",
    });
    await requireAssignableUser({ assigneeId: input.assigneeId, backlogId: item.backlogId });
  }
  return item;
}

function bulkPatchPermission(patch: BulkItemPatch): BacklogPermissionKey {
  switch (patch.field) {
    case "statusId":
      return "transition_items";
    case "assigneeId":
      return "assign_items";
    case "sprintId":
      return "schedule_items";
    default:
      return "edit_items";
  }
}

function mapCreateError(e: unknown): string {
  const s = String(e);
  if (s.includes("unique")) return "Cette clé est déjà utilisée.";
  if (s.includes("Sprint introuvable")) return "Sprint introuvable.";
  if (s.includes("sprint appartient à un autre backlog")) {
    return "Le sprint appartient à un autre backlog.";
  }
  if (s.includes("sprint terminé")) {
    return "Un sprint terminé ne peut plus recevoir d’items.";
  }
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
  "Statut invalide pour ce backlog.",
  "Assigné introuvable.",
  "Seules les tâches peuvent être estimées.",
  "Sprint introuvable.",
  "Le sprint appartient à un autre backlog.",
  "Un sprint terminé ne peut plus recevoir d’items.",
  "Seules les tâches peuvent être planifiées dans un sprint.",
  "Une ou plusieurs releases sont invalides pour ce backlog.",
  "Une release archivée ne peut pas être ajoutée.",
] as const;

function mapBulkError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "Tous les items doivent appartenir au backlog.") {
    return "Un ou plusieurs items sont introuvables.";
  }
  return BULK_DOMAIN_ERRORS.find((candidate) => candidate === message)
    ?? "Modification groupée impossible.";
}

export async function createItemAction(input: CreateItemActionInput) {
  const actorId = await authenticatedActorId();
  try {
    const backlog = await requireBacklogPermissionById({
      actorId,
      backlogId: input.backlogId,
      permission: "create_items",
    });
    await authorizeParent({
      actorId,
      parentId: input.parentId,
      childBacklog: backlog,
    });
    if (input.sprintId) {
      const sprint = await requireSprintPermission({
        actorId,
        sprintId: input.sprintId,
        permission: "schedule_items",
      });
      assertSameBacklog(backlog, sprint, "sprint");
    }
    if (hasOwnField(input, "assigneeId")) {
      await requireBacklogPermissionById({
        actorId,
        backlogId: backlog.backlogId,
        permission: "assign_items",
      });
      await requireAssignableUser({ assigneeId: input.assigneeId, backlogId: backlog.backlogId });
    }
    const { backlogKey, ...data } = input;
    // The page key stays in the input for the callers; the answer is the
    // item alone, never a page render (JIR-119).
    void backlogKey;
    const requestCorrelationId = randomUUID();
    const item = await createItem(data, actorId, requestCorrelationId);
    await publishBacklogChange({
      kind: "item",
      backlogId: backlog.backlogId,
      itemIds: [item.id, ...(input.parentId ? [input.parentId] : [])],
      actorId,
    });
    return { ok: true as const, item };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    const validationError = mapZodActionError(e);
    if (validationError) return { ok: false as const, ...validationError };
    return { ok: false as const, error: mapCreateError(e) };
  }
}

export async function updateItemAction(input: UpdateItemActionInput) {
  const actorId = await authenticatedActorId();
  try {
    const authorization = await authorizeItemUpdate(actorId, input);
    const { backlogKey, ...data } = input;
    void backlogKey;
    const requestCorrelationId = randomUUID();
    const item = await updateItem(data, actorId, requestCorrelationId);
    // The answer is the item alone: the views that need the page re-render
    // ask for it themselves, the Board applies the item (JIR-119).
    await publishBacklogChange({
      kind: "item",
      backlogId: authorization.backlogId,
      itemIds: [input.id],
      actorId,
    });
    return { ok: true as const, item };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    const validationError = mapZodActionError(e);
    if (validationError) return { ok: false as const, ...validationError };
    const s = String(e);
    const error = s.includes("Statut invalide")
      ? "Statut invalide pour ce backlog."
      : s.includes("Seules les tâches")
        ? "Seules les tâches peuvent être estimées."
      : s.includes("Le début doit précéder")
        ? "Le début doit précéder l’échéance."
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
  const actorId = await authenticatedActorId();
  try {
    await requirePermission({
      actorId,
      permission: "bulk_change_items",
      scope: { type: "global" },
    });
    const authorizedBacklog = await requireBacklogPermissionById({
      actorId,
      backlogId: input.backlogId,
      permission: bulkPatchPermission(input.patch),
    });
    assertStoredBacklog(authorizedBacklog, input.backlogId);
    if (input.patch.field === "statusId") {
      const status = await requireStatusPermission({
        actorId,
        statusId: input.patch.value,
        permission: "transition_items",
      });
      assertSameBacklog(authorizedBacklog, status, "status");
    } else if (input.patch.field === "sprintId" && input.patch.value) {
      const sprint = await requireSprintPermission({
        actorId,
        sprintId: input.patch.value,
        permission: "schedule_items",
      });
      assertSameBacklog(authorizedBacklog, sprint, "sprint");
    } else if (input.patch.field === "assigneeId") {
      await requireAssignableUser({
        assigneeId: input.patch.value,
        backlogId: authorizedBacklog.backlogId,
      });
    }
    const { backlogKey, ...serviceInput } = input;
    const requestCorrelationId = randomUUID();
    const result = await bulkUpdateItems(serviceInput, actorId, requestCorrelationId);
    await invalidateBacklog(backlogKey, {
      kind: "item",
      backlogId: authorizedBacklog.backlogId,
      itemIds: input.itemIds,
      actorId,
    });
    return { ok: true as const, ...result };
  } catch (error) {
    const authorizationError = mapActionAuthorizationError(error);
    if (authorizationError) return authorizationError;
    const validationError = mapZodActionError(error);
    if (validationError) return { ok: false as const, ...validationError };
    return { ok: false as const, error: mapBulkError(error) };
  }
}

export async function softDeleteItemAction(input: { id: string; backlogKey: string }) {
  const actorId = await authenticatedActorId();
  try {
    const authorization = await requireItemPermission({
      actorId,
      itemId: input.id,
      permission: "delete_items",
    });
    const requestCorrelationId = randomUUID();
    const item = await softDeleteItem({ id: input.id }, actorId, requestCorrelationId);
    if (!item) return { ok: false as const, error: "Item introuvable." };
    await invalidateBacklog(input.backlogKey, {
      kind: "item",
      backlogId: authorization.backlogId,
      actorId,
    });
    revalidatePath("/trash");
    return { ok: true as const };
  } catch (error) {
    const authorizationError = mapActionAuthorizationError(error);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: "Suppression impossible." };
  }
}

export async function restoreItemAction(input: { id: string; backlogKey: string }) {
  const actorId = await authenticatedActorId();
  try {
    const authorization = await requireItemPermission({
      actorId,
      itemId: input.id,
      permission: "restore_items",
    });
    const item = await restoreItem({ id: input.id }, actorId);
    if (!item) return { ok: false as const, error: "Item introuvable." };
    await invalidateBacklog(input.backlogKey, {
      kind: "item",
      backlogId: authorization.backlogId,
      actorId,
    });
    revalidatePath("/trash");
    return { ok: true as const };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    const error = String(e).includes("Délai de restauration dépassé")
      ? "Délai de restauration dépassé."
      : "Restauration impossible.";
    return { ok: false as const, error };
  }
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
  const actorId = await authenticatedActorId();
  try {
    const itemAuthorization = await requireItemPermission({
      actorId,
      itemId: input.id,
      permission: "schedule_items",
    });
    assertStoredBacklog(itemAuthorization, input.backlogId);
    const { backlogKey, ...data } = input;
    const item = await rankBacklogItem(data, actorId);
    if (!item) return { ok: false as const, error: "Item introuvable." };
    await invalidateBacklog(backlogKey, {
      kind: "item",
      backlogId: itemAuthorization.backlogId,
      itemIds: [input.id],
      actorId,
    });
    return { ok: true as const, item };
  } catch (error) {
    const authorizationError = mapActionAuthorizationError(error);
    if (authorizationError) return authorizationError;
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
  const actorId = await authenticatedActorId();
  try {
    const itemAuthorization = await requireItemPermission({
      actorId,
      itemId: input.id,
      permission: "schedule_items",
    });
    if (hasOwnField(input, "statusId")) {
      await requireItemPermission({
        actorId,
        itemId: input.id,
        permission: "transition_items",
      });
      if (input.statusId) {
        const status = await requireStatusPermission({
          actorId,
          statusId: input.statusId,
          permission: "transition_items",
        });
        assertSameBacklog(itemAuthorization, status, "status");
      }
    }
    const data = {
      id: input.id,
      statusId: input.statusId,
      beforeId: input.beforeId,
      afterId: input.afterId,
    };
    const requestCorrelationId = randomUUID();
    const item = await moveItem(data, actorId, requestCorrelationId);
    if (!item) return { ok: false as const, error: "Item introuvable." };
    // The Board already moved the card and takes the server's rank from the
    // answer: no page render travels with it (JIR-119).
    await publishBacklogChange({
      kind: "item",
      backlogId: itemAuthorization.backlogId,
      itemIds: [input.id],
      actorId,
    });
    return { ok: true as const, item };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapMoveError(e) };
  }
}

export async function reparentItemAction(input: ReparentItemActionInput) {
  const actorId = await authenticatedActorId();
  try {
    const itemAuthorization = await requireItemPermission({
      actorId,
      itemId: input.id,
      permission: "schedule_items",
    });
    await authorizeParent({
      actorId,
      parentId: input.newParentId,
      childBacklog: itemAuthorization,
    });
    const { backlogKey, ...data } = input;
    const item = await reparentItem(data, actorId);
    if (!item) return { ok: false as const, error: "Item introuvable." };
    await invalidateBacklog(backlogKey, {
      kind: "item",
      backlogId: itemAuthorization.backlogId,
      actorId,
    });
    return { ok: true as const, item };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapMoveError(e) };
  }
}
