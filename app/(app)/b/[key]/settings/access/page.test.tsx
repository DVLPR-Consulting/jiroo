import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  listGroups: vi.fn(), listPermissionSchemes: vi.fn(), readBacklogAccess: vi.fn(), listAdminUsers: vi.fn(),
  notFound: vi.fn(), redirect: vi.fn(), requireBacklogPermissionByKey: vi.fn(), requireSession: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ requireAppPageSession: mocks.requireSession }));
vi.mock("@/lib/auth/action-authorization", () => ({ requireBacklogPermissionByKey: mocks.requireBacklogPermissionByKey }));
vi.mock("@/lib/auth/authorization", () => ({ checkPermission: mocks.checkPermission }));
vi.mock("@/lib/services/users", () => ({ listAdminUsers: mocks.listAdminUsers }));
vi.mock("@/lib/services/authorization-admin", () => ({
  listGroups: mocks.listGroups, listPermissionSchemes: mocks.listPermissionSchemes, readBacklogAccess: mocks.readBacklogAccess,
}));
vi.mock("@/components/admin/access-admin", () => ({ AccessAdmin: () => null }));

import AccessPage from "@/app/(app)/b/[key]/settings/access/page";

describe("backlog access settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "u1" } });
    mocks.requireBacklogPermissionByKey.mockResolvedValue({ backlogId: "b1", backlogKey: "DEMO", resourceId: "b1" });
    mocks.listGroups.mockResolvedValue([]); mocks.listPermissionSchemes.mockResolvedValue([]); mocks.listAdminUsers.mockResolvedValue([]);
    mocks.readBacklogAccess.mockResolvedValue({ backlog: { id: "b1", key: "DEMO", name: "Démo" }, scheme: { id: "s1", name: "Schéma", version: 1 }, mode: "simple", roles: [] });
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
  });

  it("résout browse puis autorise manage_members avant toute lecture", async () => {
    mocks.checkPermission.mockImplementation(async ({ permission }: { permission: string }) => ({ allowed: permission === "manage_members" }));
    await expect(AccessPage({ params: Promise.resolve({ key: "demo" }) })).resolves.toBeTruthy();
    expect(mocks.requireBacklogPermissionByKey).toHaveBeenCalledWith({ actorId: "u1", backlogKey: "demo", permission: "browse_backlog" });
    expect(mocks.checkPermission).toHaveBeenCalledWith({ actorId: "u1", permission: "manage_members", scope: { type: "backlog", backlogId: "b1" } });
    expect(mocks.readBacklogAccess.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.checkPermission.mock.invocationCallOrder[0]!);
  });

  it("autorise administer_backlog comme alternative", async () => {
    mocks.checkPermission.mockImplementation(async ({ permission }: { permission: string }) => ({ allowed: permission === "administer_backlog" }));
    await expect(AccessPage({ params: Promise.resolve({ key: "DEMO" }) })).resolves.toBeTruthy();
    expect(mocks.readBacklogAccess).toHaveBeenCalledWith("b1");
  });

  it("refuse avant les lectures sans l’une des deux permissions", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: false });
    await expect(AccessPage({ params: Promise.resolve({ key: "DEMO" }) })).rejects.toThrow("redirect:/b/DEMO");
    expect(mocks.readBacklogAccess).not.toHaveBeenCalled();
    expect(mocks.listGroups).not.toHaveBeenCalled();
  });
});
