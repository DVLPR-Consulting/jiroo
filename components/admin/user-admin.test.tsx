import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUserAction: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/app/actions/users", () => ({
  createUserAction: mocks.createUserAction,
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

  it("affiche les comptes sans exposer le sélecteur de rôle legacy", () => {
    render(<UserAdmin users={users} currentUserId="admin-1" />);

    expect(screen.getByText("marie@example.test")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /rôle/i })).not.toBeInTheDocument();
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
    expect(screen.getByRole("alert")).toHaveTextContent("Cet e-mail est déjà utilisé.");
  });

  it("closes and announces success after creating a user", async () => {
    const user = userEvent.setup();
    mocks.createUserAction.mockResolvedValue({
      ok: true,
      user: { id: "user-3", name: "Alice Martin", email: "alice@example.test", role: "contributor" },
    });
    render(<UserAdmin users={users} currentUserId="admin-1" />);

    await user.click(screen.getByRole("button", { name: "Nouvel utilisateur" }));
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "Alice Martin");
    await user.type(screen.getByRole("textbox", { name: "E-mail" }), "alice@example.test");
    await user.type(screen.getByLabelText("Mot de passe initial"), "motdepasse123");
    expect(screen.queryByRole("combobox", { name: "Rôle initial" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Créer l’utilisateur" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Utilisateur créé.");
    expect(mocks.createUserAction).toHaveBeenCalledWith({
      name: "Alice Martin",
      email: "alice@example.test",
      password: "motdepasse123",
    });
  });
});
