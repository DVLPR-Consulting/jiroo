import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  adminTabsProps: vi.fn(),
  checkPermission: vi.fn(),
  listGroups: vi.fn(),
  listGlobalPermissionGrants: vi.fn(),
  listAdminUsers: vi.fn(),
  listBacklogsForUser: vi.fn(),
  listPermissionSchemes: vi.fn(),
  listProjectRoles: vi.fn(),
  redirect: vi.fn(),
  requireAppPageSession: vi.fn(),
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
  listBacklogsForUser: mocks.listBacklogsForUser,
}));
vi.mock("@/lib/services/users", () => ({ listAdminUsers: mocks.listAdminUsers }));
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
    mocks.listBacklogsForUser.mockResolvedValue([]);
    mocks.listAdminUsers.mockResolvedValue([]);
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
    expect(mocks.listBacklogsForUser).not.toHaveBeenCalled();
    expect(mocks.listAdminUsers).not.toHaveBeenCalled();
    expect(mocks.listGroups).not.toHaveBeenCalled();
    expect(mocks.listPermissionSchemes).not.toHaveBeenCalled();
  });

  it("redirects safely before administration reads when permission is denied", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: false });

    await expect(
      AdminPage({ searchParams: Promise.resolve({ tab: "groups" }) }),
    ).rejects.toThrow("redirect:/");
    expect(mocks.listBacklogsForUser).not.toHaveBeenCalled();
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
});
