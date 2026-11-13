import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  API_TOKEN_PREFIX,
  expiresAtFor,
  generateApiToken,
  hashApiToken,
  isApiTokenFormat,
  scopeAllows,
} from "@/lib/services/api-tokens";
import { createApiTokenSchema } from "@/lib/validation/api-token";

describe("api token secrets", () => {
  it("generates a prefixed base64url secret, its hash and its display prefix", () => {
    const first = generateApiToken();
    const second = generateApiToken();

    expect(first.token).toMatch(/^jiroo_pat_[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashApiToken(first.token));
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.prefix).toBe(first.token.slice(API_TOKEN_PREFIX.length, API_TOKEN_PREFIX.length + 8));
    expect(first.token).not.toContain(first.hash);
  });

  it("hashes deterministically and never stores the secret itself", () => {
    const { token, hash } = generateApiToken();
    expect(hashApiToken(token)).toBe(hash);
    expect(hashApiToken(`${token}x`)).not.toBe(hash);
  });

  it("recognises the token format before touching the database", () => {
    expect(isApiTokenFormat(generateApiToken().token)).toBe(true);
    expect(isApiTokenFormat("jiroo_pat_tooshort")).toBe(false);
    expect(isApiTokenFormat("Bearer jiroo_pat_x")).toBe(false);
    expect(isApiTokenFormat("")).toBe(false);
    expect(isApiTokenFormat(`${generateApiToken().token}\n`)).toBe(false);
  });

  it("lets write imply read and nothing else", () => {
    expect(scopeAllows("write", "read")).toBe(true);
    expect(scopeAllows("write", "write")).toBe(true);
    expect(scopeAllows("read", "read")).toBe(true);
    expect(scopeAllows("read", "write")).toBe(false);
  });

  it("computes the expiry from the chosen duration, or none", () => {
    const now = new Date("2026-11-12T21:00:00.000Z");
    expect(expiresAtFor(30, now)).toEqual(new Date("2026-12-12T21:00:00.000Z"));
    expect(expiresAtFor(365, now)).toEqual(new Date("2027-11-12T21:00:00.000Z"));
    expect(expiresAtFor(null, now)).toBeNull();
  });
});

describe("createApiTokenSchema", () => {
  it("trims the name and accepts the three durations or no expiry", () => {
    expect(createApiTokenSchema.parse({ name: "  Herdr  ", scope: "read", expiresInDays: 90 })).toEqual({
      name: "Herdr",
      scope: "read",
      expiresInDays: 90,
    });
    expect(createApiTokenSchema.parse({ name: "Lecture", scope: "read", expiresInDays: null }).expiresInDays).toBeNull();
    // A write token must expire (security audit, JIR-160).
    const forever = createApiTokenSchema.safeParse({ name: "Agents", scope: "write", expiresInDays: null });
    expect(forever.success).toBe(false);
    if (!forever.success) expect(forever.error.issues[0]?.message).toBe("Un jeton en lecture et écriture doit avoir une date d’expiration.");
    expect(createApiTokenSchema.parse({ name: "Agents", scope: "write", expiresInDays: 30 }).expiresInDays).toBe(30);
  });

  it("refuses an empty or too long name, an unknown scope and an arbitrary duration", () => {
    expect(createApiTokenSchema.safeParse({ name: "   ", scope: "read", expiresInDays: 30 }).success).toBe(false);
    expect(createApiTokenSchema.safeParse({ name: "x".repeat(61), scope: "read", expiresInDays: 30 }).success).toBe(false);
    expect(createApiTokenSchema.safeParse({ name: "ok", scope: "admin", expiresInDays: 30 }).success).toBe(false);
    expect(createApiTokenSchema.safeParse({ name: "ok", scope: "read", expiresInDays: 7 }).success).toBe(false);
    expect(createApiTokenSchema.safeParse({ name: "ok", scope: "read" }).success).toBe(false);
  });
});
