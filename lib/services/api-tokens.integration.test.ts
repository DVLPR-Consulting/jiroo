import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sessionAuthVersion } from "@/lib/auth/auth-version";
import { db } from "@/lib/db";
import { session, user } from "@/lib/db/schema/auth";
import { apiTokens, permissionGrants, securityAuditEvents } from "@/lib/db/schema/domain";
import {
  authenticateApiToken,
  createApiToken,
  hashApiToken,
  listApiTokens,
  MAX_LIVE_TOKENS_PER_USER,
  listAllLiveApiTokens,
  revokeAllTokensForUser,
  revokeApiToken,
  revokeApiTokenAsAdministrator,
  TOO_MANY_TOKENS_MESSAGE,
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
    const { token, row } = await createApiToken({ name: "Herdr", scope: "read", expiresInDays: 90 }, owner.id, { authVersion: 0 });

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
    const first = await createApiToken({ name: "Premier", scope: "read", expiresInDays: null }, owner.id, { authVersion: 0 });
    const second = await createApiToken({ name: "Second", scope: "write", expiresInDays: 30 }, owner.id, { authVersion: 0 });
    await createApiToken({ name: "Pas à moi", scope: "read", expiresInDays: null }, other.id, { authVersion: 0 });

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
    const mine = await createApiToken({ name: "Mien", scope: "read", expiresInDays: null }, owner.id, { authVersion: 0 });

    expect(await revokeApiToken(mine.row.id, other.id)).toBe(false);
    expect((await listApiTokens(owner.id)).map((t) => t.id)).toContain(mine.row.id);
  });

  it("authenticates a live token as its owner and records one use per minute", async () => {
    const { token, row } = await createApiToken({ name: "Agent", scope: "write", expiresInDays: 30 }, owner.id, { authVersion: 0 });
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
    const live = await createApiToken({ name: "Vivant", scope: "read", expiresInDays: null }, owner.id, { authVersion: 0 });
    const revoked = await createApiToken({ name: "Révoqué", scope: "read", expiresInDays: null }, owner.id, { authVersion: 0 });
    await revokeApiToken(revoked.row.id, owner.id);
    const expiring = await createApiToken({ name: "Expiré", scope: "read", expiresInDays: 30 }, owner.id, { authVersion: 0 });

    await expect(authenticateApiToken(`${live.token.slice(0, -1)}!`)).resolves.toBeNull();
    await expect(authenticateApiToken("jiroo_pat_" + "A".repeat(43))).resolves.toBeNull();
    await expect(authenticateApiToken("")).resolves.toBeNull();
    await expect(authenticateApiToken(revoked.token)).resolves.toBeNull();
    await expect(authenticateApiToken(expiring.token, new Date(expiring.row.expiresAt!.getTime() + 1))).resolves.toBeNull();
    await expect(authenticateApiToken(expiring.token, new Date(expiring.row.expiresAt!.getTime() - 1))).resolves.not.toBeNull();
  });

  it("records creation and revocation in the security audit trail without the secret", async () => {
    const { token, row } = await createApiToken({ name: "Audité", scope: "write", expiresInDays: 30 }, owner.id, { authVersion: 0 }, new Date(), "tokens-audit-create");
    await revokeApiToken(row.id, owner.id, new Date(), "tokens-audit-revoke");

    const events = await db
      .select()
      .from(securityAuditEvents)
      .where(eq(securityAuditEvents.targetId, row.id))
      .orderBy(securityAuditEvents.createdAt);
    expect(events.map((e) => e.action)).toEqual(["api_token_created", "api_token_revoked"]);
    expect(events[0]).toMatchObject({
      actorId: owner.id,
      actorLabel: "Propriétaire",
      scope: "global",
      targetType: "api_token",
      requestCorrelationId: "tokens-audit-create",
      newValue: { name: "Audité", scope: "write" },
    });
    const serialised = JSON.stringify(events);
    expect(serialised).not.toContain(token);
    expect(serialised).not.toContain(hashApiToken(token));
  });

  it("rejects a token at the exact second it expires and never touches its last use when refused", async () => {
    const created = await createApiToken({ name: "Limite", scope: "read", expiresInDays: 30 }, owner.id, { authVersion: 0 });
    const expiresAt = created.row.expiresAt!;

    await expect(authenticateApiToken(created.token, expiresAt)).resolves.toBeNull();
    const [row] = await db.select({ lastUsedAt: apiTokens.lastUsedAt }).from(apiTokens).where(eq(apiTokens.id, created.row.id));
    expect(row!.lastUsedAt).toBeNull();
  });

  it("refuses a creation whose session predates an account reset or lost its second factor", async () => {
    const stale = { id: `api-token-stale-${randomUUID()}`, email: `${randomUUID()}@tokens.test`, name: "Périmé" };
    await db.insert(user).values({ ...stale, emailVerified: true, twoFactorEnabled: true, role: "contributor", authVersion: 3 });
    try {
      await expect(createApiToken({ name: "Avant reset", scope: "read", expiresInDays: null }, stale.id, { authVersion: 2 }))
        .rejects.toMatchObject({ name: "StaleAuthorizationError" });
      await expect(createApiToken({ name: "Courant", scope: "read", expiresInDays: null }, stale.id, { authVersion: 3 }))
        .resolves.toBeTruthy();

      await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, stale.id));
      await expect(createApiToken({ name: "Sans 2FA", scope: "read", expiresInDays: null }, stale.id, { authVersion: 3 }))
        .rejects.toMatchObject({ name: "StaleAuthorizationError" });
      expect(await listApiTokens(stale.id)).toHaveLength(1);
    } finally {
      await db.delete(user).where(eq(user.id, stale.id));
    }
  });

  it("reads the auth version a session was granted with, which getSession hides", async () => {
    const sessionId = `api-token-session-${randomUUID()}`;
    await db.insert(session).values({
      id: sessionId,
      token: randomUUID(),
      userId: owner.id,
      expiresAt: new Date(Date.now() + 60_000),
      updatedAt: new Date(),
      authVersion: 2,
    });
    try {
      expect(await sessionAuthVersion(sessionId)).toBe(2);
      expect(await sessionAuthVersion("missing-session")).toBeNull();
    } finally {
      await db.delete(session).where(eq(session.id, sessionId));
    }
  });

  it("stops authenticating a token once its owner loses the second factor", async () => {
    const owner2 = { id: `api-token-2fa-${randomUUID()}`, email: `${randomUUID()}@tokens.test`, name: "Sans 2FA" };
    await db.insert(user).values({ ...owner2, emailVerified: true, twoFactorEnabled: true, role: "contributor" });
    try {
      const { token } = await createApiToken({ name: "Lecture", scope: "read", expiresInDays: 30 }, owner2.id, { authVersion: 0 });
      expect(await authenticateApiToken(token)).not.toBeNull();
      await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, owner2.id));
      expect(await authenticateApiToken(token)).toBeNull();
    } finally {
      await db.delete(user).where(eq(user.id, owner2.id));
    }
  });

  it("stops authenticating a legacy write token that never expires", async () => {
    const { token, row } = await createApiToken({ name: "Ancien", scope: "write", expiresInDays: 30 }, owner.id, { authVersion: 0 });
    expect(await authenticateApiToken(token)).not.toBeNull();
    await db.update(apiTokens).set({ expiresAt: null }).where(eq(apiTokens.id, row.id));
    expect(await authenticateApiToken(token)).toBeNull();
  });

  it("refuses a write token without expiry", async () => {
    await expect(createApiToken({ name: "Éternel", scope: "write", expiresInDays: null }, owner.id, { authVersion: 0 }))
      .rejects.toMatchObject({ name: "ZodError" });
  });

  it("lets only a Jiroo administrator list and revoke every account's tokens, with an audit event", async () => {
    const admin = { id: `api-token-admin-${randomUUID()}`, email: `${randomUUID()}@tokens.test`, name: "Admin jetons" };
    await db.insert(user).values({ ...admin, emailVerified: true, twoFactorEnabled: true, role: "admin" });
    await db.insert(permissionGrants).values({ scope: "global", permissionKey: "administer_jiroo", principalType: "user", userId: admin.id });
    try {
      const target = await createApiToken({ name: "À couper", scope: "read", expiresInDays: 30 }, owner.id, { authVersion: 0 });

      await expect(listAllLiveApiTokens(other.id)).rejects.toMatchObject({ name: "PermissionDeniedError" });
      await expect(revokeApiTokenAsAdministrator(target.row.id, other.id)).rejects.toMatchObject({ name: "PermissionDeniedError" });
      expect(await authenticateApiToken(target.token)).not.toBeNull();

      const listed = await listAllLiveApiTokens(admin.id);
      const row = listed.find((token) => token.id === target.row.id);
      expect(row).toMatchObject({ name: "À couper", ownerName: "Propriétaire", ownerEmail: owner.email });
      expect(listed.every((token) => !("tokenHash" in token))).toBe(true);

      expect(await revokeApiTokenAsAdministrator(target.row.id, admin.id, new Date(), "admin-revoke")).toBe(true);
      expect(await authenticateApiToken(target.token)).toBeNull();
      expect(await revokeApiTokenAsAdministrator(target.row.id, admin.id)).toBe(false);
      const [event] = await db.select().from(securityAuditEvents).where(and(
        eq(securityAuditEvents.targetId, target.row.id),
        eq(securityAuditEvents.action, "api_token_revoked_by_administrator"),
      ));
      expect(event).toMatchObject({ actorId: admin.id, targetType: "api_token", requestCorrelationId: "admin-revoke", newValue: { ownerId: owner.id, name: "À couper", scope: "read" } });
      expect(JSON.stringify(event)).not.toContain(target.token);
    } finally {
      await db.delete(securityAuditEvents).where(eq(securityAuditEvents.actorId, admin.id));
      await db.delete(permissionGrants).where(eq(permissionGrants.userId, admin.id));
      await db.delete(user).where(eq(user.id, admin.id));
    }
  });

  it("caps the live tokens of a user", async () => {
    const capped = { id: `api-token-capped-${randomUUID()}`, email: `${randomUUID()}@tokens.test`, name: "Plafond" };
    await db.insert(user).values({ ...capped, emailVerified: true, twoFactorEnabled: true, role: "contributor" });
    try {
      for (let index = 0; index < MAX_LIVE_TOKENS_PER_USER; index += 1) {
        await createApiToken({ name: `Jeton ${index}`, scope: "read", expiresInDays: null }, capped.id, { authVersion: 0 });
      }
      await expect(createApiToken({ name: "Un de trop", scope: "read", expiresInDays: null }, capped.id, { authVersion: 0 }))
        .rejects.toThrow(TOO_MANY_TOKENS_MESSAGE);
      const tokens = await listApiTokens(capped.id);
      expect(tokens).toHaveLength(MAX_LIVE_TOKENS_PER_USER);
      await revokeApiToken(tokens[0]!.id, capped.id);
      await expect(createApiToken({ name: "Après révocation", scope: "read", expiresInDays: null }, capped.id, { authVersion: 0 })).resolves.toBeTruthy();
    } finally {
      await db.delete(user).where(eq(user.id, capped.id));
    }
  });

  it("revokes every live token of a user inside the caller's transaction", async () => {
    const a = await createApiToken({ name: "A", scope: "read", expiresInDays: null }, owner.id, { authVersion: 0 });
    const b = await createApiToken({ name: "B", scope: "write", expiresInDays: 30 }, owner.id, { authVersion: 0 });
    const theirs = await createApiToken({ name: "Autre", scope: "read", expiresInDays: null }, other.id, { authVersion: 0 });

    const revokedCount = await db.transaction((tx) => revokeAllTokensForUser(tx, owner.id));

    expect(revokedCount).toBeGreaterThanOrEqual(2);
    await expect(authenticateApiToken(a.token)).resolves.toBeNull();
    await expect(authenticateApiToken(b.token)).resolves.toBeNull();
    await expect(authenticateApiToken(theirs.token)).resolves.not.toBeNull();
    expect(await listApiTokens(owner.id)).toEqual([]);
    expect(await db.transaction((tx) => revokeAllTokensForUser(tx, owner.id))).toBe(0);
  });
});
