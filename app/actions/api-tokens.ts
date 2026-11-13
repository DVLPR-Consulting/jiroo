"use server";

import { ZodError } from "zod";
import { getSession } from "@/lib/auth/session";
import {
  createApiToken,
  revokeApiToken,
  TOO_MANY_TOKENS_MESSAGE,
  type ApiTokenRow,
} from "@/lib/services/api-tokens";
import type { CreateApiTokenInput } from "@/lib/validation/api-token";

/**
 * « Jetons d'accès » (JIR-156). Creating or revoking a token needs the
 * owner's full session (password and second factor); using one never does.
 */

type ActionFailure = { ok: false; error: string };

// WORDING: to be confirmed by Codex (JIR-156 wording brief).
const SESSION_EXPIRED = "Votre session a expiré. Reconnectez-vous.";
const CREATE_FAILED = "Création du jeton impossible. Réessayez.";
const TOKEN_GONE = "Ce jeton n’existe plus.";
const REVOKE_FAILED = "Révocation impossible. Réessayez.";

async function signedInUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}

export async function createApiTokenAction(
  input: CreateApiTokenInput,
): Promise<({ ok: true; token: string; row: ApiTokenRow }) | ActionFailure> {
  const ownerId = await signedInUserId();
  if (!ownerId) return { ok: false, error: SESSION_EXPIRED };
  try {
    const { token, row } = await createApiToken(input, ownerId);
    return { ok: true, token, row };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? CREATE_FAILED };
    }
    if (error instanceof Error && error.message === TOO_MANY_TOKENS_MESSAGE) {
      return { ok: false, error: TOO_MANY_TOKENS_MESSAGE };
    }
    console.error("[api-tokens] creation failed", error);
    return { ok: false, error: CREATE_FAILED };
  }
}

export async function revokeApiTokenAction(input: { id: string }): Promise<{ ok: true } | ActionFailure> {
  const ownerId = await signedInUserId();
  if (!ownerId) return { ok: false, error: SESSION_EXPIRED };
  try {
    const revoked = await revokeApiToken(input.id, ownerId);
    return revoked ? { ok: true } : { ok: false, error: TOKEN_GONE };
  } catch (error) {
    console.error("[api-tokens] revocation failed", error);
    return { ok: false, error: REVOKE_FAILED };
  }
}
