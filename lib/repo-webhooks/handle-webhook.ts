import "server-only";

import { createHash } from "node:crypto";
import { deploymentSecretBoxKey, openSecret } from "@/lib/crypto/secret-box";
import {
  parseGithubWebhook,
  parseGitlabWebhook,
  WebhookPayloadError,
  type ParsedWebhook,
  type RepoProvider,
} from "@/lib/repo-webhooks/events";
import { verifyGithubSignature, verifyGitlabToken } from "@/lib/repo-webhooks/signature";
import {
  countRecentDeliveries,
  findWebhookConnection,
  ingestWebhookReferences,
  recordWebhookError,
  recordWebhookEvent,
} from "@/lib/services/repo-webhooks";

/**
 * `POST /api/webhooks/{github,gitlab}/<connectionId>` (JIR-95). No session:
 * the delivery is authenticated with the connection's secret, verified on the
 * raw body before any parsing. Unknown, disabled and badly signed deliveries
 * get the very same answer, so the endpoint never reveals which connections
 * exist. Neither the secret nor the payload is ever logged.
 */

export const MAX_WEBHOOK_BYTES = 1024 * 1024;
export const WEBHOOK_RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELIVERY_ID = /^[A-Za-z0-9._:-]{1,200}$/;
// Verified against when the connection is unknown, so both paths do the same work.
const PLACEHOLDER_SECRET = "jiroo-placeholder-webhook-secret-never-valid";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

const refused = () => json(401, { error: "unauthorized" });
const tooLarge = () => json(413, { error: "payload_too_large" });

/** Reads at most `limit` bytes; null when the body is larger. */
async function readLimitedBody(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function verify(provider: RepoProvider, request: Request, body: Uint8Array, secret: string): boolean {
  return provider === "github"
    ? verifyGithubSignature(body, request.headers.get("x-hub-signature-256"), secret)
    : verifyGitlabToken(request.headers.get("x-gitlab-token"), secret);
}

/**
 * The forge's delivery id, or a digest of the body when there is none: every
 * authenticated delivery is recorded, so it counts against the budget and an
 * identical replay is applied once.
 */
function deliveryId(provider: RepoProvider, request: Request, body: Uint8Array): string {
  const value = request.headers.get(provider === "github" ? "x-github-delivery" : "x-gitlab-event-uuid");
  if (value && DELIVERY_ID.test(value)) return value;
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

function parse(provider: RepoProvider, request: Request, payload: unknown): ParsedWebhook {
  return provider === "github"
    ? parseGithubWebhook(request.headers.get("x-github-event"), payload)
    : parseGitlabWebhook(request.headers.get("x-gitlab-event"), payload);
}

export async function handleRepoWebhook(
  provider: RepoProvider,
  connectionId: string,
  request: Request,
): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) return tooLarge();
  const body = await readLimitedBody(request, MAX_WEBHOOK_BYTES);
  if (!body) return tooLarge();

  const connection = UUID.test(connectionId)
    ? await findWebhookConnection(connectionId.toLowerCase(), provider)
    : null;
  let secret = PLACEHOLDER_SECRET;
  if (connection) {
    try {
      secret = openSecret(connection.secretCiphertext, deploymentSecretBoxKey());
    } catch {
      await recordWebhookError(connection.id, "Secret illisible : régénérez-le.");
      verify(provider, request, body, PLACEHOLDER_SECRET);
      return refused();
    }
  }
  const authentic = verify(provider, request, body, secret);
  if (!connection || !authentic) {
    if (connection) {
      await recordWebhookError(
        connection.id,
        provider === "github" ? "Signature invalide." : "Jeton secret invalide.",
      );
    }
    return refused();
  }

  try {
    if (await countRecentDeliveries(connection.id, RATE_WINDOW_MS) >= WEBHOOK_RATE_LIMIT) {
      await recordWebhookError(connection.id, "Trop de livraisons : réessayez plus tard.");
      return json(429, { error: "rate_limited" });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    } catch {
      await recordWebhookError(connection.id, "Payload illisible : choisissez le format JSON.");
      return json(400, { error: "invalid_payload" });
    }

    let parsed: ParsedWebhook;
    try {
      parsed = parse(provider, request, payload);
    } catch (error) {
      if (!(error instanceof WebhookPayloadError)) throw error;
      await recordWebhookError(connection.id, "Payload inattendu pour cet événement.");
      return json(400, { error: "invalid_payload" });
    }

    const delivery = deliveryId(provider, request, body);
    if (parsed.type === "ping") {
      await recordWebhookEvent(connection.id, delivery);
      return json(200, { ok: true });
    }
    if (parsed.type === "ignored") {
      await recordWebhookEvent(connection.id, delivery);
      return json(202, { ok: true, ignored: true });
    }
    if (parsed.repositoryPath !== connection.repositoryPath) {
      await recordWebhookError(
        connection.id,
        `Dépôt inattendu : ${parsed.repositoryPath.slice(0, 200)} (connecté : ${connection.repositoryPath}).`,
      );
      return json(422, { error: "repository_mismatch" });
    }

    const result = await ingestWebhookReferences({
      connection,
      deliveryId: delivery,
      refs: parsed.refs,
    });
    return json(200, result.duplicate ? { ok: true, duplicate: true } : { ok: true, linked: result.linked });
  } catch (error) {
    // Never the payload nor the secret: the connection and the error kind only.
    console.error("repo webhook failed", { connectionId: connection.id, provider, error: error instanceof Error ? error.name : "unknown" });
    await recordWebhookError(connection.id, "Erreur interne lors du traitement.").catch(() => undefined);
    return json(500, { error: "internal_error" });
  }
}
