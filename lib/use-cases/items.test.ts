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
  checkPermission: vi.fn(),
  createItem: vi.fn(),
  publishBacklogChange: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  requireItemPermission: vi.fn(),
  requireSprintPermission: vi.fn(),
  requireStatusPermission: vi.fn(),
  updateItem: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/realtime/publish", () => ({
  publishBacklogChange: mocks.publishBacklogChange,
}));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireBacklogPermissionById: mocks.requireBacklogPermissionById,
  requireItemPermission: mocks.requireItemPermission,
  requireSprintPermission: mocks.requireSprintPermission,
  requireStatusPermission: mocks.requireStatusPermission,
}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
  PermissionDeniedError: classes.PermissionDeniedError,
  ResourceNotFoundError: classes.ResourceNotFoundError,
}));
vi.mock("@/lib/services/items", () => ({
  createItem: mocks.createItem,
  updateItem: mocks.updateItem,
}));

import { currentActivitySource, type Actor } from "@/lib/auth/actor-context";
import { createItemUseCase, updateItemUseCase } from "@/lib/use-cases/items";

const backlogId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-9222-222222222222";
const parentId = "33333333-3333-4333-8333-333333333333";
const statusId = "44444444-4444-4444-8444-444444444444";
const sprintId = "55555555-5555-4555-8555-555555555555";
const otherBacklogId = "66666666-6666-4666-8666-666666666666";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const writer: Actor = { actorId: "writer-1", source: "api", tokenId: "token-1" };

function stored(id: string, inBacklog = backlogId) {
  return { backlogId: inBacklog, resourceId: id };
}

function createInput(overrides: Partial<Parameters<typeof createItemUseCase>[1]> = {}) {
  return {
    backlogId,
    type: "tache" as const,
    parentId: null,
    title: "Nouvelle tâche",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.checkPermission.mockResolvedValue({
    allowed: true,
    permission: "assignable_user",
    scope: { type: "backlog", backlogId },
    reasons: [{ type: "matching_grant" }],
  });
  mocks.requireBacklogPermissionById.mockResolvedValue(stored(backlogId));
  mocks.requireItemPermission.mockImplementation(async ({ itemId: id }: { itemId: string }) => stored(id));
  mocks.requireSprintPermission.mockResolvedValue(stored(sprintId));
  mocks.requireStatusPermission.mockResolvedValue(stored(statusId));
  mocks.createItem.mockResolvedValue({ id: itemId, key: "CASS-1" });
  mocks.updateItem.mockResolvedValue({ id: itemId, key: "CASS-1" });
  mocks.publishBacklogChange.mockResolvedValue(undefined);
});

describe("createItemUseCase", () => {
  it("authorizes, creates with one server correlation and publishes the new item", async () => {
    const input = createInput({ parentId });

    await expect(createItemUseCase(writer, input)).resolves.toEqual({
      item: { id: itemId, key: "CASS-1" },
      backlogId,
    });

    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "writer-1",
      backlogId,
      permission: "create_items",
    });
    expect(mocks.requireItemPermission).toHaveBeenNthCalledWith(1, {
      actorId: "writer-1",
      itemId: parentId,
      permission: "browse_backlog",
    });
    expect(mocks.requireItemPermission).toHaveBeenNthCalledWith(2, {
      actorId: "writer-1",
      itemId: parentId,
      permission: "schedule_items",
    });
    expect(mocks.createItem).toHaveBeenCalledWith(input, "writer-1", expect.stringMatching(uuidPattern));
    expect(mocks.publishBacklogChange).toHaveBeenCalledWith({
      kind: "item",
      backlogId,
      itemIds: [itemId, parentId],
      actorId: "writer-1",
    });
    expect(mocks.createItem.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.publishBacklogChange.mock.invocationCallOrder[0]!,
    );
  });

  it("checks the sprint and the assignee in the stored backlog before creating", async () => {
    await createItemUseCase(writer, createInput({ sprintId, assigneeId: "assignee-1" }));

    expect(mocks.requireSprintPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      sprintId,
      permission: "schedule_items",
    });
    expect(mocks.requireBacklogPermissionById).toHaveBeenLastCalledWith({
      actorId: "writer-1",
      backlogId,
      permission: "assign_items",
    });
    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "assignee-1",
      permission: "assignable_user",
      scope: { type: "backlog", backlogId },
    });
    expect(mocks.checkPermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createItem.mock.invocationCallOrder[0]!,
    );
  });

  it("hides a parent stored in another backlog and never reaches the service", async () => {
    mocks.requireItemPermission.mockResolvedValueOnce(stored(parentId, otherBacklogId));

    await expect(createItemUseCase(writer, createInput({ parentId }))).rejects.toMatchObject({
      name: "ResourceNotFoundError",
      resourceType: "item",
      resourceId: parentId,
    });
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.publishBacklogChange).not.toHaveBeenCalled();
  });

  it("rejects an assignee who is not assignable there before creating", async () => {
    mocks.checkPermission.mockResolvedValueOnce({
      allowed: false,
      permission: "assignable_user",
      scope: { type: "backlog", backlogId },
      reasons: [{ type: "no_matching_grant" }],
    });

    await expect(createItemUseCase(writer, createInput({ assigneeId: "reader-1" }))).rejects.toMatchObject({
      name: "PermissionDeniedError",
    });
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it("runs the service inside the actor scope so activities can read the source", async () => {
    mocks.createItem.mockImplementation(async () => ({ id: itemId, source: currentActivitySource() }));

    const { item } = await createItemUseCase(writer, createInput());

    expect(item).toEqual({ id: itemId, source: "api" });
    expect(currentActivitySource()).toBe("ui");
  });

  it("lets authorization and service errors through unchanged", async () => {
    mocks.requireBacklogPermissionById.mockRejectedValueOnce(
      permissionDeniedError("create_items", { type: "backlog", backlogId }),
    );
    await expect(createItemUseCase(writer, createInput())).rejects.toMatchObject({ name: "PermissionDeniedError" });

    mocks.createItem.mockRejectedValueOnce(new Error("Statut invalide pour ce backlog."));
    await expect(createItemUseCase(writer, createInput())).rejects.toThrow("Statut invalide pour ce backlog.");
    expect(mocks.publishBacklogChange).not.toHaveBeenCalled();
  });
});

describe("updateItemUseCase", () => {
  it("requires edit, transition and assign permissions for the fields present", async () => {
    const input = { id: itemId, title: "Titre", statusId, assigneeId: "assignee-1" };

    await expect(updateItemUseCase(writer, input)).resolves.toEqual({
      item: { id: itemId, key: "CASS-1" },
      backlogId,
    });

    expect(mocks.requireItemPermission.mock.calls.map(([call]) => call.permission)).toEqual([
      "edit_items",
      "transition_items",
      "assign_items",
    ]);
    expect(mocks.requireStatusPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      statusId,
      permission: "transition_items",
    });
    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "assignee-1",
      permission: "assignable_user",
      scope: { type: "backlog", backlogId },
    });
    expect(mocks.updateItem).toHaveBeenCalledWith(input, "writer-1", expect.stringMatching(uuidPattern));
    expect(mocks.publishBacklogChange).toHaveBeenCalledWith({
      kind: "item",
      backlogId,
      itemIds: [itemId],
      actorId: "writer-1",
    });
  });

  it("asks only for edit_items when neither status nor assignee is present", async () => {
    await updateItemUseCase(writer, { id: itemId, description: "Détails" });

    expect(mocks.requireItemPermission).toHaveBeenCalledTimes(1);
    expect(mocks.requireStatusPermission).not.toHaveBeenCalled();
    expect(mocks.checkPermission).not.toHaveBeenCalled();
  });

  it("hides a status from another backlog before updating", async () => {
    mocks.requireStatusPermission.mockResolvedValueOnce(stored(statusId, otherBacklogId));

    await expect(updateItemUseCase(writer, { id: itemId, statusId })).rejects.toMatchObject({
      name: "ResourceNotFoundError",
      resourceType: "status",
    });
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("surfaces a hidden item as the same not-found error", async () => {
    mocks.requireItemPermission.mockRejectedValueOnce(resourceNotFoundError("item", itemId));

    await expect(updateItemUseCase(writer, { id: itemId, title: "x" })).rejects.toMatchObject({
      name: "ResourceNotFoundError",
    });
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("runs the service inside the actor scope", async () => {
    mocks.updateItem.mockImplementation(async () => ({ id: itemId, source: currentActivitySource() }));

    const { item } = await updateItemUseCase({ actorId: "agent-1", source: "mcp" }, { id: itemId, title: "x" });

    expect(item).toEqual({ id: itemId, source: "mcp" });
  });
});
