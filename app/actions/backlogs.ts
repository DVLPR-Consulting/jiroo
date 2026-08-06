"use server";

import { revalidatePath } from "next/cache";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import { requireBacklogPermissionById } from "@/lib/auth/action-authorization";
import { requirePermission } from "@/lib/auth/authorization";
import { getSession } from "@/lib/auth/session";
import { archiveBacklog, createBacklog, updateBacklog } from "@/lib/services/backlogs";

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
    const b = await createBacklog(input);
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
}) {
  const actorId = await authenticatedActorId();
  try {
    await requireBacklogPermissionById({
      actorId,
      backlogId: input.id,
      permission: "administer_backlog",
    });
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
