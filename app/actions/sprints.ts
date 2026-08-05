"use server";

import { revalidatePath } from "next/cache";
import { type Role, canWriteItems } from "@/lib/auth/rbac";
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

async function requireWriter(): Promise<string> {
  const session = await getSession();
  const role = (session?.user as { role?: Role } | undefined)?.role;
  if (!session || !role || !canWriteItems(role)) throw new Error("Forbidden");
  return session.user.id;
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
  const validation = mapZodActionError(error);
  if (validation) return validation;
  const message = error instanceof Error ? error.message : "";
  return { error: known.has(message) ? message : fallback };
}

export async function createSprintAction(input: {
  backlogKey: string;
  backlogId: string;
}) {
  const actorId = await requireWriter();
  const { backlogKey, ...serviceInput } = input;
  try {
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
  const actorId = await requireWriter();
  const { backlogKey, ...serviceInput } = input;
  try {
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
  const actorId = await requireWriter();
  const { backlogKey, ...serviceInput } = input;
  try {
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
  const actorId = await requireWriter();
  const { backlogKey, ...serviceInput } = input;
  try {
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
  const actorId = await requireWriter();
  const { backlogKey, ...serviceInput } = input;
  try {
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
  const actorId = await requireWriter();
  const { backlogKey, ...serviceInput } = input;
  try {
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
  const actorId = await requireWriter();
  const { backlogKey, ...serviceInput } = input;
  try {
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
