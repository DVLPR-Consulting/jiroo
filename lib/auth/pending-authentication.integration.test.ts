import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { session, user, verification } from "@/lib/db/schema/auth";
import { revokePendingSignIns } from "@/lib/auth/pending-authentication";
import { createUser } from "@/lib/services/users";
import { BetterAuthDevice } from "@/test-utils/better-auth-http";
import { generateTotp } from "@/test-utils/totp";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureId = randomUUID();
const PASSWORD = "mot-de-passe-initial";
const createdUserIds: string[] = [];

async function enrolledUser(label: string) {
  const email = `pending-${label}-${fixtureId}@example.test`;
  const created = await createUser({ email, name: `Pending ${label}`, password: PASSWORD });
  createdUserIds.push(created.id);
  const device = new BetterAuthDevice();
  await device.post("/sign-in/email", { email, password: PASSWORD });
  const enable = await device.post("/two-factor/enable", { password: PASSWORD });
  const secret = new URL((enable.json as { totpURI: string }).totpURI).searchParams.get("secret")!;
  const verify = await device.post("/two-factor/verify-totp", { code: generateTotp(secret) });
  expect(verify.status).toBe(200);
  return { id: created.id, email, secret, device };
}

async function challengeRows(userId: string) {
  const challenges = await db
    .select({ identifier: verification.identifier })
    .from(verification)
    .where(and(eq(verification.value, userId), like(verification.identifier, "2fa-%")));
  const attempts = challenges.length
    ? await db
        .select({ identifier: verification.identifier })
        .from(verification)
        .where(
          or(...challenges.map((row) => eq(verification.identifier, `2fa-attempts-${row.identifier}`))),
        )
    : [];
  return { challenges, attempts };
}

describeDb("revokePendingSignIns", () => {
  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  });

  it("relies on plain verification identifiers", () => {
    // Hashed identifiers would make the prefix matches silently delete nothing.
    const options = auth.options as { verification?: { storeIdentifier?: unknown } };
    expect(options.verification?.storeIdentifier).toBeUndefined();
  });

  it("closes a challenge opened before a self-service password change", async () => {
    const target = await enrolledUser("self-change");
    const attacker = new BetterAuthDevice();
    const opened = await attacker.post("/sign-in/email", { email: target.email, password: PASSWORD });
    expect(opened.json).toMatchObject({ twoFactorRedirect: true });
    const before = await challengeRows(target.id);
    expect(before.challenges).toHaveLength(1);
    expect(before.attempts).toHaveLength(1);

    // The HTTP route is disabled; the Server Action calls auth.api directly.
    await auth.api.changePassword({
      body: { currentPassword: PASSWORD, newPassword: "nouveau-mot-de-passe", revokeOtherSessions: true },
      headers: target.device.requestHeaders(),
    });
    // Better Auth's changePassword leaves the challenge usable on its own.
    expect((await challengeRows(target.id)).challenges).toHaveLength(1);

    await expect(revokePendingSignIns(db, target.id)).resolves.toBe(1);

    const after = await db
      .select({ identifier: verification.identifier })
      .from(verification)
      .where(inArray(verification.identifier, [
        ...before.challenges.map((row) => row.identifier),
        ...before.attempts.map((row) => row.identifier),
      ]));
    expect(after).toHaveLength(0);
    const verify = await attacker.post("/two-factor/verify-totp", { code: generateTotp(target.secret) });
    expect(verify.status).toBe(401);
    const sessions = await db.select({ id: session.id }).from(session).where(eq(session.userId, target.id));
    expect(sessions).toHaveLength(1); // only the rotated session of the changing device
  });

  it("leaves other users' challenges alone", async () => {
    const target = await enrolledUser("target");
    const bystander = await enrolledUser("bystander");
    const device = new BetterAuthDevice();
    await device.post("/sign-in/email", { email: bystander.email, password: PASSWORD });

    await revokePendingSignIns(db, target.id);

    const verify = await device.post("/two-factor/verify-totp", { code: generateTotp(bystander.secret) });
    expect(verify.status).toBe(200);
  });
});
