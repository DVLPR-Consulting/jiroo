import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), clone: vi.fn() }));
vi.mock("@/app/actions/authorization", () => ({
  addSchemeGrantAction: mocks.add,
  removeSchemeGrantAction: mocks.remove,
  clonePermissionSchemeAction: mocks.clone,
}));

import { PermissionSchemeAdmin } from "@/components/admin/permission-scheme-admin";

const scheme = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Produit partagé",
  description: "Accès produit",
  protected: false,
  version: 7,
  usageCount: 2,
  affectedBacklogs: [
    { id: "b1", key: "DEMO", name: "Démonstration" },
    { id: "b2", key: "OPS", name: "Opérations" },
  ],
  grants: [
    { id: "22222222-2222-4222-8222-222222222222", permission: "browse_backlog" as const, permissionLabel: "Consulter le backlog", category: "Accès", principal: { type: "group" as const, id: "33333333-3333-4333-8333-333333333333", label: "Produit" } },
    { id: "44444444-4444-4444-8444-444444444444", permission: "add_comments" as const, permissionLabel: "Ajouter des commentaires", category: "Commentaires", principal: { type: "project_role" as const, id: "55555555-5555-4555-8555-555555555555", label: "Membre" } },
  ],
};

describe("PermissionSchemeAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ouvre directement le schéma ciblé par le lien de matrice", () => {
    render(<PermissionSchemeAdmin schemes={[scheme]} users={[]} groups={[]} roles={[]} initialSchemeId={scheme.id} />);
    expect(screen.getByRole("dialog", { name: "Matrice de Produit partagé" })).toBeVisible();
  });

  it("affiche version, usage, backlogs affectés et matrice groupée avec chips retirables", async () => {
    const user = userEvent.setup();
    render(<PermissionSchemeAdmin schemes={[scheme]} users={[]} groups={[]} roles={[]} />);
    expect(screen.getByText("Version 7")).toBeVisible();
    expect(screen.getByText("2 backlogs")).toBeVisible();
    expect(screen.getByText("Démonstration (DEMO)")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Modifier la matrice de Produit partagé" }));
    const dialog = screen.getByRole("dialog", { name: "Matrice de Produit partagé" });
    expect(within(dialog).getByRole("heading", { name: "Accès" })).toBeVisible();
    expect(within(dialog).getByRole("heading", { name: "Commentaires" })).toBeVisible();
    expect(within(dialog).getAllByText("Gérer les releases")[0]).toBeVisible();
    expect(within(dialog).getAllByText("Aucun grant").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: "Retirer Produit de Consulter le backlog" })).toBeVisible();
  });

  it("utilise type et recherche de principal pour ajouter un grant", async () => {
    const user = userEvent.setup();
    mocks.add.mockResolvedValue({
      ok: true,
      grant: {
        id: "77777777-7777-4777-8777-777777777777",
        permission: "edit_items",
        principalType: "user",
        version: 8,
      },
    });
    render(<PermissionSchemeAdmin schemes={[scheme]} users={[{ id: "u1", name: "Ada", email: "ada@test" }]} groups={[]} roles={[]} />);
    await user.click(screen.getByRole("button", { name: "Modifier la matrice de Produit partagé" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Type de principal" }), "user");
    await user.type(screen.getByRole("combobox", { name: "Rechercher un principal" }), "Ada");
    await user.selectOptions(screen.getByRole("combobox", { name: "Permission de backlog" }), "edit_items");
    await user.click(screen.getByRole("button", { name: "Ajouter le grant" }));
    const confirmation = screen.getByRole("dialog", { name: "Modifier un schéma partagé" });
    expect(within(confirmation).getByText("Démonstration (DEMO)")).toBeVisible();
    await user.click(within(confirmation).getByRole("button", { name: "Confirmer la modification" }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith({
      schemeId: scheme.id,
      permission: "edit_items",
      principal: { type: "user", userId: "u1" },
      expectedVersion: 7,
      expectedAffectedBacklogIds: ["b1", "b2"],
    }));
  });

  it("synchronise grants et version pour deux mutations successives", async () => {
    const user = userEvent.setup();
    const addedGrantId = "66666666-6666-4666-8666-666666666666";
    mocks.add.mockResolvedValue({
      ok: true,
      grant: { id: addedGrantId, permission: "edit_items", principalType: "user", version: 8 },
    });
    mocks.remove.mockResolvedValue({ ok: true, grant: { id: addedGrantId, version: 9 } });
    render(<PermissionSchemeAdmin schemes={[scheme]} users={[{ id: "u1", name: "Ada", email: "ada@test" }]} groups={[]} roles={[]} />);

    await user.click(screen.getByRole("button", { name: "Modifier la matrice de Produit partagé" }));
    await user.type(screen.getByRole("combobox", { name: "Rechercher un principal" }), "Ada");
    await user.selectOptions(screen.getByRole("combobox", { name: "Permission de backlog" }), "edit_items");
    await user.click(screen.getByRole("button", { name: "Ajouter le grant" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la modification" }));

    const addedChip = await screen.findByRole("button", { name: "Retirer Ada de Modifier les éléments" });
    expect(screen.getByText("Version 8")).toBeVisible();
    await user.click(addedChip);
    await user.click(screen.getByRole("button", { name: "Confirmer la modification" }));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({
      schemeId: scheme.id,
      grantId: addedGrantId,
      expectedVersion: 8,
      expectedAffectedBacklogIds: ["b1", "b2"],
    }));
    expect(await screen.findByText("Version 9")).toBeVisible();
  });

  it("retient le dialogue et affiche le message stale exact", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({ ok: false, error: "Ce schéma a été modifié. Rechargez la page." });
    render(<PermissionSchemeAdmin schemes={[scheme]} users={[]} groups={[]} roles={[]} />);
    await user.click(screen.getByRole("button", { name: "Modifier la matrice de Produit partagé" }));
    await user.click(screen.getByRole("button", { name: "Retirer Produit de Consulter le backlog" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la modification" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce schéma a été modifié. Rechargez la page.");
    expect(screen.getByRole("dialog", { name: "Matrice de Produit partagé" })).toBeVisible();
  });

  it("redemande confirmation avec l’ensemble courant après un remplacement à cardinalité constante", async () => {
    const user = userEvent.setup();
    const currentAffectedBacklogs = [
      scheme.affectedBacklogs[0]!,
      { id: "b3", key: "SUP", name: "Support" },
    ];
    mocks.remove
      .mockResolvedValueOnce({
        ok: false,
        confirmationRequired: true,
        affectedBacklogs: currentAffectedBacklogs,
      })
      .mockResolvedValueOnce({
        ok: true,
        grant: { id: scheme.grants[0]!.id, version: 8 },
      });
    render(<PermissionSchemeAdmin schemes={[scheme]} users={[]} groups={[]} roles={[]} />);
    await user.click(screen.getByRole("button", { name: "Modifier la matrice de Produit partagé" }));
    await user.click(screen.getByRole("button", { name: "Retirer Produit de Consulter le backlog" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la modification" }));

    const renewed = await screen.findByRole("dialog", { name: "Modifier un schéma partagé" });
    expect(within(renewed).getByText("Support (SUP)")).toBeVisible();
    expect(within(renewed).queryByText("Opérations (OPS)")).not.toBeInTheDocument();
    expect(mocks.remove).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedAffectedBacklogIds: ["b1", "b2"],
    }));

    await user.click(within(renewed).getByRole("button", { name: "Confirmer la modification" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedAffectedBacklogIds: ["b1", "b3"],
    })));
  });

  it("affiche et permet de retirer chaque grant de permission inconnue", async () => {
    const user = userEvent.setup();
    const invalidGrant = {
      id: "88888888-8888-4888-8888-888888888888",
      permission: "retired_permission",
      permissionLabel: "Permission inconnue",
      category: "Éléments",
      principal: { type: "group" as const, id: "33333333-3333-4333-8333-333333333333", label: "Produit" },
    };
    render(<PermissionSchemeAdmin schemes={[{ ...scheme, grants: [...scheme.grants, invalidGrant] }]} users={[]} groups={[]} roles={[]} />);
    await user.click(screen.getByRole("button", { name: "Modifier la matrice de Produit partagé" }));

    const invalidSection = screen.getByRole("region", { name: "Configuration invalide" });
    expect(within(invalidSection).getByText("retired_permission")).toBeVisible();
    expect(within(invalidSection).getByText("Produit")).toBeVisible();
    await user.click(within(invalidSection).getByRole("button", { name: "Retirer Produit de retired_permission" }));
    expect(screen.getByRole("dialog", { name: "Modifier un schéma partagé" })).toBeVisible();
  });

  it("clone le schéma en conservant les champs en cas d’erreur", async () => {
    const user = userEvent.setup();
    mocks.clone.mockResolvedValue({ ok: false, error: "Action impossible. Réessayez." });
    render(<PermissionSchemeAdmin schemes={[scheme]} users={[]} groups={[]} roles={[]} />);
    await user.click(screen.getByRole("button", { name: "Cloner Produit partagé" }));
    const dialog = screen.getByRole("dialog", { name: "Cloner le schéma" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Nom du clone" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Nom du clone" }), "Copie produit");
    await user.click(within(dialog).getByRole("button", { name: "Cloner" }));
    expect(await within(dialog).findByRole("alert")).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Nom du clone" })).toHaveValue("Copie produit");
  });
});
