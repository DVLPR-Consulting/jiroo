import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canWriteItems: vi.fn(),
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  restoreItem: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/rbac", () => ({ canWriteItems: mocks.canWriteItems }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/items", () => ({
  createItem: vi.fn(),
  moveItem: vi.fn(),
  reparentItem: vi.fn(),
  restoreItem: mocks.restoreItem,
  softDeleteItem: vi.fn(),
  updateItem: vi.fn(),
}));

import { restoreItemAction } from "@/app/actions/items";

describe("restoreItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canWriteItems.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      user: { id: "writer-1", role: "contributor" },
    });
  });

  it("returns a safe error when the item no longer exists", async () => {
    mocks.restoreItem.mockResolvedValue(null);

    await expect(
      restoreItemAction({ id: "missing-item", backlogKey: "DEMO" }),
    ).resolves.toEqual({ ok: false, error: "Item introuvable." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a safe error when the restore service rejects", async () => {
    mocks.restoreItem.mockRejectedValue(new Error("Parent supprimé"));

    await expect(
      restoreItemAction({ id: "item-1", backlogKey: "DEMO" }),
    ).resolves.toEqual({ ok: false, error: "Restauration impossible." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces the expired restore window without revalidating", async () => {
    mocks.restoreItem.mockRejectedValue(new Error("Délai de restauration dépassé."));

    await expect(
      restoreItemAction({ id: "item-1", backlogKey: "DEMO" }),
    ).resolves.toEqual({ ok: false, error: "Délai de restauration dépassé." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
