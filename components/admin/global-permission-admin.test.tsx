import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn() }));
vi.mock("@/app/actions/authorization", () => ({
  addGlobalPermissionGrantAction: mocks.add,
  removeGlobalPermissionGrantAction: mocks.remove,
}));

import { GlobalPermissionAdmin } from "@/components/admin/global-permission-admin";

const grants = [{
  id: "11111111-1111-4111-8111-111111111111",
  permission: "administer_jiroo" as const,
  permissionLabel: "Administrer Jiroo",
  principal: { type: "group" as const, id: "22222222-2222-4222-8222-222222222222", label: "Administrateurs" },
}];

describe("GlobalPermissionAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rend les grants en lecture seule sans contrôle d’écriture pour manage_users_groups seul", () => {
    render(<GlobalPermissionAdmin grants={grants} users={[]} groups={[]} canManage={false} />);
    expect(screen.getByText("Administrer Jiroo")).toBeVisible();
    expect(screen.getByText("Administrateurs")).toBeVisible();
    expect(screen.queryByRole("button", { name: /ajouter|retirer/i })).not.toBeInTheDocument();
  });

  it("ajoute un grant utilisateur et conserve les champs sur erreur", async () => {
    const user = userEvent.setup();
    mocks.add.mockResolvedValue({ ok: false, error: "Action impossible. Réessayez." });
    render(<GlobalPermissionAdmin grants={[]} users={[{ id: "u1", name: "Ada" }]} groups={[]} canManage />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Permission globale" }), "browse_users");
    await user.selectOptions(screen.getByRole("combobox", { name: "Type de principal" }), "user");
    await user.selectOptions(screen.getByRole("combobox", { name: "Principal" }), "u1");
    await user.click(screen.getByRole("button", { name: "Ajouter la permission" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Action impossible. Réessayez.");
    expect(screen.getByRole("combobox", { name: "Principal" })).toHaveValue("u1");
  });

  it("demande confirmation avant de retirer un grant", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({ ok: true });
    render(<GlobalPermissionAdmin grants={grants} users={[]} groups={[]} canManage />);
    await user.click(screen.getByRole("button", { name: "Retirer Administrer Jiroo pour Administrateurs" }));
    const dialog = screen.getByRole("dialog", { name: "Retirer la permission globale" });
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Confirmer le retrait" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ grantId: grants[0]!.id }));
  });
  it("n’affiche pas une erreur d’ajout dans la confirmation de retrait", async () => {
    const user = userEvent.setup();
    mocks.add.mockResolvedValue({ ok: false, error: "Ajout refusé." });
    render(<GlobalPermissionAdmin grants={grants} users={[{ id: "u1", name: "Ada" }]} groups={[]} canManage />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Principal" }), "u1");
    await user.click(screen.getByRole("button", { name: "Ajouter la permission" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ajout refusé.");

    await user.click(screen.getByRole("button", { name: "Retirer Administrer Jiroo pour Administrateurs" }));
    const dialog = screen.getByRole("dialog", { name: "Retirer la permission globale" });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("efface l’erreur de retrait précédente à la réouverture et ne la reporte pas sur le formulaire", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({ ok: false, error: "Retrait refusé." });
    render(<GlobalPermissionAdmin grants={grants} users={[{ id: "u1", name: "Ada" }]} groups={[]} canManage />);
    const trigger = screen.getByRole("button", { name: "Retirer Administrer Jiroo pour Administrateurs" });
    await user.click(trigger);
    let dialog = screen.getByRole("dialog", { name: "Retirer la permission globale" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer le retrait" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Retrait refusé.");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(trigger);
    dialog = screen.getByRole("dialog", { name: "Retirer la permission globale" });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("garde la confirmation de retrait ouverte pendant la requête", async () => {
    const user = userEvent.setup();
    let resolve!: (value: { ok: true }) => void;
    mocks.remove.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<GlobalPermissionAdmin grants={grants} users={[]} groups={[]} canManage />);
    await user.click(screen.getByRole("button", { name: "Retirer Administrer Jiroo pour Administrateurs" }));
    const dialog = screen.getByRole("dialog", { name: "Retirer la permission globale" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer le retrait" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Retirer la permission globale" })).toBeInTheDocument();
    resolve({ ok: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
