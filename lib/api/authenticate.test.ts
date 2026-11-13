import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ authenticateApiToken: vi.fn() }));

vi.mock("@/lib/services/api-tokens", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/api-tokens")>()),
  authenticateApiToken: mocks.authenticateApiToken,
}));

import { authenticateBearer, bearerChallenge } from "@/lib/api/authenticate";

const principal = { actorId: "user-1", tokenId: "token-1", scope: "read" as const };
const secret = `jiroo_pat_${"a".repeat(43)}`;

function request(authorization?: string) {
  return new Request("https://jiroo.test/api/v1/backlogs", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticateApiToken.mockResolvedValue(principal);
});

describe("authenticateBearer", () => {
  it("resolves a bearer secret to its principal", async () => {
    const now = new Date("2026-11-12T21:00:00.000Z");
    await expect(authenticateBearer(request(`Bearer ${secret}`), now)).resolves.toEqual({ ok: true, principal });
    expect(mocks.authenticateApiToken).toHaveBeenCalledWith(secret, now);
  });

  it("accepts the scheme in any case and tolerates surrounding spaces", async () => {
    await expect(authenticateBearer(request(`  bearer   ${secret} `))).resolves.toEqual({ ok: true, principal });
    expect(mocks.authenticateApiToken).toHaveBeenCalledWith(secret, expect.any(Date));
  });

  it("reports a missing credential without touching the database", async () => {
    await expect(authenticateBearer(request())).resolves.toEqual({ ok: false, reason: "missing" });
    await expect(authenticateBearer(request(""))).resolves.toEqual({ ok: false, reason: "missing" });
    await expect(authenticateBearer(request("Basic dXNlcjpwYXNz"))).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(authenticateBearer(request("Bearer"))).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(authenticateBearer(request("Bearer not-a-jiroo-token"))).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(mocks.authenticateApiToken).not.toHaveBeenCalled();
  });

  it("reports an unknown, revoked or expired token as invalid", async () => {
    mocks.authenticateApiToken.mockResolvedValueOnce(null);
    await expect(authenticateBearer(request(`Bearer ${secret}`))).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("builds the WWW-Authenticate challenge for each failure", () => {
    expect(bearerChallenge("missing")).toBe('Bearer realm="jiroo"');
    expect(bearerChallenge("invalid")).toBe('Bearer realm="jiroo", error="invalid_token"');
  });
});
