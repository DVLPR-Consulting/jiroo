import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), rename: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/app/actions/authorization", () => ({
  createGroupAction: mocks.create,
  renameGroupAction: mocks.rename,
  addGroupMemberAction: mocks.addMember,
  removeGroupMemberAction: mocks.removeMember,
  deleteGroupAction: mocks.remove,
}));
vi.mock("@/components/admin/global-permission-admin", () => ({
  GlobalPermissionAdmin: () => <p>Permissions globales</p>,
}));

import { GroupAdmin } from "@/components/admin/group-admin";
import { simulateExitAnimations } from "@/test/exit-animation";

const groups = [{
  id: "11111111-1111-4111-8111-111111111111",
  name: "Équipe produit",
  protected: false,
  memberCount: 1,
  members: [{ id: "u1", name: "Ada Lovelace" }],
  blockers: ["Utilisé par le rôle Membre dans DEMO"],
  membershipRequiresPlatformAdmin: false,
}];
const users = [
  { id: "u1", name: "Ada Lovelace", role: "contributor" as const },
  { id: "u2", name: "Lin Chen", role: "contributor" as const },
];

describe("GroupAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("affiche membres, blockers et libellé protégé", () => {
    render(<GroupAdmin groups={[...groups, { ...groups[0]!, id: "22222222-2222-4222-8222-222222222222", name: "Administrateurs de la plateforme", protected: true }]} users={users} globalGrants={[]} canAdministerGlobals={false} />);
    expect(screen.getAllByText("Ada Lovelace")[0]).toBeVisible();
    expect(screen.getAllByText("Utilisé par le rôle Membre dans DEMO")[0]).toBeVisible();
    expect(screen.getByText("Groupe protégé")).toBeVisible();
  });

  it("préserve le nom saisi et expose l’erreur pendant la création", async () => {
    const user = userEvent.setup();
    mocks.create.mockResolvedValue({ ok: false, error: "Les données saisies sont invalides." });
    render(<GroupAdmin groups={[]} users={users} globalGrants={[]} canAdministerGlobals={false} />);
    await user.type(screen.getByRole("textbox", { name: "Nom du nouveau groupe" }), "Produit");
    await user.click(screen.getByRole("button", { name: "Créer le groupe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Les données saisies sont invalides.");
    expect(screen.getByRole("textbox", { name: "Nom du nouveau groupe" })).toHaveValue("Produit");
  });

  it("ajoute et retire un membre puis confirme la suppression", async () => {
    const user = userEvent.setup();
    mocks.addMember.mockResolvedValue({ ok: true });
    mocks.removeMember.mockResolvedValue({ ok: true });
    mocks.remove.mockResolvedValue({ ok: true });
    render(<GroupAdmin groups={[{ ...groups[0]!, blockers: [] }]} users={users} globalGrants={[]} canAdministerGlobals={false} />);
    const section = screen.getByRole("region", { name: "Équipe produit" });
    await user.selectOptions(within(section).getByRole("combobox", { name: "Ajouter un membre" }), "u2");
    await user.click(within(section).getByRole("button", { name: "Ajouter Lin Chen" }));
    expect(mocks.addMember).toHaveBeenCalledWith({ groupId: groups[0]!.id, userId: "u2" });
    await user.click(within(section).getByRole("button", { name: "Retirer Ada Lovelace" }));
    expect(mocks.removeMember).toHaveBeenCalledWith({ groupId: groups[0]!.id, userId: "u1" });
    await user.click(within(section).getByRole("button", { name: "Supprimer le groupe" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer Équipe produit" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer la suppression" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ groupId: groups[0]!.id }));
  });

  it("annonce une erreur de suppression dans la modale qui reste active", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({
      ok: false,
      error: "Ce groupe est encore utilisé par un rôle de projet.",
    });
    render(<GroupAdmin groups={[{ ...groups[0]!, blockers: [] }]} users={users} globalGrants={[]} canAdministerGlobals={false} />);

    await user.click(screen.getByRole("button", { name: "Supprimer le groupe" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer Équipe produit" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer la suppression" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Ce groupe est encore utilisé par un rôle de projet.",
    );
    expect(dialog).toBeVisible();
  });

  it("masque les mutations de membres d’un groupe privilégié à un simple gestionnaire", () => {
    render(<GroupAdmin groups={[{
      ...groups[0]!,
      name: "Administrateurs de la plateforme",
      protected: true,
      membershipRequiresPlatformAdmin: true,
    }]} users={users} globalGrants={[]} canAdministerGlobals={false} />);
    const section = screen.getByRole("region", { name: "Administrateurs de la plateforme" });
    expect(within(section).queryByRole("button", { name: "Retirer Ada Lovelace" })).not.toBeInTheDocument();
    expect(within(section).queryByRole("combobox", { name: "Ajouter un membre" })).not.toBeInTheDocument();
  });

  it("cannot close the deletion confirmation while the request is pending", async () => {
    const user = userEvent.setup();
    let resolve!: (result: { ok: false; error: string }) => void;
    mocks.remove.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<GroupAdmin groups={[{ ...groups[0]!, blockers: [] }]} users={users} globalGrants={[]} canAdministerGlobals={false} />);

    await user.click(screen.getByRole("button", { name: "Supprimer le groupe" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer Équipe produit" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer la suppression" }));
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();

    resolve({ ok: false, error: "Ce groupe est encore utilisé par un rôle de projet." });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("encore utilisé");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirmer la suppression" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("keeps the group's title and blockers visible while the confirmation closes", async () => {
    const user = userEvent.setup();
    render(<GroupAdmin groups={groups} users={users} globalGrants={[]} canAdministerGlobals={false} />);
    await user.click(screen.getByRole("button", { name: "Supprimer le groupe" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer Équipe produit" });

    const restore = simulateExitAnimations();
    try {
      await user.keyboard("{Escape}");
      await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
      expect(dialog).toHaveTextContent("Supprimer Équipe produit");
      expect(dialog).toHaveTextContent("Utilisé par le rôle Membre dans DEMO");
    } finally {
      restore();
    }
  });

  it("keeps the deletion error visible while the confirmation closes", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({ ok: false, error: "Suppression refusée." });
    render(<GroupAdmin groups={[{ ...groups[0]!, blockers: [] }]} users={users} globalGrants={[]} canAdministerGlobals={false} />);
    await user.click(screen.getByRole("button", { name: "Supprimer le groupe" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer Équipe produit" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer la suppression" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Suppression refusée.");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirmer la suppression" })).toBeEnabled());

    const restore = simulateExitAnimations();
    try {
      await user.keyboard("{Escape}");
      await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
      expect(dialog).toHaveTextContent("Suppression refusée.");
    } finally {
      restore();
    }
  });

  it("opens a clean confirmation after an earlier deletion error", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({ ok: false, error: "Suppression refusée." });
    render(<GroupAdmin groups={[{ ...groups[0]!, blockers: [] }]} users={users} globalGrants={[]} canAdministerGlobals={false} />);
    await user.click(screen.getByRole("button", { name: "Supprimer le groupe" }));
    let dialog = screen.getByRole("dialog", { name: "Supprimer Équipe produit" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer la suppression" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Suppression refusée.");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirmer la suppression" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Supprimer le groupe" }));
    dialog = screen.getByRole("dialog", { name: "Supprimer Équipe produit" });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });
});
