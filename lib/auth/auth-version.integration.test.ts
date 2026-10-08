import "dotenv/config";

import { randomUUID } from "node:crypto";
import { runWithRequestState } from "@better-auth/core/context";
import { APIError } from "better-auth/api";
import { makeSignature } from "better-auth/crypto";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import {
  captureConsumedChallenge,
  stampVerificationAuthVersion,
  verifyPasswordCapturingAuthVersion,
} from "@/lib/auth/auth-version";
import { db } from "@/lib/db";
import { account, session, user, verification } from "@/lib/db/schema/auth";
import { securityAuditEvents } from "@/lib/db/schema/domain";
import { resetUserPassword, resetUserTwoFactor } from "@/lib/services/account-recovery";
import { createUser } from "@/lib/services/users";
import { BetterAuthDevice } from "@/test-utils/better-auth-http";
import { generateTotp } from "@/test-utils/totp";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureId = randomUUID();
const PASSWORD = "mot-de-passe-initial";
const adminId = `auth-version-admin-${fixtureId}`;
const createdUserIds: string[] = [adminId];

type Verify = (input: { hash: string; password: string }) => Promise<boolean>;
let restoreVerify: (() => void) | null = null;
let restoreCreateVerification: (() => void) | null = null;

/**
 * Suspends Better Auth just before it writes the next verification value
 * whose identifier matches, e.g. the challenge or trust row of a sign-in.
 */
async function suspendNextVerificationWrite(matches: (identifier: string) => boolean) {
  const context = await auth.$context;
  const adapter = context.internalAdapter;
  const original = adapter.createVerificationValue;
  let reached!: () => void;
  let release!: () => void;
  const reachedPromise = new Promise<void>((resolve) => (reached = resolve));
  const releasePromise = new Promise<void>((resolve) => (release = resolve));
  restoreCreateVerification = () => {
    adapter.createVerificationValue = original;
  };
  adapter.createVerificationValue = async (data) => {
    if (matches(data.identifier)) {
      restoreCreateVerification?.();
      reached();
      await releasePromise;
    }
    return original(data);
  };
  return { reached: reachedPromise, release };
}

/**
 * Suspends the next password verification right after it succeeded, before
 * Better Auth creates anything: the deterministic window of the R3 race.
 */
async function suspendNextPasswordVerification(when: "after" | "before" = "after") {
  const context = await auth.$context;
  const original: Verify = context.password.verify;
  let reached!: () => void;
  let release!: () => void;
  const reachedPromise = new Promise<void>((resolve) => (reached = resolve));
  const releasePromise = new Promise<void>((resolve) => (release = resolve));
  restoreVerify = () => {
    context.password.verify = original;
  };
  context.password.verify = async (input) => {
    restoreVerify?.();
    if (when === "before") {
      reached();
      await releasePromise;
      return original(input);
    }
    const verified = await original(input);
    reached();
    await releasePromise;
    return verified;
  };
  return { reached: reachedPromise, release };
}

async function newUser(label: string) {
  const email = `auth-version-${label}-${fixtureId}@example.test`;
  const created = await createUser({ email, name: `Version ${label}`, password: PASSWORD });
  createdUserIds.push(created.id);
  return { id: created.id, email };
}

/** Enrolls TOTP over HTTP; returns the secret. */
async function enroll(email: string): Promise<string> {
  const device = new BetterAuthDevice();
  await device.post("/sign-in/email", { email, password: PASSWORD });
  const enable = await device.post("/two-factor/enable", { password: PASSWORD });
  const secret = new URL((enable.json as { totpURI: string }).totpURI).searchParams.get("secret")!;
  const verify = await device.post("/two-factor/verify-totp", { code: generateTotp(secret) });
  expect(verify.status).toBe(200);
  return secret;
}

async function trustedDevice(email: string, secret: string) {
  const device = new BetterAuthDevice();
  const signIn = await device.post("/sign-in/email", { email, password: PASSWORD });
  expect(signIn.json).toMatchObject({ twoFactorRedirect: true });
  const verify = await device.post("/two-factor/verify-totp", { code: generateTotp(secret), trustDevice: true });
  expect(verify.status).toBe(200);
  return device;
}

async function verificationRows(userId: string, prefix: string) {
  return db
    .select({ identifier: verification.identifier, authVersion: verification.authVersion })
    .from(verification)
    .where(and(eq(verification.value, userId), like(verification.identifier, `${prefix}%`)));
}

async function sessionsOf(userId: string) {
  return db
    .select({ id: session.id, authVersion: session.authVersion })
    .from(session)
    .where(eq(session.userId, userId));
}

async function authVersionOf(userId: string) {
  const [row] = await db.select({ authVersion: user.authVersion }).from(user).where(eq(user.id, userId));
  return row!.authVersion;
}

async function signInSucceeds(email: string, password: string) {
  const response = await new BetterAuthDevice().post("/sign-in/email", { email, password });
  return response.status === 200;
}

async function bumpAuthVersion(userId: string) {
  await db
    .update(user)
    .set({ authVersion: sql`${user.authVersion} + 1` })
    .where(eq(user.id, userId));
}

describeDb("auth version (JIR-62)", () => {
  afterEach(() => {
    restoreVerify?.();
    restoreVerify = null;
    restoreCreateVerification?.();
    restoreCreateVerification = null;
  });

  beforeAll(async () => {
    await db.insert(user).values({
      id: adminId,
      name: "Admin version",
      email: `${adminId}@example.test`,
      role: "admin",
      twoFactorEnabled: true,
    });
  });

  afterAll(async () => {
    await db.delete(securityAuditEvents).where(inArray(securityAuditEvents.targetId, createdUserIds));
    await db.delete(user).where(inArray(user.id, createdUserIds));
  });

  it("stamps a new session with the user's current auth version", async () => {
    const target = await newUser("stamp");
    await db.update(user).set({ authVersion: 3 }).where(eq(user.id, target.id));
    const device = new BetterAuthDevice();

    const signIn = await device.post("/sign-in/email", { email: target.email, password: PASSWORD });

    expect(signIn.status).toBe(200);
    expect(await sessionsOf(target.id)).toEqual([{ id: expect.any(String), authVersion: 3 }]);
    expect((await device.get("/get-session")).json).toMatchObject({ user: { id: target.id } });
    // The version stays server-side.
    expect(JSON.stringify((await device.get("/get-session")).json)).not.toContain("authVersion");
  });

  it("treats a session with an outdated version as signed out, on every read path", async () => {
    const target = await newUser("outdated");
    const browser = new BetterAuthDevice();
    const server = new BetterAuthDevice();
    await browser.post("/sign-in/email", { email: target.email, password: PASSWORD });
    await server.post("/sign-in/email", { email: target.email, password: PASSWORD });
    expect(await auth.api.getSession({ headers: server.requestHeaders() })).not.toBeNull();

    await bumpAuthVersion(target.id);

    expect((await browser.get("/get-session")).json).toBeNull();
    expect(await auth.api.getSession({ headers: server.requestHeaders() })).toBeNull();
    // Outdated sessions are deleted when presented.
    expect(await sessionsOf(target.id)).toHaveLength(0);
  });

  it("keeps sessions created before the migration valid (version 0 on both sides)", async () => {
    const target = await newUser("legacy");
    const token = randomUUID();
    // auth_version omitted: the column default applies, as for existing rows.
    await db.insert(session).values({
      id: randomUUID(),
      token,
      userId: target.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      updatedAt: new Date(),
    });
    const { secret } = await auth.$context;
    const signed = encodeURIComponent(`${token}.${await makeSignature(token, secret)}`);

    const current = await auth.api.getSession({
      headers: new Headers({ cookie: `better-auth.session_token=${signed}` }),
    });

    expect(current?.user.id).toBe(target.id);
  });

  it("refuses a sign-in whose auth version changed after the password was verified", async () => {
    const target = await newUser("race");
    const device = new BetterAuthDevice();
    const barrier = await suspendNextPasswordVerification();

    const pending = device.post("/sign-in/email", { email: target.email, password: PASSWORD });
    await barrier.reached;
    await bumpAuthVersion(target.id);
    barrier.release();
    const signIn = await pending;

    expect(signIn.status).toBe(401);
    expect((await device.get("/get-session")).json).toBeNull();
    expect(await sessionsOf(target.id)).toHaveLength(0);
  });

  it("only accepts a verified hash that is still the stored credential", async () => {
    const target = await newUser("hash");
    const [stored] = await db
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")));
    const oldHash = stored!.password!;
    const { password } = await auth.$context;
    await expect(verifyPasswordCapturingAuthVersion({ hash: oldHash, password: PASSWORD })).resolves.toBe(true);

    await db
      .update(account)
      .set({ password: await password.hash("autre-mot-de-passe") })
      .where(eq(account.userId, target.id));

    await expect(verifyPasswordCapturingAuthVersion({ hash: oldHash, password: PASSWORD })).resolves.toBe(false);
  });

  describe("resets racing a sign-in that already verified the old password", () => {
    async function suspendedSignIn(email: string) {
      const device = new BetterAuthDevice();
      const barrier = await suspendNextPasswordVerification();
      const pending = device.post("/sign-in/email", { email, password: PASSWORD });
      await barrier.reached;
      return {
        device,
        async resume() {
          barrier.release();
          return pending;
        },
      };
    }

    it("admin password reset: the resumed sign-in yields no session", async () => {
      const target = await newUser("race-password");
      const attacker = await suspendedSignIn(target.email);

      await resetUserPassword({ userId: target.id, temporaryPassword: "temporaire-2026" }, adminId);
      const signIn = await attacker.resume();

      expect(signIn.status).not.toBe(200);
      expect((await attacker.device.get("/get-session")).json).toBeNull();
      expect(await sessionsOf(target.id)).toHaveLength(0);
      expect(await authVersionOf(target.id)).toBe(1);
      expect(await signInSucceeds(target.email, "temporaire-2026")).toBe(true);
    });

    it("admin two-factor reset: the resumed sign-in yields no session", async () => {
      const target = await newUser("race-two-factor");
      const attacker = await suspendedSignIn(target.email);

      await resetUserTwoFactor({ userId: target.id }, adminId);
      const signIn = await attacker.resume();

      expect(signIn.status).not.toBe(200);
      expect((await attacker.device.get("/get-session")).json).toBeNull();
      expect(await sessionsOf(target.id)).toHaveLength(0);
      expect(await authVersionOf(target.id)).toBe(1);
    });

    it("self-service password change: the resumed sign-in yields no session", async () => {
      const target = await newUser("race-self");
      const owner = new BetterAuthDevice();
      await owner.post("/sign-in/email", { email: target.email, password: PASSWORD });
      const attacker = await suspendedSignIn(target.email);

      // The HTTP route is disabled; the Server Action calls auth.api directly.
      await auth.api.changePassword({
        body: { currentPassword: PASSWORD, newPassword: "nouveau-mot-de-passe", revokeOtherSessions: true },
        headers: owner.requestHeaders(),
      });
      const signIn = await attacker.resume();

      expect(signIn.status).not.toBe(200);
      expect((await attacker.device.get("/get-session")).json).toBeNull();
      expect(await authVersionOf(target.id)).toBe(1);
      // Only the rotated session of the changing browser remains, at the new version.
      expect(await sessionsOf(target.id)).toEqual([{ id: expect.any(String), authVersion: 1 }]);
    });
  });

  describe("self-service password change", () => {
    it("writes the new hash and rotates the changing browser to the new version", async () => {
      const target = await newUser("self-change");
      const owner = new BetterAuthDevice();
      const other = new BetterAuthDevice();
      await owner.post("/sign-in/email", { email: target.email, password: PASSWORD });
      await other.post("/sign-in/email", { email: target.email, password: PASSWORD });

      const result = await auth.api.changePassword({
        body: { currentPassword: PASSWORD, newPassword: "nouveau-mot-de-passe", revokeOtherSessions: true },
        headers: owner.requestHeaders(),
        returnHeaders: true,
      });
      const rotated = result.headers.getSetCookie().find((cookie) => cookie.startsWith("better-auth.session_token="));
      const rotatedCookie = rotated!.split(";")[0]!;

      expect(await authVersionOf(target.id)).toBe(1);
      expect(await auth.api.getSession({ headers: new Headers({ cookie: rotatedCookie }) })).not.toBeNull();
      expect((await other.get("/get-session")).json).toBeNull();
      expect(await signInSucceeds(target.email, PASSWORD)).toBe(false);
      expect(await signInSucceeds(target.email, "nouveau-mot-de-passe")).toBe(true);
    });

    it("revokes trusted devices and pending challenges in the same change", async () => {
      const target = await newUser("self-trust");
      const secret = await enroll(target.email);
      const trusted = await trustedDevice(target.email, secret);
      const owner = new BetterAuthDevice();
      await owner.post("/sign-in/email", { email: target.email, password: PASSWORD });
      await owner.post("/two-factor/verify-totp", { code: generateTotp(secret) });
      const pending = new BetterAuthDevice();
      const opened = await pending.post("/sign-in/email", { email: target.email, password: PASSWORD });
      expect(opened.json).toMatchObject({ twoFactorRedirect: true });

      const result = await auth.api.changePassword({
        body: { currentPassword: PASSWORD, newPassword: "nouveau-mot-de-passe", revokeOtherSessions: true },
        headers: owner.requestHeaders(),
        returnHeaders: true,
      });
      const rotated = result.headers.getSetCookie().find((cookie) => cookie.startsWith("better-auth.session_token="));

      expect(await verificationRows(target.id, "trust-device-")).toHaveLength(0);
      expect(await verificationRows(target.id, "2fa-")).toHaveLength(0);
      // The changing browser's rotated session stays valid.
      const current = await auth.api.getSession({ headers: new Headers({ cookie: rotated!.split(";")[0]! }) });
      expect(current?.user.id).toBe(target.id);
      // The challenge opened before the change cannot complete.
      const verify = await pending.post("/two-factor/verify-totp", { code: generateTotp(secret) });
      expect(verify.status).toBe(401);
      expect((await pending.get("/get-session")).json).toBeNull();
      // The old trust cookie no longer skips the TOTP step.
      const again = await trusted.post("/sign-in/email", { email: target.email, password: "nouveau-mot-de-passe" });
      expect(again.json).toMatchObject({ twoFactorRedirect: true });
      expect((await trusted.get("/get-session")).json).toBeNull();
    });

    it("refuses a change whose session was revoked before the current password was verified", async () => {
      const target = await newUser("self-revoked-session");
      const owner = new BetterAuthDevice();
      await owner.post("/sign-in/email", { email: target.email, password: PASSWORD });
      const [before] = await db
        .select({ password: account.password })
        .from(account)
        .where(eq(account.userId, target.id));
      // Better Auth already accepted the session; the verifier has not run yet.
      const barrier = await suspendNextPasswordVerification("before");

      const settled = auth.api
        .changePassword({
          body: { currentPassword: PASSWORD, newPassword: "nouveau-mot-de-passe", revokeOtherSessions: true },
          headers: owner.requestHeaders(),
        })
        .then(
          () => null,
          (error: unknown) => error,
        );
      await barrier.reached;
      // The two-factor reset leaves the password hash unchanged.
      await resetUserTwoFactor({ userId: target.id }, adminId);
      barrier.release();
      const error = await settled;

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).body?.code).toBe("CREDENTIALS_CHANGED");
      const [after] = await db
        .select({ password: account.password })
        .from(account)
        .where(eq(account.userId, target.id));
      expect(after!.password).toBe(before!.password);
      expect(await authVersionOf(target.id)).toBe(1);
      expect(await sessionsOf(target.id)).toHaveLength(0);
    });

    it("refuses to overwrite an admin reset that committed after the current password was verified", async () => {
      const target = await newUser("self-vs-admin");
      const owner = new BetterAuthDevice();
      await owner.post("/sign-in/email", { email: target.email, password: PASSWORD });
      const barrier = await suspendNextPasswordVerification();

      const change = auth.api.changePassword({
        body: { currentPassword: PASSWORD, newPassword: "nouveau-mot-de-passe", revokeOtherSessions: true },
        headers: owner.requestHeaders(),
      });
      const settled = change.then(
        () => null,
        (error: unknown) => error,
      );
      await barrier.reached;
      await resetUserPassword({ userId: target.id, temporaryPassword: "temporaire-2026" }, adminId);
      barrier.release();
      const error = await settled;

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).body?.code).toBe("CREDENTIALS_CHANGED");
      expect(await authVersionOf(target.id)).toBe(1);
      expect(await signInSucceeds(target.email, "temporaire-2026")).toBe(true);
      expect(await signInSucceeds(target.email, "nouveau-mot-de-passe")).toBe(false);
      expect(await sessionsOf(target.id)).toHaveLength(1); // the temporary-password sign-in above
    });
  });

  describe("two-factor challenges and trusted devices", () => {
    it("keeps sign-in, TOTP challenges and trusted devices working at a non-zero version", async () => {
      const target = await newUser("flows");
      await db.update(user).set({ authVersion: 2 }).where(eq(user.id, target.id));
      const secret = await enroll(target.email);

      const device = new BetterAuthDevice();
      const signIn = await device.post("/sign-in/email", { email: target.email, password: PASSWORD });
      expect(signIn.json).toMatchObject({ twoFactorRedirect: true });
      expect(await verificationRows(target.id, "2fa-")).toEqual([
        { identifier: expect.any(String), authVersion: 2 },
      ]);
      const verify = await device.post("/two-factor/verify-totp", {
        code: generateTotp(secret),
        trustDevice: true,
      });
      expect(verify.status).toBe(200);
      expect((await device.get("/get-session")).json).toMatchObject({ user: { id: target.id } });
      expect(await verificationRows(target.id, "trust-device-")).toEqual([
        { identifier: expect.any(String), authVersion: 2 },
      ]);

      // Trusted: the next password sign-in skips the TOTP step and is valid.
      const again = await device.post("/sign-in/email", { email: target.email, password: PASSWORD });
      expect(again.json).not.toMatchObject({ twoFactorRedirect: true });
      expect((await device.get("/get-session")).json).toMatchObject({ user: { id: target.id } });
      for (const row of await sessionsOf(target.id)) expect(row.authVersion).toBe(2);
    });

    it("a challenge carries its first-factor version: completing it after a reset yields no session", async () => {
      const target = await newUser("challenge-version");
      const secret = await enroll(target.email);
      const attacker = new BetterAuthDevice();
      await attacker.post("/sign-in/email", { email: target.email, password: PASSWORD });
      const before = await sessionsOf(target.id);

      // A reset whose challenge deletion missed this row (it is written by a
      // sign-in in flight) still outdates it through the version.
      await bumpAuthVersion(target.id);
      const verify = await attacker.post("/two-factor/verify-totp", { code: generateTotp(secret) });

      expect(verify.status).not.toBe(200);
      expect((await attacker.get("/get-session")).json).toBeNull();
      expect(await sessionsOf(target.id)).toHaveLength(before.length);
    });

    it("a challenge written after an admin reset commits is never stored", async () => {
      const target = await newUser("challenge-race");
      const secret = await enroll(target.email);
      const attacker = new BetterAuthDevice();
      const barrier = await suspendNextVerificationWrite((id) => id.startsWith("2fa-") && !id.startsWith("2fa-attempts-"));

      const pending = attacker.post("/sign-in/email", { email: target.email, password: PASSWORD });
      await barrier.reached;
      await resetUserPassword({ userId: target.id, temporaryPassword: "temporaire-2026" }, adminId);
      barrier.release();
      await pending;

      expect(await verificationRows(target.id, "2fa-")).toHaveLength(0);
      const verify = await attacker.post("/two-factor/verify-totp", { code: generateTotp(secret) });
      expect(verify.status).toBe(401);
      expect((await attacker.get("/get-session")).json).toBeNull();
      expect(await sessionsOf(target.id)).toHaveLength(0);
    });

    it("renews a valid trust even when another user's expired challenge is cleaned up meanwhile", async () => {
      const target = await newUser("trust-cleanup");
      const other = await newUser("trust-cleanup-other");
      const secret = await enroll(target.email);
      const device = await trustedDevice(target.email, secret);
      // Better Auth deletes expired verification rows while reading the trust.
      await db.insert(verification).values({
        id: randomUUID(),
        identifier: `2fa-expired-${fixtureId}`,
        value: other.id,
        expiresAt: new Date(Date.now() - 60_000),
        authVersion: 0,
      });

      const signIn = await device.post("/sign-in/email", { email: target.email, password: PASSWORD });

      expect(signIn.json).not.toMatchObject({ twoFactorRedirect: true });
      expect(await verificationRows(target.id, "trust-device-")).toHaveLength(1);
      const again = await device.post("/sign-in/email", { email: target.email, password: PASSWORD });
      expect(again.json).not.toMatchObject({ twoFactorRedirect: true });
    });

    it("a deleted challenge of another user never replaces the sign-in's own proof", async () => {
      const target = await newUser("proof-isolation");
      const other = await newUser("proof-isolation-other");
      const [stored] = await db
        .select({ password: account.password })
        .from(account)
        .where(eq(account.userId, target.id));
      const signIn = { path: "/sign-in/email" } as Parameters<typeof stampVerificationAuthVersion>[1];
      const trustIdentifier = `trust-device-isolation-${fixtureId}`;

      // One Better Auth call: password step, then a lookup's cleanup deletes
      // another user's expired challenge, then the trust is renewed.
      await runWithRequestState(new WeakMap(), async () => {
        await expect(
          verifyPasswordCapturingAuthVersion({ hash: stored!.password!, password: PASSWORD }),
        ).resolves.toBe(true);
        await captureConsumedChallenge(
          {
            identifier: `2fa-cleaned-${fixtureId}`,
            value: other.id,
            authVersion: 0,
            expiresAt: new Date(Date.now() - 60_000),
          },
          signIn,
        );
        await stampVerificationAuthVersion(
          { identifier: trustIdentifier, value: target.id, expiresAt: new Date(Date.now() + 60_000) },
          signIn,
        );
      });

      expect(await verificationRows(target.id, "trust-device-isolation-")).toHaveLength(1);
    });

    it("a trusted-device sign-in racing an admin reset leaves no session and no trust", async () => {
      const target = await newUser("trust-race");
      const secret = await enroll(target.email);
      const device = await trustedDevice(target.email, secret);
      const barrier = await suspendNextVerificationWrite((id) => id.startsWith("trust-device-"));

      // The trust check passed and the renewal is about to be written.
      const pending = device.post("/sign-in/email", { email: target.email, password: PASSWORD });
      await barrier.reached;
      await resetUserPassword({ userId: target.id, temporaryPassword: "temporaire-2026" }, adminId);
      barrier.release();
      await pending;

      expect(await verificationRows(target.id, "trust-device-")).toHaveLength(0);
      expect((await device.get("/get-session")).json).toBeNull();
      expect(await sessionsOf(target.id)).toHaveLength(0);
      // Same browser, new password: the TOTP is required again.
      const next = await device.post("/sign-in/email", { email: target.email, password: "temporaire-2026" });
      expect(next.json).toMatchObject({ twoFactorRedirect: true });
      expect(await sessionsOf(target.id)).toHaveLength(0);
    });

    it("a trusted-device sign-in suspended after the password step yields no session after a reset", async () => {
      const target = await newUser("trust-verified");
      const secret = await enroll(target.email);
      const device = await trustedDevice(target.email, secret);
      const barrier = await suspendNextPasswordVerification();

      const pending = device.post("/sign-in/email", { email: target.email, password: PASSWORD });
      await barrier.reached;
      await resetUserTwoFactor({ userId: target.id }, adminId);
      barrier.release();
      const signIn = await pending;

      expect(signIn.status).not.toBe(200);
      expect((await device.get("/get-session")).json).toBeNull();
      expect(await sessionsOf(target.id)).toHaveLength(0);
      expect(await verificationRows(target.id, "trust-device-")).toHaveLength(0);
    });
  });
});
