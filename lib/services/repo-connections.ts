import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { deploymentSecretBoxKey, openSecret, sealSecret } from "@/lib/crypto/secret-box";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { repoConnections, securityAuditEvents } from "@/lib/db/schema/domain";
import {
  createRepoConnectionInput,
  repoConnectionIdInput,
  setRepoConnectionEnabledInput,
} from "@/lib/validation/repo-connection";

/**
 * Repository connections of a backlog (JIR-95). Every mutation validates,
 * writes and appends its security audit event in one transaction. The
 * webhook secret is generated here, stored encrypted and returned only by
 * the call that created it: it is never read back for display nor logged.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const DUPLICATE_CONNECTION_MESSAGE = "Ce dépôt est déjà connecté à ce backlog.";
export const CONNECTION_NOT_FOUND_MESSAGE = "Connexion introuvable.";

export type RepoConnectionDto = {
  id: string;
  backlogId: string;
  provider: "github" | "gitlab";
  instanceUrl: string;
  repositoryPath: string;
  enabled: boolean;
  lastEventAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  createdAt: Date;
};

const dtoColumns = {
  id: repoConnections.id,
  backlogId: repoConnections.backlogId,
  provider: repoConnections.provider,
  instanceUrl: repoConnections.instanceUrl,
  repositoryPath: repoConnections.repositoryPath,
  enabled: repoConnections.enabled,
  lastEventAt: repoConnections.lastEventAt,
  lastError: repoConnections.lastError,
  lastErrorAt: repoConnections.lastErrorAt,
  createdAt: repoConnections.createdAt,
};

/** A fresh webhook secret: 256 random bits, URL-safe. */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}

export type RepoConnectionListItem = RepoConnectionDto & {
  /** False when the secret no longer decrypts (BETTER_AUTH_SECRET rotated): regenerate it. */
  secretReadable: boolean;
};

export async function listRepoConnections(backlogId: string): Promise<RepoConnectionListItem[]> {
  const rows = await db
    .select({ ...dtoColumns, secretCiphertext: repoConnections.secretCiphertext })
    .from(repoConnections)
    .where(eq(repoConnections.backlogId, backlogId))
    .orderBy(asc(repoConnections.createdAt), asc(repoConnections.id));
  let key: ReturnType<typeof deploymentSecretBoxKey> | null = null;
  try {
    key = deploymentSecretBoxKey();
  } catch {
    key = null;
  }
  return rows.map(({ secretCiphertext, ...connection }) => {
    let secretReadable = false;
    if (key) {
      try {
        openSecret(secretCiphertext, key);
        secretReadable = true;
      } catch {
        secretReadable = false;
      }
    }
    return { ...connection, secretReadable };
  });
}

async function actorLabel(tx: Transaction, actorId: string): Promise<string> {
  const [actor] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actorId)).limit(1);
  if (!actor) throw new Error("Utilisateur introuvable.");
  return actor.name;
}

async function audit(
  tx: Transaction,
  input: {
    actorId: string;
    action: string;
    connection: Pick<RepoConnectionDto, "id" | "backlogId" | "provider" | "instanceUrl" | "repositoryPath">;
    oldValue?: Record<string, unknown>;
    /** Null for a deletion; defaults to the repository. */
    newValue?: Record<string, unknown> | null;
    requestCorrelationId?: string;
  },
): Promise<void> {
  const { connection } = input;
  // Identifies the repository, never the secret.
  const repository = {
    provider: connection.provider,
    instanceUrl: connection.instanceUrl,
    repositoryPath: connection.repositoryPath,
  };
  await tx.insert(securityAuditEvents).values({
    actorId: input.actorId,
    actorLabel: await actorLabel(tx, input.actorId),
    action: input.action,
    scope: "backlog",
    backlogId: connection.backlogId,
    targetType: "repo_connection",
    targetId: connection.id,
    oldValue: input.oldValue ? { ...repository, ...input.oldValue } : null,
    newValue: input.newValue === null ? null : { ...repository, ...input.newValue },
    requestCorrelationId: input.requestCorrelationId ?? randomUUID(),
  });
}

async function lockedConnection(tx: Transaction, connectionId: string): Promise<RepoConnectionDto> {
  const [connection] = await tx
    .select(dtoColumns)
    .from(repoConnections)
    .where(eq(repoConnections.id, connectionId))
    .for("update");
  if (!connection) throw new Error(CONNECTION_NOT_FOUND_MESSAGE);
  return connection;
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return (error as { code?: string } | null)?.code === "23505" || cause?.code === "23505";
}

export async function createRepoConnection(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
): Promise<{ connection: RepoConnectionDto; secret: string }> {
  const data = createRepoConnectionInput.parse(input);
  const secret = generateWebhookSecret();
  const secretCiphertext = sealSecret(secret, deploymentSecretBoxKey());
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: repoConnections.id })
        .from(repoConnections)
        .where(and(
          eq(repoConnections.backlogId, data.backlogId),
          eq(repoConnections.provider, data.provider),
          eq(repoConnections.instanceUrl, data.instanceUrl),
          eq(repoConnections.repositoryPath, data.repositoryPath),
        ))
        .limit(1);
      if (existing) throw new Error(DUPLICATE_CONNECTION_MESSAGE);
      const [connection] = await tx
        .insert(repoConnections)
        .values({ ...data, secretCiphertext, createdBy: actorId })
        .returning(dtoColumns);
      await audit(tx, {
        actorId,
        action: "repo_connection_created",
        connection: connection!,
        requestCorrelationId,
      });
      return { connection: connection!, secret };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(DUPLICATE_CONNECTION_MESSAGE);
    throw error;
  }
}

/** Replaces the secret: the previous one is refused from now on. */
export async function regenerateRepoConnectionSecret(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
): Promise<{ connection: RepoConnectionDto; secret: string }> {
  const { connectionId } = repoConnectionIdInput.parse(input);
  const secret = generateWebhookSecret();
  const secretCiphertext = sealSecret(secret, deploymentSecretBoxKey());
  return db.transaction(async (tx) => {
    await lockedConnection(tx, connectionId);
    const [connection] = await tx
      .update(repoConnections)
      .set({ secretCiphertext, lastError: null, lastErrorAt: null, updatedAt: new Date() })
      .where(eq(repoConnections.id, connectionId))
      .returning(dtoColumns);
    await audit(tx, {
      actorId,
      action: "repo_connection_secret_regenerated",
      connection: connection!,
      requestCorrelationId,
    });
    return { connection: connection!, secret };
  });
}

export async function setRepoConnectionEnabled(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
): Promise<RepoConnectionDto> {
  const { connectionId, enabled } = setRepoConnectionEnabledInput.parse(input);
  return db.transaction(async (tx) => {
    const current = await lockedConnection(tx, connectionId);
    if (current.enabled === enabled) return current;
    const [connection] = await tx
      .update(repoConnections)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(repoConnections.id, connectionId))
      .returning(dtoColumns);
    await audit(tx, {
      actorId,
      action: enabled ? "repo_connection_enabled" : "repo_connection_disabled",
      connection: connection!,
      oldValue: { enabled: current.enabled },
      newValue: { enabled },
      requestCorrelationId,
    });
    return connection!;
  });
}

/** Deletes the connection; the references it created stay on the items. */
export async function deleteRepoConnection(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
): Promise<void> {
  const { connectionId } = repoConnectionIdInput.parse(input);
  await db.transaction(async (tx) => {
    const connection = await lockedConnection(tx, connectionId);
    await tx.delete(repoConnections).where(eq(repoConnections.id, connectionId));
    await audit(tx, {
      actorId,
      action: "repo_connection_deleted",
      connection,
      oldValue: {},
      newValue: null,
      requestCorrelationId,
    });
  });
}
