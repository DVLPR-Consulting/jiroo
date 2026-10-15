import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBacklogSummary: vi.fn(),
  purgeItem: vi.fn(),
  requireItemPermission: vi.fn(),
  restoreItem: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateBacklog: vi.fn(),
  notifyUsers: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/realtime/publish", () => ({ invalidateBacklog: mocks.invalidateBacklog, notifyUsers: mocks.notifyUsers }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireItemPermission: mocks.requireItemPermission,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/backlogs", () => ({ getBacklogSummary: mocks.getBacklogSummary }));
vi.mock("@/lib/services/items", () => ({
  purgeItem: mocks.purgeItem,
  restoreItem: mocks.restoreItem,
}));

import { purgeItemAction, restoreTrashedItemAction } from "@/app/actions/trash";

describe("restoreTrashedItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireItemPermission.mockResolvedValue({ backlogId: "backlog-1", resourceId: "item-1" });
    mocks.getBacklogSummary.mockResolvedValue({ id: "backlog-1", key: "DEMO" });
    mocks.getSession.mockResolvedValue({
      user: { id: "admin-1", role: "admin", twoFactorEnabled: true },
    });
  });

  it.each([
    { name: "restore", run: () => restoreTrashedItemAction({ id: "item-1" }) },
    { name: "purge", run: () => purgeItemAction({ id: "item-1" }) },
  ])("requires restore_items by stored item before $name", async ({ run }) => {
    mocks.restoreItem.mockResolvedValue({ id: "item-1" });

    await expect(run()).resolves.toEqual({ ok: true });
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("DEMO", { kind: "item", backlogId: "backlog-1", actorId: "admin-1" });

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
