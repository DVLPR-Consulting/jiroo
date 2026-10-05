import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { account, session, twoFactor, user } from "@/lib/db/schema/auth";
import { permissionGrants, securityAuditEvents } from "@/lib/db/schema/domain";
import { resetUserPassword, resetUserTwoFactor } from "@/lib/services/account-recovery";
import { createUser } from "@/lib/services/users";

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
