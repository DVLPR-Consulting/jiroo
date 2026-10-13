"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import {
  requireBacklogPermissionById,
  requireRepoConnectionPermission,
} from "@/lib/auth/action-authorization";
import { getSession } from "@/lib/auth/session";
import {
  CONNECTION_NOT_FOUND_MESSAGE,
  createRepoConnection,
  deleteRepoConnection,
  DUPLICATE_CONNECTION_MESSAGE,
  regenerateRepoConnectionSecret,
  setRepoConnectionEnabled,
  type RepoConnectionDto,
} from "@/lib/services/repo-connections";
import { repoConnectionIdInput, setRepoConnectionEnabledInput } from "@/lib/validation/repo-connection";

/**
 * Repository connections (JIR-95): reserved to backlog administrators
 * (`administer_backlog`), checked against the stored connection's backlog.
 * The secret travels only in the answer of the call that generated it.
 */

type Failure = { ok: false; error: string };
type WithSecret = { ok: true; connection: RepoConnectionDto; secret: string };

const SAFE_MESSAGES = new Set([DUPLICATE_CONNECTION_MESSAGE, CONNECTION_NOT_FOUND_MESSAGE]);

async function authenticatedActorId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}

function failure(error: unknown): Failure {
  const authorization = mapActionAuthorizationError(error);
  if (authorization) return authorization;
  if (error instanceof ZodError) {
    // Only the validation's own (French) messages are shown.
    const custom = error.issues.find((issue) => issue.code === "custom");
    return { ok: false, error: custom?.message ?? "Les données saisies sont invalides." };
  }
  if (error instanceof Error && SAFE_MESSAGES.has(error.message)) return { ok: false, error: error.message };
  return { ok: false, error: "Action impossible. Réessayez." };
}

const SESSION_EXPIRED: Failure = { ok: false, error: "Votre session a expiré. Reconnectez-vous." };
const NOT_FOUND: Failure = { ok: false, error: "La ressource demandée est introuvable." };

function revalidateSettings(backlogKey: string) {
  revalidatePath(`/b/${backlogKey}/settings/development`);
}

export async function createRepoConnectionAction(input: {
  backlogId: string;
  provider: string;
  repositoryPath: string;
  instanceUrl?: string;
}): Promise<WithSecret | Failure> {
  const actorId = await authenticatedActorId();
  if (!actorId) return SESSION_EXPIRED;
  try {
    const { backlogKey } = await requireBacklogPermissionById({
      actorId,
      backlogId: input.backlogId,
      permission: "administer_backlog",
    });
    const { connection, secret } = await createRepoConnection(input, actorId);
    revalidateSettings(backlogKey);
    return { ok: true, connection, secret };
  } catch (error) {
    return failure(error);
  }
}

async function authorizeConnection(actorId: string, connectionId: string) {
  return requireRepoConnectionPermission({
    actorId,
    connectionId,
    permission: "administer_backlog",
  });
}

export async function regenerateRepoConnectionSecretAction(input: {
  backlogKey: string;
  connectionId: string;
}): Promise<WithSecret | Failure> {
  const actorId = await authenticatedActorId();
  if (!actorId) return SESSION_EXPIRED;
  const parsed = repoConnectionIdInput.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  try {
    await authorizeConnection(actorId, parsed.data.connectionId);
    const { connection, secret } = await regenerateRepoConnectionSecret(parsed.data, actorId);
    revalidateSettings(input.backlogKey);
    return { ok: true, connection, secret };
  } catch (error) {
    return failure(error);
  }
}

export async function setRepoConnectionEnabledAction(input: {
  backlogKey: string;
  connectionId: string;
  enabled: boolean;
}): Promise<{ ok: true; connection: RepoConnectionDto } | Failure> {
  const actorId = await authenticatedActorId();
  if (!actorId) return SESSION_EXPIRED;
  const parsed = setRepoConnectionEnabledInput.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  try {
    await authorizeConnection(actorId, parsed.data.connectionId);
    const connection = await setRepoConnectionEnabled(parsed.data, actorId);
    revalidateSettings(input.backlogKey);
    return { ok: true, connection };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteRepoConnectionAction(input: {
  backlogKey: string;
  connectionId: string;
}): Promise<{ ok: true } | Failure> {
  const actorId = await authenticatedActorId();
  if (!actorId) return SESSION_EXPIRED;
  const parsed = repoConnectionIdInput.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  try {
    await authorizeConnection(actorId, parsed.data.connectionId);
    await deleteRepoConnection(parsed.data, actorId);
    revalidateSettings(input.backlogKey);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
