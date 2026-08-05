import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulkUpdateItems: vi.fn(),
  canWriteItems: vi.fn(),
  createItem: vi.fn(),
  getSession: vi.fn(),
  rankBacklogItem: vi.fn(),
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
  rankBacklogItem: mocks.rankBacklogItem,
  reparentItem: vi.fn(),
  restoreItem: mocks.restoreItem,
  softDeleteItem: vi.fn(),
  updateItem: mocks.updateItem,
}));
vi.mock("@/lib/services/item-bulk", () => ({
  bulkUpdateItems: mocks.bulkUpdateItems,
}));

import {
  bulkUpdateItemsAction,
  createItemAction,
  rankBacklogItemAction,
  restoreItemAction,
  updateItemAction,
} from "@/app/actions/items";
import { bulkUpdateItemsSchema } from "@/lib/validation/bulk-item";
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

  it("forwards a contextual sprint when creating a task", async () => {
    const sprintId = "33333333-3333-4333-8333-333333333333";
    mocks.createItem.mockResolvedValueOnce({ id: "item-1", sprintId });

    await expect(
      createItemAction({
        backlogKey: "DEMO",
        backlogId: "11111111-1111-4111-8111-111111111111",
        type: "tache",
        parentId: "22222222-2222-4222-9222-222222222222",
        title: "Créée dans le sprint",
        sprintId,
      }),
    ).resolves.toEqual({ ok: true, item: { id: "item-1", sprintId } });
    expect(mocks.createItem).toHaveBeenCalledWith(
      {
        backlogId: "11111111-1111-4111-8111-111111111111",
        type: "tache",
        parentId: "22222222-2222-4222-9222-222222222222",
        title: "Créée dans le sprint",
        sprintId,
      },
      "writer-1",
    );
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

  it("forwards a decimal estimate from the authenticated writer", async () => {
    mocks.updateItem.mockResolvedValueOnce({ id: "item-1", estimatePoints: 2.5 });

    await expect(
      updateItemAction({
        backlogKey: "DEMO",
        id: "22222222-2222-4222-9222-222222222222",
        estimatePoints: 2.5,
      }),
    ).resolves.toEqual({ ok: true, item: { id: "item-1", estimatePoints: 2.5 } });
    expect(mocks.updateItem).toHaveBeenCalledWith(
      { id: "22222222-2222-4222-9222-222222222222", estimatePoints: 2.5 },
      "writer-1",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/DEMO");
  });

  it("returns the task-only estimate error without leaking internals", async () => {
    mocks.updateItem.mockRejectedValueOnce(
      new Error("Seules les tâches peuvent être estimées."),
    );

    await expect(
      updateItemAction({
        backlogKey: "DEMO",
        id: "22222222-2222-4222-9222-222222222222",
        estimatePoints: 3,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Seules les tâches peuvent être estimées.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("rankBacklogItemAction", () => {
  const input = {
    backlogKey: "DEMO",
    backlogId: "11111111-1111-4111-8111-111111111111",
    id: "22222222-2222-4222-9222-222222222222",
    beforeId: "33333333-3333-4333-8333-333333333333",
    afterId: "44444444-4444-4444-8444-444444444444",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canWriteItems.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      user: { id: "writer-1", role: "contributor", twoFactorEnabled: true },
    });
  });

  it("forwards neighbor ids from the authenticated writer and revalidates", async () => {
    const item = { id: input.id, rank: "a1V" };
    mocks.rankBacklogItem.mockResolvedValueOnce(item);

    await expect(rankBacklogItemAction(input)).resolves.toEqual({ ok: true, item });
    expect(mocks.rankBacklogItem).toHaveBeenCalledWith(
      {
        backlogId: input.backlogId,
        id: input.id,
        beforeId: input.beforeId,
        afterId: input.afterId,
      },
      "writer-1",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/DEMO");
  });

  it("rejects viewers before calling the service", async () => {
    mocks.canWriteItems.mockReturnValue(false);
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "viewer-1", role: "viewer", twoFactorEnabled: true },
    });

    await expect(rankBacklogItemAction(input)).rejects.toThrow("Forbidden");
    expect(mocks.rankBacklogItem).not.toHaveBeenCalled();
  });

  it.each([
    "Backlog introuvable.",
    "L’item appartient à un autre backlog.",
    "Seules les tâches du backlog peuvent être classées.",
    "Voisin invalide pour ce backlog.",
  ])("returns the safe domain error: %s", async (message) => {
    mocks.rankBacklogItem.mockRejectedValueOnce(new Error(message));

    await expect(rankBacklogItemAction(input)).resolves.toEqual({
      ok: false,
      error: message,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("collapses unknown failures without leaking internals", async () => {
    mocks.rankBacklogItem.mockRejectedValueOnce(
      new Error("postgres password=secret internal stack"),
    );

    await expect(rankBacklogItemAction(input)).resolves.toEqual({
      ok: false,
      error: "Classement impossible.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
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

describe("bulkUpdateItemsAction", () => {
  const input = {
    backlogKey: "DEMO",
    backlogId: "11111111-1111-4111-8111-111111111111",
    itemIds: [
      "22222222-2222-4222-9222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ],
    patch: { field: "priority" as const, value: 4 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canWriteItems.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      user: { id: "writer-1", role: "contributor", twoFactorEnabled: true },
    });
  });

  it("forwards the exact service input and revalidates the backlog once", async () => {
    mocks.bulkUpdateItems.mockResolvedValueOnce({ changedCount: 2, unchangedCount: 0 });

    await expect(bulkUpdateItemsAction(input)).resolves.toEqual({
      ok: true,
      changedCount: 2,
      unchangedCount: 0,
    });
    expect(mocks.bulkUpdateItems).toHaveBeenCalledWith(
      {
        backlogId: input.backlogId,
        itemIds: input.itemIds,
        patch: input.patch,
      },
      "writer-1",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/DEMO");
  });

  it("rejects viewers before calling the bulk service", async () => {
    mocks.canWriteItems.mockReturnValue(false);
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "viewer-1", role: "viewer", twoFactorEnabled: true },
    });

    await expect(bulkUpdateItemsAction(input)).rejects.toThrow("Forbidden");
    expect(mocks.bulkUpdateItems).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("preserves bulk validation field errors", async () => {
    const parsed = bulkUpdateItemsSchema.safeParse({
      backlogId: input.backlogId,
      itemIds: [],
      patch: input.patch,
    });
    if (parsed.success) throw new Error("Expected validation failure");
    mocks.bulkUpdateItems.mockRejectedValueOnce(parsed.error);

    await expect(bulkUpdateItemsAction({ ...input, itemIds: [] })).resolves.toEqual({
      ok: false,
      error: "Sélectionnez au moins un item.",
      fieldErrors: {},
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    "Backlog introuvable.",
    "Un ou plusieurs items sont introuvables.",
    "Tous les items doivent appartenir au backlog.",
    "Statut invalide pour ce backlog.",
    "Assigné introuvable.",
    "Seules les tâches peuvent être estimées.",
    "Sprint introuvable.",
    "Le sprint appartient à un autre backlog.",
    "Un sprint terminé ne peut plus recevoir d’items.",
    "Seules les tâches peuvent être planifiées dans un sprint.",
  ])("returns the safe domain error: %s", async (message) => {
    mocks.bulkUpdateItems.mockRejectedValueOnce(new Error(message));

    await expect(bulkUpdateItemsAction(input)).resolves.toEqual({
      ok: false,
      error: message,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("collapses unknown service failures", async () => {
    mocks.bulkUpdateItems.mockRejectedValueOnce(
      new Error("postgres password=secret internal stack"),
    );

    await expect(bulkUpdateItemsAction(input)).resolves.toEqual({
      ok: false,
      error: "Modification groupée impossible.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
