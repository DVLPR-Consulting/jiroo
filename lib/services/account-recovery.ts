import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { incrementAuthVersion } from "@/lib/auth/auth-version";
import { requirePermissionWithoutBypassAudit } from "@/lib/auth/authorization";
import { revokePendingSignIns, revokeTrustedDevices } from "@/lib/auth/pending-authentication";
import { db } from "@/lib/db";
import { account, session, twoFactor, user } from "@/lib/db/schema/auth";
import { securityAuditEvents } from "@/lib/db/schema/domain";
import { revokeAllTokensForUser } from "@/lib/services/api-tokens";
import { resetUserPasswordInput, resetUserTwoFactorInput } from "@/lib/items/users";

// Administrator-driven account recovery (JIR-61). Jiroo sends no e-mail, so an
// administrator sets a temporary password or clears the second factor; the
// target's sessions are revoked and the change is written to the security
// audit log in the same transaction. Secrets never reach the audit payload.
//
// Sign-ins in flight (JIR-62): Better Auth's sign-in does not take the row
// lock below, so a sign-in that verified the OLD password before this
// transaction commits may still try to create a session, a `2fa-*`
// challenge or a renewed trust row after it. Each reset increments
// user.auth_version in the same transaction; lib/auth/auth-version.ts
// refuses to write such a challenge or trust row (it inserts them under a
// share lock on the same user row) and treats such a session as signed out
// (its version is the pre-reset one). Deleting sessions, challenges and
// trust here closes what exists at commit time.

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const SELF_PASSWORD_RESET_MESSAGE =
  "Utilisez « Changer mon mot de passe » pour modifier votre propre mot de passe.";
export const SELF_TWO_FACTOR_RESET_MESSAGE =
  "Vous ne pouvez pas réinitialiser votre propre double authentification.";
export const MISSING_USER_MESSAGE = "Utilisateur introuvable.";
export const MISSING_CREDENTIAL_MESSAGE = "Ce compte n’a pas de mot de passe Jiroo.";

export class AccountRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountRecoveryError";
  }
}

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Données invalides.";
}

// Platform administrators only: holders of the narrower manage_users_groups
// permission must not be able to take over another account.
async function requireRecoveryAdministrator(actorId: string): Promise<void> {
  await requirePermissionWithoutBypassAudit({
    actorId,
    permission: "administer_jiroo",
    scope: { type: "global" },
  });
}

async function lockTarget(tx: Transaction, userId: string) {
  const [target] = await tx
    .select({ id: user.id, twoFactorEnabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, userId))
    .for("update");
  if (!target) throw new AccountRecoveryError(MISSING_USER_MESSAGE);
  return target;
}

async function actorLabel(tx: Transaction, actorId: string): Promise<string> {
  const [actor] = await tx
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, actorId))
    .limit(1);
  if (!actor) throw new AccountRecoveryError("Administrateur introuvable.");
  return actor.name;
}

async function revokeAllSessions(tx: Transaction, userId: string): Promise<number> {
  const revoked = await tx
    .delete(session)
    .where(eq(session.userId, userId))
    .returning({ id: session.id });
  return revoked.length;
}

async function appendRecoveryAuditEvent(
  tx: Transaction,
  event: {
    actorId: string;
    action: "user_password_reset" | "user_two_factor_reset";
    targetId: string;
    oldValue?: Record<string, unknown>;
    newValue: Record<string, unknown>;
    requestCorrelationId: string;
  },
): Promise<void> {
  await tx.insert(securityAuditEvents).values({
    actorId: event.actorId,
    actorLabel: await actorLabel(tx, event.actorId),
    action: event.action,
    scope: "global",
    targetType: "user",
    targetId: event.targetId,
    oldValue: event.oldValue,
    newValue: event.newValue,
    requestCorrelationId: event.requestCorrelationId,
  });
}

/**
 * Sets a temporary password on another user's credential account and revokes
 * all of their sessions. The hash comes from Better Auth's own password
 * context so sign-in keeps verifying it with the configured algorithm.
 */
export async function resetUserPassword(
  input: unknown,
  actorId: string,
  requestCorrelationId: string = randomUUID(),
): Promise<{ revokedSessions: number }> {
  await requireRecoveryAdministrator(actorId);
  const parsed = resetUserPasswordInput.safeParse(input);
  if (!parsed.success) throw new AccountRecoveryError(firstIssue(parsed.error));
  const { userId, temporaryPassword } = parsed.data;
  if (userId === actorId) throw new AccountRecoveryError(SELF_PASSWORD_RESET_MESSAGE);

  const authContext = await auth.$context;
  const passwordHash = await authContext.password.hash(temporaryPassword);

  return db.transaction(async (tx) => {
    await lockTarget(tx, userId);
    const updated = await tx
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (updated.length === 0) throw new AccountRecoveryError(MISSING_CREDENTIAL_MESSAGE);
    // Outdates sessions, challenges and trust a sign-in still in flight
    // could create after this commit (lib/auth/auth-version.ts).
    await incrementAuthVersion(tx, userId);
    const revokedSessions = await revokeAllSessions(tx, userId);
    // A reset answers a suspected compromise: like sessions, device trust
    // granted before it must not survive (the user re-enters a TOTP once).
    const revokedTrustedDevices = await revokeTrustedDevices(tx, userId);
    // A challenge opened with the old password would otherwise still finish
    // the sign-in with a TOTP alone.
    await revokePendingSignIns(tx, userId);
    // Access tokens act as the user with no second factor: they go the way
    // of the sessions (JIR-156).
    const revokedTokens = await revokeAllTokensForUser(tx, userId);
    await appendRecoveryAuditEvent(tx, {
      actorId,
      action: "user_password_reset",
      targetId: userId,
      newValue: { revokedSessions, revokedTrustedDevices, revokedTokens },
      requestCorrelationId,
    });
    return { revokedSessions };
  });
}

/**
 * Deletes another user's TOTP factor (secret, backup codes and lockout state),
 * disables two-factor authentication and revokes all of their sessions. Their
 * next sign-in yields a password-only session, which the app routes to the
 * mandatory enrollment flow.
 */
export async function resetUserTwoFactor(
  input: unknown,
  actorId: string,
  requestCorrelationId: string = randomUUID(),
): Promise<{ revokedSessions: number }> {
  await requireRecoveryAdministrator(actorId);
  const parsed = resetUserTwoFactorInput.safeParse(input);
  if (!parsed.success) throw new AccountRecoveryError(firstIssue(parsed.error));
  const { userId } = parsed.data;
  if (userId === actorId) throw new AccountRecoveryError(SELF_TWO_FACTOR_RESET_MESSAGE);

  return db.transaction(async (tx) => {
    const target = await lockTarget(tx, userId);
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
    await tx.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, userId));
    await incrementAuthVersion(tx, userId);
    const revokedSessions = await revokeAllSessions(tx, userId);
    // Trust is checked by user id only, so it would otherwise outlive the
    // factor it was granted for and skip the newly enrolled TOTP.
    const revokedTrustedDevices = await revokeTrustedDevices(tx, userId);
    await revokePendingSignIns(tx, userId);
    const revokedTokens = await revokeAllTokensForUser(tx, userId);
    await appendRecoveryAuditEvent(tx, {
      actorId,
      action: "user_two_factor_reset",
      targetId: userId,
      oldValue: { twoFactorEnabled: target.twoFactorEnabled === true },
      newValue: { twoFactorEnabled: false, revokedSessions, revokedTrustedDevices, revokedTokens },
      requestCorrelationId,
    });
    return { revokedSessions };
  });
}
