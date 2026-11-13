"use server";

import { z, ZodError } from "zod";
import { sessionAuthVersion } from "@/lib/auth/auth-version";
import { getSession } from "@/lib/auth/session";
import {
  createApiToken,
  revokeApiToken,
  revokeApiTokenAsAdministrator,
  StaleAuthorizationError,
  type ApiTokenRow,
} from "@/lib/services/api-tokens";
import {
  STALE_SESSION_MESSAGE,
  TOO_MANY_TOKENS_MESSAGE,
  type CreateApiTokenInput,
} from "@/lib/validation/api-token";

/**
 * « Jetons d'accès » (JIR-156). Creating or revoking a token needs the
 * owner's full session (password and second factor); using one never does.
 */

type ActionFailure = { ok: false; error: string };

// Wording: Codex proposal for JIR-156 (column A).
const CREATE_FAILED = "Impossible de créer le jeton. Réessayez.";
const TOKEN_GONE = "Ce jeton n’est plus disponible.";
const REVOKE_FAILED = "Impossible de révoquer le jeton. Réessayez.";

export async function createApiTokenAction(
  input: CreateApiTokenInput,
): Promise<({ ok: true; token: string; row: ApiTokenRow }) | ActionFailure> {
  const session = await getSession();
  if (!session) return { ok: false, error: STALE_SESSION_MESSAGE };
  try {
    // Better Auth hides the session's auth version from getSession(): read it
    // from the session row, then let the service compare it under the owner lock.
    const authVersion = await sessionAuthVersion(session.session.id);
    if (authVersion === null) return { ok: false, error: STALE_SESSION_MESSAGE };
    const { token, row } = await createApiToken(input, session.user.id, { authVersion });
    return { ok: true, token, row };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? CREATE_FAILED };
    }
    if (error instanceof StaleAuthorizationError) return { ok: false, error: STALE_SESSION_MESSAGE };
    if (error instanceof Error && error.message === TOO_MANY_TOKENS_MESSAGE) {
      return { ok: false, error: TOO_MANY_TOKENS_MESSAGE };
    }
    console.error("[api-tokens] creation failed", error);
    return { ok: false, error: CREATE_FAILED };
  }
}

export async function revokeApiTokenAction(input: { id: string }): Promise<{ ok: true } | ActionFailure> {
  const session = await getSession();
  if (!session) return { ok: false, error: STALE_SESSION_MESSAGE };
  try {
    const revoked = await revokeApiToken(input.id, session.user.id);
    return revoked ? { ok: true } : { ok: false, error: TOKEN_GONE };
  } catch (error) {
    console.error("[api-tokens] revocation failed", error);
    return { ok: false, error: REVOKE_FAILED };
  }
}

// WORDING (Codex, JIR-161).
const NOT_ADMINISTRATOR = "Cette action est réservée aux administrateurs Jiroo.";

/** Administration → Jetons d’accès: revoke any account's token (JIR-161). */
export async function revokeApiTokenAsAdministratorAction(input: { id: string }): Promise<{ ok: true } | ActionFailure> {
  const session = await getSession();
  if (!session) return { ok: false, error: STALE_SESSION_MESSAGE };
  // A malformed id cannot name a token: answer as for a gone one, before any query.
  const id = z.uuid().safeParse(input?.id);
  if (!id.success) return { ok: false, error: TOKEN_GONE };
  try {
    const revoked = await revokeApiTokenAsAdministrator(id.data, session.user.id);
    return revoked ? { ok: true } : { ok: false, error: TOKEN_GONE };
  } catch (error) {
    if (error instanceof Error && error.name === "PermissionDeniedError") return { ok: false, error: NOT_ADMINISTRATOR };
    console.error(`[api-tokens] administrator revocation failed: ${error instanceof Error ? error.name : typeof error}`);
    return { ok: false, error: REVOKE_FAILED };
  }
}
