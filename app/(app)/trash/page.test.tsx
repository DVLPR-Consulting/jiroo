import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  listTrashedItems: vi.fn(),
  requireAppPageSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireAppPageSession: mocks.requireAppPageSession,
}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
}));
vi.mock("@/lib/services/items", () => ({
  listTrashedItems: mocks.listTrashedItems,
}));
vi.mock("@/components/items/trash-list", () => ({ TrashList: () => null }));

import TrashPage from "@/app/(app)/trash/page";

describe("TrashPage read authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAppPageSession.mockResolvedValue({
      user: { id: "member-1", role: "contributor" },
    });
    mocks.listTrashedItems.mockResolvedValue([]);
    mocks.checkPermission.mockResolvedValue({ allowed: false });
  });

  it("lets an authenticated member read only browse-filtered trash", async () => {
    await expect(TrashPage()).resolves.toBeTruthy();

    expect(mocks.listTrashedItems).toHaveBeenCalledWith("member-1");
  });
});
