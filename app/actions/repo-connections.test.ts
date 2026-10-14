import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { permissionDeniedError, resourceNotFoundError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  requireRepoConnectionPermission: vi.fn(),
  revalidatePath: vi.fn(),
  createRepoConnection: vi.fn(),
  regenerateRepoConnectionSecret: vi.fn(),
  setRepoConnectionEnabled: vi.fn(),
  deleteRepoConnection: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireBacklogPermissionById: mocks.requireBacklogPermissionById,
  requireRepoConnectionPermission: mocks.requireRepoConnectionPermission,
}));
vi.mock("@/lib/services/repo-connections", () => ({
  CONNECTION_NOT_FOUND_MESSAGE: "Connexion introuvable.",
  DUPLICATE_CONNECTION_MESSAGE: "Ce dépôt est déjà connecté à ce backlog.",
  createRepoConnection: mocks.createRepoConnection,
  regenerateRepoConnectionSecret: mocks.regenerateRepoConnectionSecret,
  setRepoConnectionEnabled: mocks.setRepoConnectionEnabled,
  deleteRepoConnection: mocks.deleteRepoConnection,
}));

import {
  createRepoConnectionAction,
  deleteRepoConnectionAction,
  regenerateRepoConnectionSecretAction,
  setRepoConnectionEnabledAction,
} from "@/app/actions/repo-connections";

const BACKLOG_ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const CONNECTION_ID = "0b6c2a5e-3f1d-4c8e-9a7b-1d2e3f4a5b6c";

describe("repository connection actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireBacklogPermissionById.mockResolvedValue({ backlogId: BACKLOG_ID, resourceId: BACKLOG_ID, backlogKey: "CASS" });
    mocks.requireRepoConnectionPermission.mockResolvedValue({ backlogId: BACKLOG_ID, resourceId: CONNECTION_ID, backlogKey: "CASS" });
    mocks.createRepoConnection.mockResolvedValue({ connection: { id: CONNECTION_ID }, secret: "s3cret" });
    mocks.regenerateRepoConnectionSecret.mockResolvedValue({ connection: { id: CONNECTION_ID }, secret: "n3w" });
  });

  it("requires administer_backlog on the target backlog before connecting", async () => {
    const input = { backlogId: BACKLOG_ID, provider: "github", repositoryPath: "acme/api" };
    await expect(createRepoConnectionAction(input)).resolves.toEqual({
      ok: true,
      connection: { id: CONNECTION_ID },
      secret: "s3cret",
    });
    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "admin-1",
      backlogId: BACKLOG_ID,
      permission: "administer_backlog",
    });
    expect(mocks.createRepoConnection).toHaveBeenCalledWith(input, "admin-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/CASS/settings/development");
  });

  it("refuses without a session and before any check", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(
      createRepoConnectionAction({ backlogId: BACKLOG_ID, provider: "github", repositoryPath: "a/b" }),
    ).resolves.toEqual({ ok: false, error: "Votre session a expiré. Reconnectez-vous." });
    expect(mocks.requireBacklogPermissionById).not.toHaveBeenCalled();
  });

  it("reports a missing permission without creating anything", async () => {
    mocks.requireBacklogPermissionById.mockRejectedValue(
      permissionDeniedError("administer_backlog", { type: "backlog", backlogId: BACKLOG_ID }),
    );
    await expect(
      createRepoConnectionAction({ backlogId: BACKLOG_ID, provider: "github", repositoryPath: "a/b" }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Administrer le backlog » pour ce backlog.",
    });
    expect(mocks.createRepoConnection).not.toHaveBeenCalled();
  });

  it("shows the validation's own message, and hides other errors", async () => {
    mocks.createRepoConnection.mockRejectedValueOnce(
      new ZodError([{ code: "custom", path: ["repositoryPath"], message: "Dépôt invalide : saisissez « propriétaire/dépôt »." }]),
    );
    await expect(
      createRepoConnectionAction({ backlogId: BACKLOG_ID, provider: "github", repositoryPath: "x" }),
    ).resolves.toEqual({ ok: false, error: "Dépôt invalide : saisissez « propriétaire/dépôt »." });

    mocks.createRepoConnection.mockRejectedValueOnce(new Error("Ce dépôt est déjà connecté à ce backlog."));
    await expect(
      createRepoConnectionAction({ backlogId: BACKLOG_ID, provider: "github", repositoryPath: "a/b" }),
    ).resolves.toEqual({ ok: false, error: "Ce dépôt est déjà connecté à ce backlog." });

    mocks.createRepoConnection.mockRejectedValueOnce(new Error("connect ECONNREFUSED secret-host"));
    await expect(
      createRepoConnectionAction({ backlogId: BACKLOG_ID, provider: "github", repositoryPath: "a/b" }),
    ).resolves.toEqual({ ok: false, error: "Action impossible. Réessayez." });
  });

  it("checks administer_backlog from the stored connection for every connection change", async () => {
    await regenerateRepoConnectionSecretAction({ backlogKey: "FORGED", connectionId: CONNECTION_ID });
    await setRepoConnectionEnabledAction({ backlogKey: "FORGED", connectionId: CONNECTION_ID, enabled: false });
    await deleteRepoConnectionAction({ backlogKey: "FORGED", connectionId: CONNECTION_ID });
    expect(mocks.requireRepoConnectionPermission).toHaveBeenCalledTimes(3);
    for (const call of mocks.requireRepoConnectionPermission.mock.calls) {
      expect(call[0]).toEqual({ actorId: "admin-1", connectionId: CONNECTION_ID, permission: "administer_backlog" });
    }
    expect(mocks.setRepoConnectionEnabled).toHaveBeenCalledWith({ connectionId: CONNECTION_ID, enabled: false }, "admin-1");
    expect(mocks.deleteRepoConnection).toHaveBeenCalledWith({ connectionId: CONNECTION_ID }, "admin-1");
    // The page revalidated is the stored connection's backlog, not the client's key.
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/b/CASS/settings/development"],
      ["/b/CASS/settings/development"],
      ["/b/CASS/settings/development"],
    ]);
  });

  it("hides an unknown or malformed connection", async () => {
    await expect(
      deleteRepoConnectionAction({ backlogKey: "CASS", connectionId: "not-a-uuid" }),
    ).resolves.toEqual({ ok: false, error: "La ressource demandée est introuvable." });
    expect(mocks.requireRepoConnectionPermission).not.toHaveBeenCalled();

    mocks.requireRepoConnectionPermission.mockRejectedValueOnce(resourceNotFoundError("repo_connection", CONNECTION_ID));
    await expect(
      regenerateRepoConnectionSecretAction({ backlogKey: "CASS", connectionId: CONNECTION_ID }),
    ).resolves.toEqual({ ok: false, error: "La ressource demandée est introuvable." });
    expect(mocks.regenerateRepoConnectionSecret).not.toHaveBeenCalled();
  });
});
