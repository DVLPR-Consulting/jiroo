import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addRef: vi.fn(),
  getSession: vi.fn(),
  removeRef: vi.fn(),
  requireItemPermission: vi.fn(),
  requireRefPermission: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireItemPermission: mocks.requireItemPermission,
  requireRefPermission: mocks.requireRefPermission,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/refs", () => ({ addRef: mocks.addRef, removeRef: mocks.removeRef }));

import { addRefAction, removeRefAction } from "@/app/actions/refs";

describe("reference action permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "writer-1", role: "contributor" } });
    mocks.requireItemPermission.mockResolvedValue({ backlogId: "backlog-1", resourceId: "item-1" });
    mocks.requireRefPermission.mockResolvedValue({ backlogId: "backlog-1", resourceId: "ref-1" });
    mocks.addRef.mockResolvedValue({ id: "ref-1" });
  });

  it("requires link_items from the stored item before adding a reference", async () => {
    await addRefAction({ backlogKey: "FORGED", itemId: "item-1", url: "https://github.com/o/r/pull/1" });
    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      itemId: "item-1",
      permission: "link_items",
    });
  });

  it("requires link_items from the stored reference before removing it", async () => {
    await removeRefAction({ backlogKey: "FORGED", id: "ref-1" });
    expect(mocks.requireRefPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      refId: "ref-1",
      permission: "link_items",
    });
    expect(mocks.removeRef).toHaveBeenCalledWith("ref-1");
  });
});
