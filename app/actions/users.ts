"use server";

import { revalidatePath } from "next/cache";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import { requirePermission } from "@/lib/auth/authorization";
import { getSession } from "@/lib/auth/session";
import {
  AccountRecoveryError,
  resetUserPassword,
  resetUserTwoFactor,
} from "@/lib/services/account-recovery";
import { createUser } from "@/lib/services/users";

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

async function requireUserAdministrator(actorId: string): Promise<void> {
  await requirePermission({
    actorId,
    permission: "manage_users_groups",
    scope: { type: "global" },
  });
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapUserError(e: unknown): string {
  const msg = String(e);
  const safeMessages = [
    "Cet e-mail est déjà utilisé.",
    "Adresse e-mail invalide.",
    "Le nom est requis.",
    "Le nom ne peut pas dépasser 80 caractères.",
    "Rôle invalide.",
    "Mot de passe : 8 caractères minimum.",
    "L’utilisateur est requis.",
    "Utilisateur introuvable.",
  ];
  const safeMessage = safeMessages.find((message) => msg.includes(message));
  if (safeMessage) return safeMessage;
  return "Action impossible.";
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createUserAction(input: {
  email: string;
  name: string;
  password: string;
}) {
  const actorId = await authenticatedActorId();
  try {
    await requireUserAdministrator(actorId);
    const u = await createUser({ ...input, role: "contributor" });
    revalidatePath("/admin");
    return { ok: true as const, user: u };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapUserError(e) };
  }
}

export async function setUserRoleAction(input: { userId: string; role: string }) {
  void input;
  return {
    ok: false as const,
    error: "Les rôles de compte hérités ne peuvent plus être modifiés.",
  };
}

// ---------------------------------------------------------------------------
// Account recovery (JIR-61) — the service enforces administer_jiroo, the
// self-guard and the audit trail; the action maps errors to safe messages.
// ---------------------------------------------------------------------------

function mapRecoveryError(e: unknown) {
  const authorizationError = mapActionAuthorizationError(e);
  if (authorizationError) return authorizationError;
  if (e instanceof AccountRecoveryError) return { ok: false as const, error: e.message };
  return { ok: false as const, error: "Action impossible." };
}

export async function resetUserPasswordAction(input: {
  userId: string;
  temporaryPassword: string;
}) {
  const actorId = await authenticatedActorId();
  try {
    await resetUserPassword(
      { userId: input.userId, temporaryPassword: input.temporaryPassword },
      actorId,
    );
    revalidatePath("/admin");
    return { ok: true as const };
  } catch (e) {
    return mapRecoveryError(e);
  }
}

export async function resetUserTwoFactorAction(input: { userId: string }) {
  const actorId = await authenticatedActorId();
  try {
    await resetUserTwoFactor({ userId: input.userId }, actorId);
    revalidatePath("/admin");
    return { ok: true as const };
  } catch (e) {
    return mapRecoveryError(e);
  }
}
