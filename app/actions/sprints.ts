"use server";

import { revalidatePath } from "next/cache";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import {
  requireBacklogPermissionById,
  requireItemPermission,
  requireSprintPermission,
  type AuthorizedResource,
} from "@/lib/auth/action-authorization";
import { ResourceNotFoundError } from "@/lib/auth/authorization";
import { getSession } from "@/lib/auth/session";
import {
  completeSprint,
  startSprint,
} from "@/lib/services/sprint-lifecycle";
import {
  assignItemsToSprint,
  createSprint,
  moveItemToSprint,
  reorderSprint,
  updateSprint,
} from "@/lib/services/sprints";
import { mapZodActionError } from "@/lib/validation/action-error";
import type {
  AssignSprintItemsInput,
  CompleteSprintInput,
  MoveSprintItemInput,
  ReorderSprintInput,
  StartSprintInput,
  UpdateSprintInput,
} from "@/lib/validation/sprint";

type WithBacklogKey<T> = T & { backlogKey: string };

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

function assertSameBacklog(expected: AuthorizedResource, actual: AuthorizedResource): void {
  if (expected.backlogId !== actual.backlogId) {
    throw new ResourceNotFoundError("sprint", actual.resourceId);
  }
}

function assertStoredBacklog(resource: AuthorizedResource, backlogId: string): void {
  if (resource.backlogId !== backlogId) {
    throw new ResourceNotFoundError("backlog", backlogId);
  }
}

function revalidateBacklog(backlogKey: string) {
  revalidatePath(`/b/${backlogKey}`);
}

const PLANNING_ERRORS = new Set([
  "Backlog introuvable.",
  "Sprint introuvable.",
  "Un sprint portant ce nom existe déjà.",
  "Un sprint terminé permet uniquement de modifier son nom et son objectif.",
  "Seul un sprint planifié peut être réordonné.",
  "Voisin invalide pour ce backlog.",
  "Un ou plusieurs items sont introuvables.",
  "Tous les items doivent appartenir au backlog.",
  "Seules les tâches peuvent être planifiées dans un sprint.",
  "Le sprint appartient à un autre backlog.",
  "Un sprint terminé ne peut plus recevoir d’items.",
  "Seules les tâches du backlog peuvent être déplacées.",
  "Le voisin n’appartient pas à la section cible.",
]);

const START_ERRORS = new Set([
  "Backlog introuvable.",
  "Sprint introuvable.",
  "Seul un sprint planifié peut être démarré.",
  "Un sprint est déjà actif pour ce backlog.",
  "Le contenu du sprint est incohérent.",
]);

const COMPLETE_ERRORS = new Set([
  "Backlog introuvable.",
  "Sprint introuvable.",
  "Seul un sprint actif peut être clôturé.",
  "Le contenu du sprint est incohérent.",
  "Sprint de destination introuvable.",
  "Un sprint portant ce nom existe déjà.",
]);

function safeError(
  error: unknown,
  known: ReadonlySet<string>,
  fallback: string,
): { error: string; fieldErrors?: Record<string, string[]> } {
  const authorizationError = mapActionAuthorizationError(error);
  if (authorizationError) return { error: authorizationError.error };
  const validation = mapZodActionError(error);
  if (validation) return validation;
  const message = error instanceof Error ? error.message : "";
  return { error: known.has(message) ? message : fallback };
}

export async function createSprintAction(input: {
  backlogKey: string;
  backlogId: string;
}) {
  const actorId = await authenticatedActorId();
  try {
    await requireBacklogPermissionById({
      actorId,
      backlogId: input.backlogId,
      permission: "manage_sprints",
    });
    const { backlogKey, ...serviceInput } = input;
    const sprint = await createSprint(serviceInput, actorId);
    revalidateBacklog(backlogKey);
    return { ok: true as const, sprint };
  } catch (error) {
    return {
      ok: false as const,
      ...safeError(error, PLANNING_ERRORS, "Création du sprint impossible."),
    };
  }
}

export async function updateSprintAction(
  input: WithBacklogKey<UpdateSprintInput>,
) {
  const actorId = await authenticatedActorId();
  try {
    const sprintAuthorization = await requireSprintPermission({
      actorId,
      sprintId: input.id,
      permission: "manage_sprints",
    });
    assertStoredBacklog(sprintAuthorization, input.backlogId);
    const { backlogKey, ...serviceInput } = input;
    const sprint = await updateSprint(serviceInput, actorId);
    revalidateBacklog(backlogKey);
    return { ok: true as const, sprint };
  } catch (error) {
    return {
      ok: false as const,
      ...safeError(error, PLANNING_ERRORS, "Modification du sprint impossible."),
    };
  }
}

export async function reorderSprintAction(
  input: WithBacklogKey<ReorderSprintInput>,
) {
  const actorId = await authenticatedActorId();
  try {
    const sprintAuthorization = await requireSprintPermission({
      actorId,
      sprintId: input.id,
      permission: "manage_sprints",
    });
    assertStoredBacklog(sprintAuthorization, input.backlogId);
    const { backlogKey, ...serviceInput } = input;
    const sprint = await reorderSprint(serviceInput, actorId);
    revalidateBacklog(backlogKey);
    return { ok: true as const, sprint };
  } catch (error) {
    return {
      ok: false as const,
      ...safeError(error, PLANNING_ERRORS, "Classement du sprint impossible."),
    };
  }
}

export async function assignSprintItemsAction(
  input: WithBacklogKey<AssignSprintItemsInput>,
) {
  const actorId = await authenticatedActorId();
  try {
    const items: AuthorizedResource[] = [];
    for (const itemId of input.itemIds) {
      const item = await requireItemPermission({ actorId, itemId, permission: "schedule_items" });
      assertStoredBacklog(item, input.backlogId);
      items.push(item);
    }
    if (input.sprintId) {
      const sprint = await requireSprintPermission({
        actorId,
        sprintId: input.sprintId,
        permission: "schedule_items",
      });
      for (const item of items) assertSameBacklog(item, sprint);
    }
    const { backlogKey, ...serviceInput } = input;
    const result = await assignItemsToSprint(serviceInput, actorId);
    revalidateBacklog(backlogKey);
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      ...safeError(error, PLANNING_ERRORS, "Planification des items impossible."),
    };
  }
}

export async function moveSprintItemAction(
  input: WithBacklogKey<MoveSprintItemInput>,
) {
  const actorId = await authenticatedActorId();
  try {
    const itemAuthorization = await requireItemPermission({
      actorId,
      itemId: input.itemId,
      permission: "schedule_items",
    });
    assertStoredBacklog(itemAuthorization, input.backlogId);
    if (input.sprintId) {
      const sprint = await requireSprintPermission({
        actorId,
        sprintId: input.sprintId,
        permission: "schedule_items",
      });
      assertSameBacklog(itemAuthorization, sprint);
    }
    const { backlogKey, ...serviceInput } = input;
    const item = await moveItemToSprint(serviceInput, actorId);
    revalidateBacklog(backlogKey);
    return { ok: true as const, item };
  } catch (error) {
    return {
      ok: false as const,
      ...safeError(error, PLANNING_ERRORS, "Déplacement de l’item impossible."),
    };
  }
}

export async function startSprintAction(input: WithBacklogKey<StartSprintInput>) {
  const actorId = await authenticatedActorId();
  try {
    const sprintAuthorization = await requireSprintPermission({
      actorId,
      sprintId: input.id,
      permission: "manage_sprints",
    });
    assertStoredBacklog(sprintAuthorization, input.backlogId);
    const { backlogKey, ...serviceInput } = input;
    const result = await startSprint(serviceInput, actorId);
    revalidateBacklog(backlogKey);
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      ...safeError(error, START_ERRORS, "Démarrage du sprint impossible."),
    };
  }
}

export async function completeSprintAction(
  input: WithBacklogKey<CompleteSprintInput>,
) {
  const actorId = await authenticatedActorId();
  try {
    const sprintAuthorization = await requireSprintPermission({
      actorId,
      sprintId: input.id,
      permission: "manage_sprints",
    });
    assertStoredBacklog(sprintAuthorization, input.backlogId);
    const { backlogKey, ...serviceInput } = input;
    const result = await completeSprint(serviceInput, actorId);
    revalidateBacklog(backlogKey);
    return { ok: true as const, ...result };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "IncompleteSprintSubtasksError" &&
      "itemKeys" in error &&
      Array.isArray(error.itemKeys) &&
      error.itemKeys.every((key) => typeof key === "string")
    ) {
      return {
        ok: false as const,
        error: "Terminez les sous-tâches avant de clôturer le sprint.",
        itemKeys: error.itemKeys as string[],
      };
    }
    return {
      ok: false as const,
      ...safeError(error, COMPLETE_ERRORS, "Clôture du sprint impossible."),
    };
  }
}
