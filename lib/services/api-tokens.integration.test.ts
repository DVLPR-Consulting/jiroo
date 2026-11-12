import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { apiTokens } from "@/lib/db/schema/domain";
import {
  authenticateApiToken,
  createApiToken,
  hashApiToken,
  listApiTokens,
  revokeAllTokensForUser,
  revokeApiToken,
} from "@/lib/services/api-tokens";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("api tokens (JIR-156)", () => {
  const owner = { id: `api-token-owner-${randomUUID()}`, email: `${randomUUID()}@tokens.test`, name: "Propriétaire" };
  const other = { id: `api-token-other-${randomUUID()}`, email: `${randomUUID()}@tokens.test`, name: "Autre" };

  beforeAll(async () => {
    await db.insert(user).values([
      { ...owner, emailVerified: true, twoFactorEnabled: true, role: "contributor" },
      { ...other, emailVerified: true, twoFactorEnabled: true, role: "contributor" },
    ]);
  });

  afterAll(async () => {
    // Cascades to the tokens.
    await db.delete(user).where(eq(user.id, owner.id));
    await db.delete(user).where(eq(user.id, other.id));
  });

  it("returns the secret once and stores only its hash and prefix", async () => {
    const { token, row } = await createApiToken({ name: "Herdr", scope: "read", expiresInDays: 90 }, owner.id);

    expect(token).toMatch(/^jiroo_pat_/);
    expect(row).toMatchObject({ name: "Herdr", scope: "read", userId: owner.id, revokedAt: null, lastUsedAt: null });
    expect(row.expiresAt).toBeInstanceOf(Date);
    expect(row).not.toHaveProperty("tokenHash");

    const [stored] = await db.select().from(apiTokens).where(eq(apiTokens.id, row.id));
    expect(stored!.tokenHash).toBe(hashApiToken(token));
    expect(stored!.tokenPrefix).toBe(row.tokenPrefix);
    expect(token).toContain(stored!.tokenPrefix);
  });

  it("lists the owner's live tokens without their hashes, newest first", async () => {
    const first = await createApiToken({ name: "Premier", scope: "read", expiresInDays: null }, owner.id);
    const second = await createApiToken({ name: "Second", scope: "write", expiresInDays: 30 }, owner.id);
    await createApiToken({ name: "Pas à moi", scope: "read", expiresInDays: null }, other.id);

    const listed = await listApiTokens(owner.id);
    const names = listed.map((t) => t.name);
    expect(names.indexOf("Second")).toBeLessThan(names.indexOf("Premier"));
    expect(names).not.toContain("Pas à moi");
    expect(listed.every((t) => !("tokenHash" in t))).toBe(true);

    expect(await revokeApiToken(first.row.id, owner.id)).toBe(true);
    expect((await listApiTokens(owner.id)).map((t) => t.id)).not.toContain(first.row.id);
    expect((await listApiTokens(owner.id)).map((t) => t.id)).toContain(second.row.id);
  });

  it("refuses to revoke another user's token and reports it", async () => {
    const mine = await createApiToken({ name: "Mien", scope: "read", expiresInDays: null }, owner.id);

    expect(await revokeApiToken(mine.row.id, other.id)).toBe(false);
    expect((await listApiTokens(owner.id)).map((t) => t.id)).toContain(mine.row.id);
  });

  it("authenticates a live token as its owner and records one use per minute", async () => {
    const { token, row } = await createApiToken({ name: "Agent", scope: "write", expiresInDays: null }, owner.id);
    const now = new Date("2026-11-12T21:00:00.000Z");

    await expect(authenticateApiToken(token, now)).resolves.toEqual({
      actorId: owner.id,
      tokenId: row.id,
      scope: "write",
    });
    const [afterFirst] = await db.select({ lastUsedAt: apiTokens.lastUsedAt }).from(apiTokens).where(eq(apiTokens.id, row.id));
    expect(afterFirst!.lastUsedAt).toEqual(now);

    await authenticateApiToken(token, new Date(now.getTime() + 30_000));
    const [afterSecond] = await db.select({ lastUsedAt: apiTokens.lastUsedAt }).from(apiTokens).where(eq(apiTokens.id, row.id));
    expect(afterSecond!.lastUsedAt).toEqual(now);

    const later = new Date(now.getTime() + 61_000);
    await authenticateApiToken(token, later);
    const [afterThird] = await db.select({ lastUsedAt: apiTokens.lastUsedAt }).from(apiTokens).where(eq(apiTokens.id, row.id));
    expect(afterThird!.lastUsedAt).toEqual(later);
  });

  it("rejects unknown, malformed, revoked and expired tokens alike", async () => {
    const live = await createApiToken({ name: "Vivant", scope: "read", expiresInDays: null }, owner.id);
    const revoked = await createApiToken({ name: "Révoqué", scope: "read", expiresInDays: null }, owner.id);
    await revokeApiToken(revoked.row.id, owner.id);
    const expiring = await createApiToken({ name: "Expiré", scope: "read", expiresInDays: 30 }, owner.id);

    await expect(authenticateApiToken(`${live.token.slice(0, -1)}!`)).resolves.toBeNull();
    await expect(authenticateApiToken("jiroo_pat_" + "A".repeat(43))).resolves.toBeNull();
    await expect(authenticateApiToken("")).resolves.toBeNull();
    await expect(authenticateApiToken(revoked.token)).resolves.toBeNull();
    await expect(authenticateApiToken(expiring.token, new Date(expiring.row.expiresAt!.getTime() + 1))).resolves.toBeNull();
    await expect(authenticateApiToken(expiring.token, new Date(expiring.row.expiresAt!.getTime() - 1))).resolves.not.toBeNull();
  });

  it("revokes every live token of a user inside the caller's transaction", async () => {
    const a = await createApiToken({ name: "A", scope: "read", expiresInDays: null }, owner.id);
    const b = await createApiToken({ name: "B", scope: "write", expiresInDays: null }, owner.id);
    const theirs = await createApiToken({ name: "Autre", scope: "read", expiresInDays: null }, other.id);

    const revokedCount = await db.transaction((tx) => revokeAllTokensForUser(tx, owner.id));

    expect(revokedCount).toBeGreaterThanOrEqual(2);
    await expect(authenticateApiToken(a.token)).resolves.toBeNull();
    await expect(authenticateApiToken(b.token)).resolves.toBeNull();
    await expect(authenticateApiToken(theirs.token)).resolves.not.toBeNull();
    expect(await listApiTokens(owner.id)).toEqual([]);
    expect(await db.transaction((tx) => revokeAllTokensForUser(tx, owner.id))).toBe(0);
  });
});
