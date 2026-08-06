import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  listAdminUsers: vi.fn(),
  listBacklogsForUser: vi.fn(),
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
vi.mock("@/components/admin/admin-tabs", () => ({ AdminTabs: () => null }));

import AdminPage from "@/app/(app)/admin/page";

describe("AdminPage read authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAppPageSession.mockResolvedValue({
      user: { id: "platform-admin-1", role: "contributor" },
    });
    mocks.listBacklogsForUser.mockResolvedValue([]);
    mocks.listAdminUsers.mockResolvedValue([]);
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it("uses the effective platform permission before loading administration reads", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: true });

    await expect(
      AdminPage({ searchParams: Promise.resolve({}) }),
    ).resolves.toBeTruthy();

    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "platform-admin-1",
      permission: "administer_jiroo",
      scope: { type: "global" },
    });
    expect(mocks.listBacklogsForUser).toHaveBeenCalledWith("platform-admin-1", {
      includeArchived: true,
    });
  });

  it("redirects safely before administration reads when permission is denied", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: false });

    await expect(
      AdminPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/");
    expect(mocks.listBacklogsForUser).not.toHaveBeenCalled();
    expect(mocks.listAdminUsers).not.toHaveBeenCalled();
  });
});
