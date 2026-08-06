import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createView: vi.fn(),
  deleteView: vi.fn(),
  getSession: vi.fn(),
  renameView: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  requireViewMutationPermission: vi.fn(),
  revalidatePath: vi.fn(),
  setShared: vi.fn(),
  updateView: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireBacklogPermissionById: mocks.requireBacklogPermissionById,
  requireViewMutationPermission: mocks.requireViewMutationPermission,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/views", () => ({
  createView: mocks.createView,
  deleteView: mocks.deleteView,
  renameView: mocks.renameView,
  setShared: mocks.setShared,
  updateView: mocks.updateView,
}));

import {
  createViewAction,
  deleteViewAction,
  renameViewAction,
  setSharedViewAction,
  updateViewAction,
} from "@/app/actions/views";

const viewState = {
  displayMode: "board" as const,
  filters: {
    q: "",
    types: [],
    statusIds: [],
    priorities: [],
    assignees: [],
    labels: [],
    kind: [],
    underIds: [],
  },
  group: null,
  sort: null,
};

describe("view action permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1", role: "viewer" } });
    mocks.requireBacklogPermissionById.mockResolvedValue({
      backlogId: "backlog-1",
      resourceId: "backlog-1",
    });
    mocks.requireViewMutationPermission.mockResolvedValue({
      backlogId: "backlog-1",
      resourceId: "view-1",
      ownerId: "owner-1",
      shared: false,
    });
    mocks.createView.mockResolvedValue({ id: "view-1" });
    mocks.updateView.mockResolvedValue({ id: "view-1" });
    mocks.renameView.mockResolvedValue({ id: "view-1" });
    mocks.setShared.mockResolvedValue({ id: "view-1" });
  });

  it.each([
    { shared: false, permission: "browse_backlog" },
    { shared: true, permission: "manage_shared_views" },
  ])("requires $permission when creating a shared=$shared view", async ({ shared, permission }) => {
    await createViewAction({
      backlogKey: "FORGED",
      backlogId: "backlog-1",
      name: "Vue",
      ...viewState,
      shared,
    });

    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "owner-1",
      backlogId: "backlog-1",
      permission,
    });
  });

  it("resolves stored ownership before personal update, rename, and delete", async () => {
    await updateViewAction({ backlogKey: "FORGED", id: "view-1", ...viewState });
    await renameViewAction({ backlogKey: "FORGED", id: "view-1", name: "Renommée" });
    await deleteViewAction({ backlogKey: "FORGED", id: "view-1" });

    expect(mocks.requireViewMutationPermission.mock.calls.map(([input]) => input)).toEqual(
      Array.from({ length: 3 }, () => ({ actorId: "owner-1", viewId: "view-1" })),
    );
  });

  it("requires a shared mutation decision before changing visibility", async () => {
    await setSharedViewAction({ backlogKey: "FORGED", id: "view-1", shared: true });

    expect(mocks.requireViewMutationPermission).toHaveBeenCalledWith({
      actorId: "owner-1",
      viewId: "view-1",
      sharedMutation: true,
    });
  });

  it("passes a stored shared-view manager decision to the service", async () => {
    mocks.requireViewMutationPermission.mockResolvedValueOnce({
      backlogId: "backlog-1",
      resourceId: "view-1",
      ownerId: "other-owner",
      shared: true,
    });

    await deleteViewAction({ backlogKey: "DEMO", id: "view-1" });

    expect(mocks.deleteView).toHaveBeenCalledWith(
      "view-1",
      "owner-1",
      { allowAny: true },
    );
  });
});
