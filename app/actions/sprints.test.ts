import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";
import { startSprintSchema, updateSprintSchema } from "@/lib/validation/sprint";

const classes = vi.hoisted(() => ({
  ResourceNotFoundError: class ResourceNotFoundError extends Error {
    constructor() {
      super("La ressource demandée est introuvable.");
      this.name = "ResourceNotFoundError";
    }
  },
}));

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
  invalidateBacklog: vi.fn(),
  notifyUsers: vi.fn(),
  startSprint: vi.fn(),
  updateSprint: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/realtime/publish", () => ({ invalidateBacklog: mocks.invalidateBacklog, notifyUsers: mocks.notifyUsers }));
vi.mock("@/lib/auth/rbac", () => ({ canWriteItems: mocks.canWriteItems }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireBacklogPermissionById: mocks.requireBacklogPermissionById,
  requireItemPermission: mocks.requireItemPermission,
  requireSprintPermission: mocks.requireSprintPermission,
}));
vi.mock("@/lib/auth/authorization", () => ({
  ResourceNotFoundError: classes.ResourceNotFoundError,
}));
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
const otherBacklogId = "44444444-4444-4444-8444-444444444444";
const absentBacklogId = "55555555-5555-4555-8555-555555555555";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
    mocks.requireItemPermission.mockRejectedValueOnce(
      permissionDeniedError("schedule_items", { type: "backlog", backlogId }),
    );

    await expect(
      assignSprintItemsAction({
        backlogKey: "DEMO",
        backlogId,
        itemIds: [itemId],
        sprintId,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Planifier les éléments » pour ce backlog.",
    });
    expect(mocks.assignItemsToSprint).not.toHaveBeenCalled();
  });

  it("returns a structured sprint permission denial", async () => {
    mocks.requireSprintPermission.mockRejectedValueOnce(
      permissionDeniedError("manage_sprints", { type: "backlog", backlogId }),
    );

    await expect(
      updateSprintAction({
        backlogKey: "FORGED",
        id: sprintId,
        backlogId,
        name: "Sprint",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Gérer les sprints » pour ce backlog.",
    });
    expect(mocks.updateSprint).not.toHaveBeenCalled();
  });

  it.each([
    { backlogKind: "existing", forgedBacklogId: otherBacklogId },
    { backlogKind: "absent", forgedBacklogId: absentBacklogId },
  ])(
    "rejects an $backlogKind forged backlog identically before every stored sprint mutation",
    async ({ forgedBacklogId }) => {
      const cases = [
        {
          service: mocks.updateSprint,
          run: () =>
            updateSprintAction({
              backlogKey: "FORGED",
              id: sprintId,
              backlogId: forgedBacklogId,
              name: "Sprint",
            }),
        },
        {
          service: mocks.reorderSprint,
          run: () =>
            reorderSprintAction({
              backlogKey: "FORGED",
              id: sprintId,
              backlogId: forgedBacklogId,
              beforeId: null,
              afterId: null,
            }),
        },
        {
          service: mocks.assignItemsToSprint,
          run: () =>
            assignSprintItemsAction({
              backlogKey: "FORGED",
              backlogId: forgedBacklogId,
              itemIds: [itemId],
              sprintId,
            }),
        },
        {
          service: mocks.moveItemToSprint,
          run: () =>
            moveSprintItemAction({
              backlogKey: "FORGED",
              backlogId: forgedBacklogId,
              itemId,
              sprintId,
              beforeId: null,
              afterId: null,
            }),
        },
        {
          service: mocks.startSprint,
          run: () =>
            startSprintAction({
              backlogKey: "FORGED",
              id: sprintId,
              backlogId: forgedBacklogId,
              name: "Sprint",
              goal: null,
              startAt: "2026-08-05T09:00:00.000Z",
              endAt: "2026-08-19T09:00:00.000Z",
              capacityPoints: null,
            }),
        },
        {
          service: mocks.completeSprint,
          run: () =>
            completeSprintAction({
              backlogKey: "FORGED",
              id: sprintId,
              backlogId: forgedBacklogId,
              destination: { type: "backlog" },
            }),
        },
      ];

      for (const testCase of cases) {
        vi.clearAllMocks();
        mocks.getSession.mockResolvedValue({ user: { id: "writer-1", role: "contributor" } });
        mocks.requireItemPermission.mockResolvedValue({ backlogId, resourceId: itemId });
        mocks.requireSprintPermission.mockResolvedValue({ backlogId, resourceId: sprintId });

        await expect(testCase.run()).resolves.toEqual({
          ok: false,
          error: "La ressource demandée est introuvable.",
        });
        expect(testCase.service).not.toHaveBeenCalled();
      }
    },
  );

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
      expect.stringMatching(uuidPattern),
    );
    expect(mocks.moveItemToSprint).toHaveBeenCalledWith(
      { backlogId, itemId, sprintId, beforeId: null, afterId: null },
      "writer-1",
      expect.stringMatching(uuidPattern),
    );
    expect(mocks.invalidateBacklog).toHaveBeenCalledTimes(5);
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("DEMO", expect.objectContaining({ kind: "sprint", backlogId, actorId: "writer-1" }));
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
      expect.stringMatching(uuidPattern),
    );
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("DEMO", expect.objectContaining({ kind: "sprint", backlogId, actorId: "writer-1" }));
  });

  it("forwards one completion correlation after authorization and strips forged fields", async () => {
    mocks.completeSprint.mockResolvedValue({
      sprintId,
      completedItemCount: 0,
      carriedItemCount: 0,
      destinationSprintId: null,
    });
    const runtimeInput = {
      backlogKey: "DEMO",
      id: sprintId,
      backlogId,
      destination: { type: "backlog" as const },
      actorId: "forged-actor",
      requestCorrelationId: "forged-correlation",
    };

    await completeSprintAction(runtimeInput);

    expect(mocks.completeSprint).toHaveBeenCalledWith(
      {
        id: sprintId,
        backlogId,
        destination: { type: "backlog" },
      },
      "writer-1",
      expect.stringMatching(uuidPattern),
    );
    expect(
      mocks.requireSprintPermission.mock.invocationCallOrder[0]!,
    ).toBeLessThan(mocks.completeSprint.mock.invocationCallOrder[0]!);
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("DEMO", expect.objectContaining({ kind: "sprint", backlogId, actorId: "writer-1" }));
  });

  it("blocks a viewer before every planning and lifecycle service call", async () => {
    mocks.requireBacklogPermissionById.mockRejectedValue(
      permissionDeniedError("manage_sprints", { type: "backlog", backlogId }),
    );
    mocks.requireItemPermission.mockRejectedValue(
      permissionDeniedError("schedule_items", { type: "backlog", backlogId }),
    );
    mocks.requireSprintPermission.mockRejectedValue(
      permissionDeniedError("manage_sprints", { type: "backlog", backlogId }),
    );
    mocks.getSession.mockResolvedValue({ user: { id: "viewer-1", role: "viewer" } });

    const manageError = "Vous n’avez pas la permission « Gérer les sprints » pour ce backlog.";
    const scheduleError = "Vous n’avez pas la permission « Planifier les éléments » pour ce backlog.";
    const calls = [
      { error: manageError, run: () => createSprintAction({ backlogKey: "DEMO", backlogId }) },
      { error: manageError, run: () =>
        updateSprintAction({ backlogKey: "DEMO", id: sprintId, backlogId, name: "X" }),
      },
      { error: manageError, run: () =>
        reorderSprintAction({
          backlogKey: "DEMO",
          id: sprintId,
          backlogId,
          beforeId: null,
          afterId: null,
        }),
      },
      { error: scheduleError, run: () =>
        assignSprintItemsAction({
          backlogKey: "DEMO",
          backlogId,
          itemIds: [itemId],
          sprintId,
        }),
      },
      { error: scheduleError, run: () =>
        moveSprintItemAction({
          backlogKey: "DEMO",
          backlogId,
          itemId,
          sprintId,
          beforeId: null,
          afterId: null,
        }),
      },
      { error: manageError, run: () =>
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
      },
      { error: manageError, run: () =>
        completeSprintAction({
          backlogKey: "DEMO",
          id: sprintId,
          backlogId,
          destination: { type: "backlog" },
        }),
      },
    ];
    for (const testCase of calls) {
      await expect(testCase.run()).resolves.toEqual({ ok: false, error: testCase.error });
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

  it("returns the real Zod field errors of sprint dates and capacity (JIR-87)", async () => {
    // The services parse their input with the real schemas.
    mocks.updateSprint.mockImplementationOnce(async (input) => updateSprintSchema.parse(input));
    mocks.startSprint.mockImplementationOnce(async (input) => startSprintSchema.parse(input));

    await expect(updateSprintAction({
      backlogKey: "DEMO",
      id: sprintId,
      backlogId,
      plannedStartAt: "2026-10-15T07:00:00.000Z",
      plannedEndAt: "2026-10-14T16:00:00.000Z",
      capacityPoints: 1000,
    })).resolves.toEqual({
      ok: false,
      error: "La capacité ne peut pas dépasser 999,99 points.",
      fieldErrors: {
        capacityPoints: ["La capacité ne peut pas dépasser 999,99 points."],
        plannedEndAt: ["La date de fin doit être postérieure à la date de début."],
      },
    });
    await expect(startSprintAction({
      backlogKey: "DEMO",
      id: sprintId,
      backlogId,
      name: "Sprint 1",
      goal: null,
      startAt: "2026-10-15T07:00:00.000Z",
      endAt: "2026-10-14T16:00:00.000Z",
      capacityPoints: 1.234,
    })).resolves.toEqual({
      ok: false,
      error: "La capacité accepte au maximum deux décimales.",
      fieldErrors: {
        capacityPoints: ["La capacité accepte au maximum deux décimales."],
        endAt: ["La date de fin doit être postérieure à la date de début."],
      },
    });
  });

  it("saves a two-decimal capacity through the real schema (JIR-90)", async () => {
    mocks.updateSprint.mockImplementationOnce(async (input) => updateSprintSchema.parse(input));

    await expect(updateSprintAction({
      backlogKey: "DEMO",
      id: sprintId,
      backlogId,
      capacityPoints: 0.29,
    })).resolves.toEqual({
      ok: true,
      sprint: { id: sprintId, backlogId, capacityPoints: 0.29 },
    });
    expect(mocks.updateSprint).toHaveBeenCalledWith(
      { id: sprintId, backlogId, capacityPoints: 0.29 },
      "writer-1",
    );
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
    mocks.completeSprint.mockRejectedValueOnce(
      new Error("Le contenu historique du sprint est incohérent."),
    );
    await expect(completeSprintAction(payload)).resolves.toEqual({
      ok: false,
      error: "Le contenu historique du sprint est incohérent.",
    });
    mocks.completeSprint.mockRejectedValueOnce(new Error("internal SQL"));
    await expect(completeSprintAction(payload)).resolves.toEqual({
      ok: false,
      error: "Clôture du sprint impossible.",
    });
  });
});
