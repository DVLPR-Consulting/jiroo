"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { forwardAuthCookies } from "@/lib/auth/forward-auth-cookies";
import { getSession } from "@/lib/auth/session";
import { changeOwnPasswordInput } from "@/lib/items/users";
import { changeOwnPasswordWithBudget } from "@/lib/services/password-change";

type ChangeOwnPasswordResult = { ok: true } | { ok: false; error: string };

const GENERIC_FAILURE_MESSAGE = "Impossible de modifier le mot de passe. Réessayez.";
const SIGN_IN_AGAIN_MESSAGE = "Mot de passe modifié. Reconnectez-vous avec le nouveau.";

const BETTER_AUTH_ERRORS: Record<string, string> = {
  INVALID_PASSWORD: "Mot de passe actuel incorrect.",
  PASSWORD_TOO_SHORT: "Mot de passe : 8 caractères minimum.",
  PASSWORD_TOO_LONG: "Mot de passe : 128 caractères maximum.",
};

// Better Auth rejections raised before anything is written (lengths, missing
// credential). Any other APIError, including internal ones raised after the
// password may have changed (e.g. the rotated session could not be created)
// or CREDENTIALS_CHANGED (lib/auth/auth-version.ts), propagates so the
// budget keeps the attempt counted.
const NON_MUTATING_REJECTIONS = new Set([
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "CREDENTIAL_ACCOUNT_NOT_FOUND",
]);

function betterAuthErrorCode(error: unknown): string | null {
  if (!(error instanceof APIError)) return null;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : null;
}

/**
 * "Changer mon mot de passe" (JIR-61). Better Auth verifies the current
 * password, stores the new hash and, with revokeOtherSessions, deletes every
 * session of the user before issuing a fresh one for this browser.
 */
export async function changeOwnPasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}): Promise<ChangeOwnPasswordResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Votre session a expiré. Reconnectez-vous." };

  const parsed = changeOwnPasswordInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  let responseHeaders: Headers | null = null;
  let failureCode: string | null = null;
  let outcome;
  try {
    // The budget check runs first: when it refuses, Better Auth (and its
    // password hashing) is never reached.
    outcome = await changeOwnPasswordWithBudget(session.user.id, async () => {
      try {
        const result = await auth.api.changePassword({
          body: {
            currentPassword: parsed.data.currentPassword,
            newPassword: parsed.data.newPassword,
            revokeOtherSessions: true,
          },
          headers: await headers(),
          returnHeaders: true,
        });
        responseHeaders = result.headers;
        return "changed";
      } catch (error) {
        // Unknown errors propagate so the budget keeps the attempt counted.
        const code = betterAuthErrorCode(error);
        if (code === "INVALID_PASSWORD") {
          failureCode = code;
          return "wrong_password";
        }
        if (code !== null && NON_MUTATING_REJECTIONS.has(code)) {
          failureCode = code;
          return "failed";
        }
        throw error;
      }
    });
  } catch {
    // If Better Auth already changed the password, revoking pending sign-ins
    // or auditing failed afterwards: keep this browser signed out as well
    // (its old session is gone) rather than inviting a doomed retry.
    if (responseHeaders) return { ok: false, error: SIGN_IN_AGAIN_MESSAGE };
    return { ok: false, error: GENERIC_FAILURE_MESSAGE };
  }

  if (outcome === "rate_limited") {
    return { ok: false, error: "Trop de tentatives. Réessayez dans quelques minutes." };
  }
  if (outcome !== "changed" || !responseHeaders) {
    const message = failureCode ? BETTER_AUTH_ERRORS[failureCode] : undefined;
    return { ok: false, error: message ?? GENERIC_FAILURE_MESSAGE };
  }
  try {
    await forwardAuthCookies(responseHeaders);
  } catch {
    // The password changed and every session was revoked, but this browser
    // could not receive its new session: say so instead of inviting a retry.
    return { ok: false, error: SIGN_IN_AGAIN_MESSAGE };
  }
  return { ok: true };
}
