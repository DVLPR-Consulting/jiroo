import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook authentication (JIR-95). Both checks compare in constant time and
 * answer a plain boolean: the caller refuses every failure the same way.
 */

const GITHUB_SIGNATURE = /^sha256=([0-9a-f]{64})$/i;

/** The `X-Hub-Signature-256` value GitHub sends for this raw body. */
export function signGithubPayload(rawBody: Uint8Array, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/**
 * GitHub: `X-Hub-Signature-256` is `sha256=` + the hex HMAC-SHA256 of the
 * exact raw body, keyed with the webhook secret.
 */
export function verifyGithubSignature(
  rawBody: Uint8Array,
  header: string | null | undefined,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const match = header ? GITHUB_SIGNATURE.exec(header.trim()) : null;
  // Compare against a same-length placeholder when the header is malformed,
  // so the work done does not depend on what was sent.
  const received = match ? Buffer.from(match[1]!, "hex") : Buffer.alloc(expected.length);
  return timingSafeEqual(received, expected) && match !== null;
}

/**
 * GitLab: `X-Gitlab-Token` carries the secret token itself. Both sides are
 * hashed first so the comparison takes the same time whatever the length.
 */
export function verifyGitlabToken(header: string | null | undefined, secret: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  const received = digest(header ?? "");
  return timingSafeEqual(received, digest(secret)) && typeof header === "string" && header.length > 0;
}
