import "server-only";

import { randomUUID } from "node:crypto";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { revokePendingSignIns } from "@/lib/auth/pending-authentication";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { securityAuditEvents } from "@/lib/db/schema/domain";

// Better Auth's own rate limiter only guards its HTTP router; Server Actions
// call auth.api directly. This account-scoped budget lives in Postgres so it
// holds across instances: wrong current passwords are audited and counted.
export const PASSWORD_CHANGE_FAILURE_LIMIT = 5;
export const PASSWORD_CHANGE_FAILURE_WINDOW_MS = 15 * 60 * 1000;

const FAILED_ACTION = "user_password_change_failed";
const CHANGED_ACTION = "user_password_changed";

export type PasswordChangeOutcome = "changed" | "wrong_password" | "failed";

/**
 * Runs one self-service password change attempt under a per-user advisory
 * lock, so concurrent attempts are serialized and the failure budget cannot
 * be overrun. When the budget is spent, `attempt` (Better Auth, which hashes
 * the new password) is never called.
 *
 * On success the user's pending 2FA sign-in challenges are revoked and the
 * change is audited in the same transaction. Better Auth's own writes happen
 * inside `attempt`, outside this transaction: a sign-in in flight during that
 * call is the known race tracked as R3.
 */
export async function changeOwnPasswordWithBudget(
  userId: string,
  attempt: () => Promise<PasswordChangeOutcome>,
): Promise<PasswordChangeOutcome | "rate_limited"> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`password-change:${userId}`}))`);
    const windowStart = new Date(Date.now() - PASSWORD_CHANGE_FAILURE_WINDOW_MS);
    const [failures] = await tx
      .select({ value: count() })
      .from(securityAuditEvents)
      .where(
        and(
          eq(securityAuditEvents.targetId, userId),
          eq(securityAuditEvents.action, FAILED_ACTION),
          gt(securityAuditEvents.createdAt, windowStart),
        ),
      );
    if ((failures?.value ?? 0) >= PASSWORD_CHANGE_FAILURE_LIMIT) return "rate_limited";

    const outcome = await attempt();
    if (outcome === "failed") return outcome;

    const [actor] = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId));
    const pendingSignInsRevoked =
      outcome === "changed" ? await revokePendingSignIns(tx, userId) : 0;
    await tx.insert(securityAuditEvents).values({
      actorId: userId,
      actorLabel: actor?.name ?? userId,
      action: outcome === "changed" ? CHANGED_ACTION : FAILED_ACTION,
      scope: "global",
      targetType: "user",
      targetId: userId,
      newValue: outcome === "changed" ? { pendingSignInsRevoked } : undefined,
      requestCorrelationId: randomUUID(),
      // Wall clock, not the transaction start, so a slow attempt still counts.
      createdAt: new Date(),
    });
    return outcome;
  });
}
