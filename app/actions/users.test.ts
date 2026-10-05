import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  getSession: vi.fn(),
  requirePermission: vi.fn(),
  resetUserPassword: vi.fn(),
  resetUserTwoFactor: vi.fn(),
  revalidatePath: vi.fn(),
  setUserRole: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/authorization", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/account-recovery", () => ({
  AccountRecoveryError: class AccountRecoveryError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AccountRecoveryError";
    }
  },
  resetUserPassword: mocks.resetUserPassword,
  resetUserTwoFactor: mocks.resetUserTwoFactor,
}));
vi.mock("@/lib/services/users", () => ({
  createUser: mocks.createUser,
  setUserRole: mocks.setUserRole,
}));

import {
  createUserAction,
  resetUserPasswordAction,
  resetUserTwoFactorAction,
  setUserRoleAction,
} from "@/app/actions/users";
import { AccountRecoveryError } from "@/lib/services/account-recovery";

describe("user admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "admin-1", role: "admin", twoFactorEnabled: true },
    });
  });

  it.each([
    {
      name: "create",
      run: () =>
        createUserAction({
          email: "user@example.test",
          name: "User",
          password: "password-123",
        }),
      service: mocks.createUser,
    },
  ])("requires manage_users_groups before $name", async ({ run, service }) => {
    mocks.createUser.mockResolvedValue({ id: "user-2" });
    mocks.setUserRole.mockResolvedValue({ id: "user-2" });

    await run();

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId: "admin-1",
      permission: "manage_users_groups",
      scope: { type: "global" },
    });
    expect(mocks.requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      service.mock.invocationCallOrder[0]!,
    );
  });

  it("returns a structured user-administration permission denial", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      permissionDeniedError("manage_users_groups", { type: "global" }),
    );

    await expect(
      createUserAction({
        email: "user@example.test",
        name: "User",
        password: "password-123",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Gérer les utilisateurs et les groupes ».",
    });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("force contributor même si un appel forgé envoie le rôle bootstrap admin", async () => {
    mocks.createUser.mockResolvedValue({ id: "user-2", role: "contributor" });
    const forgedCreate = createUserAction as (input: { email: string; name: string; password: string; role: string }) => ReturnType<typeof createUserAction>;
    await forgedCreate({ email: "user@example.test", name: "User", password: "password-123", role: "admin" });
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "user@example.test",
      name: "User",
      password: "password-123",
      role: "contributor",
    });
  });

  it.each([
    "Cet e-mail est déjà utilisé.",
    "Adresse e-mail invalide.",
    "Le nom est requis.",
    "Le nom ne peut pas dépasser 80 caractères.",
    "Rôle invalide.",
    "Mot de passe : 8 caractères minimum.",
  ])("preserves the safe create-user error: %s", async (message) => {
    mocks.createUser.mockRejectedValue(new Error(message));

    await expect(
      createUserAction({ email: "x", name: "x", password: "x" }),
    ).resolves.toEqual({ ok: false, error: message });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps unknown create failures to a generic message", async () => {
    mocks.createUser.mockRejectedValue(new Error("database offline"));

    await expect(
      createUserAction({ email: "x", name: "x", password: "x" }),
    ).resolves.toEqual({ ok: false, error: "Action impossible." });
  });

  it("désactive l’ancienne frontière de rôle même pour un appel forgé vers admin", async () => {
    await expect(setUserRoleAction({ userId: "admin-1", role: "admin" })).resolves.toEqual({
      ok: false,
      error: "Les rôles de compte hérités ne peuvent plus être modifiés.",
    });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.setUserRole).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("account recovery actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "admin-1", role: "admin", twoFactorEnabled: true },
    });
  });

  it("rejects anonymous callers before touching the service", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(
      resetUserPasswordAction({ userId: "user-2", temporaryPassword: "temporaire-1" }),
    ).rejects.toThrow("Forbidden");
    await expect(resetUserTwoFactorAction({ userId: "user-2" })).rejects.toThrow("Forbidden");
    expect(mocks.resetUserPassword).not.toHaveBeenCalled();
    expect(mocks.resetUserTwoFactor).not.toHaveBeenCalled();
  });

  it("resets a password as the signed-in actor and only forwards the expected fields", async () => {
    mocks.resetUserPassword.mockResolvedValue({ revokedSessions: 2 });
    const forged = resetUserPasswordAction as (input: Record<string, string>) => ReturnType<
      typeof resetUserPasswordAction
    >;

    await expect(
      forged({ userId: "user-2", temporaryPassword: "temporaire-1", actorId: "someone-else" }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.resetUserPassword).toHaveBeenCalledWith(
      { userId: "user-2", temporaryPassword: "temporaire-1" },
      "admin-1",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("resets two-factor authentication as the signed-in actor", async () => {
    mocks.resetUserTwoFactor.mockResolvedValue({ revokedSessions: 1 });

    await expect(resetUserTwoFactorAction({ userId: "user-2" })).resolves.toEqual({ ok: true });
    expect(mocks.resetUserTwoFactor).toHaveBeenCalledWith({ userId: "user-2" }, "admin-1");
  });

  it("maps a non-administrator denial to the French permission message", async () => {
    mocks.resetUserTwoFactor.mockRejectedValue(
      permissionDeniedError("administer_jiroo", { type: "global" }),
    );

    await expect(resetUserTwoFactorAction({ userId: "user-2" })).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Administrer Jiroo ».",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces the self-reset guard message", async () => {
    mocks.resetUserTwoFactor.mockRejectedValue(
      new AccountRecoveryError(
        "Vous ne pouvez pas réinitialiser votre propre double authentification.",
      ),
    );

    await expect(resetUserTwoFactorAction({ userId: "admin-1" })).resolves.toEqual({
      ok: false,
      error: "Vous ne pouvez pas réinitialiser votre propre double authentification.",
    });
  });

  it("hides unexpected failures behind a generic message", async () => {
    mocks.resetUserPassword.mockRejectedValue(new Error("connection refused: secret details"));

    await expect(
      resetUserPasswordAction({ userId: "user-2", temporaryPassword: "temporaire-1" }),
    ).resolves.toEqual({ ok: false, error: "Action impossible." });
  });
});
