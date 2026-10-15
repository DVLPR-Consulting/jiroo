import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  permissionDeniedError,
  resourceNotFoundError,
} from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  archiveRelease: vi.fn(),
  createRelease: vi.fn(),
  deleteRelease: vi.fn(),
  getSession: vi.fn(),
  mergeRelease: vi.fn(),
  reorderRelease: vi.fn(),
  publishRelease: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateBacklog: vi.fn(),
  notifyUsers: vi.fn(),
  unarchiveRelease: vi.fn(),
  unreleaseRelease: vi.fn(),
  updateRelease: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/realtime/publish", () => ({ invalidateBacklog: mocks.invalidateBacklog, notifyUsers: mocks.notifyUsers }));
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
  deleteRelease: mocks.deleteRelease,
  mergeRelease: mocks.mergeRelease,
  publishRelease: mocks.publishRelease,
  reorderRelease: mocks.reorderRelease,
  unarchiveRelease: mocks.unarchiveRelease,
  unreleaseRelease: mocks.unreleaseRelease,
  updateRelease: mocks.updateRelease,
}));

import {
  archiveReleaseAction,
  createReleaseAction,
  deleteReleaseAction,
  mergeReleaseAction,
  publishReleaseAction,
  reorderReleaseAction,
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
  expectedScopeRevision: "0123456789abcdef0123456789abcdef",
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
  mocks.deleteRelease.mockResolvedValue(removalResult(null));
  mocks.mergeRelease.mockResolvedValue(
    removalResult({ id: destinationReleaseId, revision: 3 }),
  );
  mocks.reorderRelease.mockResolvedValue({ id: releaseId, revision: 2, rank: "a1" });
}

function removalResult(targetRelease: { id: string; revision: number } | null) {
  return {
    deletedReleaseId: releaseId,
    linkedCount: 2,
    transferredCount: targetRelease ? 2 : 0,
    removedCount: targetRelease ? 0 : 2,
    targetRelease,
  };
}

describe("release server action permissions", () => {
  beforeEach(resetMocks);

  it.each([
    {
      name: "create",
      invoke: () => createReleaseAction(createInput),
      service: () => mocks.createRelease,
      error: "Création de release impossible.",
    },
    {
      name: "update",
      invoke: () => updateReleaseAction(updateInput),
      service: () => mocks.updateRelease,
      error: "Mise à jour de release impossible.",
    },
    {
      name: "publish",
      invoke: () => publishReleaseAction(keepInput),
      service: () => mocks.publishRelease,
      error: "Publication impossible.",
    },
    {
      name: "unrelease",
      invoke: () => unreleaseReleaseAction(identityInput),
      service: () => mocks.unreleaseRelease,
      error: "Dépublication impossible.",
    },
    {
      name: "archive",
      invoke: () => archiveReleaseAction(identityInput),
      service: () => mocks.archiveRelease,
      error: "Archivage impossible.",
    },
    {
      name: "unarchive",
      invoke: () => unarchiveReleaseAction(identityInput),
      service: () => mocks.unarchiveRelease,
      error: "Désarchivage impossible.",
    },
  ])("returns a safe result for a missing session before $name", async ({ invoke, service, error }) => {
    mocks.getSession.mockResolvedValueOnce(null);

    await expect(invoke()).resolves.toEqual({ ok: false, error });
    expect(mocks.requireBacklogPermissionById).not.toHaveBeenCalled();
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(service()).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "create backlog ID",
      invoke: () => createReleaseAction({ ...createInput, backlogId: "not-a-uuid" }),
      service: () => mocks.createRelease,
    },
    {
      name: "create driver",
      invoke: () => createReleaseAction({ ...createInput, driverId: " " }),
      service: () => mocks.createRelease,
    },
    {
      name: "update release ID",
      invoke: () => updateReleaseAction({ ...updateInput, releaseId: "not-a-uuid" }),
      service: () => mocks.updateRelease,
    },
    {
      name: "update revision",
      invoke: () => updateReleaseAction({ ...updateInput, expectedRevision: 0 }),
      service: () => mocks.updateRelease,
    },
    {
      name: "update date",
      invoke: () => updateReleaseAction({ ...updateInput, targetDate: "not-a-date" }),
      service: () => mocks.updateRelease,
    },
    {
      name: "publish effective date",
      invoke: () => publishReleaseAction({ ...keepInput, effectiveDate: "not-a-date" }),
      service: () => mocks.publishRelease,
    },
    {
      name: "publish disposition",
      invoke: () => publishReleaseAction({ ...keepInput, incompleteDisposition: "drop" } as never),
      service: () => mocks.publishRelease,
    },
    {
      name: "publish destination release ID",
      invoke: () =>
        publishReleaseAction({
          ...keepInput,
          incompleteDisposition: "move",
          destinationReleaseId: "not-a-uuid",
        }),
      service: () => mocks.publishRelease,
    },
    {
      name: "unrelease revision",
      invoke: () => unreleaseReleaseAction({ ...identityInput, expectedRevision: -1 }),
      service: () => mocks.unreleaseRelease,
    },
    {
      name: "archive release ID",
      invoke: () => archiveReleaseAction({ ...identityInput, releaseId: "not-a-uuid" }),
      service: () => mocks.archiveRelease,
    },
    {
      name: "unarchive revision type",
      invoke: () => unarchiveReleaseAction({ ...identityInput, expectedRevision: "1" } as never),
      service: () => mocks.unarchiveRelease,
    },
  ])("rejects malformed $name before authentication or authorization", async ({ invoke, service }) => {
    await expect(invoke()).resolves.toMatchObject({ ok: false });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.requireBacklogPermissionById).not.toHaveBeenCalled();
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(service()).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

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
        expectedScopeRevision: keepInput.expectedScopeRevision,
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

  it("returns structured canonical scope data for a stale publication preview", async () => {
    const stale = Object.assign(
      new Error("Le périmètre de publication a changé. Vérifiez-le avant de réessayer."),
      {
        code: "RELEASE_PUBLICATION_SCOPE_STALE" as const,
        currentScopeRevision: "fedcba9876543210fedcba9876543210",
        currentIncompleteCount: 2,
      },
    );
    mocks.publishRelease.mockRejectedValueOnce(stale);

    await expect(publishReleaseAction(keepInput)).resolves.toEqual({
      ok: false,
      reason: "stale_scope",
      error: "Le périmètre de publication a changé. Vérifiez-le avant de réessayer.",
      currentScopeRevision: "fedcba9876543210fedcba9876543210",
      currentIncompleteCount: 2,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
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

  it.each([
    { kind: "hidden", inaccessibleBacklogId: "44444444-4444-4444-8444-444444444444" },
    { kind: "absent", inaccessibleBacklogId: "55555555-5555-4555-8555-555555555555" },
  ])(
    "returns the same result for an $kind backlog and never calls the service",
    async ({ inaccessibleBacklogId }) => {
      mocks.requireBacklogPermissionById.mockRejectedValueOnce(
        resourceNotFoundError("backlog", inaccessibleBacklogId),
      );

      await expect(
        createReleaseAction({ ...createInput, backlogId: inaccessibleBacklogId }),
      ).resolves.toEqual({
        ok: false,
        error: "La ressource demandée est introuvable.",
      });
      expect(mocks.createRelease).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("uses only the stored backlog for publication and release paths", async () => {
    await updateReleaseAction(updateInput);

    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("STORED", { kind: "release", backlogId, actorId });
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/b/STORED/releases",
      `/b/STORED/releases/${releaseId}`,
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/b/FORGED");
  });

  it("maps actionable domain failures to release form fields", async () => {
    mocks.createRelease.mockRejectedValueOnce(
      new Error("Une release portant ce nom existe déjà."),
    );
    mocks.updateRelease.mockRejectedValueOnce(
      new Error("La date cible doit suivre la date de début."),
    );

    await expect(createReleaseAction(createInput)).resolves.toEqual({
      ok: false,
      error: "Une release portant ce nom existe déjà.",
      fieldErrors: { name: ["Une release portant ce nom existe déjà."] },
    });
    await expect(updateReleaseAction(updateInput)).resolves.toEqual({
      ok: false,
      error: "La date cible doit suivre la date de début.",
      fieldErrors: { targetDate: ["La date cible doit suivre la date de début."] },
    });
  });

  it.each([
    {
      invoke: () => publishReleaseAction({
        ...keepInput,
        incompleteDisposition: "move" as const,
        destinationReleaseId,
      }),
      service: () => mocks.publishRelease,
      message: "La release de destination doit être non publiée.",
    },
    {
      invoke: () => unreleaseReleaseAction(identityInput),
      service: () => mocks.unreleaseRelease,
      message: "Cette release doit être désarchivée avant dépublication.",
    },
  ])("returns the safe lifecycle error: $message", async ({ invoke, service, message }) => {
    service().mockRejectedValueOnce(new Error(message));

    await expect(invoke()).resolves.toEqual({ ok: false, error: message });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("release depth server actions", () => {
  beforeEach(resetMocks);

  const scope = "0123456789abcdef0123456789abcdef";
  const deleteRemoveInput = {
    backlogKey: "FORGED",
    backlogId,
    releaseId,
    expectedRevision: 1,
    expectedScopeRevision: scope,
    fixVersions: { disposition: "remove" as const },
  };
  const deleteTransferInput = {
    ...deleteRemoveInput,
    fixVersions: {
      disposition: "transfer" as const,
      targetReleaseId: destinationReleaseId,
      expectedTargetRevision: 2,
    },
  };
  const deleteEmptyInput = { ...deleteRemoveInput, fixVersions: { disposition: "none" as const } };
  const mergeInput = {
    backlogKey: "FORGED",
    backlogId,
    sourceReleaseId: releaseId,
    expectedSourceRevision: 1,
    expectedScopeRevision: scope,
    targetReleaseId: destinationReleaseId,
    expectedTargetRevision: 2,
  };
  const reorderInput = {
    backlogKey: "FORGED",
    backlogId,
    releaseId,
    expectedRevision: 1,
    beforeId: null,
    afterId: destinationReleaseId,
  };

  const cases = [
    { name: "merge", invoke: () => mergeReleaseAction(mergeInput), service: () => mocks.mergeRelease, error: "Fusion impossible." },
    { name: "delete transfer", invoke: () => deleteReleaseAction(deleteTransferInput), service: () => mocks.deleteRelease, error: "Suppression impossible." },
    { name: "delete remove", invoke: () => deleteReleaseAction(deleteRemoveInput), service: () => mocks.deleteRelease, error: "Suppression impossible." },
    { name: "delete empty", invoke: () => deleteReleaseAction(deleteEmptyInput), service: () => mocks.deleteRelease, error: "Suppression impossible." },
    { name: "reorder", invoke: () => reorderReleaseAction(reorderInput), service: () => mocks.reorderRelease, error: "Réordonnancement impossible." },
  ];

  it.each(cases)(
    "authorizes $name with manage_releases only, as Jira version administration",
    async ({ invoke, service }) => {
      await expect(invoke()).resolves.toMatchObject({ ok: true });
      expect(mocks.requireBacklogPermissionById.mock.calls.map(([input]) => input)).toEqual([
        { actorId, backlogId, permission: "manage_releases" },
      ]);
      expect(service()).toHaveBeenCalledOnce();
      expect(service().mock.calls[0]?.[1]).toBe(actorId);
      expect(service().mock.calls[0]?.[2]).toMatch(/^[0-9a-f-]{36}$/);
      expect(service().mock.calls[0]?.[0]).not.toHaveProperty("backlogKey");
    },
  );

  it.each(cases)("returns a safe result for a missing session before $name", async ({ invoke, service, error }) => {
    mocks.getSession.mockResolvedValueOnce(null);
    await expect(invoke()).resolves.toEqual({ ok: false, error });
    expect(mocks.requireBacklogPermissionById).not.toHaveBeenCalled();
    expect(service()).not.toHaveBeenCalled();
  });

  it.each(cases)("refuses $name without manage_releases and writes nothing", async ({ invoke, service }) => {
    mocks.requireBacklogPermissionById.mockRejectedValueOnce(
      permissionDeniedError("manage_releases", { type: "backlog", backlogId }),
    );
    await expect(invoke()).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Gérer les releases » pour ce backlog.",
    });
    expect(service()).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(cases)("hides an inaccessible backlog for $name", async ({ invoke, service }) => {
    mocks.requireBacklogPermissionById.mockRejectedValueOnce(resourceNotFoundError("backlog", backlogId));
    await expect(invoke()).resolves.toEqual({
      ok: false,
      error: "La ressource demandée est introuvable.",
    });
    expect(service()).not.toHaveBeenCalled();
  });

  it.each([
    { name: "delete without disposition", invoke: () => deleteReleaseAction({ ...deleteRemoveInput, fixVersions: undefined } as never) },
    { name: "delete onto itself", invoke: () => deleteReleaseAction({ ...deleteTransferInput, fixVersions: { ...deleteTransferInput.fixVersions, targetReleaseId: releaseId } }) },
    { name: "merge onto itself", invoke: () => mergeReleaseAction({ ...mergeInput, targetReleaseId: releaseId }) },
    { name: "reorder self neighbour", invoke: () => reorderReleaseAction({ ...reorderInput, afterId: releaseId }) },
  ])("rejects malformed $name before authentication", async ({ invoke }) => {
    await expect(invoke()).resolves.toMatchObject({ ok: false });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.deleteRelease).not.toHaveBeenCalled();
    expect(mocks.mergeRelease).not.toHaveBeenCalled();
    expect(mocks.reorderRelease).not.toHaveBeenCalled();
  });

  it("returns the current impact when the linked items changed since the preview", async () => {
    mocks.deleteRelease.mockRejectedValueOnce(
      Object.assign(
        new Error("Les éléments liés à cette version ont changé. Vérifiez l’impact avant de réessayer."),
        {
          code: "RELEASE_SCOPE_STALE" as const,
          currentScopeRevision: "fedcba9876543210fedcba9876543210",
          currentLinkedCount: 3,
          currentTrashedCount: 1,
        },
      ),
    );
    await expect(deleteReleaseAction(deleteRemoveInput)).resolves.toEqual({
      ok: false,
      reason: "stale_scope",
      error: "Les éléments liés à cette version ont changé. Vérifiez l’impact avant de réessayer.",
      currentScopeRevision: "fedcba9876543210fedcba9876543210",
      currentLinkedCount: 3,
      currentTrashedCount: 1,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    "La version contient des éléments.",
    "La release de destination a changé. Rechargez-la avant de réessayer.",
    "Une version archivée ne peut pas être réordonnée.",
    "Voisin invalide pour ce backlog.",
  ])("passes the domain error through: %s", async (message) => {
    mocks.deleteRelease.mockRejectedValueOnce(new Error(message));
    await expect(deleteReleaseAction(deleteRemoveInput)).resolves.toEqual({ ok: false, error: message });
  });

  it("maps unknown failures to a generic message", async () => {
    mocks.mergeRelease.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));
    await expect(mergeReleaseAction(mergeInput)).resolves.toEqual({ ok: false, error: "Fusion impossible." });
  });

  it("revalidates the stored backlog paths and the target detail", async () => {
    await mergeReleaseAction(mergeInput);
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/b/STORED/releases",
      `/b/STORED/releases/${releaseId}`,
      `/b/STORED/releases/${destinationReleaseId}`,
    ]);
    mocks.revalidatePath.mockClear();
    await deleteReleaseAction(deleteRemoveInput);
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/b/STORED/releases",
      `/b/STORED/releases/${releaseId}`,
    ]);
  });
});
