"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import { requireBacklogPermissionById } from "@/lib/auth/action-authorization";
import { listAssignableUsersForBacklog, ResourceNotFoundError } from "@/lib/auth/authorization";
import { getSession } from "@/lib/auth/session";
import { invalidateBacklog } from "@/lib/realtime/publish";
import {
  ABSENCE_NOT_FOUND_MESSAGE,
  ABSENCE_OVERLAP_MESSAGE,
  declareAbsence,
  getAbsenceOwner,
  removeAbsence,
  type AbsenceDto,
} from "@/lib/services/absences";
import { absenceIdInput, declareAbsenceInput } from "@/lib/validation/absence";

/**
 * Declared absences (JIR-124). Anyone declares their own from a backlog they
 * may browse; a backlog's administrators declare a member's. The rights are
 * checked against the stored absence's owner, never a client value.
 */

type Failure = { ok: false; error: string };

const NOT_A_MEMBER_MESSAGE = "Cette personne n’est pas membre du backlog.";
const SAFE_MESSAGES = new Set([ABSENCE_OVERLAP_MESSAGE, ABSENCE_NOT_FOUND_MESSAGE, NOT_A_MEMBER_MESSAGE]);
const SESSION_EXPIRED: Failure = { ok: false, error: "Votre session a expiré. Reconnectez-vous." };
const NOT_FOUND: Failure = { ok: false, error: "La ressource demandée est introuvable." };

function failure(error: unknown): Failure {
  const authorization = mapActionAuthorizationError(error);
  if (authorization) return authorization;
  if (error instanceof ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Les données saisies sont invalides." };
  }
  if (error instanceof Error && SAFE_MESSAGES.has(error.message)) return { ok: false, error: error.message };
  return { ok: false, error: "Action impossible. Réessayez." };
}

async function sessionActorId(): Promise<string | null> {
  return (await getSession())?.user.id ?? null;
}

/** The same right as opening the backlog's settings: administer it, or manage its members. */
async function requireAdministration(actorId: string, backlogId: string) {
  try {
    return await requireBacklogPermissionById({ actorId, backlogId, permission: "administer_backlog" });
  } catch (error) {
    if (!mapActionAuthorizationError(error)) throw error;
    return requireBacklogPermissionById({ actorId, backlogId, permission: "manage_members" });
  }
}

/** The backlog's key once the actor may act on this person's absences from it. */
async function authorize(actorId: string, backlogId: string, userId: string): Promise<string> {
  if (userId === actorId) {
    return (await requireBacklogPermissionById({ actorId, backlogId, permission: "browse_backlog" })).backlogKey;
  }
  const { backlogKey } = await requireAdministration(actorId, backlogId);
  const members = await listAssignableUsersForBacklog(backlogId);
  if (!members.some((member) => member.id === userId)) throw new Error(NOT_A_MEMBER_MESSAGE);
  return backlogKey;
}

/** Re-renders the backlog's pages, Le point first, and tells its open tabs; no item changed. */
async function publish(backlogKey: string, backlogId: string, actorId: string) {
  revalidatePath(`/b/${backlogKey}/le-point`);
  await invalidateBacklog(backlogKey, { kind: "backlog", backlogId, itemIds: [], actorId });
}

export async function declareAbsenceAction(
  input: Record<string, unknown>,
): Promise<{ ok: true; absence: AbsenceDto } | Failure> {
  const actorId = await sessionActorId();
  if (!actorId) return SESSION_EXPIRED;
  try {
    const data = declareAbsenceInput.parse(input);
    const backlogKey = await authorize(actorId, data.backlogId, data.userId);
    const absence = await declareAbsence(data, actorId);
    await publish(backlogKey, data.backlogId, actorId);
    return { ok: true, absence };
  } catch (error) {
    return failure(error);
  }
}

export async function removeAbsenceAction(input: { id: string; backlogId: string }): Promise<{ ok: true } | Failure> {
  const actorId = await sessionActorId();
  if (!actorId) return SESSION_EXPIRED;
  const parsed = absenceIdInput.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  try {
    const owner = await getAbsenceOwner(parsed.data.id);
    if (!owner) throw new ResourceNotFoundError("absence", parsed.data.id);
    const backlogKey = await authorize(actorId, parsed.data.backlogId, owner);
    await removeAbsence(parsed.data, actorId);
    await publish(backlogKey, parsed.data.backlogId, actorId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
