import "dotenv/config";

import { randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { verifyPasswordCapturingAuthVersion } from "@/lib/auth/auth-version";
import { db } from "@/lib/db";
import { account, session, user } from "@/lib/db/schema/auth";
import { createUser } from "@/lib/services/users";
import { BetterAuthDevice } from "@/test-utils/better-auth-http";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureId = randomUUID();
const PASSWORD = "mot-de-passe-initial";
const createdUserIds: string[] = [];

type Verify = (input: { hash: string; password: string }) => Promise<boolean>;
let restoreVerify: (() => void) | null = null;

/**
 * Suspends the next password verification right after it succeeded, before
 * Better Auth creates anything: the deterministic window of the R3 race.
 */
async function suspendNextPasswordVerification() {
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

async function sessionsOf(userId: string) {
  return db
    .select({ id: session.id, authVersion: session.authVersion })
    .from(session)
    .where(eq(session.userId, userId));
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
  });

  afterAll(async () => {
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
});
