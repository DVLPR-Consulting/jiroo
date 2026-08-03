import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUserAction: vi.fn(),
  setUserRoleAction: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/app/actions/users", () => ({
  createUserAction: mocks.createUserAction,
  setUserRoleAction: mocks.setUserRoleAction,
}));
vi.mock("@/lib/toast", () => ({ toast: { success: mocks.toastSuccess } }));

import { UserAdmin } from "@/components/admin/user-admin";

const users = [
  {
    id: "admin-1",
    name: "Marie Lemaire",
    email: "marie@example.test",
    role: "admin" as const,
  },
  {
    id: "user-2",
    name: "Thomas Dubois",
    email: "thomas@example.test",
    role: "contributor" as const,
  },
];

describe("UserAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders users and prevents the current admin from changing their own role", () => {
    render(<UserAdmin users={users} currentUserId="admin-1" />);

    expect(screen.getByText("marie@example.test")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /rôle de Marie/i })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /rôle de Thomas/i })).toBeEnabled();
  });

  it("persists another user's selected role", async () => {
    const user = userEvent.setup();
    mocks.setUserRoleAction.mockResolvedValue({ ok: true });
    render(<UserAdmin users={users} currentUserId="admin-1" />);

    await user.selectOptions(screen.getByRole("combobox", { name: /rôle de Thomas/i }), "viewer");

    await waitFor(() =>
      expect(mocks.setUserRoleAction).toHaveBeenCalledWith({
        userId: "user-2",
        role: "viewer",
      }),
    );
  });

  it("restores the old role and shows the action error on failure", async () => {
    const user = userEvent.setup();
    mocks.setUserRoleAction.mockResolvedValue({ ok: false, error: "Utilisateur introuvable." });
    render(<UserAdmin users={users} currentUserId="admin-1" />);
    const select = screen.getByRole("combobox", { name: /rôle de Thomas/i });

    await user.selectOptions(select, "viewer");

    expect(await screen.findByText("Utilisateur introuvable.")).toBeVisible();
    expect(select).toHaveValue("contributor");
  });

  it("keeps create fields and the dialog open on failure", async () => {
    const user = userEvent.setup();
    mocks.createUserAction.mockResolvedValue({ ok: false, error: "Cet e-mail est déjà utilisé." });
    render(<UserAdmin users={users} currentUserId="admin-1" />);

    await user.click(screen.getByRole("button", { name: "Nouvel utilisateur" }));
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "Alice Martin");
    await user.type(screen.getByRole("textbox", { name: "E-mail" }), "alice@example.test");
    await user.type(screen.getByLabelText("Mot de passe initial"), "motdepasse123");
    await user.click(screen.getByRole("button", { name: "Créer l’utilisateur" }));

    expect(await screen.findByText("Cet e-mail est déjà utilisé.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveValue("Alice Martin");
    expect(screen.getByRole("textbox", { name: "E-mail" })).toHaveValue("alice@example.test");
  });

  it("closes and announces success after creating a user", async () => {
    const user = userEvent.setup();
    mocks.createUserAction.mockResolvedValue({
      ok: true,
      user: { id: "user-3", name: "Alice Martin", email: "alice@example.test", role: "viewer" },
    });
    render(<UserAdmin users={users} currentUserId="admin-1" />);

    await user.click(screen.getByRole("button", { name: "Nouvel utilisateur" }));
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "Alice Martin");
    await user.type(screen.getByRole("textbox", { name: "E-mail" }), "alice@example.test");
    await user.type(screen.getByLabelText("Mot de passe initial"), "motdepasse123");
    await user.selectOptions(screen.getByRole("combobox", { name: "Rôle initial" }), "viewer");
    await user.click(screen.getByRole("button", { name: "Créer l’utilisateur" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Utilisateur créé.");
  });
});
