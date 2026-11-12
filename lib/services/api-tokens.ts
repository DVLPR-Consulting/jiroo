import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema/domain";
import {
  createApiTokenSchema,
  type ApiTokenExpiryDays,
  type ApiTokenScope,
} from "@/lib/validation/api-token";

/**
 * Personal access tokens (JIR-156). A token acts as its owner, with the
 * owner's permissions, for the REST API and the MCP server. The secret is
 * shown once at creation; only its SHA-256 is stored, and the first
 * characters identify the token in the owner's list.
 */

export const API_TOKEN_PREFIX = "jiroo_pat_";

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
 * Creates a token for `ownerId` and returns the secret, the only time it is
 * ever available. The caller has checked that the owner is signed in with
 * their second factor: the token itself never asks for it again.
 */
export async function createApiToken(
  input: unknown,
  ownerId: string,
  now = new Date(),
): Promise<{ token: string; row: ApiTokenRow }> {
  const data = createApiTokenSchema.parse(input);
  const { token, hash, prefix } = generateApiToken();
  const [row] = await db
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
  return { token, row: row! };
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
export async function revokeApiToken(id: string, ownerId: string, now = new Date()): Promise<boolean> {
  const revoked = await db
    .update(apiTokens)
    .set({ revokedAt: now })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, ownerId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return revoked.length === 1;
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
    })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1);
  if (!row) return null;
  const matches = timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hash, "hex"));
  if (!matches || row.revokedAt !== null) return null;
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
