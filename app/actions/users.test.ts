import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  getSession: vi.fn(),
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  setUserRole: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/users", () => ({
  createUser: mocks.createUser,
  setUserRole: mocks.setUserRole,
}));

import { createUserAction, setUserRoleAction } from "@/app/actions/users";

describe("user admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "admin-1", role: "admin", twoFactorEnabled: true },
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
      createUserAction({ email: "x", name: "x", role: "x", password: "x" }),
    ).resolves.toEqual({ ok: false, error: message });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps unknown create failures to a generic message", async () => {
    mocks.createUser.mockRejectedValue(new Error("database offline"));

    await expect(
      createUserAction({ email: "x", name: "x", role: "x", password: "x" }),
    ).resolves.toEqual({ ok: false, error: "Action impossible." });
  });

  it.each(["L’utilisateur est requis.", "Rôle invalide.", "Utilisateur introuvable."])(
    "preserves the safe role error: %s",
    async (message) => {
      mocks.setUserRole.mockRejectedValue(new Error(message));

      await expect(setUserRoleAction({ userId: "user-2", role: "viewer" })).resolves.toEqual({
        ok: false,
        error: message,
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("prevents self-demotion before touching persistence", async () => {
    await expect(setUserRoleAction({ userId: "admin-1", role: "viewer" })).resolves.toEqual({
      ok: false,
      error: "Vous ne pouvez pas retirer votre propre rôle administrateur.",
    });
    expect(mocks.setUserRole).not.toHaveBeenCalled();
  });

  it("revalidates only the admin route after success", async () => {
    mocks.setUserRole.mockResolvedValue({ id: "user-2", role: "viewer" });

    await expect(setUserRoleAction({ userId: "user-2", role: "viewer" })).resolves.toEqual({
      ok: true,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });
});
