"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  requireBacklogPermissionById,
  requireStatusPermission,
  type AuthorizedResource,
} from "@/lib/auth/action-authorization";
import { ResourceNotFoundError } from "@/lib/auth/authorization";
import { getSession } from "@/lib/auth/session";
import {
  createStatus,
  deleteStatus,
  reorderStatuses,
  updateStatus,
} from "@/lib/services/statuses";

type StatusCategory = "todo" | "in_progress" | "done";

const SAFE_ERRORS = new Set([
  "Backlog introuvable.",
  "Statut introuvable.",
  "Statut de destination introuvable.",
  "Un statut portant ce nom existe déjà.",
  "La liste des statuts est incomplète.",
  "Le workflow doit conserver au moins un statut.",
  "Le workflow doit conserver au moins un statut initial.",
  "Le workflow doit conserver au moins un statut terminé.",
  "Choisissez un statut de destination pour les items existants.",
]);

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

function assertStatusBacklog(status: AuthorizedResource, backlogId: string): void {
  if (status.backlogId !== backlogId) {
    throw new ResourceNotFoundError("status", status.resourceId);
  }
}

function actionError(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Données de statut invalides.";
  }
  const message = error instanceof Error ? error.message : String(error);
  return SAFE_ERRORS.has(message) ? message : "Modification du workflow impossible.";
}

function revalidateWorkflow(backlogKey: string) {
  for (const path of ["/admin", "/", "/mine", "/trash", `/b/${backlogKey}`]) {
    revalidatePath(path);
  }
}

export async function createStatusAction(input: {
  backlogId: string;
  backlogKey: string;
  name: string;
  category: StatusCategory;
  color: string;
}) {
  const actorId = await authenticatedActorId();
  await requireBacklogPermissionById({
    actorId,
    backlogId: input.backlogId,
    permission: "manage_workflows",
  });
  try {
    const status = await createStatus({
      backlogId: input.backlogId,
      name: input.name,
      category: input.category,
      color: input.color,
    });
    revalidateWorkflow(input.backlogKey);
    return { ok: true as const, status };
  } catch (error) {
    return { ok: false as const, error: actionError(error) };
  }
}

export async function updateStatusAction(input: {
  id: string;
  backlogId: string;
  backlogKey: string;
  name: string;
  category: StatusCategory;
  color: string;
}) {
  const actorId = await authenticatedActorId();
  const statusAuthorization = await requireStatusPermission({
    actorId,
    statusId: input.id,
    permission: "manage_workflows",
  });
  assertStatusBacklog(statusAuthorization, input.backlogId);
  try {
    const status = await updateStatus(
      {
        id: input.id,
        backlogId: input.backlogId,
        name: input.name,
        category: input.category,
        color: input.color,
      },
      actorId,
    );
    revalidateWorkflow(input.backlogKey);
    return { ok: true as const, status };
  } catch (error) {
    return { ok: false as const, error: actionError(error) };
  }
}

export async function reorderStatusesAction(input: {
  backlogId: string;
  backlogKey: string;
  statusIds: string[];
}) {
  const actorId = await authenticatedActorId();
  await requireBacklogPermissionById({
    actorId,
    backlogId: input.backlogId,
    permission: "manage_workflows",
  });
  for (const statusId of input.statusIds) {
    const statusAuthorization = await requireStatusPermission({
      actorId,
      statusId,
      permission: "manage_workflows",
    });
    assertStatusBacklog(statusAuthorization, input.backlogId);
  }
  try {
    await reorderStatuses({ backlogId: input.backlogId, statusIds: input.statusIds });
    revalidateWorkflow(input.backlogKey);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionError(error) };
  }
}

export async function deleteStatusAction(input: {
  id: string;
  backlogId: string;
  backlogKey: string;
  replacementStatusId?: string | null;
}) {
  const actorId = await authenticatedActorId();
  const statusAuthorization = await requireStatusPermission({
    actorId,
    statusId: input.id,
    permission: "manage_workflows",
  });
  assertStatusBacklog(statusAuthorization, input.backlogId);
  if (input.replacementStatusId) {
    const replacementAuthorization = await requireStatusPermission({
      actorId,
      statusId: input.replacementStatusId,
      permission: "manage_workflows",
    });
    assertStatusBacklog(replacementAuthorization, statusAuthorization.backlogId);
  }
  try {
    const result = await deleteStatus(
      {
        id: input.id,
        backlogId: input.backlogId,
        replacementStatusId: input.replacementStatusId ?? null,
      },
      actorId,
    );
    revalidateWorkflow(input.backlogKey);
    return { ok: true as const, ...result };
  } catch (error) {
    const currentItemCount =
      error instanceof Error &&
      "currentItemCount" in error &&
      typeof error.currentItemCount === "number"
        ? error.currentItemCount
        : undefined;
    return {
      ok: false as const,
      error: actionError(error),
      ...(currentItemCount === undefined ? {} : { currentItemCount }),
    };
  }
}
