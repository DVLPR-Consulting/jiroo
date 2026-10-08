import { randomUUID } from "node:crypto";
import type { GenericEndpointContext } from "@better-auth/core";
import { defineRequestState, hasRequestState } from "@better-auth/core/context";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { verifyPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, session, user, verification } from "@/lib/db/schema/auth";

// Credential freshness (JIR-62). `user.auth_version` is incremented by every
// password or second-factor reset. A session is only honoured while it carries
// the version that was current when its first factor (the password) was
// verified, so a sign-in that verified the old password before a reset cannot
// produce a usable session after it, whatever the interleaving.
//
// Better Auth gives no hook between "password verified" and "session created",
// so the version travels through Better Auth's per-call request state (one
// WeakMap per auth.api call or HTTP request, shared by its endpoint, plugin
// hooks and database hooks):
// - the password verifier captures the version in the same snapshot that
//   proves the verified hash is still the stored one;
// - the session creation hook stamps the session with the captured version;
// - every Better Auth call first deletes a presented session whose version is
//   no longer the user's (treated as signed out);
// - a pending 2FA challenge and a trusted device are only written while the
//   version they continue is still current, and a completed challenge hands
//   its version to the session it creates.

type Grant = { userId: string; authVersion: number };

type RequestGrants = {
  /** First factor verified in this call, with the hash it matched. */
  password?: Grant & { verifiedHash: string };
  /** Valid session presented by this call (inherited by session rotations). */
  session?: Grant;
  /** Version written by this call's own password change. */
  passwordChange?: Grant;
  /** Pending 2FA challenge consumed by this call. */
  challenge?: Grant;
};

const requestGrants = defineRequestState<RequestGrants>(() => ({}));

async function currentGrants(): Promise<RequestGrants | null> {
  return (await hasRequestState()) ? requestGrants.get() : null;
}

async function currentAuthVersion(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ authVersion: user.authVersion })
    .from(user)
    .where(eq(user.id, userId));
  return row?.authVersion ?? null;
}

/**
 * Better Auth password verifier (`emailAndPassword.password.verify`). After
 * the regular scrypt check, one query proves the verified hash is still the
 * user's stored credential and reads the auth version from that same
 * snapshot: a reset committed earlier fails here, one committed later
 * outdates the captured version.
 */
export async function verifyPasswordCapturingAuthVersion(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (!(await verifyPassword(input))) return false;
  const rows = await db
    .select({ userId: account.userId, authVersion: user.authVersion })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(and(eq(account.providerId, "credential"), eq(account.password, input.hash)))
    .limit(2);
  if (rows.length !== 1) return false;
  const grants = await currentGrants();
  if (grants) grants.password = { ...rows[0]!, verifiedHash: input.hash };
  return true;
}

/**
 * Global Better Auth `hooks.before`: runs ahead of every endpoint, including
 * `getSession` used by Server Components, Server Actions and route handlers.
 * A presented session whose version is outdated is deleted, so Better Auth
 * then sees no session at all.
 */
export const rejectStaleSession = createAuthMiddleware(async (ctx) => {
  const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
  if (!token) return;
  const [row] = await db
    .select({
      id: session.id,
      userId: session.userId,
      sessionVersion: session.authVersion,
      userVersion: user.authVersion,
    })
    .from(session)
    .innerJoin(user, eq(user.id, session.userId))
    .where(eq(session.token, token))
    .limit(1);
  if (!row) return;
  if (row.sessionVersion !== row.userVersion) {
    await db.delete(session).where(eq(session.id, row.id));
    return;
  }
  const grants = await currentGrants();
  if (grants) grants.session = { userId: row.userId, authVersion: row.sessionVersion };
});

type GrantSelector = (grants: RequestGrants) => Grant | undefined;

// Completing a challenge continues its first factor; with a presented session
// (enrollment), the session is rotated.
const TWO_FACTOR_VERIFICATION: GrantSelector = (grants) => grants.challenge ?? grants.session;

// Every Better Auth path that creates a session in Jiroo's configuration, and
// the first factor it continues. Any other path is refused.
const SESSION_GRANTS: Record<string, GrantSelector> = {
  "/sign-in/email": (grants) => grants.password,
  "/change-password": (grants) => grants.passwordChange,
  // Enrollment rotates the presented session.
  "/two-factor/enable": (grants) => grants.session,
  "/two-factor/disable": (grants) => grants.session,
  "/two-factor/verify-totp": TWO_FACTOR_VERIFICATION,
  "/two-factor/verify-backup-code": TWO_FACTOR_VERIFICATION,
  "/two-factor/verify-otp": TWO_FACTOR_VERIFICATION,
};

/**
 * `databaseHooks.session.create.before`: stamps the new session with the auth
 * version of the first factor it continues, or refuses it (Better Auth then
 * fails the sign-in). Refusing an already outdated version here is only an
 * early exit; the read-side check is what closes the race.
 */
export async function stampSessionAuthVersion(
  data: { userId: string } & Record<string, unknown>,
  ctx: GenericEndpointContext | null,
): Promise<false | { data: Record<string, unknown> }> {
  const select = ctx?.path ? SESSION_GRANTS[ctx.path] : undefined;
  const grants = await currentGrants();
  if (!select || !grants) return false;
  const grant = select(grants);
  if (!grant || grant.userId !== data.userId) return false;
  if ((await currentAuthVersion(grant.userId)) !== grant.authVersion) return false;
  return { data: { ...data, authVersion: grant.authVersion } };
}

// Better Auth 1.6.22 two-factor identifiers (see pending-authentication.ts).
const CHALLENGE_PREFIX = "2fa-";
const ATTEMPTS_PREFIX = "2fa-attempts-";
const TRUST_DEVICE_PREFIX = "trust-device-";

function isChallenge(identifier: string): boolean {
  return identifier.startsWith(CHALLENGE_PREFIX) && !identifier.startsWith(ATTEMPTS_PREFIX);
}

/**
 * `databaseHooks.verification.create.before`. A pending 2FA challenge (after
 * the password step) and a trusted device (created or renewed) are inserted
 * here, stamped with the version of the first factor they continue, in one
 * transaction holding a share lock on the user row: a reset (which locks the
 * row for update, increments the version and deletes challenges and trust)
 * either deletes the new row or makes this insert skip it. Better Auth's own
 * insert is always skipped for these identifiers; it ignores the result.
 */
export async function stampVerificationAuthVersion(
  data: Record<string, unknown>,
): Promise<false | void> {
  const { identifier, value, expiresAt } = data;
  if (typeof identifier !== "string") return;
  const challenge = isChallenge(identifier);
  if (!challenge && !identifier.startsWith(TRUST_DEVICE_PREFIX)) return;
  const grants = await currentGrants();
  // Challenges follow the password step; trust follows a completed challenge
  // or, when renewed, the password step of a trusted sign-in.
  const grant = challenge ? grants?.password : (grants?.challenge ?? grants?.password);
  if (!grant || grant.userId !== value || !(expiresAt instanceof Date)) return false;
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ authVersion: user.authVersion })
      .from(user)
      .where(eq(user.id, grant.userId))
      .for("share");
    if (locked?.authVersion !== grant.authVersion) return;
    const now = new Date();
    await tx.insert(verification).values({
      id: randomUUID(),
      identifier,
      value: grant.userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      authVersion: grant.authVersion,
    });
  });
  return false;
}

/**
 * `databaseHooks.verification.delete.after`: Better Auth consumes a pending
 * challenge right before creating the session that completes it; its stored
 * version becomes the session's.
 */
export async function captureConsumedChallenge(row: unknown): Promise<void> {
  if (!row || typeof row !== "object") return;
  const { identifier, value, authVersion } = row as Record<string, unknown>;
  if (typeof identifier !== "string" || !isChallenge(identifier)) return;
  if (typeof value !== "string" || typeof authVersion !== "number") return;
  const grants = await currentGrants();
  if (grants) grants.challenge = { userId: value, authVersion };
}

type Executor = Pick<typeof db, "update">;

/**
 * Outdates every session, pending challenge and trusted device of the user.
 * Callers run it inside the transaction that resets the credential, after
 * locking the user row.
 */
export async function incrementAuthVersion(executor: Executor, userId: string): Promise<number> {
  const [row] = await executor
    .update(user)
    .set({ authVersion: sql`${user.authVersion} + 1` })
    .where(eq(user.id, userId))
    .returning({ authVersion: user.authVersion });
  if (!row) throw new Error("User not found while incrementing its auth version.");
  return row.authVersion;
}

function credentialsChanged(): APIError {
  return new APIError("CONFLICT", {
    code: "CREDENTIALS_CHANGED",
    message: "The credentials changed while the password change was in progress.",
  });
}

/**
 * `databaseHooks.account.update.before`. Better Auth writes a changed
 * password with a plain update, unrelated to the version captured when the
 * current password was verified. Jiroo writes it here instead, in one
 * transaction under the user row lock that admin resets also take: the write
 * only happens if the presented session carries the version proven with the
 * current password and neither the stored hash nor the auth version moved
 * since; it increments the version and revokes trusted devices
 * and pending 2FA challenges in the same transaction. Returning false then
 * skips Better Auth's own write, which would otherwise be able to overwrite
 * a concurrent reset. Better Auth's /change-password is the only route
 * allowed to change a password through Better Auth in Jiroo.
 */
export async function applyOwnPasswordChange(
  data: Record<string, unknown>,
  ctx: GenericEndpointContext | null,
): Promise<false | void> {
  if (data.password === undefined) return;
  if (ctx?.path !== "/change-password") {
    throw new APIError("FORBIDDEN", {
      code: "PASSWORD_UPDATE_NOT_ALLOWED",
      message: "Passwords change through /change-password only.",
    });
  }
  const grants = await currentGrants();
  const verified = grants?.password;
  // The presented session, the current-password proof and (below, under the
  // lock) the user row must belong to the same credential generation: a
  // reset committed after the session was accepted but before the password
  // was verified (a 2FA reset keeps the hash) must not let this request
  // renew access.
  const presented = grants?.session;
  if (
    !grants ||
    !verified ||
    !presented ||
    verified.userId !== presented.userId ||
    verified.authVersion !== presented.authVersion ||
    typeof data.password !== "string"
  ) {
    throw credentialsChanged();
  }
  const newHash = data.password;
  const authVersion = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ authVersion: user.authVersion })
      .from(user)
      .where(eq(user.id, verified.userId))
      .for("update");
    if (locked?.authVersion !== verified.authVersion) return null;
    const updated = await tx
      .update(account)
      .set({ password: newHash, updatedAt: new Date() })
      .where(
        and(
          eq(account.userId, verified.userId),
          eq(account.providerId, "credential"),
          eq(account.password, verified.verifiedHash),
        ),
      )
      .returning({ id: account.id });
    if (updated.length !== 1) return null;
    const authVersion = await incrementAuthVersion(tx, verified.userId);
    // Like the admin resets: device trust and pending sign-in challenges
    // granted before the change do not survive it (owner decision, JIR-62).
    // Imported lazily: that module is server-only, this one is also loaded
    // by scripts.
    const { revokePendingSignIns, revokeTrustedDevices } = await import(
      "@/lib/auth/pending-authentication"
    );
    await revokeTrustedDevices(tx, verified.userId);
    await revokePendingSignIns(tx, verified.userId);
    return authVersion;
  });
  if (authVersion === null) throw credentialsChanged();
  grants.passwordChange = { userId: verified.userId, authVersion };
  return false;
}

export const AUTH_VERSION_FIELD = {
  type: "number",
  required: false,
  input: false,
  returned: false,
} as const;
