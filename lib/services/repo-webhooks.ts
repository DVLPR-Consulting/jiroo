import "server-only";

import { and, count, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  backlogs,
  itemRefs,
  items,
  repoConnections,
  repoWebhookDeliveries,
} from "@/lib/db/schema/domain";
import type { DevRefCandidate, RepoProvider } from "@/lib/repo-webhooks/events";
import { extractItemKeys } from "@/lib/repo-webhooks/item-keys";
import { buildRefUrl, externalRefId } from "@/lib/repo-webhooks/ref-links";

/**
 * Webhook side of repository connections (JIR-95). No session here: the
 * route has authenticated the delivery with the connection's secret before
 * anything is written. Item history is left alone (as in Jira, development
 * information is not part of an issue's history); the delivery log and the
 * connection status record what was received.
 */

/** Deliveries kept for replay detection. */
const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** A failing connection's last error is rewritten at most this often. */
const ERROR_THROTTLE_MS = 60 * 1000;
const MAX_ERROR_LENGTH = 300;

export type WebhookConnection = {
  id: string;
  backlogId: string;
  backlogKey: string;
  provider: RepoProvider;
  instanceUrl: string;
  repositoryPath: string;
  secretCiphertext: string;
};

/**
 * The enabled connection of a live backlog for this forge, or null. Unknown,
 * disabled and wrong-forge connections all read as null: the route refuses
 * them exactly like a bad signature.
 */
export async function findWebhookConnection(
  connectionId: string,
  provider: RepoProvider,
): Promise<WebhookConnection | null> {
  const [connection] = await db
    .select({
      id: repoConnections.id,
      backlogId: repoConnections.backlogId,
      backlogKey: backlogs.key,
      provider: repoConnections.provider,
      instanceUrl: repoConnections.instanceUrl,
      repositoryPath: repoConnections.repositoryPath,
      secretCiphertext: repoConnections.secretCiphertext,
    })
    .from(repoConnections)
    .innerJoin(backlogs, eq(backlogs.id, repoConnections.backlogId))
    .where(and(
      eq(repoConnections.id, connectionId),
      eq(repoConnections.provider, provider),
      eq(repoConnections.enabled, true),
      isNull(backlogs.archivedAt),
    ))
    .limit(1);
  return connection ?? null;
}

/** Deliveries applied in the last `windowMs`, for the per-connection budget. */
export async function countRecentDeliveries(connectionId: string, windowMs: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(repoWebhookDeliveries)
    .where(and(
      eq(repoWebhookDeliveries.connectionId, connectionId),
      gte(repoWebhookDeliveries.receivedAt, new Date(Date.now() - windowMs)),
    ));
  return row?.value ?? 0;
}

/** Shows the failure on the settings page; throttled against floods. */
export async function recordWebhookError(connectionId: string, message: string): Promise<void> {
  const now = new Date();
  const error = message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH - 1)}…` : message;
  await db
    .update(repoConnections)
    .set({ lastError: error, lastErrorAt: now })
    .where(and(
      eq(repoConnections.id, connectionId),
      or(
        isNull(repoConnections.lastErrorAt),
        lt(repoConnections.lastErrorAt, new Date(now.getTime() - ERROR_THROTTLE_MS)),
        sql`${repoConnections.lastError} is distinct from ${error}`,
      ),
    ));
}

/** An authenticated delivery that linked nothing (ping, ignored event). */
export async function recordWebhookEvent(connectionId: string): Promise<void> {
  await db
    .update(repoConnections)
    .set({ lastEventAt: new Date(), lastError: null, lastErrorAt: null })
    .where(eq(repoConnections.id, connectionId));
}

type RefRow = typeof itemRefs.$inferInsert & { occurredAt: Date };

function refRows(
  connection: WebhookConnection,
  candidates: DevRefCandidate[],
  itemIdsByKey: Map<string, string>,
): RefRow[] {
  const rows = new Map<string, RefRow>();
  for (const candidate of candidates) {
    const keys = extractItemKeys(candidate.texts, connection.backlogKey);
    const location = {
      provider: connection.provider,
      instanceUrl: connection.instanceUrl,
      repositoryPath: connection.repositoryPath,
      kind: candidate.kind,
      id: candidate.id,
    };
    for (const key of keys) {
      const itemId = itemIdsByKey.get(key);
      if (!itemId) continue;
      const externalId = externalRefId(location);
      const identity = `${itemId}|${candidate.kind}|${externalId}`;
      const previous = rows.get(identity);
      // One upsert per identity: keep the most recent version in this batch.
      if (previous && previous.occurredAt > candidate.occurredAt) continue;
      rows.set(identity, {
        itemId,
        kind: candidate.kind,
        url: buildRefUrl(location),
        connectionId: connection.id,
        provider: connection.provider,
        externalId,
        title: candidate.title,
        authorName: candidate.authorName,
        state: candidate.state,
        occurredAt: candidate.occurredAt,
      });
    }
  }
  return [...rows.values()];
}

/**
 * Applies one authenticated delivery in a single transaction: records its
 * id (a replay is a no-op), links each reference to the live items of the
 * connected backlog it mentions, and marks the connection as healthy.
 * A reference is upserted per (item, kind, provider, external id); an older
 * event never overwrites a newer one (e.g. a late « opened » after « merged »).
 */
export async function ingestWebhookReferences(input: {
  connection: WebhookConnection;
  deliveryId: string | null;
  refs: DevRefCandidate[];
}): Promise<{ duplicate: boolean; linked: number }> {
  const { connection, deliveryId } = input;
  return db.transaction(async (tx) => {
    if (deliveryId) {
      const inserted = await tx
        .insert(repoWebhookDeliveries)
        .values({ connectionId: connection.id, deliveryId })
        .onConflictDoNothing()
        .returning({ deliveryId: repoWebhookDeliveries.deliveryId });
      if (inserted.length === 0) return { duplicate: true, linked: 0 };
      await tx
        .delete(repoWebhookDeliveries)
        .where(and(
          eq(repoWebhookDeliveries.connectionId, connection.id),
          lt(repoWebhookDeliveries.receivedAt, new Date(Date.now() - DELIVERY_RETENTION_MS)),
        ));
    }

    const keys = [...new Set(input.refs.flatMap((ref) => extractItemKeys(ref.texts, connection.backlogKey)))];
    const liveItems = keys.length === 0
      ? []
      : await tx
          .select({ id: items.id, key: items.key })
          .from(items)
          .where(and(
            eq(items.backlogId, connection.backlogId),
            inArray(items.key, keys),
            isNull(items.deletedAt),
          ));
    const rows = refRows(connection, input.refs, new Map(liveItems.map((item) => [item.key, item.id])));

    if (rows.length > 0) {
      await tx
        .insert(itemRefs)
        .values(rows)
        .onConflictDoUpdate({
          target: [itemRefs.itemId, itemRefs.kind, itemRefs.provider, itemRefs.externalId],
          set: {
            url: sql`excluded.url`,
            connectionId: sql`excluded.connection_id`,
            title: sql`excluded.title`,
            authorName: sql`excluded.author_name`,
            state: sql`excluded.state`,
            occurredAt: sql`excluded.occurred_at`,
          },
          setWhere: sql`${itemRefs.occurredAt} is null or excluded.occurred_at >= ${itemRefs.occurredAt}`,
        });
    }

    await tx
      .update(repoConnections)
      .set({ lastEventAt: new Date(), lastError: null, lastErrorAt: null })
      .where(eq(repoConnections.id, connection.id));
    return { duplicate: false, linked: rows.length };
  });
}
