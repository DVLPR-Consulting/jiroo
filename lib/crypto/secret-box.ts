import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encrypts secrets Jiroo must read back later (e.g. repository webhook
 * secrets, JIR-95): AES-256-GCM with a random 96-bit nonce, authenticated, in
 * a versioned text envelope `v1:<nonce>:<tag>:<ciphertext>` (base64url).
 *
 * The key is derived with HKDF-SHA256 from the deployment's
 * BETTER_AUTH_SECRET (the secret Better Auth already relies on to encrypt TOTP
 * secrets), under a purpose label of its own, so no new environment variable
 * is needed and the derived key is used for nothing else. Rotating
 * BETTER_AUTH_SECRET makes the stored secrets unreadable: they must then be
 * regenerated.
 */

const VERSION = "v1";
const KEY_INFO = "jiroo:secret-box:v1";
const MIN_MATERIAL_LENGTH = 32;
const UNREADABLE = "Secret illisible.";

export type SecretBoxKey = { readonly bytes: Buffer };

export function secretBoxKey(material: string | undefined): SecretBoxKey {
  if (!material || material.length < MIN_MATERIAL_LENGTH) {
    throw new Error("Clé de chiffrement absente.");
  }
  const bytes = Buffer.from(hkdfSync("sha256", material, "jiroo", KEY_INFO, 32));
  return { bytes };
}

/** The deployment key, from BETTER_AUTH_SECRET; throws when it is absent. */
export function deploymentSecretBoxKey(): SecretBoxKey {
  return secretBoxKey(process.env.BETTER_AUTH_SECRET);
}

export function sealSecret(plaintext: string, key: SecretBoxKey): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.bytes, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, nonce, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(":");
}

export function openSecret(envelope: string, key: SecretBoxKey): string {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error(UNREADABLE);
  const [, nonceText, tagText, ciphertextText] = parts as [string, string, string, string];
  const nonce = Buffer.from(nonceText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  const ciphertext = Buffer.from(ciphertextText, "base64url");
  if (nonce.length !== 12 || tag.length !== 16) throw new Error(UNREADABLE);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.bytes, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(UNREADABLE);
  }
}
