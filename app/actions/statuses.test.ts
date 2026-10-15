import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  createStatus: vi.fn(),
  deleteStatus: vi.fn(),
  getSession: vi.fn(),
  reorderStatuses: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  requireStatusPermission: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateBacklog: vi.fn(),
  notifyUsers: vi.fn(),
  updateStatus: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/realtime/publish", () => ({ invalidateBacklog: mocks.invalidateBacklog, notifyUsers: mocks.notifyUsers }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireBacklogPermissionById: mocks.requireBacklogPermissionById,
  requireStatusPermission: mocks.requireStatusPermission,
}));
vi.mock("@/lib/auth/authorization", () => ({ ResourceNotFoundError: Error }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/statuses", () => ({
  createStatus: mocks.createStatus,
  deleteStatus: mocks.deleteStatus,
  reorderStatuses: mocks.reorderStatuses,
  updateStatus: mocks.updateStatus,
}));

import {
  createStatusAction,
  deleteStatusAction,
  reorderStatusesAction,
  updateStatusAction,
} from "@/app/actions/statuses";

const backlogId = "11111111-1111-4111-8111-111111111111";
const statusId = "22222222-2222-4222-8222-222222222222";

describe("workflow status actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.requireBacklogPermissionById.mockResolvedValue({ backlogId, resourceId: backlogId });
    mocks.requireStatusPermission.mockImplementation(async ({ statusId: id }) => ({
      backlogId,
      resourceId: id,
    }));
  });

  it("requires manage_workflows on the stored resource before every workflow mutation", async () => {
    const replacementStatusId = "33333333-3333-4333-8333-333333333333";
    mocks.createStatus.mockResolvedValue({ id: statusId });
    mocks.updateStatus.mockResolvedValue({ id: statusId });
    mocks.deleteStatus.mockResolvedValue({ deletedId: statusId, migratedItems: 0 });

    await createStatusAction({
      backlogId,
      backlogKey: "FORGED",
      name: "En revue",
      category: "in_progress",
      color: "#8b5cf6",
    });
    expect(mocks.requireBacklogPermissionById).toHaveBeenLastCalledWith({
      actorId: "admin-1",
      backlogId,
      permission: "manage_workflows",
    });

    await updateStatusAction({
      id: statusId,
      backlogId,
      backlogKey: "FORGED",
      name: "Livré",
      category: "done",
      color: "#3aa675",
    });
    expect(mocks.requireStatusPermission).toHaveBeenLastCalledWith({
      actorId: "admin-1",
      statusId,
      permission: "manage_workflows",
    });

    await deleteStatusAction({
      id: statusId,
      backlogId,
      backlogKey: "FORGED",
      replacementStatusId,
    });
    expect(mocks.requireStatusPermission.mock.calls.slice(-2).map(([input]) => input)).toEqual([
      { actorId: "admin-1", statusId, permission: "manage_workflows" },
      { actorId: "admin-1", statusId: replacementStatusId, permission: "manage_workflows" },
    ]);
  });

  it("returns a structured workflow permission denial", async () => {
    mocks.requireStatusPermission.mockRejectedValueOnce(
      permissionDeniedError("manage_workflows", { type: "backlog", backlogId }),
    );

    await expect(
      updateStatusAction({
        id: statusId,
        backlogId,
        backlogKey: "FORGED",
        name: "Livré",
        category: "done",
        color: "#3aa675",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Gérer les workflows » pour ce backlog.",
    });
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });

  it("checks every stored status before reordering", async () => {
    const secondStatusId = "33333333-3333-4333-8333-333333333333";
    await reorderStatusesAction({
      backlogId,
      backlogKey: "FORGED",
      statusIds: [statusId, secondStatusId],
    });

    expect(mocks.requireStatusPermission.mock.calls.map(([input]) => input)).toEqual([
      { actorId: "admin-1", statusId, permission: "manage_workflows" },
      { actorId: "admin-1", statusId: secondStatusId, permission: "manage_workflows" },
    ]);
  });

  it("creates a status as an admin and revalidates every backlog surface", async () => {
    mocks.createStatus.mockResolvedValue({ id: statusId, name: "En revue", order: 4 });

    await expect(
      createStatusAction({
        backlogId,
        backlogKey: "DEMO",
        name: "En revue",
        category: "in_progress",
        color: "#8b5cf6",
      }),
    ).resolves.toEqual({
      ok: true,
      status: { id: statusId, name: "En revue", order: 4 },
    });
    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "admin-1",
      backlogId,
      permission: "manage_workflows",
    });
    expect(mocks.createStatus).toHaveBeenCalledWith({
      backlogId,
      name: "En revue",
      category: "in_progress",
      color: "#8b5cf6",
    });
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("DEMO", { kind: "backlog", backlogId, actorId: "admin-1" });
    expect(new Set(mocks.revalidatePath.mock.calls.map(([path]) => path))).toEqual(
      new Set(["/admin", "/", "/mine", "/trash"]),
    );
  });

  it("passes the actor to edits and safe deletion migrations", async () => {
    mocks.updateStatus.mockResolvedValue({ id: statusId });
    mocks.deleteStatus.mockResolvedValue({ deletedId: statusId, migratedItems: 2 });

    await updateStatusAction({
      id: statusId,
      backlogId,
      backlogKey: "DEMO",
      name: "Livré",
      category: "done",
      color: "#3aa675",
    });
    await deleteStatusAction({
      id: statusId,
      backlogId,
      backlogKey: "DEMO",
      replacementStatusId: "33333333-3333-4333-8333-333333333333",
    });

    expect(mocks.updateStatus).toHaveBeenCalledWith(
      { id: statusId, backlogId, name: "Livré", category: "done", color: "#3aa675" },
      "admin-1",
    );
    expect(mocks.deleteStatus).toHaveBeenCalledWith(
      {
        id: statusId,
        backlogId,
        replacementStatusId: "33333333-3333-4333-8333-333333333333",
      },
      "admin-1",
    );
  });

  it("preserves known domain errors and hides unknown failures", async () => {
    mocks.reorderStatuses.mockRejectedValueOnce(
      new Error("La liste des statuts est incomplète."),
    );
    await expect(
      reorderStatusesAction({ backlogId, backlogKey: "DEMO", statusIds: [statusId] }),
    ).resolves.toEqual({ ok: false, error: "La liste des statuts est incomplète." });

    mocks.reorderStatuses.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      reorderStatusesAction({ backlogId, backlogKey: "DEMO", statusIds: [statusId] }),
    ).resolves.toEqual({ ok: false, error: "Modification du workflow impossible." });
  });

  it("returns the current occupation when deletion now requires a replacement", async () => {
    mocks.deleteStatus.mockRejectedValue(
      Object.assign(
        new Error("Choisissez un statut de destination pour les items existants."),
        { currentItemCount: 2 },
      ),
    );

    await expect(
      deleteStatusAction({
        id: statusId,
        backlogId,
        backlogKey: "DEMO",
        replacementStatusId: null,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Choisissez un statut de destination pour les items existants.",
      currentItemCount: 2,
    });
  });
});
