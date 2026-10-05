"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { forwardAuthCookies } from "@/lib/auth/forward-auth-cookies";
import { getSession } from "@/lib/auth/session";
import { changeOwnPasswordInput } from "@/lib/items/users";

type ChangeOwnPasswordResult = { ok: true } | { ok: false; error: string };

const BETTER_AUTH_ERRORS: Record<string, string> = {
  INVALID_PASSWORD: "Mot de passe actuel incorrect.",
  PASSWORD_TOO_SHORT: "Mot de passe : 8 caractères minimum.",
  PASSWORD_TOO_LONG: "Mot de passe : 128 caractères maximum.",
};

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

  try {
    const { headers: responseHeaders } = await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
      returnHeaders: true,
    });
    try {
      await forwardAuthCookies(responseHeaders);
    } catch {
      // The password changed and every session was revoked, but this browser
      // could not receive its new session: say so instead of inviting a retry.
      return { ok: false, error: "Mot de passe modifié. Reconnectez-vous avec le nouveau." };
    }
    return { ok: true };
  } catch (error) {
    const code = betterAuthErrorCode(error);
    const message = code ? BETTER_AUTH_ERRORS[code] : undefined;
    return { ok: false, error: message ?? "Impossible de modifier le mot de passe. Réessayez." };
  }
}
