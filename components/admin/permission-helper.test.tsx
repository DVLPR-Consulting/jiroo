import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ helper: vi.fn() }));
vi.mock("@/app/actions/authorization", () => ({ permissionHelperAction: mocks.helper }));

import { PermissionHelper } from "@/components/admin/permission-helper";

const props = {
  users: [{ id: "user-raw-uuid-11111111-1111-4111-8111-111111111111", name: "Ada", email: "ada@test" }],
  backlogs: [{ id: "22222222-2222-4222-8222-222222222222", key: "DEMO", name: "Démonstration" }],
};

describe("PermissionHelper", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["user_grant", "Ada", "Grant direct à Ada."],
    ["group_grant", "Produit", "Membre du groupe Produit."],
    ["project_role_grant", "Membre", "Occupe le rôle Membre."],
    ["authenticated_user_grant", "Tous les utilisateurs authentifiés", "Grant pour tous les utilisateurs authentifiés."],
    ["missing_prerequisite", undefined, "La permission « Consulter le backlog » est absente."],
    ["no_matching_grant", undefined, "Aucun grant ne correspond."],
    ["platform_administrator", undefined, "Administrateur de la plateforme : accès de récupération."],
  ])("traduit la raison métier %s sans identifiant brut", async (type, label, expected) => {
    const user = userEvent.setup();
    mocks.helper.mockResolvedValue({ ok: true, result: { allowed: type !== "missing_prerequisite" && type !== "no_matching_grant", permission: "edit_items", reasons: [{ type, ...(label ? { label } : {}) }] } });
    const { container } = render(<PermissionHelper {...props} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Utilisateur à vérifier" }), props.users[0]!.id);
    await user.click(screen.getByRole("button", { name: "Vérifier la permission" }));
    expect(await screen.findByText(expected)).toBeVisible();
    expect(screen.getByRole("heading", { name: type === "missing_prerequisite" || type === "no_matching_grant" ? "Refusé" : "Autorisé" })).toBeVisible();
    expect(container).not.toHaveTextContent(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  });

  it("préserve les trois choix et annonce une erreur", async () => {
    const user = userEvent.setup();
    mocks.helper.mockResolvedValue({ ok: false, error: "Action impossible. Réessayez." });
    render(<PermissionHelper {...props} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Utilisateur à vérifier" }), props.users[0]!.id);
    await user.selectOptions(screen.getByRole("combobox", { name: "Permission à vérifier" }), "manage_releases");
    await user.click(screen.getByRole("button", { name: "Vérifier la permission" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Action impossible. Réessayez.");
    expect(screen.getByRole("combobox", { name: "Permission à vérifier" })).toHaveValue("manage_releases");
  });
});
