import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  checkPermission: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  listBacklogsForUser: vi.fn(),
  listVisibleViews: vi.fn(),
  unreadCount: vi.fn(),
  listRecentNotifications: vi.fn(),
  getShellCounts: vi.fn(),
  sidebar: vi.fn(() => null),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: async () => ({ toString: () => "" }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.authGetSession } },
}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
}));
vi.mock("@/lib/services/backlogs", () => ({
  listBacklogsForUser: mocks.listBacklogsForUser,
}));
vi.mock("@/lib/services/views", () => ({ listVisibleViews: mocks.listVisibleViews }));
vi.mock("@/lib/services/notifications", () => ({
  unreadCount: mocks.unreadCount,
  listRecentNotifications: mocks.listRecentNotifications,
}));
vi.mock("@/lib/services/shell", () => ({ getShellCounts: mocks.getShellCounts }));
vi.mock("@/components/shell/app-shell", () => ({
  AppShell: ({ sidebar }: { sidebar: ReactNode }) => sidebar,
}));
vi.mock("@/components/shell/sidebar", () => ({ Sidebar: mocks.sidebar }));
vi.mock("@/components/shell/topbar", () => ({ Topbar: () => null }));

import AppLayout from "@/app/(app)/layout";

function authSession(twoFactorEnabled: boolean) {
  return {
    session: {
      id: "session-1",
      token: "token-1",
      userId: "user-1",
      expiresAt: new Date("2026-08-05T00:00:00Z"),
      createdAt: new Date("2026-08-04T00:00:00Z"),
      updatedAt: new Date("2026-08-04T00:00:00Z"),
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: "user-1",
      name: "Marie Martin",
      email: "marie@example.test",
      emailVerified: true,
      image: null,
      createdAt: new Date("2026-08-04T00:00:00Z"),
      updatedAt: new Date("2026-08-04T00:00:00Z"),
      role: "contributor",
      twoFactorEnabled,
    },
  };
}

describe("AppLayout 2FA access guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
    mocks.listBacklogsForUser.mockResolvedValue([]);
    mocks.listVisibleViews.mockResolvedValue([]);
    mocks.unreadCount.mockResolvedValue(0);
    mocks.listRecentNotifications.mockResolvedValue([]);
    mocks.getShellCounts.mockResolvedValue({});
    mocks.checkPermission.mockResolvedValue({ allowed: true });
  });

  it("redirects direct app access to enrollment before loading app data", async () => {
    mocks.authGetSession.mockResolvedValue(authSession(false));

    await expect(AppLayout({ children: null })).rejects.toThrow("redirect:/2fa/enroll");
    expect(mocks.redirect).toHaveBeenCalledWith("/2fa/enroll");
    expect(mocks.listBacklogsForUser).not.toHaveBeenCalled();
  });

  it("loads the shell for a fully enrolled session", async () => {
    mocks.authGetSession.mockResolvedValue(authSession(true));

    render(await AppLayout({ children: null }));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.listBacklogsForUser).toHaveBeenCalledWith("user-1");
    expect(mocks.checkPermission).toHaveBeenCalledWith(expect.objectContaining({ actorId: "user-1", permission: "administer_jiroo" }));
    expect(mocks.sidebar).toHaveBeenCalledWith(
      expect.objectContaining({ canAdminister: true }),
      undefined,
    );
  });

  it("expose l’administration pour une permission globale dédiée, jamais pour manage_members seul", async () => {
    mocks.authGetSession.mockResolvedValue(authSession(true));
    mocks.checkPermission.mockImplementation(async ({ permission }: { permission: string }) => ({ allowed: permission === "manage_users_groups" }));
    render(await AppLayout({ children: null }));
    expect(mocks.sidebar).toHaveBeenLastCalledWith(expect.objectContaining({ canAdminister: true, adminHref: "/admin?tab=users" }), undefined);

    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.authGetSession.mockResolvedValue(authSession(true));
    mocks.listBacklogsForUser.mockResolvedValue([]); mocks.listVisibleViews.mockResolvedValue([]); mocks.unreadCount.mockResolvedValue(0); mocks.listRecentNotifications.mockResolvedValue([]); mocks.getShellCounts.mockResolvedValue({});
    mocks.checkPermission.mockResolvedValue({ allowed: false });
    render(await AppLayout({ children: null }));
    expect(mocks.sidebar).toHaveBeenLastCalledWith(expect.objectContaining({ canAdminister: false }), undefined);
  });
});
