"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z, type ZodType } from "zod";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import { requireBacklogPermissionById } from "@/lib/auth/action-authorization";
import { requirePermission } from "@/lib/auth/authorization";
import { getSession } from "@/lib/auth/session";
import { invalidateBacklog } from "@/lib/realtime/publish";
import {
  archiveRelease,
  createRelease,
  deleteRelease,
  mergeRelease,
  publishRelease,
  reorderRelease,
  unarchiveRelease,
  unreleaseRelease,
  updateRelease,
} from "@/lib/services/releases";
import { mapZodActionError } from "@/lib/validation/action-error";
import {
  createReleaseWithOptionalDriverSchema,
  deleteReleaseSchema,
  mergeReleaseSchema,
  publishReleaseSchema,
  reorderReleaseSchema,
  revisionedReleaseIdentitySchema,
  updateReleaseSchema,
} from "@/lib/validation/release";

const releaseActionEnvelopeSchema = z.looseObject({ backlogKey: z.string() });

const RELEASE_DOMAIN_ERRORS = new Set([
  "Backlog introuvable.",
  "Release introuvable.",
  "Acteur introuvable.",
  "Pilote introuvable.",
  "Une release portant ce nom existe déjà.",
  "La date cible doit suivre la date de début.",
  "Cette release a changé. Rechargez-la avant de réessayer.",
  "Cette release est déjà publiée.",
  "Cette release n’est pas publiée.",
  "Cette release est déjà archivée.",
  "Cette release n’est pas archivée.",
  "Une release archivée ne peut pas être publiée.",
  "Cette release doit être désarchivée avant dépublication.",
  "La release de destination est invalide pour ce backlog.",
  "La release de destination est archivée.",
  "La release de destination doit être non publiée.",
  "Le scope de la release est incohérent.",
  "La version contient des éléments.",
  "La release de destination a changé. Rechargez-la avant de réessayer.",
  "Une version archivée ne peut pas être réordonnée.",
  "Voisin invalide pour ce backlog.",
]);

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

function safeReleaseError(error: unknown, fallback: string) {
  const authorization = mapActionAuthorizationError(error);
  if (authorization) return authorization;
  const validation = mapZodActionError(error);
  if (validation) return { ok: false as const, ...validation };
  const message = error instanceof Error ? error.message : "";
  const fieldErrors = message === "Une release portant ce nom existe déjà."
    ? { name: [message] }
    : message === "La date cible doit suivre la date de début."
      ? { targetDate: [message] }
      : undefined;
  return {
    ok: false as const,
    error: RELEASE_DOMAIN_ERRORS.has(message) ? message : fallback,
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}

function stalePublicationScopeResult(error: unknown) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "RELEASE_PUBLICATION_SCOPE_STALE" ||
    !("currentScopeRevision" in error) ||
    typeof error.currentScopeRevision !== "string" ||
    !("currentIncompleteCount" in error) ||
    typeof error.currentIncompleteCount !== "number"
  ) {
    return null;
  }
  return {
    ok: false as const,
    reason: "stale_scope" as const,
    error: error.message,
    currentScopeRevision: error.currentScopeRevision,
    currentIncompleteCount: error.currentIncompleteCount,
  };
}

function staleReleaseScopeResult(error: unknown) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "RELEASE_SCOPE_STALE" ||
    !("currentScopeRevision" in error) ||
    typeof error.currentScopeRevision !== "string" ||
    !("currentLinkedCount" in error) ||
    typeof error.currentLinkedCount !== "number" ||
    !("currentTrashedCount" in error) ||
    typeof error.currentTrashedCount !== "number"
  ) {
    return null;
  }
  return {
    ok: false as const,
    reason: "stale_scope" as const,
    error: error.message,
    currentScopeRevision: error.currentScopeRevision,
    currentLinkedCount: error.currentLinkedCount,
    currentTrashedCount: error.currentTrashedCount,
  };
}

function revalidateReleasePaths(backlogKey: string, ...releaseIds: string[]) {
  revalidatePath(`/b/${backlogKey}/releases`);
  for (const releaseId of releaseIds) revalidatePath(`/b/${backlogKey}/releases/${releaseId}`);
}

function parseReleaseActionCommand<T>(input: unknown, commandSchema: ZodType<T>) {
  const { backlogKey, ...rawCommand } = releaseActionEnvelopeSchema.parse(input);
  void backlogKey;
  return commandSchema.parse(rawCommand);
}

async function authorizeReleaseManagement(actorId: string, backlogId: string) {
  return requireBacklogPermissionById({
    actorId,
    backlogId,
    permission: "manage_releases",
  });
}

async function requireDriverBrowsePermission(
  actorId: string,
  driverId: string | null | undefined,
) {
  if (!driverId || driverId === actorId) return;
  await requirePermission({
    actorId,
    permission: "browse_users",
    scope: { type: "global" },
  });
}

export async function createReleaseAction(input: unknown) {
  try {
    const command = parseReleaseActionCommand(input, createReleaseWithOptionalDriverSchema);
    const actorId = await authenticatedActorId();
    const backlog = await authorizeReleaseManagement(actorId, command.backlogId);
    const driverId = command.driverId ?? actorId;
    await requireDriverBrowsePermission(actorId, driverId);
    const result = await createRelease(
      { ...command, driverId },
      actorId,
      randomUUID(),
    );
    await invalidateBacklog(backlog.backlogKey, {
      kind: "release",
      backlogId: backlog.backlogId,
      actorId,
    });
    revalidateReleasePaths(backlog.backlogKey);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Création de release impossible.");
  }
}

export async function updateReleaseAction(input: unknown) {
  try {
    const command = parseReleaseActionCommand(input, updateReleaseSchema);
    const actorId = await authenticatedActorId();
    const backlog = await authorizeReleaseManagement(actorId, command.backlogId);
    await requireDriverBrowsePermission(actorId, command.driverId);
    const result = await updateRelease(command, actorId, randomUUID());
    await invalidateBacklog(backlog.backlogKey, {
      kind: "release",
      backlogId: backlog.backlogId,
      actorId,
    });
    revalidateReleasePaths(backlog.backlogKey, command.releaseId);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Mise à jour de release impossible.");
  }
}

export async function publishReleaseAction(input: unknown) {
  try {
    const command = parseReleaseActionCommand(input, publishReleaseSchema);
    const actorId = await authenticatedActorId();
    const backlog = await authorizeReleaseManagement(actorId, command.backlogId);
    if (command.incompleteDisposition === "move") {
      await requireBacklogPermissionById({
        actorId,
        backlogId: backlog.backlogId,
        permission: "edit_items",
      });
    }
    const result = await publishRelease(command, actorId, randomUUID());
    await invalidateBacklog(backlog.backlogKey, {
      kind: "release",
      backlogId: backlog.backlogId,
      actorId,
    });
    revalidateReleasePaths(backlog.backlogKey, command.releaseId);
    return { ok: true as const, result };
  } catch (error) {
    const staleScope = stalePublicationScopeResult(error);
    if (staleScope) return staleScope;
    return safeReleaseError(error, "Publication impossible.");
  }
}

export async function unreleaseReleaseAction(input: unknown) {
  try {
    const command = parseReleaseActionCommand(input, revisionedReleaseIdentitySchema);
    const actorId = await authenticatedActorId();
    const backlog = await authorizeReleaseManagement(actorId, command.backlogId);
    const result = await unreleaseRelease(command, actorId, randomUUID());
    await invalidateBacklog(backlog.backlogKey, {
      kind: "release",
      backlogId: backlog.backlogId,
      actorId,
    });
    revalidateReleasePaths(backlog.backlogKey, command.releaseId);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Dépublication impossible.");
  }
}

export async function archiveReleaseAction(input: unknown) {
  try {
    const command = parseReleaseActionCommand(input, revisionedReleaseIdentitySchema);
    const actorId = await authenticatedActorId();
    const backlog = await authorizeReleaseManagement(actorId, command.backlogId);
    const result = await archiveRelease(command, actorId, randomUUID());
    await invalidateBacklog(backlog.backlogKey, {
      kind: "release",
      backlogId: backlog.backlogId,
      actorId,
    });
    revalidateReleasePaths(backlog.backlogKey, command.releaseId);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Archivage impossible.");
  }
}

export async function unarchiveReleaseAction(input: unknown) {
  try {
    const command = parseReleaseActionCommand(input, revisionedReleaseIdentitySchema);
    const actorId = await authenticatedActorId();
    const backlog = await authorizeReleaseManagement(actorId, command.backlogId);
    const result = await unarchiveRelease(command, actorId, randomUUID());
    await invalidateBacklog(backlog.backlogKey, {
      kind: "release",
      backlogId: backlog.backlogId,
      actorId,
    });
    revalidateReleasePaths(backlog.backlogKey, command.releaseId);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Désarchivage impossible.");
  }
}

// Merge, delete and reorder are version administration: like Jira (project
// admin "Manage versions"), they require manage_releases only, even when the
// Fix version links of items are transferred or removed.

export async function mergeReleaseAction(input: unknown) {
  try {
    const command = parseReleaseActionCommand(input, mergeReleaseSchema);
    const actorId = await authenticatedActorId();
    const backlog = await authorizeReleaseManagement(actorId, command.backlogId);
    const result = await mergeRelease(command, actorId, randomUUID());
    await invalidateBacklog(backlog.backlogKey, {
      kind: "release",
      backlogId: backlog.backlogId,
      actorId,
    });
    revalidateReleasePaths(backlog.backlogKey, command.sourceReleaseId, command.targetReleaseId);
    return { ok: true as const, result };
  } catch (error) {
    const staleScope = staleReleaseScopeResult(error);
    if (staleScope) return staleScope;
    return safeReleaseError(error, "Fusion impossible.");
  }
}

export async function deleteReleaseAction(input: unknown) {
  try {
    const command = parseReleaseActionCommand(input, deleteReleaseSchema);
    const actorId = await authenticatedActorId();
    const backlog = await authorizeReleaseManagement(actorId, command.backlogId);
    const result = await deleteRelease(command, actorId, randomUUID());
    await invalidateBacklog(backlog.backlogKey, {
      kind: "release",
      backlogId: backlog.backlogId,
      actorId,
    });
    revalidateReleasePaths(
      backlog.backlogKey,
      command.releaseId,
      ...(result.targetRelease ? [result.targetRelease.id] : []),
    );
    return { ok: true as const, result };
  } catch (error) {
    const staleScope = staleReleaseScopeResult(error);
    if (staleScope) return staleScope;
    return safeReleaseError(error, "Suppression impossible.");
  }
}

export async function reorderReleaseAction(input: unknown) {
  try {
    const command = parseReleaseActionCommand(input, reorderReleaseSchema);
    const actorId = await authenticatedActorId();
    const backlog = await authorizeReleaseManagement(actorId, command.backlogId);
    const result = await reorderRelease(command, actorId, randomUUID());
    await invalidateBacklog(backlog.backlogKey, {
      kind: "release",
      backlogId: backlog.backlogId,
      actorId,
    });
    revalidateReleasePaths(backlog.backlogKey);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Réordonnancement impossible.");
  }
}
