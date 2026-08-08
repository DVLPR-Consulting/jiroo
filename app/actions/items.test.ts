import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  permissionDeniedError,
  resourceNotFoundError,
} from "@/test-utils/action-authorization-errors";

const classes = vi.hoisted(() => ({
  PermissionDeniedError: class PermissionDeniedError extends Error {
    readonly decision: unknown;

    constructor(decision: unknown) {
      super("denied");
      this.name = "PermissionDeniedError";
      this.decision = decision;
    }
  },
  ResourceNotFoundError: class ResourceNotFoundError extends Error {
    readonly resourceType: string;
    readonly resourceId: string;

    constructor(resourceType: string, resourceId: string) {
      super("La ressource demandée est introuvable.");
      this.name = "ResourceNotFoundError";
      this.resourceType = resourceType;
      this.resourceId = resourceId;
    }
  },
}));

const mocks = vi.hoisted(() => ({
  bulkUpdateItems: vi.fn(),
  checkPermission: vi.fn(),
  createItem: vi.fn(),
  getSession: vi.fn(),
  moveItem: vi.fn(),
  rankBacklogItem: vi.fn(),
  reparentItem: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  requireItemPermission: vi.fn(),
  requirePermission: vi.fn(),
  requireSprintPermission: vi.fn(),
  requireStatusPermission: vi.fn(),
  revalidatePath: vi.fn(),
  restoreItem: vi.fn(),
  softDeleteItem: vi.fn(),
  updateItem: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireBacklogPermissionById: mocks.requireBacklogPermissionById,
  requireItemPermission: mocks.requireItemPermission,
  requireSprintPermission: mocks.requireSprintPermission,
  requireStatusPermission: mocks.requireStatusPermission,
}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
  PermissionDeniedError: classes.PermissionDeniedError,
  requirePermission: mocks.requirePermission,
  ResourceNotFoundError: classes.ResourceNotFoundError,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/items", () => ({
  createItem: mocks.createItem,
  moveItem: mocks.moveItem,
  rankBacklogItem: mocks.rankBacklogItem,
  reparentItem: mocks.reparentItem,
  restoreItem: mocks.restoreItem,
  softDeleteItem: mocks.softDeleteItem,
  updateItem: mocks.updateItem,
}));
vi.mock("@/lib/services/item-bulk", () => ({
  bulkUpdateItems: mocks.bulkUpdateItems,
}));

import {
  bulkUpdateItemsAction,
  createItemAction,
  moveItemAction,
  rankBacklogItemAction,
  reparentItemAction,
  restoreItemAction,
  softDeleteItemAction,
  updateItemAction,
} from "@/app/actions/items";
import { bulkUpdateItemsSchema } from "@/lib/validation/bulk-item";
import { createItemSchema, updateItemSchema } from "@/lib/validation/item";

const backlogId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-9222-222222222222";
const secondItemId = "33333333-3333-4333-8333-333333333333";
const statusId = "44444444-4444-4444-8444-444444444444";
const sprintId = "55555555-5555-4555-8555-555555555555";
const otherBacklogId = "66666666-6666-4666-8666-666666666666";
const absentBacklogId = "77777777-7777-4777-8777-777777777777";
const releaseId = "88888888-8888-4888-8888-888888888888";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function authorizeStoredResource(id: string) {
  return { backlogId, resourceId: id };
}

function resetActionMocks() {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "writer-1", role: "contributor" } });
  mocks.checkPermission.mockResolvedValue({
    allowed: true,
    permission: "assignable_user",
    scope: { type: "backlog", backlogId },
    reasons: [{ type: "matching_grant" }],
  });
  mocks.requireBacklogPermissionById.mockImplementation(async ({ backlogId: id }) =>
    authorizeStoredResource(id),
  );
  mocks.requireItemPermission.mockImplementation(async ({ itemId: id }) =>
    authorizeStoredResource(id),
  );
  mocks.requireSprintPermission.mockImplementation(async ({ sprintId: id }) =>
    authorizeStoredResource(id),
  );
  mocks.requireStatusPermission.mockImplementation(async ({ statusId: id }) =>
    authorizeStoredResource(id),
  );
  mocks.createItem.mockResolvedValue({ id: itemId });
  mocks.updateItem.mockResolvedValue({ id: itemId });
  mocks.bulkUpdateItems.mockResolvedValue({ changedCount: 2, unchangedCount: 0 });
  mocks.rankBacklogItem.mockResolvedValue({ id: itemId });
  mocks.moveItem.mockResolvedValue({ id: itemId });
  mocks.reparentItem.mockResolvedValue({ id: itemId });
  mocks.softDeleteItem.mockResolvedValue({ id: itemId });
  mocks.restoreItem.mockResolvedValue({ id: itemId });
}

describe("item action permission mapping", () => {
  beforeEach(() => {
    resetActionMocks();
  });

  it("requires create_items and schedule_items when creating directly in a sprint", async () => {
    await createItemAction({
      backlogKey: "FORGED",
      backlogId,
      type: "tache",
      parentId: itemId,
      title: "Planifiée",
      sprintId,
    });

    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "writer-1",
      backlogId,
      permission: "create_items",
    });
    expect(mocks.requireSprintPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      sprintId,
      permission: "schedule_items",
    });
    expect(mocks.createItem).toHaveBeenCalled();
  });

  it("requires schedule_items for a non-null parent before creating the child", async () => {
    mocks.requireItemPermission.mockImplementation(async ({ itemId: id, permission }) => {
      if (id === itemId && permission === "schedule_items") {
        throw permissionDeniedError("schedule_items", {
          type: "backlog",
          backlogId,
        });
      }
      return authorizeStoredResource(id);
    });

    await expect(
      createItemAction({
        backlogKey: "FORGED",
        backlogId,
        type: "tache",
        parentId: itemId,
        title: "Enfant non planifiable",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Planifier les éléments » pour ce backlog.",
    });
    expect(mocks.requireItemPermission.mock.calls.map(([input]) => input)).toEqual([
      { actorId: "writer-1", itemId, permission: "browse_backlog" },
      { actorId: "writer-1", itemId, permission: "schedule_items" },
    ]);
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it("resolves a create parent with browse_backlog and rejects another stored backlog", async () => {
    const parentId = "88888888-8888-4888-8888-888888888888";
    mocks.requireItemPermission.mockImplementation(async ({ itemId: id }) =>
      id === parentId
        ? { backlogId: otherBacklogId, resourceId: parentId }
        : authorizeStoredResource(id),
    );

    await expect(
      createItemAction({
        backlogKey: "FORGED",
        backlogId,
        type: "tache",
        parentId,
        title: "Enfant",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "La ressource demandée est introuvable.",
    });
    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      itemId: parentId,
      permission: "browse_backlog",
    });
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it("resolves a reparent target with browse_backlog and rejects another stored backlog", async () => {
    const parentId = "88888888-8888-4888-8888-888888888888";
    mocks.requireItemPermission.mockImplementation(async ({ itemId: id }) =>
      id === parentId
        ? { backlogId: otherBacklogId, resourceId: parentId }
        : authorizeStoredResource(id),
    );

    await expect(
      reparentItemAction({
        backlogKey: "FORGED",
        id: itemId,
        newParentId: parentId,
        beforeId: null,
        afterId: null,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "La ressource demandée est introuvable.",
    });
    expect(mocks.requireItemPermission.mock.calls.map(([input]) => input)).toEqual([
      { actorId: "writer-1", itemId, permission: "schedule_items" },
      { actorId: "writer-1", itemId: parentId, permission: "browse_backlog" },
    ]);
    expect(mocks.reparentItem).not.toHaveBeenCalled();
  });

  it.each([
    { field: "title", value: "Nouveau", permissions: ["edit_items"] },
    { field: "statusId", value: statusId, permissions: ["edit_items", "transition_items"] },
    { field: "assigneeId", value: "assignee-1", permissions: ["edit_items", "assign_items"] },
    { field: "fixVersionIds", value: [releaseId], permissions: ["edit_items"] },
  ])("requires $permissions when updating $field", async ({ field, value, permissions }) => {
    await updateItemAction({ backlogKey: "FORGED", id: itemId, [field]: value });

    expect(mocks.requireItemPermission.mock.calls.map(([input]) => input)).toEqual(
      permissions.map((permission) => ({ actorId: "writer-1", itemId, permission })),
    );
  });

  it.each([
    { patch: { field: "priority" as const, value: 4 }, permission: "edit_items" },
    { patch: { field: "statusId" as const, value: statusId }, permission: "transition_items" },
    { patch: { field: "assigneeId" as const, value: "assignee-1" }, permission: "assign_items" },
    { patch: { field: "sprintId" as const, value: sprintId }, permission: "schedule_items" },
    {
      patch: { field: "fixVersionIds" as const, mode: "replace" as const, value: [releaseId] },
      permission: "edit_items",
    },
  ])("requires global bulk plus one backlog-scoped $permission check", async ({ patch, permission }) => {
    await bulkUpdateItemsAction({
      backlogKey: "FORGED",
      backlogId,
      itemIds: [itemId, secondItemId],
      patch,
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      permission: "bulk_change_items",
      scope: { type: "global" },
    });
    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledOnce();
    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "writer-1",
      backlogId,
      permission,
    });
    expect(mocks.requireItemPermission).not.toHaveBeenCalled();
  });

  it("keeps bulk authorization constant for the validated 500-item maximum", async () => {
    const itemIds = Array.from({ length: 500 }, (_, index) =>
      `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    );

    await bulkUpdateItemsAction({
      backlogKey: "FORGED",
      backlogId,
      itemIds,
      patch: { field: "fixVersionIds", mode: "remove", value: [releaseId] },
    });

    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledTimes(1);
    expect(mocks.requireItemPermission).not.toHaveBeenCalled();
    expect(mocks.bulkUpdateItems).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "rank",
      run: () =>
        rankBacklogItemAction({
          backlogKey: "FORGED",
          backlogId,
          id: itemId,
          beforeId: null,
          afterId: null,
        }),
    },
    {
      name: "reparent",
      run: () =>
        reparentItemAction({
          backlogKey: "FORGED",
          id: itemId,
          newParentId: null,
          beforeId: null,
          afterId: null,
        }),
    },
  ])("requires schedule_items by stored item for $name", async ({ run }) => {
    await run();
    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      itemId,
      permission: "schedule_items",
    });
  });

  it("combines schedule and transition permission for a ranked status move", async () => {
    await moveItemAction({
      backlogKey: "FORGED",
      id: itemId,
      statusId,
      beforeId: null,
      afterId: null,
    });

    expect(mocks.requireItemPermission.mock.calls.map(([input]) => input.permission)).toEqual([
      "schedule_items",
      "transition_items",
    ]);
  });

  it.each([
    { name: "soft delete", run: () => softDeleteItemAction({ id: itemId, backlogKey: "FORGED" }), permission: "delete_items" },
    { name: "restore", run: () => restoreItemAction({ id: itemId, backlogKey: "FORGED" }), permission: "restore_items" },
  ])("requires $permission by stored item before $name", async ({ run, permission }) => {
    await run();
    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      itemId,
      permission,
    });
  });

  it("does not let a forged backlog key authorize an item from another backlog", async () => {
    mocks.requireItemPermission.mockRejectedValueOnce(
      permissionDeniedError("edit_items", { type: "backlog", backlogId }),
    );

    await expect(
      updateItemAction({ backlogKey: "AUTHORIZED-BUT-FORGED", id: itemId, title: "Interdit" }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Modifier les éléments » pour ce backlog.",
    });
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("returns a structured item permission denial with the exact label", async () => {
    mocks.requireItemPermission.mockRejectedValueOnce(
      permissionDeniedError("edit_items", { type: "backlog", backlogId }),
    );

    await expect(
      updateItemAction({ backlogKey: "FORGED", id: itemId, title: "Interdit" }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Modifier les éléments » pour ce backlog.",
    });
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("returns the same structured not-found result for hidden and absent resources", async () => {
    for (const resourceId of ["hidden-item", "absent-item"]) {
      mocks.requireItemPermission.mockRejectedValueOnce(
        resourceNotFoundError("item", resourceId),
      );
      await expect(
        updateItemAction({ backlogKey: "FORGED", id: resourceId, title: "Interdit" }),
      ).resolves.toEqual({
        ok: false,
        error: "La ressource demandée est introuvable.",
      });
    }
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("does not let global bulk_change_items substitute for backlog edit permission", async () => {
    mocks.requireBacklogPermissionById.mockRejectedValueOnce(
      permissionDeniedError("edit_items", { type: "backlog", backlogId }),
    );

    await expect(
      bulkUpdateItemsAction({
        backlogKey: "DEMO",
        backlogId,
        itemIds: [itemId],
        patch: { field: "priority", value: 4 },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Modifier les éléments » pour ce backlog.",
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      permission: "bulk_change_items",
      scope: { type: "global" },
    });
    expect(mocks.bulkUpdateItems).not.toHaveBeenCalled();
  });

  it("lets an editor assign fix versions but stops a reader before mutation", async () => {
    await updateItemAction({ backlogKey: "FORGED", id: itemId, fixVersionIds: [releaseId] });

    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      itemId,
      permission: "edit_items",
    });
    expect(mocks.updateItem).toHaveBeenCalledWith(
      { id: itemId, fixVersionIds: [releaseId] },
      "writer-1",
      expect.stringMatching(uuidPattern),
    );

    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "reader-1", role: "viewer" } });
    mocks.requireItemPermission.mockRejectedValueOnce(
      permissionDeniedError("edit_items", { type: "backlog", backlogId }),
    );
    await expect(
      updateItemAction({ backlogKey: "FORGED", id: itemId, fixVersionIds: [releaseId] }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Modifier les éléments » pour ce backlog.",
    });
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("uses create_items for creation-time fix versions and passes one correlation", async () => {
    await createItemAction({
      backlogKey: "FORGED",
      backlogId,
      type: "composant",
      parentId: null,
      title: "Versionnée",
      fixVersionIds: [releaseId],
    });

    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "writer-1",
      backlogId,
      permission: "create_items",
    });
    expect(mocks.createItem).toHaveBeenCalledWith(
      {
        backlogId,
        type: "composant",
        parentId: null,
        title: "Versionnée",
        fixVersionIds: [releaseId],
      },
      "writer-1",
      expect.stringMatching(uuidPattern),
    );
  });

  it.each([
    { name: "existing", forgedBacklogId: otherBacklogId },
    { name: "absent", forgedBacklogId: absentBacklogId },
  ])("rejects an $name forged backlog before bulk mutation", async ({ forgedBacklogId }) => {
    await expect(
      bulkUpdateItemsAction({
        backlogKey: "FORGED",
        backlogId: forgedBacklogId,
        itemIds: [itemId, secondItemId],
        patch: { field: "priority", value: 4 },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "La ressource demandée est introuvable.",
    });
    expect(mocks.bulkUpdateItems).not.toHaveBeenCalled();
  });

  it.each([
    { name: "existing", forgedBacklogId: otherBacklogId },
    { name: "absent", forgedBacklogId: absentBacklogId },
  ])("rejects an $name forged backlog before ranking", async ({ forgedBacklogId }) => {
    await expect(
      rankBacklogItemAction({
        backlogKey: "FORGED",
        backlogId: forgedBacklogId,
        id: itemId,
        beforeId: null,
        afterId: null,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "La ressource demandée est introuvable.",
    });
    expect(mocks.rankBacklogItem).not.toHaveBeenCalled();
  });

  it("rejects an assignee who lacks assignable_user in the stored item backlog", async () => {
    mocks.checkPermission.mockResolvedValueOnce({
      allowed: false,
      permission: "assignable_user",
      scope: { type: "backlog", backlogId },
      reasons: [{ type: "no_matching_grant" }],
    });

    await expect(
      updateItemAction({
        backlogKey: "DEMO",
        id: itemId,
        assigneeId: "unassignable-1",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Être assignable » pour ce backlog.",
    });
    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "unassignable-1",
      permission: "assignable_user",
      scope: { type: "backlog", backlogId },
    });
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("evaluates assignable_user without invoking the audited mutation boundary for the target", async () => {
    await updateItemAction({
      backlogKey: "DEMO",
      id: itemId,
      assigneeId: "platform-admin-target",
    });

    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "platform-admin-target",
      permission: "assignable_user",
      scope: { type: "backlog", backlogId },
    });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.updateItem).toHaveBeenCalled();
  });

  it("requires the assignee to be assignable in the stored bulk backlog", async () => {
    mocks.checkPermission.mockResolvedValueOnce({
      allowed: false,
      permission: "assignable_user",
      scope: { type: "backlog", backlogId },
      reasons: [{ type: "no_matching_grant" }],
    });

    await expect(
      bulkUpdateItemsAction({
        backlogKey: "DEMO",
        backlogId,
        itemIds: [itemId, secondItemId],
        patch: { field: "assigneeId", value: "assignee-1" },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Être assignable » pour ce backlog.",
    });
    expect(mocks.requirePermission.mock.calls.map(([input]) => input)).toEqual([
      { actorId: "writer-1", permission: "bulk_change_items", scope: { type: "global" } },
    ]);
    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "assignee-1",
      permission: "assignable_user",
      scope: { type: "backlog", backlogId },
    });
    expect(mocks.bulkUpdateItems).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "sprint",
      run: () =>
        createItemAction({
          backlogKey: "DEMO",
          backlogId,
          type: "tache",
          parentId: itemId,
          title: "Croisée",
          sprintId,
        }),
      helper: mocks.requireSprintPermission,
      service: mocks.createItem,
    },
    {
      name: "status",
      run: () => updateItemAction({ backlogKey: "DEMO", id: itemId, statusId }),
      helper: mocks.requireStatusPermission,
      service: mocks.updateItem,
    },
  ])("rejects a stored $name target from another backlog", async ({ name, run, helper, service }) => {
    helper.mockResolvedValueOnce({ backlogId: "backlog-2", resourceId: `${name}-other` });
    await expect(run()).resolves.toEqual({
      ok: false,
      error: "La ressource demandée est introuvable.",
    });
    expect(service).not.toHaveBeenCalled();
  });

  it("keeps a rejected authorization implementation local to this describe", async () => {
    mocks.requireItemPermission.mockRejectedValue(
      permissionDeniedError("schedule_items", { type: "backlog", backlogId }),
    );

    await expect(
      rankBacklogItemAction({
        backlogKey: "DEMO",
        backlogId,
        id: itemId,
        beforeId: null,
        afterId: null,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Planifier les éléments » pour ce backlog.",
    });
  });
});

describe("item action validation", () => {
  beforeEach(() => {
    resetActionMocks();
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
      expect.stringMatching(uuidPattern),
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
      expect.stringMatching(uuidPattern),
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
    resetActionMocks();
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
    mocks.requireItemPermission.mockRejectedValueOnce(
      permissionDeniedError("schedule_items", {
        type: "backlog",
        backlogId: input.backlogId,
      }),
    );
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "viewer-1", role: "viewer", twoFactorEnabled: true },
    });

    await expect(rankBacklogItemAction(input)).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Planifier les éléments » pour ce backlog.",
    });
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
    resetActionMocks();
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
    resetActionMocks();
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
      expect.stringMatching(uuidPattern),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/DEMO");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/DEMO/reports");
  });

  it("forwards one correlation to soft deletion after authorization", async () => {
    await expect(
      softDeleteItemAction({ id: itemId, backlogKey: "DEMO" }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.requireItemPermission).toHaveBeenCalledBefore(mocks.softDeleteItem);
    expect(mocks.softDeleteItem).toHaveBeenCalledWith(
      { id: itemId },
      "writer-1",
      expect.stringMatching(uuidPattern),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/DEMO/reports");
  });

  it("rejects viewers before calling the bulk service", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      permissionDeniedError("bulk_change_items", { type: "global" }),
    );
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "viewer-1", role: "viewer", twoFactorEnabled: true },
    });

    await expect(bulkUpdateItemsAction(input)).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Modifier des éléments en masse ».",
    });
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

  it.each([
    "Un ou plusieurs items sont introuvables.",
    "Tous les items doivent appartenir au backlog.",
  ])("does not expose whether a selected item is absent or belongs to a hidden backlog", async (message) => {
    mocks.bulkUpdateItems.mockRejectedValueOnce(new Error(message));

    await expect(bulkUpdateItemsAction(input)).resolves.toEqual({
      ok: false,
      error: "Un ou plusieurs items sont introuvables.",
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
