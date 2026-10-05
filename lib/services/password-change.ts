import "server-only";

import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { revokePendingSignIns } from "@/lib/auth/pending-authentication";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { securityAuditEvents } from "@/lib/db/schema/domain";

// Better Auth's own rate limiter only guards its HTTP router; Server Actions
// call auth.api directly. This account-scoped budget lives in Postgres so it
// holds across instances: wrong current passwords are audited and counted.
export const PASSWORD_CHANGE_FAILURE_LIMIT = 5;
export const PASSWORD_CHANGE_FAILURE_WINDOW_MS = 15 * 60 * 1000;

const ATTEMPTED_ACTION = "user_password_change_attempted";
const FAILED_ACTION = "user_password_change_failed";
const CHANGED_ACTION = "user_password_changed";

export type PasswordChangeOutcome = "changed" | "wrong_password" | "failed";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockUserBudget(tx: Transaction, userId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('password-change'), hashtext(${userId}))`,
  );
}

/**
 * Runs one self-service password change attempt against a per-account
 * budget. Phase 1 (short transaction, per-user advisory lock) counts recent
 * failures plus unresolved attempts and, if the budget allows, reserves the
 * attempt as an `attempted` audit row; concurrent requests therefore cannot
 * overrun the budget. When it is spent, `attempt` (Better Auth, which hashes
 * the new password) is never called.
 *
 * `attempt` runs outside any transaction: Better Auth shares the connection
 * pool, so holding a connection or lock across it could exhaust the pool.
 * Phase 2 resolves the reservation: a wrong current password becomes a
 * `failed` row, a success becomes a `changed` row and revokes pending 2FA
 * sign-in challenges in the same transaction, any other error drops it. A
 * reservation left behind by a crash keeps counting, the safe direction.
 *
 * Better Auth's writes are not atomic with phase 2: a challenge created or
 * completed concurrently with the change can survive (the R3 race).
 */
export async function changeOwnPasswordWithBudget(
  userId: string,
  attempt: () => Promise<PasswordChangeOutcome>,
): Promise<PasswordChangeOutcome | "rate_limited"> {
  const reservationId = await db.transaction(async (tx) => {
    await lockUserBudget(tx, userId);
    const [spent] = await tx
      .select({ value: count() })
      .from(securityAuditEvents)
      .where(
        and(
          eq(securityAuditEvents.targetId, userId),
          inArray(securityAuditEvents.action, [ATTEMPTED_ACTION, FAILED_ACTION]),
          sql`${securityAuditEvents.createdAt} > now() - make_interval(secs => ${PASSWORD_CHANGE_FAILURE_WINDOW_MS / 1000})`,
        ),
      );
    if ((spent?.value ?? 0) >= PASSWORD_CHANGE_FAILURE_LIMIT) return null;
    const [actor] = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId));
    const [reservation] = await tx
      .insert(securityAuditEvents)
      .values({
        actorId: userId,
        actorLabel: actor?.name ?? userId,
        action: ATTEMPTED_ACTION,
        scope: "global",
        targetType: "user",
        targetId: userId,
        requestCorrelationId: randomUUID(),
      })
      .returning({ id: securityAuditEvents.id });
    return reservation!.id;
  });
  if (!reservationId) return "rate_limited";

  let outcome: PasswordChangeOutcome;
  try {
    outcome = await attempt();
  } catch (error) {
    await db.delete(securityAuditEvents).where(eq(securityAuditEvents.id, reservationId));
    throw error;
  }

  if (outcome === "failed") {
    await db.delete(securityAuditEvents).where(eq(securityAuditEvents.id, reservationId));
    return outcome;
  }
  if (outcome === "wrong_password") {
    await db
      .update(securityAuditEvents)
      .set({ action: FAILED_ACTION })
      .where(eq(securityAuditEvents.id, reservationId));
    return outcome;
  }
  await db.transaction(async (tx) => {
    const pendingSignInsRevoked = await revokePendingSignIns(tx, userId);
    await tx
      .update(securityAuditEvents)
      .set({ action: CHANGED_ACTION, newValue: { pendingSignInsRevoked } })
      .where(eq(securityAuditEvents.id, reservationId));
  });
  return outcome;
}
