import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  permissionDeniedError,
  resourceNotFoundError,
} from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  archiveRelease: vi.fn(),
  createRelease: vi.fn(),
  getSession: vi.fn(),
  publishRelease: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  unarchiveRelease: vi.fn(),
  unreleaseRelease: vi.fn(),
  updateRelease: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireBacklogPermissionById: mocks.requireBacklogPermissionById,
}));
vi.mock("@/lib/auth/authorization", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/releases", () => ({
  archiveRelease: mocks.archiveRelease,
  createRelease: mocks.createRelease,
  publishRelease: mocks.publishRelease,
  unarchiveRelease: mocks.unarchiveRelease,
  unreleaseRelease: mocks.unreleaseRelease,
  updateRelease: mocks.updateRelease,
}));

import {
  archiveReleaseAction,
  createReleaseAction,
  publishReleaseAction,
  unarchiveReleaseAction,
  unreleaseReleaseAction,
  updateReleaseAction,
} from "@/app/actions/releases";

const backlogId = "11111111-1111-4111-8111-111111111111";
const releaseId = "22222222-2222-4222-8222-222222222222";
const destinationReleaseId = "33333333-3333-4333-8333-333333333333";
const actorId = "actor-1";
const otherDriverId = "driver-2";

const createInput = {
  backlogKey: "FORGED",
  backlogId,
  name: "2026.09",
  description: null,
  startDate: null,
  targetDate: "2026-09-30",
};
const updateInput = {
  backlogKey: "FORGED",
  backlogId,
  releaseId,
  expectedRevision: 1,
  name: "2026.09.1",
};
const keepInput = {
  backlogKey: "FORGED",
  backlogId,
  releaseId,
  expectedRevision: 1,
  effectiveDate: "2026-09-30",
  incompleteDisposition: "keep" as const,
};
const identityInput = {
  backlogKey: "FORGED",
  backlogId,
  releaseId,
  expectedRevision: 1,
};

function authorizedBacklog() {
  return { backlogId, resourceId: backlogId, backlogKey: "STORED" };
}

function resetMocks() {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: actorId, role: "contributor" } });
  mocks.requireBacklogPermissionById.mockResolvedValue(authorizedBacklog());
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.createRelease.mockResolvedValue({ id: releaseId, revision: 1 });
  mocks.updateRelease.mockResolvedValue({ id: releaseId, revision: 2 });
  mocks.publishRelease.mockResolvedValue({ release: { id: releaseId, revision: 2 } });
  mocks.unreleaseRelease.mockResolvedValue({ release: { id: releaseId, revision: 2 } });
  mocks.archiveRelease.mockResolvedValue({ id: releaseId, revision: 2 });
  mocks.unarchiveRelease.mockResolvedValue({ id: releaseId, revision: 2 });
}

describe("release server action permissions", () => {
  beforeEach(resetMocks);

  it("maps all six lifecycle actions to manage_releases and one action correlation", async () => {
    await createReleaseAction(createInput);
    await updateReleaseAction(updateInput);
    await publishReleaseAction(keepInput);
    await unreleaseReleaseAction(identityInput);
    await archiveReleaseAction(identityInput);
    await unarchiveReleaseAction(identityInput);

    expect(mocks.requireBacklogPermissionById.mock.calls.map(([input]) => input)).toEqual(
      Array.from({ length: 6 }, () => ({
        actorId,
        backlogId,
        permission: "manage_releases",
      })),
    );
    const services = [
      mocks.createRelease,
      mocks.updateRelease,
      mocks.publishRelease,
      mocks.unreleaseRelease,
      mocks.archiveRelease,
      mocks.unarchiveRelease,
    ];
    const correlationIds = services.map((service) => service.mock.calls[0]?.[2]);
    expect(correlationIds).toHaveLength(6);
    expect(new Set(correlationIds).size).toBe(6);
    for (const correlationId of correlationIds) {
      expect(correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
    expect(mocks.createRelease).toHaveBeenCalledWith(
      {
        backlogId,
        name: "2026.09",
        description: null,
        startDate: null,
        targetDate: "2026-09-30",
        driverId: actorId,
      },
      actorId,
      expect.any(String),
    );
    expect(mocks.updateRelease).toHaveBeenCalledWith(
      { backlogId, releaseId, expectedRevision: 1, name: "2026.09.1" },
      actorId,
      expect.any(String),
    );
    expect(mocks.publishRelease).toHaveBeenCalledWith(
      {
        backlogId,
        releaseId,
        expectedRevision: 1,
        effectiveDate: "2026-09-30",
        incompleteDisposition: "keep",
      },
      actorId,
      expect.any(String),
    );
    for (const service of [mocks.unreleaseRelease, mocks.archiveRelease, mocks.unarchiveRelease]) {
      expect(service).toHaveBeenCalledWith(
        { backlogId, releaseId, expectedRevision: 1 },
        actorId,
        expect.any(String),
      );
    }
  });

  it("lets manage-only publish keep without requiring edit_items", async () => {
    await expect(publishReleaseAction(keepInput)).resolves.toMatchObject({ ok: true });
    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledTimes(1);
    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId,
      backlogId,
      permission: "manage_releases",
    });
    expect(mocks.publishRelease).toHaveBeenCalledOnce();
  });

  it("requires edit_items in addition to manage_releases before publish move", async () => {
    mocks.requireBacklogPermissionById.mockImplementation(async ({ permission }) => {
      if (permission === "edit_items") {
        throw permissionDeniedError("edit_items", { type: "backlog", backlogId });
      }
      return authorizedBacklog();
    });

    await expect(
      publishReleaseAction({
        ...keepInput,
        incompleteDisposition: "move",
        destinationReleaseId,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Modifier les éléments » pour ce backlog.",
    });
    expect(mocks.requireBacklogPermissionById.mock.calls.map(([input]) => input.permission)).toEqual([
      "manage_releases",
      "edit_items",
    ]);
    expect(mocks.publishRelease).not.toHaveBeenCalled();
  });

  it("defaults a missing driver to the actor without browsing the directory", async () => {
    await createReleaseAction(createInput);

    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.createRelease).toHaveBeenCalledWith(
      {
        backlogId,
        name: "2026.09",
        description: null,
        startDate: null,
        targetDate: "2026-09-30",
        driverId: actorId,
      },
      actorId,
      expect.any(String),
    );
  });

  it("requires global browse_users before accepting another driver", async () => {
    await createReleaseAction({ ...createInput, driverId: otherDriverId });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId,
      permission: "browse_users",
      scope: { type: "global" },
    });
    expect(mocks.requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createRelease.mock.invocationCallOrder[0]!,
    );
  });

  it("does not call a release service when browse_users rejects a forged driver", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      permissionDeniedError("browse_users", { type: "global" }),
    );

    await expect(
      updateReleaseAction({ ...updateInput, driverId: otherDriverId }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Parcourir les utilisateurs ».",
    });
    expect(mocks.updateRelease).not.toHaveBeenCalled();
  });

  it.each([
    { role: "editor", actor: "editor-1" },
    { role: "reader", actor: "reader-1" },
  ])("does not let a $role perform release lifecycle mutations", async ({ actor }) => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: actor, role: "contributor" } });
    mocks.requireBacklogPermissionById.mockRejectedValueOnce(
      permissionDeniedError("manage_releases", { type: "backlog", backlogId }),
    );

    await expect(archiveReleaseAction(identityInput)).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Gérer les releases » pour ce backlog.",
    });
    expect(mocks.archiveRelease).not.toHaveBeenCalled();
  });

  it.each(["hidden", "absent"])(
    "returns the same result for an %s backlog and never calls the service",
    async (kind) => {
      mocks.requireBacklogPermissionById.mockRejectedValueOnce(
        resourceNotFoundError("backlog", `${kind}-backlog`),
      );

      await expect(
        createReleaseAction({ ...createInput, backlogId: `${kind}-backlog` }),
      ).resolves.toEqual({
        ok: false,
        error: "La ressource demandée est introuvable.",
      });
      expect(mocks.createRelease).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("uses only the stored backlog key for literal revalidation paths", async () => {
    await updateReleaseAction(updateInput);

    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/b/STORED",
      "/b/STORED/releases",
      `/b/STORED/releases/${releaseId}`,
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/b/FORGED");
  });
});
