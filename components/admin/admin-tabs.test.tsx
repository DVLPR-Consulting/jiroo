import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/components/admin/api-tokens-admin", () => ({ ApiTokensAdmin: () => <p>Jetons actifs</p> }));
vi.mock("@/components/admin/backlog-admin", () => ({ BacklogAdmin: () => <p>Backlogs actifs</p> }));
vi.mock("@/components/admin/user-admin", () => ({ UserAdmin: () => <p>Utilisateurs actifs</p> }));
vi.mock("@/components/admin/group-admin", () => ({ GroupAdmin: () => <p>Groupes actifs</p> }));
vi.mock("@/components/admin/project-role-admin", () => ({ ProjectRoleAdmin: () => <p>Rôles actifs</p> }));
vi.mock("@/components/admin/permission-scheme-admin", () => ({
  PermissionSchemeAdmin: () => <p>Schémas actifs</p>,
}));

import { AdminTabs } from "@/components/admin/admin-tabs";

describe("AdminTabs", () => {
  it("expose exactement six onglets avec la sélection et les liens attendus", () => {
    render(<AdminTabs activeTab="groups" data={{ tab: "groups", groups: [], users: [], globalGrants: [], canAdministerGlobals: false }} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Backlogs",
      "Utilisateurs",
      "Groupes",
      "Rôles de projet",
      "Schémas de permissions",
      "Jetons d’accès",
    ]);
    expect(screen.getByRole("tab", { name: "Jetons d’accès" })).toHaveAttribute("href", "/admin?tab=tokens");
    expect(screen.getByRole("tab", { name: "Groupes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Schémas de permissions" })).toHaveAttribute(
      "href",
      "/admin?tab=schemes",
    );
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Groupes");
  });

  it("déplace le focus au clavier sans sélectionner un autre panneau", () => {
    render(<AdminTabs activeTab="groups" data={{ tab: "groups", groups: [], users: [], globalGrants: [], canAdministerGlobals: false }} />);
    const current = screen.getByRole("tab", { name: "Groupes" });
    const next = screen.getByRole("tab", { name: "Rôles de projet" });

    current.focus();
    fireEvent.keyDown(current, { key: "ArrowRight" });

    expect(next).toHaveFocus();
    expect(current).toHaveAttribute("aria-selected", "true");
  });
});
