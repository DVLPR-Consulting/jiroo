import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const mocks = vi.hoisted(() => ({
  createApiToken: vi.fn(),
  getSession: vi.fn(),
  revokeApiToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/api-tokens", () => ({
  createApiToken: mocks.createApiToken,
  revokeApiToken: mocks.revokeApiToken,
  TOO_MANY_TOKENS_MESSAGE: "Vous avez déjà 50 jetons actifs : révoquez-en un avant d’en créer un autre.",
}));

import { createApiTokenAction, revokeApiTokenAction } from "@/app/actions/api-tokens";

const input = { name: "Herdr", scope: "read" as const, expiresInDays: 90 as const };
const row = { id: "token-1", name: "Herdr", tokenPrefix: "Ab3dEf9h", scope: "read" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1", twoFactorEnabled: true } });
  mocks.createApiToken.mockResolvedValue({ token: "jiroo_pat_secret", row });
  mocks.revokeApiToken.mockResolvedValue(true);
});

describe("createApiTokenAction", () => {
  it("creates the token for the signed-in user and returns the secret once", async () => {
    await expect(createApiTokenAction(input)).resolves.toEqual({ ok: true, token: "jiroo_pat_secret", row });
    expect(mocks.createApiToken).toHaveBeenCalledWith(input, "user-1");
  });

  it("refuses without a second-factor session and never reaches the service", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    await expect(createApiTokenAction(input)).resolves.toEqual({
      ok: false,
      error: "Votre session a expiré. Reconnectez-vous.",
    });
    expect(mocks.createApiToken).not.toHaveBeenCalled();
  });

  it("surfaces the first validation message and hides other failures", async () => {
    mocks.createApiToken.mockRejectedValueOnce(
      new ZodError([{ code: "too_small", minimum: 1, origin: "string", inclusive: true, path: ["name"], message: "Donnez un nom à ce jeton." }]),
    );
    await expect(createApiTokenAction({ ...input, name: "" })).resolves.toEqual({
      ok: false,
      error: "Donnez un nom à ce jeton.",
    });

    mocks.createApiToken.mockRejectedValueOnce(new Error("Vous avez déjà 50 jetons actifs : révoquez-en un avant d’en créer un autre."));
    await expect(createApiTokenAction(input)).resolves.toEqual({
      ok: false,
      error: "Vous avez déjà 50 jetons actifs : révoquez-en un avant d’en créer un autre.",
    });

    mocks.createApiToken.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await expect(createApiTokenAction(input)).resolves.toEqual({
      ok: false,
      error: "Création du jeton impossible. Réessayez.",
    });
  });
});

describe("revokeApiTokenAction", () => {
  it("revokes one of the user's tokens", async () => {
    await expect(revokeApiTokenAction({ id: "token-1" })).resolves.toEqual({ ok: true });
    expect(mocks.revokeApiToken).toHaveBeenCalledWith("token-1", "user-1");
  });

  it("reports a token that is not the user's or already gone", async () => {
    mocks.revokeApiToken.mockResolvedValueOnce(false);
    await expect(revokeApiTokenAction({ id: "token-9" })).resolves.toEqual({
      ok: false,
      error: "Ce jeton n’existe plus.",
    });
  });

  it("refuses without a session", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    await expect(revokeApiTokenAction({ id: "token-1" })).resolves.toMatchObject({ ok: false });
    expect(mocks.revokeApiToken).not.toHaveBeenCalled();
  });
});
