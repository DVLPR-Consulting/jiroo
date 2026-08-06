import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/app/actions/authorization", () => ({
  createProjectRoleAction: mocks.create,
  updateProjectRoleAction: mocks.update,
  deleteProjectRoleAction: mocks.remove,
}));

import { ProjectRoleAdmin } from "@/components/admin/project-role-admin";

const role = {
  id: "11111111-1111-4111-8111-111111111111", key: "delivery", name: "Delivery",
  description: "Pilote les livraisons", protected: false, occupancyCount: 2,
  blockers: ["2 affectations de backlog", "1 autorisation de schéma"],
};

describe("ProjectRoleAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("affiche descriptions, usages, protections et blockers", () => {
    render(<ProjectRoleAdmin roles={[role, { ...role, id: "22222222-2222-4222-8222-222222222222", name: "Administrateur", protected: true }]} />);
    expect(screen.getAllByText("Pilote les livraisons")[0]).toBeVisible();
    expect(screen.getAllByText("2 affectations de backlog")[0]).toBeVisible();
    expect(screen.getByText("Rôle protégé")).toBeVisible();
  });

  it("préserve nom et description lors d’une erreur de modification", async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue({ ok: false, error: "Ce rôle de projet est encore utilisé." });
    render(<ProjectRoleAdmin roles={[role]} />);
    const section = screen.getByRole("region", { name: "Delivery" });
    await user.clear(within(section).getByRole("textbox", { name: "Nom du rôle" }));
    await user.type(within(section).getByRole("textbox", { name: "Nom du rôle" }), "Responsable delivery");
    await user.click(within(section).getByRole("button", { name: "Enregistrer le rôle" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent("Ce rôle de projet est encore utilisé.");
    expect(within(section).getByRole("textbox", { name: "Nom du rôle" })).toHaveValue("Responsable delivery");
  });

  it("demande confirmation et détaille les blockers avant suppression", async () => {
    const user = userEvent.setup();
    render(<ProjectRoleAdmin roles={[role]} />);
    await user.click(screen.getByRole("button", { name: "Supprimer Delivery" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer Delivery" });
    expect(within(dialog).getByText("1 autorisation de schéma")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Confirmer la suppression" })).toBeDisabled();
  });
});
