import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createStatus: vi.fn(),
  deleteStatus: vi.fn(),
  getSession: vi.fn(),
  reorderStatuses: vi.fn(),
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  updateStatus: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
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
    expect(mocks.requireRole).toHaveBeenCalledWith(
      { user: { id: "admin-1", role: "admin" } },
      "admin",
    );
    expect(mocks.createStatus).toHaveBeenCalledWith({
      backlogId,
      name: "En revue",
      category: "in_progress",
      color: "#8b5cf6",
    });
    expect(new Set(mocks.revalidatePath.mock.calls.map(([path]) => path))).toEqual(
      new Set(["/admin", "/", "/mine", "/trash", "/b/DEMO"]),
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
