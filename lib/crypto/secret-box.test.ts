import { describe, expect, it } from "vitest";
import { openSecret, sealSecret, secretBoxKey } from "@/lib/crypto/secret-box";

const MATERIAL = "a-test-only-key-material-of-sufficient-length-0123456789";

describe("secret box", () => {
  it("round-trips a secret through an opaque versioned envelope", () => {
    const key = secretBoxKey(MATERIAL);
    const envelope = sealSecret("whsec_example", key);

    expect(envelope).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(envelope).not.toContain("whsec_example");
    expect(openSecret(envelope, key)).toBe("whsec_example");
  });

  it("uses a fresh nonce for every seal", () => {
    const key = secretBoxKey(MATERIAL);
    expect(sealSecret("same", key)).not.toBe(sealSecret("same", key));
  });

  it("refuses an envelope sealed with another key", () => {
    const envelope = sealSecret("secret", secretBoxKey(MATERIAL));
    expect(() => openSecret(envelope, secretBoxKey(`${MATERIAL}-other`))).toThrow(
      "Secret illisible.",
    );
  });

  it("refuses a tampered envelope", () => {
    const key = secretBoxKey(MATERIAL);
    const [version, iv, tag, ciphertext] = sealSecret("secret", key).split(":");
    const flipped = `${ciphertext!.startsWith("A") ? "B" : "A"}${ciphertext!.slice(1)}`;
    expect(() => openSecret([version, iv, tag, flipped].join(":"), key)).toThrow(
      "Secret illisible.",
    );
  });

  it("refuses malformed envelopes and unknown versions", () => {
    const key = secretBoxKey(MATERIAL);
    for (const envelope of ["", "v1:abc", "v2:a:b:c", "plain-text-secret"]) {
      expect(() => openSecret(envelope, key)).toThrow("Secret illisible.");
    }
  });

  it("refuses missing or short key material", () => {
    expect(() => secretBoxKey(undefined)).toThrow("Clé de chiffrement absente.");
    expect(() => secretBoxKey("short")).toThrow("Clé de chiffrement absente.");
  });
});
