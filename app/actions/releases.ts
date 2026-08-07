"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import { requireBacklogPermissionById } from "@/lib/auth/action-authorization";
import { requirePermission } from "@/lib/auth/authorization";
import { getSession } from "@/lib/auth/session";
import {
  archiveRelease,
  createRelease,
  publishRelease,
  unarchiveRelease,
  unreleaseRelease,
  updateRelease,
} from "@/lib/services/releases";
import { mapZodActionError } from "@/lib/validation/action-error";
import type {
  CreateReleaseInput,
  PublishReleaseInput,
  UpdateReleaseInput,
} from "@/lib/validation/release";

type WithBacklogKey<T> = T & { backlogKey: string };
type CreateReleaseActionInput = WithBacklogKey<
  Omit<CreateReleaseInput, "driverId"> & { driverId?: string }
>;
type UpdateReleaseActionInput = WithBacklogKey<UpdateReleaseInput>;
type PublishReleaseActionInput = WithBacklogKey<PublishReleaseInput>;
type RevisionedReleaseActionInput = {
  backlogKey: string;
  backlogId: string;
  releaseId: string;
  expectedRevision: number;
};

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
  "La release de destination est invalide pour ce backlog.",
  "La release de destination est archivée.",
  "Le scope de la release est incohérent.",
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
  return {
    ok: false as const,
    error: RELEASE_DOMAIN_ERRORS.has(message) ? message : fallback,
  };
}

function revalidateReleasePaths(backlogKey: string, releaseId?: string) {
  revalidatePath(`/b/${backlogKey}`);
  revalidatePath(`/b/${backlogKey}/releases`);
  if (releaseId) revalidatePath(`/b/${backlogKey}/releases/${releaseId}`);
}

function stripClientBacklogKey<T extends object>(input: WithBacklogKey<T>): T {
  const { backlogKey, ...serviceInput } = input;
  void backlogKey;
  return serviceInput as T;
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

export async function createReleaseAction(input: CreateReleaseActionInput) {
  const actorId = await authenticatedActorId();
  try {
    const backlog = await authorizeReleaseManagement(actorId, input.backlogId);
    const driverId = input.driverId ?? actorId;
    await requireDriverBrowsePermission(actorId, driverId);
    const serviceInput = stripClientBacklogKey(input);
    const result = await createRelease(
      { ...serviceInput, driverId },
      actorId,
      randomUUID(),
    );
    revalidateReleasePaths(backlog.backlogKey);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Création de release impossible.");
  }
}

export async function updateReleaseAction(input: UpdateReleaseActionInput) {
  const actorId = await authenticatedActorId();
  try {
    const backlog = await authorizeReleaseManagement(actorId, input.backlogId);
    await requireDriverBrowsePermission(actorId, input.driverId);
    const serviceInput = stripClientBacklogKey(input);
    const result = await updateRelease(serviceInput, actorId, randomUUID());
    revalidateReleasePaths(backlog.backlogKey, input.releaseId);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Mise à jour de release impossible.");
  }
}

export async function publishReleaseAction(input: PublishReleaseActionInput) {
  const actorId = await authenticatedActorId();
  try {
    const backlog = await authorizeReleaseManagement(actorId, input.backlogId);
    if (input.incompleteDisposition === "move") {
      await requireBacklogPermissionById({
        actorId,
        backlogId: backlog.backlogId,
        permission: "edit_items",
      });
    }
    const serviceInput = stripClientBacklogKey(input);
    const result = await publishRelease(serviceInput, actorId, randomUUID());
    revalidateReleasePaths(backlog.backlogKey, input.releaseId);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Publication impossible.");
  }
}

export async function unreleaseReleaseAction(input: RevisionedReleaseActionInput) {
  const actorId = await authenticatedActorId();
  try {
    const backlog = await authorizeReleaseManagement(actorId, input.backlogId);
    const serviceInput = stripClientBacklogKey(input);
    const result = await unreleaseRelease(serviceInput, actorId, randomUUID());
    revalidateReleasePaths(backlog.backlogKey, input.releaseId);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Dépublication impossible.");
  }
}

export async function archiveReleaseAction(input: RevisionedReleaseActionInput) {
  const actorId = await authenticatedActorId();
  try {
    const backlog = await authorizeReleaseManagement(actorId, input.backlogId);
    const serviceInput = stripClientBacklogKey(input);
    const result = await archiveRelease(serviceInput, actorId, randomUUID());
    revalidateReleasePaths(backlog.backlogKey, input.releaseId);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Archivage impossible.");
  }
}

export async function unarchiveReleaseAction(input: RevisionedReleaseActionInput) {
  const actorId = await authenticatedActorId();
  try {
    const backlog = await authorizeReleaseManagement(actorId, input.backlogId);
    const serviceInput = stripClientBacklogKey(input);
    const result = await unarchiveRelease(serviceInput, actorId, randomUUID());
    revalidateReleasePaths(backlog.backlogKey, input.releaseId);
    return { ok: true as const, result };
  } catch (error) {
    return safeReleaseError(error, "Désarchivage impossible.");
  }
}
