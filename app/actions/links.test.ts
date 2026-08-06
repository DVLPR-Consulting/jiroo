import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  addLink: vi.fn(),
  getSession: vi.fn(),
  removeLink: vi.fn(),
  requireItemPermission: vi.fn(),
  requireLinkPermission: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireItemPermission: mocks.requireItemPermission,
  requireLinkPermission: mocks.requireLinkPermission,
}));
vi.mock("@/lib/auth/authorization", () => ({ ResourceNotFoundError: Error }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/links", () => ({
  addLink: mocks.addLink,
  removeLink: mocks.removeLink,
}));

import { addLinkAction, removeLinkAction } from "@/app/actions/links";

describe("link action permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "writer-1", role: "contributor" } });
    mocks.requireItemPermission.mockImplementation(async ({ itemId }) => ({
      backlogId: "backlog-1",
      resourceId: itemId,
    }));
    mocks.requireLinkPermission.mockResolvedValue({
      backlogId: "backlog-1",
      resourceId: "link-1",
    });
    mocks.addLink.mockResolvedValue({ id: "link-1" });
  });

  it("requires link_items for both stored items before adding a link", async () => {
    await addLinkAction({
      backlogKey: "FORGED",
      sourceId: "item-1",
      targetId: "item-2",
      type: "relates",
    });

    expect(mocks.requireItemPermission.mock.calls.map(([input]) => input)).toEqual([
      { actorId: "writer-1", itemId: "item-1", permission: "link_items" },
      { actorId: "writer-1", itemId: "item-2", permission: "link_items" },
    ]);
    expect(mocks.addLink).toHaveBeenCalled();
  });

  it("returns a structured link permission denial", async () => {
    mocks.requireItemPermission.mockRejectedValueOnce(
      permissionDeniedError("link_items", { type: "backlog", backlogId: "backlog-1" }),
    );

    await expect(
      addLinkAction({
        backlogKey: "FORGED",
        sourceId: "item-1",
        targetId: "item-2",
        type: "relates",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Lier les éléments » pour ce backlog.",
    });
    expect(mocks.addLink).not.toHaveBeenCalled();
  });

  it("requires link_items from the stored link before removing it", async () => {
    await removeLinkAction({ backlogKey: "FORGED", id: "link-1" });

    expect(mocks.requireLinkPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      linkId: "link-1",
      permission: "link_items",
    });
    expect(mocks.requireLinkPermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.removeLink.mock.invocationCallOrder[0]!,
    );
  });
});
