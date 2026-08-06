"use server";

import { revalidatePath } from "next/cache";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import {
  requireBacklogPermissionById,
  requireViewMutationPermission,
} from "@/lib/auth/action-authorization";
import { getSession } from "@/lib/auth/session";
import type { DisplayMode } from "@/lib/items/views";
import type { Filters, GroupKey, SortDir, SortField } from "@/lib/items/filter";
import {
  createView,
  updateView,
  renameView,
  setShared,
  deleteView,
} from "@/lib/services/views";

// ---------------------------------------------------------------------------
// Action input types
// ---------------------------------------------------------------------------

type CreateViewActionInput = {
  backlogKey: string;
  backlogId: string;
  name: string;
  displayMode: DisplayMode;
  filters: Filters;
  group: GroupKey | null;
  sort: { field: SortField; dir: SortDir } | null;
  shared: boolean;
};

type UpdateViewActionInput = {
  backlogKey: string;
  id: string;
  displayMode: DisplayMode;
  filters: Filters;
  group: GroupKey | null;
  sort: { field: SortField; dir: SortDir } | null;
};

type RenameViewActionInput = {
  backlogKey: string;
  id: string;
  name: string;
};

type SetSharedViewActionInput = {
  backlogKey: string;
  id: string;
  shared: boolean;
};

type DeleteViewActionInput = {
  backlogKey: string;
  id: string;
};

// ---------------------------------------------------------------------------
// Auth helper — views are per-user; any authenticated user may manage their own
// ---------------------------------------------------------------------------

async function requireUser(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");
  return session.user.id;
}

// ---------------------------------------------------------------------------
// Error mapper
// The service throws two user-visible French messages verbatim; everything
// else falls back to a generic French message.
// ---------------------------------------------------------------------------

function mapViewError(e: unknown): string {
  const s = String(e);
  if (s.includes("Vue introuvable.")) return "Vue introuvable.";
  if (s.includes("Action réservée au propriétaire de la vue."))
    return "Action réservée au propriétaire de la vue.";
  return "Action impossible sur la vue.";
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Creates a new saved view owned by the authenticated user. */
export async function createViewAction(input: CreateViewActionInput) {
  const ownerId = await requireUser();
  try {
    await requireBacklogPermissionById({
      actorId: ownerId,
      backlogId: input.backlogId,
      permission: input.shared ? "manage_shared_views" : "browse_backlog",
    });
    const { backlogKey, ...data } = input;
    const view = await createView(data, ownerId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, view };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapViewError(e) };
  }
}

/** Overwrites the display state of an existing view in-place ("Save"). */
export async function updateViewAction(input: UpdateViewActionInput) {
  const actorId = await requireUser();
  try {
    const authorization = await requireViewMutationPermission({
      actorId,
      viewId: input.id,
    });
    const { backlogKey, id, ...stateFields } = input;
    const view = await updateView(id, stateFields, actorId, {
      allowAny: authorization.shared && authorization.ownerId !== actorId,
    });
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, view };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapViewError(e) };
  }
}

/** Renames a saved view. Only the owner may rename. */
export async function renameViewAction(input: RenameViewActionInput) {
  const actorId = await requireUser();
  try {
    const authorization = await requireViewMutationPermission({
      actorId,
      viewId: input.id,
    });
    const { backlogKey, id, name } = input;
    const view = await renameView(id, { name }, actorId, {
      allowAny: authorization.shared && authorization.ownerId !== actorId,
    });
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, view };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapViewError(e) };
  }
}

/** Sets the shared flag on a view. Only the owner may change visibility. */
export async function setSharedViewAction(input: SetSharedViewActionInput) {
  const actorId = await requireUser();
  try {
    const authorization = await requireViewMutationPermission({
      actorId,
      viewId: input.id,
      sharedMutation: true,
    });
    const { backlogKey, id, shared } = input;
    const view = await setShared(id, { shared }, actorId, {
      allowAny: authorization.shared && authorization.ownerId !== actorId,
    });
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, view };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapViewError(e) };
  }
}

/** Permanently deletes a saved view. Only the owner may delete. */
export async function deleteViewAction(input: DeleteViewActionInput) {
  const actorId = await requireUser();
  try {
    const authorization = await requireViewMutationPermission({
      actorId,
      viewId: input.id,
    });
    const { backlogKey, id } = input;
    await deleteView(id, actorId, {
      allowAny: authorization.shared && authorization.ownerId !== actorId,
    });
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapViewError(e) };
  }
}
