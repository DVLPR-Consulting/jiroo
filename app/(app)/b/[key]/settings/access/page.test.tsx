import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const classes = vi.hoisted(() => ({
  ResourceNotFoundError: class ResourceNotFoundError extends Error {
    constructor(readonly resourceType: string, readonly resourceId: string) {
      super("resource not found");
    }
  },
}));

const mocks = vi.hoisted(() => ({
  accessProps: vi.fn(),
  checkPermission: vi.fn(),
  helperProps: vi.fn(),
  listGroups: vi.fn(), listPermissionSchemes: vi.fn(), readBacklogAccess: vi.fn(), listAdminUsers: vi.fn(),
  notFound: vi.fn(), redirect: vi.fn(), requireBacklogReadPermissionByKey: vi.fn(), requireSession: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ requireAppPageSession: mocks.requireSession }));
vi.mock("@/lib/auth/action-authorization", () => ({ requireBacklogReadPermissionByKey: mocks.requireBacklogReadPermissionByKey }));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
  ResourceNotFoundError: classes.ResourceNotFoundError,
}));
vi.mock("@/lib/services/users", () => ({ listAdminUsers: mocks.listAdminUsers }));
vi.mock("@/lib/services/authorization-admin", () => ({
  listGroups: mocks.listGroups, listPermissionSchemes: mocks.listPermissionSchemes, readBacklogAccess: mocks.readBacklogAccess,
}));
vi.mock("@/components/admin/access-admin", () => ({
  AccessAdmin: (props: unknown) => {
    mocks.accessProps(props);
    return null;
  },
}));
vi.mock("@/components/admin/permission-helper", () => ({
  PermissionHelper: (props: unknown) => {
    mocks.helperProps(props);
    return null;
  },
}));

import AccessPage from "@/app/(app)/b/[key]/settings/access/page";

describe("backlog access settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "u1" } });
    mocks.requireBacklogReadPermissionByKey.mockResolvedValue({ backlogId: "b1", backlogKey: "DEMO", resourceId: "b1" });
    mocks.listGroups.mockResolvedValue([]); mocks.listPermissionSchemes.mockResolvedValue([]); mocks.listAdminUsers.mockResolvedValue([]);
    mocks.readBacklogAccess.mockResolvedValue({ backlog: { id: "b1", key: "DEMO", name: "Démo" }, scheme: { id: "s1", name: "Schéma", version: 1 }, mode: "simple", roles: [] });
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
    mocks.notFound.mockImplementation(() => { throw new Error("not-found"); });
  });

  it("résout browse puis autorise manage_members avant toute lecture", async () => {
    mocks.checkPermission.mockImplementation(async ({ permission }: { permission: string }) => ({ allowed: permission === "manage_members" }));
    await expect(AccessPage({ params: Promise.resolve({ key: "demo" }) })).resolves.toBeTruthy();
    expect(mocks.requireBacklogReadPermissionByKey).toHaveBeenCalledWith({ actorId: "u1", backlogKey: "demo", permission: "browse_backlog" });
    expect(mocks.checkPermission).toHaveBeenCalledWith({ actorId: "u1", permission: "manage_members", scope: { type: "backlog", backlogId: "b1" } });
    expect(mocks.readBacklogAccess.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.checkPermission.mock.invocationCallOrder[0]!);
  });

  it("autorise administer_backlog comme alternative", async () => {
    mocks.checkPermission.mockImplementation(async ({ permission }: { permission: string }) => ({ allowed: permission === "administer_backlog" }));
    render(await AccessPage({ params: Promise.resolve({ key: "DEMO" }) }));
    expect(mocks.readBacklogAccess).toHaveBeenCalledWith("b1");
    expect(mocks.accessProps).toHaveBeenCalledWith(expect.objectContaining({
      canManageMembers: false,
      canAdministerBacklog: true,
      canAdministerJiroo: false,
    }));
  });

  it("laisse le landmark main au shell parent", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: true });
    render(await AccessPage({ params: Promise.resolve({ key: "DEMO" }) }));

    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accès — Démo" })).toBeVisible();
  });

  it("refuse avant les lectures sans l’une des deux permissions", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: false });
    await expect(AccessPage({ params: Promise.resolve({ key: "DEMO" }) })).rejects.toThrow("redirect:/b/DEMO");
    expect(mocks.readBacklogAccess).not.toHaveBeenCalled();
    expect(mocks.listGroups).not.toHaveBeenCalled();
  });

  it("convertit une clé inconnue en notFound avant toute lecture", async () => {
    mocks.requireBacklogReadPermissionByKey.mockRejectedValue(
      new classes.ResourceNotFoundError("backlog", "UNKNOWN"),
    );

    await expect(AccessPage({ params: Promise.resolve({ key: "UNKNOWN" }) })).rejects.toThrow("not-found");
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.checkPermission).not.toHaveBeenCalled();
    expect(mocks.readBacklogAccess).not.toHaveBeenCalled();
  });

  it("convertit un refus browse en notFound sans divulguer le backlog", async () => {
    mocks.requireBacklogReadPermissionByKey.mockRejectedValue(
      new classes.ResourceNotFoundError("backlog", "DEMO"),
    );

    await expect(AccessPage({ params: Promise.resolve({ key: "DEMO" }) })).rejects.toThrow("not-found");
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.listGroups).not.toHaveBeenCalled();
    expect(mocks.listAdminUsers).not.toHaveBeenCalled();
  });

  it("ne lit ni ne transmet l’annuaire sans browse_users", async () => {
    mocks.checkPermission.mockImplementation(async ({ permission }: { permission: string }) => ({
      allowed: permission === "manage_members" || permission === "administer_backlog",
    }));
    mocks.listAdminUsers.mockResolvedValue([
      { id: "u2", name: "Lin", email: "lin@test", role: "contributor" },
    ]);

    render(await AccessPage({ params: Promise.resolve({ key: "DEMO" }) }));

    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "u1",
      permission: "browse_users",
      scope: { type: "global" },
    });
    expect(mocks.listAdminUsers).not.toHaveBeenCalled();
    expect(mocks.accessProps).toHaveBeenCalledWith(expect.objectContaining({
      users: [],
      canBrowseUsers: false,
    }));
    expect(mocks.helperProps).not.toHaveBeenCalled();
  });

  it("transmet le people picker minimal avec browse_users", async () => {
    mocks.checkPermission.mockImplementation(async ({ permission }: { permission: string }) => ({
      allowed: ["manage_members", "administer_backlog", "browse_users"].includes(permission),
    }));
    mocks.listAdminUsers.mockResolvedValue([
      { id: "u2", name: "Lin", email: "lin@test", role: "contributor" },
    ]);

    render(await AccessPage({ params: Promise.resolve({ key: "DEMO" }) }));

    expect(mocks.listAdminUsers).toHaveBeenCalledOnce();
    expect(mocks.accessProps).toHaveBeenCalledWith(expect.objectContaining({
      users: [{ id: "u2", name: "Lin" }],
      canBrowseUsers: true,
    }));
    expect(mocks.helperProps).toHaveBeenCalledWith(expect.objectContaining({
      users: [{ id: "u2", name: "Lin" }],
    }));
  });
});
