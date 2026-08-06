import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createLabel: vi.fn(),
  getSession: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireBacklogPermissionById: mocks.requireBacklogPermissionById,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/labels", () => ({ createLabel: mocks.createLabel }));

import { createLabelAction } from "@/app/actions/labels";

describe("label action permissions", () => {
  it("requires edit_items on the target backlog before creating an item label", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "writer-1", role: "contributor" } });
    mocks.createLabel.mockResolvedValue({ id: "label-1" });

    await createLabelAction({ backlogKey: "FORGED", backlogId: "backlog-1", name: "Urgent" });

    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "writer-1",
      backlogId: "backlog-1",
      permission: "edit_items",
    });
    expect(mocks.requireBacklogPermissionById.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createLabel.mock.invocationCallOrder[0]!,
    );
  });
});
