import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canWriteItems: vi.fn(),
  createItem: vi.fn(),
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  restoreItem: vi.fn(),
  updateItem: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/rbac", () => ({ canWriteItems: mocks.canWriteItems }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/items", () => ({
  createItem: mocks.createItem,
  moveItem: vi.fn(),
  reparentItem: vi.fn(),
  restoreItem: mocks.restoreItem,
  softDeleteItem: vi.fn(),
  updateItem: mocks.updateItem,
}));

import {
  createItemAction,
  restoreItemAction,
  updateItemAction,
} from "@/app/actions/items";
import { createItemSchema, updateItemSchema } from "@/lib/validation/item";

describe("item action validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canWriteItems.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      user: { id: "writer-1", role: "contributor", twoFactorEnabled: true },
    });
  });

  it("preserves create title validation as a field error", async () => {
    const parsed = createItemSchema.safeParse({
      backlogId: "11111111-1111-4111-8111-111111111111",
      type: "composant",
      parentId: null,
      title: "A".repeat(201),
    });
    if (parsed.success) throw new Error("Expected validation failure");
    mocks.createItem.mockRejectedValueOnce(parsed.error);

    await expect(
      createItemAction({
        backlogKey: "DEMO",
        backlogId: "11111111-1111-4111-8111-111111111111",
        type: "composant",
        parentId: null,
        title: "A".repeat(201),
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Titre trop long (200 max).",
      fieldErrors: { title: ["Titre trop long (200 max)."] },
    });
  });

  it("preserves update description validation as a field error", async () => {
    const parsed = updateItemSchema.safeParse({
      id: "22222222-2222-4222-9222-222222222222",
      description: "A".repeat(20_001),
    });
    if (parsed.success) throw new Error("Expected validation failure");
    mocks.updateItem.mockRejectedValueOnce(parsed.error);

    await expect(
      updateItemAction({
        backlogKey: "DEMO",
        id: "22222222-2222-4222-9222-222222222222",
        description: "A".repeat(20_001),
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Description trop longue (20 000 max).",
      fieldErrors: {
        description: ["Description trop longue (20 000 max)."],
      },
    });
  });
});

describe("restoreItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canWriteItems.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      user: { id: "writer-1", role: "contributor", twoFactorEnabled: true },
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
