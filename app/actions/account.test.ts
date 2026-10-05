import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  forwardAuthCookies: vi.fn(),
  getSession: vi.fn(),
  headers: vi.fn(),
  revokePendingSignIns: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth", () => ({ auth: { api: { changePassword: mocks.changePassword } } }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({ db: { marker: "db" } }));
vi.mock("@/lib/auth/pending-authentication", () => ({
  revokePendingSignIns: mocks.revokePendingSignIns,
}));
vi.mock("@/lib/auth/forward-auth-cookies", () => ({
  forwardAuthCookies: mocks.forwardAuthCookies,
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
  });

  it("changes the password through Better Auth and revokes the other sessions", async () => {
    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({ ok: true });

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
    // Challenges opened with the old password must not complete afterwards.
    expect(mocks.revokePendingSignIns).toHaveBeenCalledWith({ marker: "db" }, "user-1");
    expect(mocks.revokePendingSignIns.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.changePassword.mock.invocationCallOrder[0]!,
    );
  });

  it("requires a fully authenticated session", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Votre session a expiré. Reconnectez-vous.",
    });
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...valid, newPassword: "court", confirmation: "court" }, "Mot de passe : 8 caractères minimum."],
    [{ ...valid, confirmation: "different" }, "Les mots de passe ne correspondent pas."],
    [{ ...valid, currentPassword: "" }, "Le mot de passe actuel est requis."],
  ])("validates before calling Better Auth (%#)", async (input, error) => {
    await expect(changeOwnPasswordAction(input)).resolves.toEqual({ ok: false, error });
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("reports a wrong current password in French", async () => {
    mocks.changePassword.mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "INVALID_PASSWORD", message: "Invalid password" }),
    );

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Mot de passe actuel incorrect.",
    });
    expect(mocks.forwardAuthCookies).not.toHaveBeenCalled();
    expect(mocks.revokePendingSignIns).not.toHaveBeenCalled();
  });

  it("hides unexpected failures behind a generic message", async () => {
    mocks.changePassword.mockRejectedValue(new Error("database offline"));

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Impossible de modifier le mot de passe. Réessayez.",
    });
  });

  it("tells the user to sign in again when the rotated session cookie cannot be written", async () => {
    mocks.forwardAuthCookies.mockRejectedValue(new Error("cookies are read-only here"));

    await expect(changeOwnPasswordAction(valid)).resolves.toEqual({
      ok: false,
      error: "Mot de passe modifié. Reconnectez-vous avec le nouveau.",
    });
  });
});
