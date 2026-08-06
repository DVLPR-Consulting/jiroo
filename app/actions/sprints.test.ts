import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assignItemsToSprint: vi.fn(),
  canWriteItems: vi.fn(),
  completeSprint: vi.fn(),
  createSprint: vi.fn(),
  getSession: vi.fn(),
  moveItemToSprint: vi.fn(),
  reorderSprint: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  requireItemPermission: vi.fn(),
  requireSprintPermission: vi.fn(),
  revalidatePath: vi.fn(),
  startSprint: vi.fn(),
  updateSprint: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/rbac", () => ({ canWriteItems: mocks.canWriteItems }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireBacklogPermissionById: mocks.requireBacklogPermissionById,
  requireItemPermission: mocks.requireItemPermission,
  requireSprintPermission: mocks.requireSprintPermission,
}));
vi.mock("@/lib/auth/authorization", () => ({ ResourceNotFoundError: Error }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/sprints", () => ({
  assignItemsToSprint: mocks.assignItemsToSprint,
  createSprint: mocks.createSprint,
  moveItemToSprint: mocks.moveItemToSprint,
  reorderSprint: mocks.reorderSprint,
  updateSprint: mocks.updateSprint,
}));
vi.mock("@/lib/services/sprint-lifecycle", () => ({
  completeSprint: mocks.completeSprint,
  IncompleteSprintSubtasksError: class extends Error {},
  startSprint: mocks.startSprint,
}));

import {
  assignSprintItemsAction,
  completeSprintAction,
  createSprintAction,
  moveSprintItemAction,
  reorderSprintAction,
  startSprintAction,
  updateSprintAction,
} from "@/app/actions/sprints";

const backlogId = "11111111-1111-4111-8111-111111111111";
const sprintId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";

describe("sprint actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canWriteItems.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      user: { id: "writer-1", role: "contributor" },
    });
    mocks.requireBacklogPermissionById.mockResolvedValue({ backlogId, resourceId: backlogId });
    mocks.requireItemPermission.mockImplementation(async ({ itemId: id }) => ({
      backlogId,
      resourceId: id,
    }));
    mocks.requireSprintPermission.mockImplementation(async ({ sprintId: id }) => ({
      backlogId,
      resourceId: id,
    }));
  });

  it("maps sprint lifecycle operations to manage_sprints by stored ownership", async () => {
    mocks.createSprint.mockResolvedValue({ id: sprintId });
    mocks.updateSprint.mockResolvedValue({ id: sprintId });
    mocks.reorderSprint.mockResolvedValue({ id: sprintId });
    mocks.startSprint.mockResolvedValue({ sprintId });
    mocks.completeSprint.mockResolvedValue({ sprintId });

    await createSprintAction({ backlogKey: "FORGED", backlogId });
    await updateSprintAction({ backlogKey: "FORGED", id: sprintId, backlogId, name: "Sprint" });
    await reorderSprintAction({
      backlogKey: "FORGED",
      id: sprintId,
      backlogId,
      beforeId: null,
      afterId: null,
    });
    await startSprintAction({
      backlogKey: "FORGED",
      id: sprintId,
      backlogId,
      name: "Sprint",
      goal: null,
      startAt: "2026-08-05T09:00:00.000Z",
      endAt: "2026-08-19T09:00:00.000Z",
      capacityPoints: null,
    });
    await completeSprintAction({
      backlogKey: "FORGED",
      id: sprintId,
      backlogId,
      destination: { type: "backlog" },
    });

    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "writer-1",
      backlogId,
      permission: "manage_sprints",
    });
    expect(mocks.requireSprintPermission.mock.calls.map(([input]) => input)).toEqual(
      Array.from({ length: 4 }, () => ({
        actorId: "writer-1",
        sprintId,
        permission: "manage_sprints",
      })),
    );
  });

  it("maps sprint membership operations to schedule_items on every stored item", async () => {
    const secondItemId = "44444444-4444-4444-8444-444444444444";
    mocks.assignItemsToSprint.mockResolvedValue({ changedCount: 2, unchangedCount: 0 });
    mocks.moveItemToSprint.mockResolvedValue({ id: itemId });

    await assignSprintItemsAction({
      backlogKey: "FORGED",
      backlogId,
      itemIds: [itemId, secondItemId],
      sprintId,
    });
    expect(mocks.requireItemPermission.mock.calls.map(([input]) => input)).toEqual([
      { actorId: "writer-1", itemId, permission: "schedule_items" },
      { actorId: "writer-1", itemId: secondItemId, permission: "schedule_items" },
    ]);

    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "writer-1", role: "contributor" } });
    mocks.requireItemPermission.mockResolvedValue({ backlogId, resourceId: itemId });
    mocks.requireSprintPermission.mockResolvedValue({ backlogId, resourceId: sprintId });
    mocks.moveItemToSprint.mockResolvedValue({ id: itemId });
    await moveSprintItemAction({
      backlogKey: "FORGED",
      backlogId,
      itemId,
      sprintId,
      beforeId: null,
      afterId: null,
    });
    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      itemId,
      permission: "schedule_items",
    });
  });

  it("does not let manage_sprints substitute for schedule_items", async () => {
    mocks.requireItemPermission.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(
      assignSprintItemsAction({
        backlogKey: "DEMO",
        backlogId,
        itemIds: [itemId],
        sprintId,
      }),
    ).rejects.toThrow("Forbidden");
    expect(mocks.assignItemsToSprint).not.toHaveBeenCalled();
  });

  it("forwards planning commands with the authenticated actor and revalidates", async () => {
    mocks.createSprint.mockResolvedValue({ id: sprintId, name: "Sprint 1" });
    mocks.updateSprint.mockResolvedValue({ id: sprintId, name: "Sprint produit" });
    mocks.reorderSprint.mockResolvedValue({ id: sprintId, rank: "a1" });
    mocks.assignItemsToSprint.mockResolvedValue({ changedCount: 1, unchangedCount: 0 });
    mocks.moveItemToSprint.mockResolvedValue({ id: itemId, rank: "a2" });

    await expect(
      createSprintAction({ backlogKey: "DEMO", backlogId }),
    ).resolves.toEqual({ ok: true, sprint: { id: sprintId, name: "Sprint 1" } });
    await updateSprintAction({
      backlogKey: "DEMO",
      id: sprintId,
      backlogId,
      name: "Sprint produit",
    });
    await reorderSprintAction({
      backlogKey: "DEMO",
      id: sprintId,
      backlogId,
      beforeId: null,
      afterId: null,
    });
    await assignSprintItemsAction({
      backlogKey: "DEMO",
      backlogId,
      itemIds: [itemId],
      sprintId,
    });
    await moveSprintItemAction({
      backlogKey: "DEMO",
      backlogId,
      itemId,
      sprintId,
      beforeId: null,
      afterId: null,
    });

    expect(mocks.createSprint).toHaveBeenCalledWith({ backlogId }, "writer-1");
    expect(mocks.updateSprint).toHaveBeenCalledWith(
      { id: sprintId, backlogId, name: "Sprint produit" },
      "writer-1",
    );
    expect(mocks.reorderSprint).toHaveBeenCalledWith(
      { id: sprintId, backlogId, beforeId: null, afterId: null },
      "writer-1",
    );
    expect(mocks.assignItemsToSprint).toHaveBeenCalledWith(
      { backlogId, itemIds: [itemId], sprintId },
      "writer-1",
    );
    expect(mocks.moveItemToSprint).toHaveBeenCalledWith(
      { backlogId, itemId, sprintId, beforeId: null, afterId: null },
      "writer-1",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(5);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/DEMO");
  });

  it("returns compact lifecycle successes", async () => {
    mocks.startSprint.mockResolvedValue({
      sprintId,
      committedItemCount: 2,
      committedPoints: 8,
      unestimatedCount: 1,
    });
    mocks.completeSprint.mockResolvedValue({
      sprintId,
      completedItemCount: 1,
      carriedItemCount: 1,
      destinationSprintId: null,
    });
    const startPayload = {
      backlogKey: "DEMO",
      id: sprintId,
      backlogId,
      name: "Sprint 1",
      goal: null,
      startAt: "2026-08-05T09:00:00.000Z",
      endAt: "2026-08-19T09:00:00.000Z",
      capacityPoints: 10,
    };

    await expect(startSprintAction(startPayload)).resolves.toEqual({
      ok: true,
      sprintId,
      committedItemCount: 2,
      committedPoints: 8,
      unestimatedCount: 1,
    });
    await expect(
      completeSprintAction({
        backlogKey: "DEMO",
        id: sprintId,
        backlogId,
        destination: { type: "backlog" },
      }),
    ).resolves.toEqual({
      ok: true,
      sprintId,
      completedItemCount: 1,
      carriedItemCount: 1,
      destinationSprintId: null,
    });
    expect(mocks.startSprint).toHaveBeenCalledWith(
      {
        id: sprintId,
        backlogId,
        name: "Sprint 1",
        goal: null,
        startAt: "2026-08-05T09:00:00.000Z",
        endAt: "2026-08-19T09:00:00.000Z",
        capacityPoints: 10,
      },
      "writer-1",
    );
  });

  it("blocks a viewer before every planning and lifecycle service call", async () => {
    mocks.requireBacklogPermissionById.mockRejectedValue(new Error("Forbidden"));
    mocks.requireItemPermission.mockRejectedValue(new Error("Forbidden"));
    mocks.requireSprintPermission.mockRejectedValue(new Error("Forbidden"));
    mocks.getSession.mockResolvedValue({ user: { id: "viewer-1", role: "viewer" } });

    const calls = [
      () => createSprintAction({ backlogKey: "DEMO", backlogId }),
      () =>
        updateSprintAction({ backlogKey: "DEMO", id: sprintId, backlogId, name: "X" }),
      () =>
        reorderSprintAction({
          backlogKey: "DEMO",
          id: sprintId,
          backlogId,
          beforeId: null,
          afterId: null,
        }),
      () =>
        assignSprintItemsAction({
          backlogKey: "DEMO",
          backlogId,
          itemIds: [itemId],
          sprintId,
        }),
      () =>
        moveSprintItemAction({
          backlogKey: "DEMO",
          backlogId,
          itemId,
          sprintId,
          beforeId: null,
          afterId: null,
        }),
      () =>
        startSprintAction({
          backlogKey: "DEMO",
          id: sprintId,
          backlogId,
          name: "Sprint 1",
          goal: null,
          startAt: "2026-08-05T09:00:00.000Z",
          endAt: "2026-08-19T09:00:00.000Z",
          capacityPoints: null,
        }),
      () =>
        completeSprintAction({
          backlogKey: "DEMO",
          id: sprintId,
          backlogId,
          destination: { type: "backlog" },
        }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toThrow("Forbidden");
    }
    for (const service of [
      mocks.createSprint,
      mocks.updateSprint,
      mocks.reorderSprint,
      mocks.assignItemsToSprint,
      mocks.moveItemToSprint,
      mocks.startSprint,
      mocks.completeSprint,
    ]) {
      expect(service).not.toHaveBeenCalled();
    }
  });

  it("preserves known start errors and hides unknown failures", async () => {
    const payload = {
      backlogKey: "DEMO",
      id: sprintId,
      backlogId,
      name: "Sprint 1",
      goal: null,
      startAt: "2026-08-05T09:00:00.000Z",
      endAt: "2026-08-19T09:00:00.000Z",
      capacityPoints: null,
    };
    mocks.startSprint.mockRejectedValueOnce(
      new Error("Un sprint est déjà actif pour ce backlog."),
    );
    await expect(startSprintAction(payload)).resolves.toEqual({
      ok: false,
      error: "Un sprint est déjà actif pour ce backlog.",
    });
    mocks.startSprint.mockRejectedValueOnce(new Error("postgres password=secret"));
    await expect(startSprintAction(payload)).resolves.toEqual({
      ok: false,
      error: "Démarrage du sprint impossible.",
    });
  });

  it("returns blocker keys and hides unknown completion failures", async () => {
    const payload = {
      backlogKey: "DEMO",
      id: sprintId,
      backlogId,
      destination: { type: "backlog" as const },
    };
    mocks.completeSprint.mockRejectedValueOnce(
      Object.assign(
        new Error("Terminez les sous-tâches avant de clôturer le sprint."),
        { name: "IncompleteSprintSubtasksError", itemKeys: ["DEMO-42"] },
      ),
    );
    await expect(completeSprintAction(payload)).resolves.toEqual({
      ok: false,
      error: "Terminez les sous-tâches avant de clôturer le sprint.",
      itemKeys: ["DEMO-42"],
    });
    mocks.completeSprint.mockRejectedValueOnce(new Error("internal SQL"));
    await expect(completeSprintAction(payload)).resolves.toEqual({
      ok: false,
      error: "Clôture du sprint impossible.",
    });
  });
});
