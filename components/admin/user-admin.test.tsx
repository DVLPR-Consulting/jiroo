import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUserAction: vi.fn(),
  resetUserPasswordAction: vi.fn(),
  resetUserTwoFactorAction: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/app/actions/users", () => ({
  createUserAction: mocks.createUserAction,
  resetUserPasswordAction: mocks.resetUserPasswordAction,
  resetUserTwoFactorAction: mocks.resetUserTwoFactorAction,
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

describe("UserAdmin account recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderRecovery(canRecoverAccounts = true) {
    return render(
      <UserAdmin users={users} currentUserId="admin-1" canRecoverAccounts={canRecoverAccounts} />,
    );
  }

  it("hides recovery actions from administrators without Jiroo administration", () => {
    renderRecovery(false);

    expect(screen.queryByRole("button", { name: /Actions de compte/ })).not.toBeInTheDocument();
  });

  it("never offers recovery actions on the administrator's own row", () => {
    renderRecovery();

    expect(
      screen.queryByRole("button", { name: "Actions de compte pour Marie Lemaire" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Actions de compte pour Thomas Dubois" }),
    ).toBeVisible();
  });

  it("resets a password only after explicit confirmation", async () => {
    const user = userEvent.setup();
    mocks.resetUserPasswordAction.mockResolvedValue({ ok: true });
    renderRecovery();

    await user.click(screen.getByRole("button", { name: "Actions de compte pour Thomas Dubois" }));
    await user.click(screen.getByRole("menuitem", { name: "Réinitialiser le mot de passe" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Réinitialiser le mot de passe de Thomas Dubois ?",
    });
    expect(within(dialog).getByText(/Toutes ses sessions seront fermées/)).toBeVisible();
    const confirm = within(dialog).getByRole("button", { name: "Réinitialiser le mot de passe" });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Mot de passe temporaire"), "court");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Mot de passe temporaire"), "-provisoire");
    expect(mocks.resetUserPasswordAction).not.toHaveBeenCalled();
    await user.click(confirm);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.resetUserPasswordAction).toHaveBeenCalledWith({
      userId: "user-2",
      temporaryPassword: "court-provisoire",
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Mot de passe de Thomas Dubois réinitialisé. Ses sessions ont été fermées.",
    );
  });

  it("keeps the password dialog open with the server error", async () => {
    const user = userEvent.setup();
    mocks.resetUserPasswordAction.mockResolvedValue({
      ok: false,
      error: "Vous n’avez pas la permission « Administrer Jiroo ».",
    });
    renderRecovery();

    await user.click(screen.getByRole("button", { name: "Actions de compte pour Thomas Dubois" }));
    await user.click(screen.getByRole("menuitem", { name: "Réinitialiser le mot de passe" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Mot de passe temporaire"), "provisoire-1");
    await user.click(within(dialog).getByRole("button", { name: "Réinitialiser le mot de passe" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Vous n’avez pas la permission « Administrer Jiroo ».",
    );
    expect(dialog).toBeVisible();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("resets two-factor authentication after confirmation", async () => {
    const user = userEvent.setup();
    mocks.resetUserTwoFactorAction.mockResolvedValue({ ok: true });
    renderRecovery();

    await user.click(screen.getByRole("button", { name: "Actions de compte pour Thomas Dubois" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Réinitialiser la double authentification" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Réinitialiser la double authentification de Thomas Dubois ?",
    });
    expect(
      within(dialog).getByText(/devra configurer à nouveau la double authentification/),
    ).toBeVisible();
    expect(mocks.resetUserTwoFactorAction).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Réinitialiser la double authentification" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.resetUserTwoFactorAction).toHaveBeenCalledWith({ userId: "user-2" });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Double authentification de Thomas Dubois réinitialisée. Ses sessions ont été fermées.",
    );
  });

  it("can cancel the two-factor reset without calling the server", async () => {
    const user = userEvent.setup();
    renderRecovery();

    await user.click(screen.getByRole("button", { name: "Actions de compte pour Thomas Dubois" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Réinitialiser la double authentification" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.resetUserTwoFactorAction).not.toHaveBeenCalled();
  });

  it("shows the two-factor reset error inside the dialog", async () => {
    const user = userEvent.setup();
    mocks.resetUserTwoFactorAction.mockResolvedValue({
      ok: false,
      error: "Vous ne pouvez pas réinitialiser votre propre double authentification.",
    });
    renderRecovery();

    await user.click(screen.getByRole("button", { name: "Actions de compte pour Thomas Dubois" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Réinitialiser la double authentification" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Réinitialiser la double authentification" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Vous ne pouvez pas réinitialiser votre propre double authentification.",
    );
  });

  it("forgets the typed temporary password when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    renderRecovery();

    await user.click(screen.getByRole("button", { name: "Actions de compte pour Thomas Dubois" }));
    await user.click(screen.getByRole("menuitem", { name: "Réinitialiser le mot de passe" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Mot de passe temporaire"), "provisoire-1");
    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Actions de compte pour Thomas Dubois" }));
    await user.click(screen.getByRole("menuitem", { name: "Réinitialiser le mot de passe" }));
    const reopened = await screen.findByRole("dialog");
    expect(within(reopened).getByLabelText("Mot de passe temporaire")).toHaveValue("");
    expect(mocks.resetUserPasswordAction).not.toHaveBeenCalled();
  });
});
