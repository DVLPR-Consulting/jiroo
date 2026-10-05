import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  changeOwnPasswordWithBudget: vi.fn(),
  forwardAuthCookies: vi.fn(),
  getSession: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth", () => ({ auth: { api: { changePassword: mocks.changePassword } } }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/auth/forward-auth-cookies", () => ({
  forwardAuthCookies: mocks.forwardAuthCookies,
}));
vi.mock("@/lib/services/password-change", () => ({
  changeOwnPasswordWithBudget: mocks.changeOwnPasswordWithBudget,
}));

import { APIError } from "better-auth/api";
import { changeOwnPasswordAction } from "@/app/actions/account";

const valid = {
  currentPassword: "ancien-mot",
  newPassword: "nouveau-mot",
  confirmation: "nouveau-mot",
};

describe("changeOwnPasswordAction", () => {
  const requestHeaders = new Headers({ cookie: "better-auth.session_token=abc" });
  const responseHeaders = new Headers({ "set-cookie": "better-auth.session_token=new; Path=/" });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1", twoFactorEnabled: true } });
    mocks.headers.mockResolvedValue(requestHeaders);
    mocks.changePassword.mockResolvedValue({ headers: responseHeaders, response: { token: "new" } });
    // Default: the budget allows the attempt and reports its outcome.
    mocks.changeOwnPasswordWithBudget.mockImplementation(
      async (_userId: string, attempt: () => Promise<string>) => attempt(),
    );
  });

  it("changes the password through Better Auth inside the user's attempt budget", async () => {
    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({ ok: true });

    expect(mocks.changeOwnPasswordWithBudget).toHaveBeenCalledWith("user-1", expect.any(Function));
    expect(mocks.changePassword).toHaveBeenCalledWith({
      body: {
        currentPassword: "ancien-mot",
        newPassword: "nouveau-mot",
        revokeOtherSessions: true,
      },
      headers: requestHeaders,
      returnHeaders: true,
    });
    // Better Auth rotates the current session too; its new cookie must reach the browser.
    expect(mocks.forwardAuthCookies).toHaveBeenCalledWith(responseHeaders);
  });

  it("refuses without calling Better Auth when the budget is spent", async () => {
    mocks.changeOwnPasswordWithBudget.mockResolvedValue("rate_limited");

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
    });
    expect(mocks.changePassword).not.toHaveBeenCalled();
    expect(mocks.forwardAuthCookies).not.toHaveBeenCalled();
  });

  it("requires a fully authenticated session", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Votre session a expiré. Reconnectez-vous.",
    });
    expect(mocks.changeOwnPasswordWithBudget).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...valid, newPassword: "court", confirmation: "court" }, "Mot de passe : 8 caractères minimum."],
    [{ ...valid, confirmation: "different" }, "Les mots de passe ne correspondent pas."],
    [{ ...valid, currentPassword: "" }, "Le mot de passe actuel est requis."],
  ])("validates before spending budget or calling Better Auth (%#)", async (input, error) => {
    await expect(changeOwnPasswordAction(input)).resolves.toEqual({ ok: false, error });
    expect(mocks.changeOwnPasswordWithBudget).not.toHaveBeenCalled();
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("reports a wrong current password as a counted failure", async () => {
    mocks.changePassword.mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "INVALID_PASSWORD", message: "Invalid password" }),
    );
    let outcome: unknown;
    mocks.changeOwnPasswordWithBudget.mockImplementation(
      async (_userId: string, attempt: () => Promise<string>) => (outcome = await attempt()),
    );

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Mot de passe actuel incorrect.",
    });
    expect(outcome).toBe("wrong_password");
    expect(mocks.forwardAuthCookies).not.toHaveBeenCalled();
  });

  it("lets unexpected errors reach the budget, which keeps the attempt counted", async () => {
    mocks.changePassword.mockRejectedValue(new Error("database offline"));
    let thrown: unknown;
    mocks.changeOwnPasswordWithBudget.mockImplementation(
      async (_userId: string, attempt: () => Promise<string>) => {
        try {
          return await attempt();
        } catch (error) {
          thrown = error;
          throw error;
        }
      },
    );

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Impossible de modifier le mot de passe. Réessayez.",
    });
    expect(thrown).toBeInstanceOf(Error);
  });

  it("hides other Better Auth failures without counting them as guesses", async () => {
    mocks.changePassword.mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "CREDENTIAL_ACCOUNT_NOT_FOUND", message: "x" }),
    );
    let outcome: unknown;
    mocks.changeOwnPasswordWithBudget.mockImplementation(
      async (_userId: string, attempt: () => Promise<string>) => (outcome = await attempt()),
    );

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Impossible de modifier le mot de passe. Réessayez.",
    });
    expect(outcome).toBe("failed");
  });

  it("tells the user to sign in again when the rotated session cookie cannot be written", async () => {
    mocks.forwardAuthCookies.mockRejectedValue(new Error("cookies are read-only here"));

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Mot de passe modifié. Reconnectez-vous avec le nouveau.",
    });
  });

  it("does not forward the new session when finalizing the change fails", async () => {
    mocks.changeOwnPasswordWithBudget.mockImplementation(
      async (_userId: string, attempt: () => Promise<string>) => {
        await attempt();
        throw new Error("audit insert failed");
      },
    );

    // Pending challenges may not be revoked: keep this browser signed out too.
    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Mot de passe modifié. Reconnectez-vous avec le nouveau.",
    });
    expect(mocks.forwardAuthCookies).not.toHaveBeenCalled();
  });

  it("maps a budget failure before any change to a generic message", async () => {
    mocks.changeOwnPasswordWithBudget.mockRejectedValue(new Error("lock timeout"));

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Impossible de modifier le mot de passe. Réessayez.",
    });
  });
});
