import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  purgeItem: vi.fn(),
  requireItemPermission: vi.fn(),
  restoreItem: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireItemPermission: mocks.requireItemPermission,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/items", () => ({
  purgeItem: mocks.purgeItem,
  restoreItem: mocks.restoreItem,
}));

import { purgeItemAction, restoreTrashedItemAction } from "@/app/actions/trash";

describe("restoreTrashedItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "admin-1", role: "admin", twoFactorEnabled: true },
    });
  });

  it.each([
    { name: "restore", run: () => restoreTrashedItemAction({ id: "item-1" }) },
    { name: "purge", run: () => purgeItemAction({ id: "item-1" }) },
  ])("requires restore_items by stored item before $name", async ({ run }) => {
    mocks.restoreItem.mockResolvedValue({ id: "item-1" });

    await run();

    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "admin-1",
      itemId: "item-1",
      permission: "restore_items",
    });
  });

  it("returns a structured trash permission denial", async () => {
    mocks.requireItemPermission.mockRejectedValueOnce(
      permissionDeniedError("restore_items", { type: "backlog", backlogId: "backlog-1" }),
    );

    await expect(restoreTrashedItemAction({ id: "item-1" })).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Restaurer les éléments » pour ce backlog.",
    });
    expect(mocks.restoreItem).not.toHaveBeenCalled();
  });

  it("surfaces the expired restore window without revalidating", async () => {
    mocks.restoreItem.mockRejectedValue(new Error("Délai de restauration dépassé."));

    await expect(
      restoreTrashedItemAction({ id: "item-1" }),
    ).resolves.toEqual({ ok: false, error: "Délai de restauration dépassé." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
