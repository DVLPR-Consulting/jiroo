import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  adminTabsProps: vi.fn(),
  checkPermission: vi.fn(),
  listGroups: vi.fn(),
  listGlobalPermissionGrants: vi.fn(),
  listAdminUsers: vi.fn(),
  listAdminBacklogsForUser: vi.fn(),
  listPermissionSchemes: vi.fn(),
  listProjectRoles: vi.fn(),
  listUsers: vi.fn(),
  redirect: vi.fn(),
  requireAppPageSession: vi.fn(),
}));

vi.mock("@/components/shell/shell-breadcrumb", () => ({
  ShellBreadcrumb: () => <nav aria-label="Fil d’Ariane" />,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({
  requireAppPageSession: mocks.requireAppPageSession,
}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
}));
vi.mock("@/lib/services/backlogs", () => ({
  listAdminBacklogsForUser: mocks.listAdminBacklogsForUser,
}));
vi.mock("@/lib/services/users", () => ({ listAdminUsers: mocks.listAdminUsers }));
vi.mock("@/lib/services/items", () => ({ listUsers: mocks.listUsers }));
vi.mock("@/lib/services/authorization-admin", () => ({
  listGroups: mocks.listGroups,
  listGlobalPermissionGrants: mocks.listGlobalPermissionGrants,
  listPermissionSchemes: mocks.listPermissionSchemes,
  listProjectRoles: mocks.listProjectRoles,
}));
vi.mock("@/components/admin/admin-tabs", () => ({
  AdminTabs: (props: unknown) => {
    mocks.adminTabsProps(props);
    return null;
  },
}));

import AdminPage from "@/app/(app)/admin/page";

describe("AdminPage read authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAppPageSession.mockResolvedValue({
      user: { id: "platform-admin-1", role: "contributor" },
    });
    mocks.listAdminBacklogsForUser.mockResolvedValue([]);
    mocks.listAdminUsers.mockResolvedValue([]);
    mocks.listUsers.mockResolvedValue([]);
    mocks.listGroups.mockResolvedValue([]);
    mocks.listGlobalPermissionGrants.mockResolvedValue([]);
    mocks.listPermissionSchemes.mockResolvedValue([]);
    mocks.listProjectRoles.mockResolvedValue([]);
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it("autorise et charge uniquement les données de l’onglet actif", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: true });

    await expect(
      AdminPage({ searchParams: Promise.resolve({ tab: "roles" }) }),
    ).resolves.toBeTruthy();

    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "platform-admin-1",
      permission: "manage_users_groups",
      scope: { type: "global" },
    });
    expect(mocks.listProjectRoles).toHaveBeenCalledOnce();
    expect(mocks.listAdminBacklogsForUser).not.toHaveBeenCalled();
    expect(mocks.listAdminUsers).not.toHaveBeenCalled();
    expect(mocks.listGroups).not.toHaveBeenCalled();
    expect(mocks.listPermissionSchemes).not.toHaveBeenCalled();
  });

  it("redirects safely before administration reads when permission is denied", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: false });

    await expect(
      AdminPage({ searchParams: Promise.resolve({ tab: "groups" }) }),
    ).rejects.toThrow("redirect:/");
    expect(mocks.listAdminBacklogsForUser).not.toHaveBeenCalled();
    expect(mocks.listAdminUsers).not.toHaveBeenCalled();
  });

  it("requires browse_users before loading the users directory tab", async () => {
    mocks.checkPermission.mockImplementation(async ({ permission }) => ({
      allowed: permission === "manage_users_groups",
    }));

    await expect(
      AdminPage({ searchParams: Promise.resolve({ tab: "users" }) }),
    ).rejects.toThrow("redirect:/");

    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "platform-admin-1",
      permission: "browse_users",
      scope: { type: "global" },
    });
    expect(mocks.listAdminUsers).not.toHaveBeenCalled();
  });

  it.each(["groups", "schemes"])(
    "does not load user picker candidates for the %s tab without browse_users",
    async (tab) => {
      mocks.checkPermission.mockImplementation(async ({ permission }) => ({
        allowed: permission !== "browse_users",
      }));
      mocks.listAdminUsers.mockResolvedValue([
        { id: "u1", name: "Ada", email: "private@example.test" },
      ]);

      render(await AdminPage({ searchParams: Promise.resolve({ tab }) }));

      expect(mocks.listAdminUsers).not.toHaveBeenCalled();
      expect(mocks.adminTabsProps).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ users: [] }),
        }),
      );
    },
  );

  it("removes email from non-directory picker DTOs", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: true });
    mocks.listAdminUsers.mockResolvedValue([
      { id: "u1", name: "Ada", email: "private@example.test" },
    ]);

    render(await AdminPage({ searchParams: Promise.resolve({ tab: "groups" }) }));

    expect(mocks.adminTabsProps).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          users: [{ id: "u1", name: "Ada" }],
        }),
      }),
    );
  });

  it.each([
    { administerJiroo: true, expected: true },
    { administerJiroo: false, expected: false },
  ])(
    "exposes account recovery on the users tab only to Jiroo administrators ($administerJiroo)",
    async ({ administerJiroo, expected }) => {
      mocks.checkPermission.mockImplementation(async ({ permission }) => ({
        allowed: permission === "administer_jiroo" ? administerJiroo : true,
      }));
      mocks.listAdminUsers.mockResolvedValue([
        { id: "u1", name: "Ada", email: "ada@example.test", role: "contributor" },
      ]);

      render(await AdminPage({ searchParams: Promise.resolve({ tab: "users" }) }));

      expect(mocks.checkPermission).toHaveBeenCalledWith({
        actorId: "platform-admin-1",
        permission: "administer_jiroo",
        scope: { type: "global" },
      });
      expect(mocks.adminTabsProps).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tab: "users",
            canRecoverAccounts: expected,
            currentUserId: "platform-admin-1",
          }),
        }),
      );
    },
  );

  it("offers backlog lead candidates, sorted, only with browse_users (JIR-82)", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: true });
    mocks.listUsers.mockResolvedValue([
      { id: "u2", name: "Zoé" },
      { id: "u1", name: "Émile" },
    ]);

    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.listAdminBacklogsForUser).toHaveBeenCalledWith("platform-admin-1");
    expect(mocks.adminTabsProps).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tab: "backlogs",
          leadOptions: [
            { id: "u1", name: "Émile" },
            { id: "u2", name: "Zoé" },
          ],
        }),
      }),
    );
  });

  it("hides backlog lead candidates without browse_users (JIR-82)", async () => {
    mocks.checkPermission.mockImplementation(async ({ permission }) => ({
      allowed: permission !== "browse_users",
    }));

    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.adminTabsProps).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tab: "backlogs", leadOptions: undefined }),
      }),
    );
  });
});
