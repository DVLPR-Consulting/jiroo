"use server";

import { revalidatePath } from "next/cache";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import { requireBacklogPermissionById } from "@/lib/auth/action-authorization";
import { requirePermission } from "@/lib/auth/authorization";
import { getSession } from "@/lib/auth/session";
import { ZodError } from "zod";
import {
  archiveBacklog,
  createBacklog,
  setBacklogStar,
  updateBacklog,
} from "@/lib/services/backlogs";

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    return true;
  }
  return String(error).includes("23505") || String(error).toLowerCase().includes("unique");
}

export async function createBacklogAction(input: { key: string; name: string; color: string }) {
  const actorId = await authenticatedActorId();
  try {
    await requirePermission({
      actorId,
      permission: "create_backlogs",
      scope: { type: "global" },
    });
    const b = await createBacklog(input, actorId);
    revalidatePath("/admin");
    return { ok: true as const, backlog: b };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    const msg = String(e).includes("unique") ? "Cette clé est déjà utilisée." : "Création impossible.";
    return { ok: false as const, error: msg };
  }
}

export async function updateBacklogAction(input: {
  id: string;
  key: string;
  name: string;
  color: string;
  /** Backlog lead (JIR-82): null for none, omitted to keep it. */
  leadUserId?: string | null;
}) {
  const actorId = await authenticatedActorId();
  try {
    await requireBacklogPermissionById({
      actorId,
      backlogId: input.id,
      permission: "administer_backlog",
    });
    // Picking a lead reads the user directory, as the lead picker does.
    if (input.leadUserId !== undefined) {
      await requirePermission({
        actorId,
        permission: "browse_users",
        scope: { type: "global" },
      });
    }
    const result = await updateBacklog(input, actorId);
    if (!result) return { ok: false as const, error: "Modification impossible." };

    for (const path of [
      "/admin",
      "/",
      "/mine",
      "/trash",
      `/b/${result.previousKey}`,
      `/b/${result.backlog.key}`,
    ]) {
      revalidatePath(path);
    }
    return { ok: true as const };
  } catch (error) {
    const authorizationError = mapActionAuthorizationError(error);
    if (authorizationError) return authorizationError;
    return {
      ok: false as const,
      error: isUniqueViolation(error)
        ? "Cette clé est déjà utilisée."
        : error instanceof Error && error.message === "Responsable introuvable."
          ? "Responsable introuvable."
          : "Modification impossible.",
    };
  }
}

export async function archiveBacklogAction(id: string) {
  const actorId = await authenticatedActorId();
  try {
    await requireBacklogPermissionById({
      actorId,
      backlogId: id,
      permission: "administer_backlog",
    });
    await archiveBacklog(id);
    revalidatePath("/admin");
    return { ok: true as const };
  } catch (error) {
    const authorizationError = mapActionAuthorizationError(error);
    if (authorizationError) return authorizationError;
    throw error;
  }
}

/**
 * Stars or unstars a backlog for the signed-in user (JIR-82). No permission
 * beyond browsing the backlog, checked by the service; idempotent.
 */
export async function setBacklogStarAction(input: { backlogId: string; starred: boolean }) {
  const actorId = await authenticatedActorId();
  try {
    const result = await setBacklogStar(input, actorId);
    // Favourites reorder the home page and the sidebar selector of every page.
    revalidatePath("/", "layout");
    return { ok: true as const, starred: result.starred };
  } catch (error) {
    const authorizationError = mapActionAuthorizationError(error);
    if (authorizationError) return authorizationError;
    if (error instanceof ZodError) return { ok: false as const, error: "Requête invalide." };
    return { ok: false as const, error: "Favori non enregistré. Réessayez." };
  }
}
