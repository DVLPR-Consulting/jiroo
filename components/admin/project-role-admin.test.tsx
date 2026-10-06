import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/app/actions/authorization", () => ({
  createProjectRoleAction: mocks.create,
  updateProjectRoleAction: mocks.update,
  deleteProjectRoleAction: mocks.remove,
}));

import { ProjectRoleAdmin } from "@/components/admin/project-role-admin";
import { simulateExitAnimations } from "@/test/exit-animation";

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

  it("rend des blockers de même libellé sans erreur de clé React", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ProjectRoleAdmin roles={[{
      ...role,
      blockers: ["Affectation dans Cour de cassation", "Affectation dans Cour de cassation"],
    }]} />);

    expect(screen.getAllByText("Affectation dans Cour de cassation")).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
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

  it("annonce une erreur de suppression dans la modale qui reste active", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({
      ok: false,
      error: "Ce rôle de projet est encore utilisé.",
    });
    render(<ProjectRoleAdmin roles={[{ ...role, blockers: [] }]} />);

    await user.click(screen.getByRole("button", { name: "Supprimer Delivery" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer Delivery" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer la suppression" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Ce rôle de projet est encore utilisé.",
    );
    expect(dialog).toBeVisible();
  });

  it("cannot close the deletion confirmation while the request is pending", async () => {
    const user = userEvent.setup();
    let resolve!: (result: { ok: false; error: string }) => void;
    mocks.remove.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<ProjectRoleAdmin roles={[{ ...role, blockers: [] }]} />);

    await user.click(screen.getByRole("button", { name: "Supprimer Delivery" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer Delivery" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer la suppression" }));
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();

    resolve({ ok: false, error: "Ce rôle de projet est encore utilisé." });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("encore utilisé");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirmer la suppression" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the role's title and blockers visible while the confirmation closes", async () => {
    const user = userEvent.setup();
    render(<ProjectRoleAdmin roles={[role]} />);
    await user.click(screen.getByRole("button", { name: "Supprimer Delivery" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer Delivery" });

    const restore = simulateExitAnimations();
    try {
      await user.keyboard("{Escape}");
      await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
      expect(dialog).toHaveTextContent("Supprimer Delivery");
      expect(dialog).toHaveTextContent("1 autorisation de schéma");
    } finally {
      restore();
    }
  });

  it("keeps the deletion error visible while the confirmation closes", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({ ok: false, error: "Suppression refusée." });
    render(<ProjectRoleAdmin roles={[{ ...role, blockers: [] }]} />);
    await user.click(screen.getByRole("button", { name: "Supprimer Delivery" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer Delivery" });
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
    render(<ProjectRoleAdmin roles={[{ ...role, blockers: [] }]} />);
    await user.click(screen.getByRole("button", { name: "Supprimer Delivery" }));
    let dialog = screen.getByRole("dialog", { name: "Supprimer Delivery" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer la suppression" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Suppression refusée.");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirmer la suppression" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Supprimer Delivery" }));
    dialog = screen.getByRole("dialog", { name: "Supprimer Delivery" });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });
});
