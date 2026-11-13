import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { account, session, twoFactor, user, verification } from "@/lib/db/schema/auth";
import { permissionGrants, securityAuditEvents } from "@/lib/db/schema/domain";
import { resetUserPassword, resetUserTwoFactor } from "@/lib/services/account-recovery";
import { authenticateApiToken, createApiToken, listApiTokens } from "@/lib/services/api-tokens";
import { createUser } from "@/lib/services/users";
import { BetterAuthDevice } from "@/test-utils/better-auth-http";
import { generateTotp } from "@/test-utils/totp";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureId = randomUUID();
const adminId = `recovery-admin-${fixtureId}`;
const memberId = `recovery-member-${fixtureId}`;
const userManagerId = `recovery-user-manager-${fixtureId}`;
const ORIGINAL_PASSWORD = "mot-de-passe-initial";
const createdUserIds = [adminId, memberId, userManagerId];

async function createTarget(label: string): Promise<{ id: string; email: string }> {
  const email = `recovery-${label}-${fixtureId}@example.test`;
  const created = await createUser({ email, name: `Cible ${label}`, password: ORIGINAL_PASSWORD });
  createdUserIds.push(created.id);
  return { id: created.id, email };
}

async function addSessions(userId: string, count: number): Promise<void> {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(session).values(
    Array.from({ length: count }, () => ({
      id: randomUUID(),
      token: randomUUID(),
      expiresAt,
      updatedAt: new Date(),
      userId,
    })),
  );
}

async function sessionCount(userId: string): Promise<number> {
  const rows = await db.select({ id: session.id }).from(session).where(eq(session.userId, userId));
  return rows.length;
}

async function enrollTwoFactor(userId: string): Promise<void> {
  await db.insert(twoFactor).values({
    id: randomUUID(),
    secret: "encrypted-secret",
    backupCodes: "encrypted-backup-codes",
    userId,
    verified: true,
    failedVerificationCount: 2,
    lockedUntil: new Date(Date.now() + 60_000),
  });
  await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, userId));
}

async function signInSucceeds(email: string, password: string): Promise<boolean> {
  try {
    await auth.api.signInEmail({ body: { email, password } });
    return true;
  } catch {
    return false;
  }
}

/** Enrolls TOTP through Better Auth's HTTP API and returns the secret. */
async function enrollOverHttp(email: string, password: string): Promise<string> {
  const device = new BetterAuthDevice();
  const signIn = await device.post("/sign-in/email", { email, password });
  expect(signIn.status).toBe(200);
  const enable = await device.post("/two-factor/enable", { password });
  expect(enable.status).toBe(200);
  const secret = new URL((enable.json as { totpURI: string }).totpURI).searchParams.get("secret")!;
  const verify = await device.post("/two-factor/verify-totp", { code: generateTotp(secret) });
  expect(verify.status).toBe(200);
  return secret;
}

/** Signs in with password + TOTP on a fresh device and marks it as trusted. */
async function trustedDevice(email: string, password: string, secret: string) {
  const device = new BetterAuthDevice();
  const signIn = await device.post("/sign-in/email", { email, password });
  expect(signIn.json).toMatchObject({ twoFactorRedirect: true });
  const verify = await device.post("/two-factor/verify-totp", {
    code: generateTotp(secret),
    trustDevice: true,
  });
  expect(verify.status).toBe(200);
  // Trusted: the next password sign-in skips the TOTP step.
  const again = await device.post("/sign-in/email", { email, password });
  expect(again.json).not.toMatchObject({ twoFactorRedirect: true });
  return device;
}

/** Passes the password step on a fresh device, leaving a pending TOTP challenge. */
async function pendingChallenge(email: string, password: string) {
  const device = new BetterAuthDevice();
  const signIn = await device.post("/sign-in/email", { email, password });
  expect(signIn.json).toMatchObject({ twoFactorRedirect: true });
  return device;
}

async function expectChallengeRejected(device: BetterAuthDevice, secret: string) {
  const verify = await device.post("/two-factor/verify-totp", { code: generateTotp(secret) });
  expect(verify.status).toBe(401);
  const current = await device.get("/get-session");
  expect(current.json).toBeNull();
}

/** Challenges of the user plus their `2fa-attempts-*` counters. */
async function challengeRowsFor(userId: string) {
  const challenges = await db
    .select({ identifier: verification.identifier })
    .from(verification)
    .where(and(eq(verification.value, userId), like(verification.identifier, "2fa-%")));
  const counters = challenges.length
    ? await db
        .select({ identifier: verification.identifier })
        .from(verification)
        .where(
          inArray(
            verification.identifier,
            challenges.map((row) => `2fa-attempts-${row.identifier}`),
          ),
        )
    : [];
  return [...challenges, ...counters];
}

async function countersFor(identifiers: string[]) {
  return db
    .select({ identifier: verification.identifier })
    .from(verification)
    .where(inArray(verification.identifier, identifiers.map((id) => `2fa-attempts-${id}`)));
}

async function trustRowsFor(userId: string) {
  return db
    .select({ identifier: verification.identifier })
    .from(verification)
    .where(and(eq(verification.value, userId), like(verification.identifier, "trust-device-%")));
}

async function auditEventsFor(targetId: string) {
  return db
    .select()
    .from(securityAuditEvents)
    .where(eq(securityAuditEvents.targetId, targetId));
}

describeDb("account recovery service", () => {
  beforeAll(async () => {
    await db.insert(user).values([
      { id: adminId, name: "Admin récupération", email: `${adminId}@example.test`, role: "admin", twoFactorEnabled: true },
      { id: memberId, name: "Membre récupération", email: `${memberId}@example.test`, role: "contributor", twoFactorEnabled: true },
      { id: userManagerId, name: "Gestionnaire récupération", email: `${userManagerId}@example.test`, role: "contributor", twoFactorEnabled: true },
    ]);
    // Holds the Users tab permission, but not Jiroo administration.
    await db.insert(permissionGrants).values({
      scope: "global",
      permissionKey: "manage_users_groups",
      principalType: "user",
      userId: userManagerId,
    });
  });

  afterAll(async () => {
    await db.delete(securityAuditEvents).where(inArray(securityAuditEvents.targetId, createdUserIds));
    await db.delete(user).where(inArray(user.id, createdUserIds));
  });

  describe("resetUserPassword", () => {
    it("replaces the credential hash through Better Auth and revokes every session", async () => {
      const target = await createTarget("password");
      await addSessions(target.id, 2);
      const [before] = await db
        .select({ password: account.password })
        .from(account)
        .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")));

      await resetUserPassword(
        { userId: target.id, temporaryPassword: "temporaire-2026" },
        adminId,
        `recovery-${fixtureId}-password`,
      );

      const [after] = await db
        .select({ password: account.password })
        .from(account)
        .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")));
      expect(after?.password).toBeTruthy();
      expect(after?.password).not.toBe(before?.password);
      expect(after?.password).not.toContain("temporaire-2026");
      expect(await sessionCount(target.id)).toBe(0);
      expect(await signInSucceeds(target.email, ORIGINAL_PASSWORD)).toBe(false);
      expect(await signInSucceeds(target.email, "temporaire-2026")).toBe(true);
    });

    it("revokes trusted devices along with the sessions", async () => {
      const target = await createTarget("password-trust");
      const secret = await enrollOverHttp(target.email, ORIGINAL_PASSWORD);
      const device = await trustedDevice(target.email, ORIGINAL_PASSWORD, secret);
      expect(await trustRowsFor(target.id)).not.toHaveLength(0);

      await resetUserPassword(
        { userId: target.id, temporaryPassword: "temporaire-trust" },
        adminId,
      );

      expect(await trustRowsFor(target.id)).toHaveLength(0);
      const signIn = await device.post("/sign-in/email", {
        email: target.email,
        password: "temporaire-trust",
      });
      expect(signIn.json).toMatchObject({ twoFactorRedirect: true });
    });

    it("revokes the access tokens along with the sessions", async () => {
      const target = await createTarget("password-tokens");
      await enrollTwoFactor(target.id);
      const { token } = await createApiToken({ name: "Herdr", scope: "write", expiresInDays: null }, target.id, { authVersion: 0 });
      expect(await authenticateApiToken(token)).not.toBeNull();

      await resetUserPassword(
        { userId: target.id, temporaryPassword: "temporaire-tokens" },
        adminId,
        `recovery-${fixtureId}-password-tokens`,
      );

      expect(await authenticateApiToken(token)).toBeNull();
      expect(await listApiTokens(target.id)).toEqual([]);
      const events = await auditEventsFor(target.id);
      expect(events[0]?.newValue).toMatchObject({ revokedTokens: 1 });
    });

    it("invalidates a sign-in challenge opened with the old password", async () => {
      const target = await createTarget("password-challenge");
      const secret = await enrollOverHttp(target.email, ORIGINAL_PASSWORD);
      const attacker = await pendingChallenge(target.email, ORIGINAL_PASSWORD);
      const opened = await challengeRowsFor(target.id);
      expect(opened).toHaveLength(2); // challenge + attempt counter

      await resetUserPassword(
        { userId: target.id, temporaryPassword: "temporaire-challenge" },
        adminId,
      );

      expect(await challengeRowsFor(target.id)).toHaveLength(0);
      expect(await countersFor(opened.map((row) => row.identifier))).toHaveLength(0);
      await expectChallengeRejected(attacker, secret);
      expect(await sessionCount(target.id)).toBe(0);
    });

    it("records who reset whose password without storing the secret", async () => {
      const target = await createTarget("password-audit");
      await addSessions(target.id, 1);

      await resetUserPassword(
        { userId: target.id, temporaryPassword: "temporaire-audit" },
        adminId,
        `recovery-${fixtureId}-password-audit`,
      );

      const events = await auditEventsFor(target.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorId: adminId,
        actorLabel: "Admin récupération",
        action: "user_password_reset",
        scope: "global",
        targetType: "user",
        targetId: target.id,
        requestCorrelationId: `recovery-${fixtureId}-password-audit`,
      });
      expect(JSON.stringify(events[0])).not.toContain("temporaire-audit");
    });

    it("rejects an actor who is not a Jiroo administrator", async () => {
      const target = await createTarget("password-denied");
      await addSessions(target.id, 1);

      await expect(
        resetUserPassword({ userId: target.id, temporaryPassword: "temporaire-2026" }, memberId),
      ).rejects.toMatchObject({ name: "PermissionDeniedError" });
      expect(await sessionCount(target.id)).toBe(1);
      expect(await signInSucceeds(target.email, ORIGINAL_PASSWORD)).toBe(true);
      expect(await auditEventsFor(target.id)).toHaveLength(0);
    });

    it("rejects a user manager who is not a Jiroo administrator", async () => {
      const target = await createTarget("password-user-manager");

      await expect(
        resetUserPassword({ userId: target.id, temporaryPassword: "temporaire-2026" }, userManagerId),
      ).rejects.toMatchObject({ name: "PermissionDeniedError" });
      expect(await signInSucceeds(target.email, ORIGINAL_PASSWORD)).toBe(true);
    });

    it("rolls back when the target has no credential account", async () => {
      const target = await createTarget("password-no-credential");
      await db
        .delete(account)
        .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")));
      await addSessions(target.id, 2);

      await expect(
        resetUserPassword({ userId: target.id, temporaryPassword: "temporaire-2026" }, adminId),
      ).rejects.toThrow("Ce compte n’a pas de mot de passe Jiroo.");
      expect(await sessionCount(target.id)).toBe(2);
      expect(await auditEventsFor(target.id)).toHaveLength(0);
    });

    it("refuses to reset the administrator's own password", async () => {
      await expect(
        resetUserPassword({ userId: adminId, temporaryPassword: "temporaire-2026" }, adminId),
      ).rejects.toThrow(
        "Utilisez « Changer mon mot de passe » pour modifier votre propre mot de passe.",
      );
    });

    it("validates the temporary password like user creation", async () => {
      const target = await createTarget("password-short");
      await expect(
        resetUserPassword({ userId: target.id, temporaryPassword: "court" }, adminId),
      ).rejects.toThrow("Mot de passe : 8 caractères minimum.");
      expect(await signInSucceeds(target.email, ORIGINAL_PASSWORD)).toBe(true);
    });

    it("reports a missing target user", async () => {
      await expect(
        resetUserPassword({ userId: `missing-${fixtureId}`, temporaryPassword: "temporaire-2026" }, adminId),
      ).rejects.toThrow("Utilisateur introuvable.");
    });
  });

  describe("resetUserTwoFactor", () => {
    it("removes the factor, disables 2FA and revokes every session", async () => {
      const target = await createTarget("two-factor");
      await enrollTwoFactor(target.id);
      await addSessions(target.id, 3);

      await resetUserTwoFactor({ userId: target.id }, adminId, `recovery-${fixtureId}-2fa`);

      const factors = await db.select({ id: twoFactor.id }).from(twoFactor).where(eq(twoFactor.userId, target.id));
      const [stored] = await db
        .select({ twoFactorEnabled: user.twoFactorEnabled })
        .from(user)
        .where(eq(user.id, target.id));
      expect(factors).toHaveLength(0);
      expect(stored?.twoFactorEnabled).toBe(false);
      expect(await sessionCount(target.id)).toBe(0);
      // The password is untouched: the next sign-in yields a password-only
      // session, which the app routes to the mandatory enrollment flow.
      expect(await signInSucceeds(target.email, ORIGINAL_PASSWORD)).toBe(true);

      const events = await auditEventsFor(target.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorId: adminId,
        action: "user_two_factor_reset",
        scope: "global",
        targetType: "user",
        targetId: target.id,
        requestCorrelationId: `recovery-${fixtureId}-2fa`,
      });
      expect(JSON.stringify(events[0])).not.toContain("encrypted-secret");
      expect(JSON.stringify(events[0])).not.toContain("encrypted-backup-codes");
    });

    it("rejects an actor who is not a Jiroo administrator", async () => {
      const target = await createTarget("two-factor-denied");
      await enrollTwoFactor(target.id);
      await addSessions(target.id, 1);

      await expect(resetUserTwoFactor({ userId: target.id }, memberId)).rejects.toMatchObject({
        name: "PermissionDeniedError",
      });
      const factors = await db.select({ id: twoFactor.id }).from(twoFactor).where(eq(twoFactor.userId, target.id));
      expect(factors).toHaveLength(1);
      expect(await sessionCount(target.id)).toBe(1);
      expect(await auditEventsFor(target.id)).toHaveLength(0);
    });

    it("revokes the access tokens of the reset account", async () => {
      const target = await createTarget("two-factor-tokens");
      await enrollTwoFactor(target.id);
      const { token } = await createApiToken({ name: "Agent", scope: "read", expiresInDays: null }, target.id, { authVersion: 0 });

      await resetUserTwoFactor({ userId: target.id }, adminId, `recovery-${fixtureId}-2fa-tokens`);

      expect(await authenticateApiToken(token)).toBeNull();
      const events = await auditEventsFor(target.id);
      expect(events[0]?.newValue).toMatchObject({ revokedTokens: 1 });
    });

    it("revokes trusted devices so a re-enrolled account always asks for the new TOTP", async () => {
      const target = await createTarget("two-factor-trust");
      const oldSecret = await enrollOverHttp(target.email, ORIGINAL_PASSWORD);
      const lostDevice = await trustedDevice(target.email, ORIGINAL_PASSWORD, oldSecret);
      expect(await trustRowsFor(target.id)).not.toHaveLength(0);

      await resetUserTwoFactor({ userId: target.id }, adminId);
      expect(await trustRowsFor(target.id)).toHaveLength(0);

      const newSecret = await enrollOverHttp(target.email, ORIGINAL_PASSWORD);
      expect(newSecret).not.toBe(oldSecret);
      const signIn = await lostDevice.post("/sign-in/email", {
        email: target.email,
        password: ORIGINAL_PASSWORD,
      });
      expect(signIn.json).toMatchObject({ twoFactorRedirect: true });
    });

    it("invalidates pending sign-in challenges", async () => {
      const target = await createTarget("two-factor-challenge");
      const secret = await enrollOverHttp(target.email, ORIGINAL_PASSWORD);
      const attacker = await pendingChallenge(target.email, ORIGINAL_PASSWORD);
      const opened = await challengeRowsFor(target.id);
      expect(opened).toHaveLength(2);

      await resetUserTwoFactor({ userId: target.id }, adminId);

      expect(await challengeRowsFor(target.id)).toHaveLength(0);
      expect(await countersFor(opened.map((row) => row.identifier))).toHaveLength(0);
      await expectChallengeRejected(attacker, secret);
    });

    it("rejects a user manager who is not a Jiroo administrator", async () => {
      const target = await createTarget("two-factor-user-manager");
      await enrollTwoFactor(target.id);

      await expect(resetUserTwoFactor({ userId: target.id }, userManagerId)).rejects.toMatchObject({
        name: "PermissionDeniedError",
      });
      const factors = await db.select({ id: twoFactor.id }).from(twoFactor).where(eq(twoFactor.userId, target.id));
      expect(factors).toHaveLength(1);
    });

    it("is idempotent for a user who never enrolled", async () => {
      const target = await createTarget("two-factor-never-enrolled");

      await expect(resetUserTwoFactor({ userId: target.id }, adminId)).resolves.toEqual({
        revokedSessions: 0,
      });
      const [event] = await auditEventsFor(target.id);
      expect(event?.oldValue).toEqual({ twoFactorEnabled: false });
    });

    it("refuses to reset the administrator's own two-factor authentication", async () => {
      await expect(resetUserTwoFactor({ userId: adminId }, adminId)).rejects.toThrow(
        "Vous ne pouvez pas réinitialiser votre propre double authentification.",
      );
      const [stored] = await db
        .select({ twoFactorEnabled: user.twoFactorEnabled })
        .from(user)
        .where(eq(user.id, adminId));
      expect(stored?.twoFactorEnabled).toBe(true);
    });

    it("reports a missing target user", async () => {
      await expect(resetUserTwoFactor({ userId: `missing-${fixtureId}` }, adminId)).rejects.toThrow(
        "Utilisateur introuvable.",
      );
    });
  });
});
