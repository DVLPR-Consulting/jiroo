import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assign: vi.fn(), remove: vi.fn(), associate: vi.fn(), mode: vi.fn() }));
vi.mock("@/app/actions/authorization", () => ({
  assignBacklogRoleActorAction: mocks.assign,
  removeBacklogRoleActorAction: mocks.remove,
  associatePermissionSchemeAction: mocks.associate,
  setBacklogAccessModeAction: mocks.mode,
}));
vi.mock("next/link", () => ({ default: (props: React.ComponentProps<"a">) => <a {...props} /> }));

import { AccessAdmin } from "@/components/admin/access-admin";

const base = {
  access: {
    backlog: { id: "11111111-1111-4111-8111-111111111111", key: "DEMO", name: "Démonstration" },
    scheme: { id: "22222222-2222-4222-8222-222222222222", name: "Schéma DEMO", version: 4 },
    mode: "simple" as const,
    roles: [
      { id: "33333333-3333-4333-8333-333333333333", key: "administrators", name: "Administrateur", description: null, protected: true, occupants: [{ actorId: "a1", principal: { type: "user" as const, id: "u1", label: "Ada", email: "ada@test" }, removalBlocked: true }] },
      { id: "44444444-4444-4444-8444-444444444444", key: "members", name: "Membre", description: null, protected: true, occupants: [{ actorId: "a2", principal: { type: "group" as const, id: "55555555-5555-4555-8555-555555555555", label: "Produit" }, removalBlocked: false }] },
      { id: "66666666-6666-4666-8666-666666666666", key: "viewers", name: "Lecteur", description: null, protected: true, occupants: [] },
    ],
  },
  users: [{ id: "u1", name: "Ada", email: "ada@test" }, { id: "u2", name: "Lin", email: "lin@test" }],
  groups: [{ id: "55555555-5555-4555-8555-555555555555", name: "Produit" }],
  schemes: [{ id: "22222222-2222-4222-8222-222222222222", name: "Schéma DEMO", version: 4, usageCount: 1 }],
  canManageMembers: true,
  canAdministerBacklog: true,
};

describe("AccessAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rend le mode Simple avec lignes utilisateur/groupe et rôles protégés", () => {
    render(<AccessAdmin {...base} />);
    expect(screen.getByRole("heading", { name: "Accès simple" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Rôle de Produit" })).toHaveValue(base.access.roles[1]!.id);
    const lastAdmin = screen.getByRole("combobox", { name: "Rôle de Ada" });
    expect(lastAdmin).toBeDisabled();
    expect(screen.getByText("Le dernier administrateur effectif du backlog ne peut pas être retiré.")).toBeVisible();
  });

  it("ajoute un utilisateur directement à un rôle protégé en mode Simple", async () => {
    const user = userEvent.setup();
    mocks.assign.mockResolvedValue({ ok: true });
    render(<AccessAdmin {...base} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Ajouter un utilisateur ou groupe" }), "user:u2");
    await user.selectOptions(screen.getByRole("combobox", { name: "Rôle initial" }), base.access.roles[2]!.id);
    await user.click(screen.getByRole("button", { name: "Ajouter à l’accès simple" }));
    expect(mocks.assign).toHaveBeenCalledWith({
      backlogId: base.access.backlog.id,
      projectRoleId: base.access.roles[2]!.id,
      principal: { type: "user", userId: "u2" },
    });
  });

  it("passe en avancé et expose occupants, schéma, changement et lien matrice", async () => {
    const user = userEvent.setup();
    mocks.mode.mockResolvedValue({ ok: true });
    render(<AccessAdmin {...base} />);
    await user.click(screen.getByRole("button", { name: "Mode Avancé" }));
    expect(mocks.mode).toHaveBeenCalledWith({ backlogId: base.access.backlog.id, mode: "advanced" });

    expect(screen.getByRole("heading", { name: "Accès avancé" })).toBeVisible();
    expect(screen.getByText("Produit")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ouvrir la matrice" })).toHaveAttribute("href", `/admin?tab=schemes&scheme=${base.access.scheme.id}`);
    expect(screen.getByRole("combobox", { name: "Schéma de permissions" })).toHaveValue(base.access.scheme.id);
  });

  it("liste le blocker exact quand le retour Simple échoue", async () => {
    const user = userEvent.setup();
    mocks.mode.mockResolvedValue({ ok: false, error: "Le mode Simple est indisponible : ce schéma est partagé." });
    render(<AccessAdmin {...base} access={{ ...base.access, mode: "advanced" }} />);
    await user.click(screen.getByRole("button", { name: "Mode Simple" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Le mode Simple est indisponible : ce schéma est partagé.");
  });

  it("désactive le retrait du dernier administrateur avec explication accessible", () => {
    render(<AccessAdmin {...base} access={{ ...base.access, mode: "advanced" }} />);
    const adminRegion = screen.getByRole("region", { name: "Administrateur" });
    const button = within(adminRegion).getByRole("button", { name: "Retirer Ada" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Le dernier administrateur effectif du backlog ne peut pas être retiré.");
  });
});
