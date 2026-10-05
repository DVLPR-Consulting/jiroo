import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeOwnPasswordAction: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/app/actions/account", () => ({
  changeOwnPasswordAction: mocks.changeOwnPasswordAction,
}));
vi.mock("@/lib/toast", () => ({ toast: { success: mocks.toastSuccess } }));

import { ChangePasswordDialog } from "@/components/shell/change-password-dialog";

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Rouvrir</button>
      <ChangePasswordDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

async function fill(
  interaction: ReturnType<typeof userEvent.setup>,
  values: { current: string; next: string; confirmation: string },
) {
  const dialog = screen.getByRole("dialog", { name: "Changer mon mot de passe" });
  await interaction.type(within(dialog).getByLabelText("Mot de passe actuel"), values.current);
  await interaction.type(within(dialog).getByLabelText("Nouveau mot de passe"), values.next);
  await interaction.type(
    within(dialog).getByLabelText("Confirmer le nouveau mot de passe"),
    values.confirmation,
  );
  return dialog;
}

describe("ChangePasswordDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("changes the password, closes and announces that other sessions were closed", async () => {
    const interaction = userEvent.setup();
    mocks.changeOwnPasswordAction.mockResolvedValue({ ok: true });
    render(<Harness />);

    const dialog = await fill(interaction, {
      current: "ancien-mot",
      next: "nouveau-mot",
      confirmation: "nouveau-mot",
    });
    await interaction.click(within(dialog).getByRole("button", { name: "Changer le mot de passe" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.changeOwnPasswordAction).toHaveBeenCalledWith({
      currentPassword: "ancien-mot",
      newPassword: "nouveau-mot",
      confirmation: "nouveau-mot",
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Mot de passe modifié. Vos autres sessions ont été fermées.",
    );
  });

  it("explains a mismatch before calling the server", async () => {
    const interaction = userEvent.setup();
    render(<Harness />);

    const dialog = await fill(interaction, {
      current: "ancien-mot",
      next: "nouveau-mot",
      confirmation: "nouveau-mox",
    });

    expect(within(dialog).getByText("Les mots de passe ne correspondent pas.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Changer le mot de passe" })).toBeDisabled();
    expect(mocks.changeOwnPasswordAction).not.toHaveBeenCalled();
  });

  it("keeps the submit disabled while the new password is too short", async () => {
    const interaction = userEvent.setup();
    render(<Harness />);

    const dialog = await fill(interaction, { current: "ancien-mot", next: "court", confirmation: "court" });

    expect(within(dialog).getByText("8 caractères minimum.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Changer le mot de passe" })).toBeDisabled();
  });

  it("shows a wrong current password error and keeps the dialog open", async () => {
    const interaction = userEvent.setup();
    mocks.changeOwnPasswordAction.mockResolvedValue({
      ok: false,
      error: "Mot de passe actuel incorrect.",
    });
    render(<Harness />);

    const dialog = await fill(interaction, {
      current: "mauvais-mot",
      next: "nouveau-mot",
      confirmation: "nouveau-mot",
    });
    await interaction.click(within(dialog).getByRole("button", { name: "Changer le mot de passe" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Mot de passe actuel incorrect.",
    );
    expect(dialog).toBeVisible();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("clears every field when cancelled", async () => {
    const interaction = userEvent.setup();
    render(<Harness />);

    const dialog = await fill(interaction, {
      current: "ancien-mot",
      next: "nouveau-mot",
      confirmation: "nouveau-mot",
    });
    await interaction.click(within(dialog).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await interaction.click(screen.getByRole("button", { name: "Rouvrir" }));

    const reopened = await screen.findByRole("dialog", { name: "Changer mon mot de passe" });
    expect(within(reopened).getByLabelText("Mot de passe actuel")).toHaveValue("");
    expect(within(reopened).getByLabelText("Nouveau mot de passe")).toHaveValue("");
    expect(within(reopened).getByLabelText("Confirmer le nouveau mot de passe")).toHaveValue("");
  });
});
