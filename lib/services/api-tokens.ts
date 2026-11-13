import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { requirePermission, requirePermissionWithoutBypassAudit } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { apiTokens, securityAuditEvents } from "@/lib/db/schema/domain";
import {
  API_TOKEN_PREFIX,
  createApiTokenSchema,
  MAX_LIVE_TOKENS_PER_USER,
  STALE_SESSION_MESSAGE,
  TOO_MANY_TOKENS_MESSAGE,
  type ApiTokenExpiryDays,
  type ApiTokenScope,
} from "@/lib/validation/api-token";

/**
 * Personal access tokens (JIR-156). A token acts as its owner, with the
 * owner's permissions, for the REST API and the MCP server. The secret is
 * shown once at creation; only its SHA-256 is stored, and the first
 * characters identify the token in the owner's list.
 */

export { API_TOKEN_PREFIX, MAX_LIVE_TOKENS_PER_USER, TOO_MANY_TOKENS_MESSAGE };

const SECRET_BYTES = 32;
const SECRET_LENGTH = 43; // 32 bytes in base64url, unpadded
const DISPLAY_PREFIX_LENGTH = 8;
const TOKEN_FORMAT = new RegExp(`^${API_TOKEN_PREFIX}[A-Za-z0-9_-]{${SECRET_LENGTH}}$`);

/** `last_used_at` moves at most once a minute: one write per token, not per call. */
export const LAST_USED_THROTTLE_MS = 60_000;


type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Queryable = typeof db | Transaction;

export type ApiTokenRow = Omit<typeof apiTokens.$inferSelect, "tokenHash">;

/** The authenticated principal of an API or MCP request. */
export type ApiPrincipal = {
  actorId: string;
  tokenId: string;
  scope: ApiTokenScope;
};

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateApiToken(): { token: string; hash: string; prefix: string } {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const token = `${API_TOKEN_PREFIX}${secret}`;
  return { token, hash: hashApiToken(token), prefix: secret.slice(0, DISPLAY_PREFIX_LENGTH) };
}

export function isApiTokenFormat(value: string): boolean {
  return TOKEN_FORMAT.test(value);
}

/** `write` implies `read`; nothing else is implied. */
export function scopeAllows(granted: ApiTokenScope, required: ApiTokenScope): boolean {
  return granted === required || (granted === "write" && required === "read");
}

export function expiresAtFor(days: ApiTokenExpiryDays, now = new Date()): Date | null {
  if (days === null) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

const publicColumns = {
  id: apiTokens.id,
  userId: apiTokens.userId,
  name: apiTokens.name,
  tokenPrefix: apiTokens.tokenPrefix,
  scope: apiTokens.scope,
  expiresAt: apiTokens.expiresAt,
  lastUsedAt: apiTokens.lastUsedAt,
  revokedAt: apiTokens.revokedAt,
  createdAt: apiTokens.createdAt,
};

/**
 * Token lifecycle events join the security audit trail (never the secret nor
 * its hash): a token acts without a second factor, so minting or revoking one
 * must leave the same trace as the account recoveries.
 */
async function appendTokenAuditEvent(
  tx: Queryable,
  event: {
    actorId: string;
    action: "api_token_created" | "api_token_revoked" | "api_token_revoked_by_administrator";
    tokenId: string;
    newValue: Record<string, unknown>;
    requestCorrelationId: string;
  },
): Promise<void> {
  const [actor] = await tx
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, event.actorId))
    .limit(1);
  await tx.insert(securityAuditEvents).values({
    actorId: event.actorId,
    actorLabel: actor?.name ?? event.actorId,
    action: event.action,
    scope: "global",
    targetType: "api_token",
    targetId: event.tokenId,
    newValue: event.newValue,
    requestCorrelationId: event.requestCorrelationId,
  });
}

/** The session that asks for a token, as the Server Action read it. */
export type TokenCreationSession = {
  /** `user.auth_version` captured when the session's first factor was verified. */
  authVersion: number;
};

/**
 * The session is no longer good enough to mint a token: an administrator
 * reset the account (auth version moved) or the second factor is gone.
 */
export class StaleAuthorizationError extends Error {
  constructor() {
    super(STALE_SESSION_MESSAGE);
    this.name = "StaleAuthorizationError";
  }
}

/**
 * Creates a token for `ownerId` and returns the secret, the only time it is
 * ever available. The caller has checked that the owner is signed in with
 * their second factor; the row lock below then waits for any account
 * recovery in flight and re-checks that the session is still current, so a
 * creation that started before a reset cannot land after it (lib/auth/auth-version.ts).
 */
export async function createApiToken(
  input: unknown,
  ownerId: string,
  session: TokenCreationSession,
  now = new Date(),
  requestCorrelationId: string = randomUUID(),
): Promise<{ token: string; row: ApiTokenRow }> {
  const data = createApiTokenSchema.parse(input);
  const { token, hash, prefix } = generateApiToken();
  const row = await db.transaction(async (tx) => {
    // Serialises with the account recoveries (same lock) and the owner's
    // other creations, so the freshness check and the cap hold under concurrency.
    const [owner] = await tx
      .select({ authVersion: user.authVersion, twoFactorEnabled: user.twoFactorEnabled })
      .from(user)
      .where(eq(user.id, ownerId))
      .for("update");
    if (!owner || owner.authVersion !== session.authVersion || owner.twoFactorEnabled !== true) {
      throw new StaleAuthorizationError();
    }
    const [live] = await tx
      .select({ count: count() })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, ownerId), isNull(apiTokens.revokedAt)));
    if ((live?.count ?? 0) >= MAX_LIVE_TOKENS_PER_USER) throw new Error(TOO_MANY_TOKENS_MESSAGE);
    const [created] = await tx
      .insert(apiTokens)
      .values({
        userId: ownerId,
        name: data.name,
        tokenHash: hash,
        tokenPrefix: prefix,
        scope: data.scope,
        expiresAt: expiresAtFor(data.expiresInDays, now),
      })
      .returning(publicColumns);
    await appendTokenAuditEvent(tx, {
      actorId: ownerId,
      action: "api_token_created",
      tokenId: created!.id,
      newValue: { name: data.name, scope: data.scope, expiresAt: created!.expiresAt?.toISOString() ?? null },
      requestCorrelationId,
    });
    return created!;
  });
  return { token, row };
}

/** The owner's tokens not yet revoked, newest first (expired ones included, flagged by the UI). */
export async function listApiTokens(ownerId: string): Promise<ApiTokenRow[]> {
  return db
    .select(publicColumns)
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, ownerId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id));
}

/** Revokes one of the owner's live tokens; `false` when it is not theirs or already revoked. */
export async function revokeApiToken(
  id: string,
  ownerId: string,
  now = new Date(),
  requestCorrelationId: string = randomUUID(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const revoked = await tx
      .update(apiTokens)
      .set({ revokedAt: now })
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, ownerId), isNull(apiTokens.revokedAt)))
      .returning({ id: apiTokens.id, name: apiTokens.name, scope: apiTokens.scope });
    const token = revoked[0];
    if (!token) return false;
    await appendTokenAuditEvent(tx, {
      actorId: ownerId,
      action: "api_token_revoked",
      tokenId: token.id,
      newValue: { name: token.name, scope: token.scope },
      requestCorrelationId,
    });
    return true;
  });
}

/** A live token as Administration lists it: its metadata and its owner, never its hash. */
export type AdministeredApiTokenRow = ApiTokenRow & { ownerName: string; ownerEmail: string };

const TOKEN_ADMINISTRATION = { permission: "administer_jiroo", scope: { type: "global" } } as const;

async function requireTokenAdministrator(actorId: string): Promise<void> {
  // Same gate as the account recoveries: only a Jiroo administrator (JIR-161).
  await requirePermissionWithoutBypassAudit({ actorId, ...TOKEN_ADMINISTRATION });
}

/** Every live token of every account, newest first, for Administration (JIR-161). */
export async function listAllLiveApiTokens(actorId: string): Promise<AdministeredApiTokenRow[]> {
  await requireTokenAdministrator(actorId);
  return db
    .select({ ...publicColumns, ownerName: user.name, ownerEmail: user.email })
    .from(apiTokens)
    .innerJoin(user, eq(apiTokens.userId, user.id))
    .where(isNull(apiTokens.revokedAt))
    .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id));
}

/**
 * Revokes any account's live token on an administrator's behalf, recorded in
 * the security audit trail with the owner (JIR-161). `false` when the token
 * is unknown or already revoked.
 */
export async function revokeApiTokenAsAdministrator(
  id: string,
  actorId: string,
  now = new Date(),
  requestCorrelationId: string = randomUUID(),
): Promise<boolean> {
  // Unlike the listing, a revocation reaches one token: trace the bypass against it.
  await requirePermission(
    { actorId, ...TOKEN_ADMINISTRATION },
    { targetType: "api_token", targetId: id, requestCorrelationId },
  );
  return db.transaction(async (tx) => {
    const revoked = await tx
      .update(apiTokens)
      .set({ revokedAt: now })
      .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
      .returning({ id: apiTokens.id, ownerId: apiTokens.userId, name: apiTokens.name, scope: apiTokens.scope });
    const token = revoked[0];
    if (!token) return false;
    await appendTokenAuditEvent(tx, {
      actorId,
      action: "api_token_revoked_by_administrator",
      tokenId: token.id,
      newValue: { ownerId: token.ownerId, name: token.name, scope: token.scope },
      requestCorrelationId,
    });
    return true;
  });
}

/**
 * Revokes every live token of a user, inside the caller's transaction: an
 * account recovery by an administrator answers a suspected compromise, so
 * the tokens go the way of the sessions (lib/services/account-recovery.ts).
 */
export async function revokeAllTokensForUser(tx: Queryable, userId: string, now = new Date()): Promise<number> {
  const revoked = await tx
    .update(apiTokens)
    .set({ revokedAt: now })
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return revoked.length;
}

/**
 * Resolves a bearer secret to its principal, or `null` for anything that is
 * not a live token: malformed, unknown, revoked or expired, all alike. The
 * lookup goes through the hash; the stored hash is then compared in constant
 * time so a near miss costs the same as a hit.
 */
export async function authenticateApiToken(rawToken: string, now = new Date()): Promise<ApiPrincipal | null> {
  if (!isApiTokenFormat(rawToken)) return null;
  const hash = hashApiToken(rawToken);
  const [row] = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      scope: apiTokens.scope,
      tokenHash: apiTokens.tokenHash,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
      ownerTwoFactorEnabled: user.twoFactorEnabled,
    })
    .from(apiTokens)
    .innerJoin(user, eq(apiTokens.userId, user.id))
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1);
  if (!row) return null;
  const matches = timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hash, "hex"));
  if (!matches || row.revokedAt !== null) return null;
  // A token never outlives its owner's second factor (security audit, JIR-160):
  // an account without 2FA could not mint it, so it may not use it either.
  if (row.ownerTwoFactorEnabled !== true) return null;
  // Write tokens created before expiry became mandatory stop working (JIR-160).
  if (row.scope === "write" && row.expiresAt === null) return null;
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) return null;
  await touchLastUsed(row.id, now);
  return { actorId: row.userId, tokenId: row.id, scope: row.scope };
}

async function touchLastUsed(tokenId: string, now: Date): Promise<void> {
  const threshold = new Date(now.getTime() - LAST_USED_THROTTLE_MS);
  await db
    .update(apiTokens)
    .set({ lastUsedAt: now })
    .where(and(
      eq(apiTokens.id, tokenId),
      or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, threshold)),
      // Never move the mark backwards when calls race.
      or(isNull(apiTokens.lastUsedAt), sql`${apiTokens.lastUsedAt} < ${now}`),
    ));
}
