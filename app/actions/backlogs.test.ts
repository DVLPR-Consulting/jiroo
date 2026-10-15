import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  archiveBacklog: vi.fn(),
  createBacklog: vi.fn(),
  getSession: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateBacklog: vi.fn(),
  notifyUsers: vi.fn(),
  setBacklogStar: vi.fn(),
  updateBacklog: vi.fn(),
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
vi.mock("@/lib/services/backlogs", () => ({
  archiveBacklog: mocks.archiveBacklog,
  createBacklog: mocks.createBacklog,
  setBacklogStar: mocks.setBacklogStar,
  updateBacklog: mocks.updateBacklog,
}));

import {
  archiveBacklogAction,
  createBacklogAction,
  setBacklogStarAction,
  updateBacklogAction,
} from "@/app/actions/backlogs";
import { ZodError } from "zod";

describe("backlog action permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "admin-1", role: "admin", twoFactorEnabled: true },
    });
    mocks.requireBacklogPermissionById.mockResolvedValue({ backlogId: "backlog-1", resourceId: "backlog-1", backlogKey: "WEB" });
    mocks.createBacklog.mockResolvedValue({ id: "backlog-created", key: "API" });
    mocks.updateBacklog.mockResolvedValue({
      previousKey: "WEB",
      backlog: { id: "backlog-1", key: "PLAT", name: "Plateforme", color: "#2b6cb0" },
    });
  });

  it("requires the exact global permission before creating a backlog", async () => {
    await createBacklogAction({ key: "API", name: "API", color: "#475569" });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId: "admin-1",
      permission: "create_backlogs",
      scope: { type: "global" },
    });
    expect(mocks.requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createBacklog.mock.invocationCallOrder[0]!,
    );
    expect(mocks.createBacklog).toHaveBeenCalledWith(
      { key: "API", name: "API", color: "#475569" },
      "admin-1",
    );
  });

  it("returns a structured global permission denial", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      permissionDeniedError("create_backlogs", { type: "global" }),
    );

    await expect(
      createBacklogAction({ key: "API", name: "API", color: "#475569" }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Créer des backlogs ».",
    });
    expect(mocks.createBacklog).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "update",
      run: () =>
        updateBacklogAction({
          id: "backlog-1",
          key: "PLAT",
          name: "Plateforme",
          color: "#2b6cb0",
        }),
      service: mocks.updateBacklog,
    },
    {
      name: "archive",
      run: () => archiveBacklogAction("backlog-1"),
      service: mocks.archiveBacklog,
    },
  ])("requires administer_backlog by stored id before $name", async ({ run, service }) => {
    await run();

    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "admin-1",
      backlogId: "backlog-1",
      permission: "administer_backlog",
    });
    expect(mocks.requireBacklogPermissionById.mock.invocationCallOrder[0]).toBeLessThan(
      service.mock.invocationCallOrder[0]!,
    );
  });
});

describe("updateBacklogAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "admin-1", role: "admin", twoFactorEnabled: true },
    });
  });

  it("passes the admin actor and revalidates every affected route", async () => {
    mocks.updateBacklog.mockResolvedValue({
      previousKey: "WEB",
      backlog: { id: "backlog-1", key: "PLAT", name: "Plateforme", color: "#2b6cb0" },
    });

    await expect(
      updateBacklogAction({
        id: "backlog-1",
        key: "PLAT",
        name: "Plateforme",
        color: "#2b6cb0",
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.updateBacklog).toHaveBeenCalledWith(
      { id: "backlog-1", key: "PLAT", name: "Plateforme", color: "#2b6cb0" },
      "admin-1",
    );
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("WEB", { kind: "backlog", backlogId: "backlog-1", actorId: "admin-1" });
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("PLAT", { kind: "backlog", backlogId: "backlog-1", actorId: "admin-1" });
    expect(new Set(mocks.revalidatePath.mock.calls.map(([path]) => path))).toEqual(
      new Set(["/admin", "/", "/mine", "/trash"]),
    );
  });

  it("returns a stable message for a duplicate key", async () => {
    mocks.updateBacklog.mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }));

    await expect(
      updateBacklogAction({
        id: "backlog-1",
        key: "API",
        name: "API",
        color: "#475569",
      }),
    ).resolves.toEqual({ ok: false, error: "Cette clé est déjà utilisée." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateBacklogAction lead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "admin-1", role: "admin", twoFactorEnabled: true },
    });
  });

  it("forwards the lead to the service", async () => {
    mocks.updateBacklog.mockResolvedValue({
      previousKey: "WEB",
      backlog: { id: "backlog-1", key: "WEB", name: "Site", color: "#2b6cb0" },
    });
    const input = { id: "backlog-1", key: "WEB", name: "Site", color: "#2b6cb0", leadUserId: "user-2" };

    await expect(updateBacklogAction(input)).resolves.toEqual({ ok: true });
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId: "admin-1",
      permission: "browse_users",
      scope: { type: "global" },
    });
    expect(mocks.updateBacklog).toHaveBeenCalledWith(input, "admin-1");
  });

  it("requires browse_users to change the lead", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      permissionDeniedError("browse_users", { type: "global" }),
    );

    const result = await updateBacklogAction({
      id: "backlog-1",
      key: "WEB",
      name: "Site",
      color: "#2b6cb0",
      leadUserId: null,
    });
    expect(result.ok).toBe(false);
    expect(mocks.updateBacklog).not.toHaveBeenCalled();
  });

  it("reports an unknown lead", async () => {
    mocks.updateBacklog.mockRejectedValue(new Error("Responsable introuvable."));

    await expect(
      updateBacklogAction({ id: "backlog-1", key: "WEB", name: "Site", color: "#2b6cb0", leadUserId: "x" }),
    ).resolves.toEqual({ ok: false, error: "Responsable introuvable." });
  });
});

describe("setBacklogStarAction", () => {
  const input = { backlogId: "39cbd39a-7c97-4f0d-848d-199ed2c93ad4", starred: true };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1", role: "contributor", twoFactorEnabled: true },
    });
    mocks.setBacklogStar.mockResolvedValue({ starred: true });
  });

  it("stars for the session user and refreshes every page's shell", async () => {
    await expect(setBacklogStarAction(input)).resolves.toEqual({ ok: true, starred: true });
    expect(mocks.setBacklogStar).toHaveBeenCalledWith(input, "user-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.requireBacklogPermissionById).not.toHaveBeenCalled();
  });

  it("refuses without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(setBacklogStarAction(input)).rejects.toThrow("Forbidden");
    expect(mocks.setBacklogStar).not.toHaveBeenCalled();
  });

  it("maps an inaccessible backlog to not found", async () => {
    mocks.setBacklogStar.mockRejectedValue(
      Object.assign(new Error("La ressource demandée est introuvable."), {
        name: "ResourceNotFoundError",
      }),
    );
    await expect(setBacklogStarAction(input)).resolves.toEqual({
      ok: false,
      error: "La ressource demandée est introuvable.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps invalid input", async () => {
    mocks.setBacklogStar.mockRejectedValue(new ZodError([]));
    await expect(setBacklogStarAction(input)).resolves.toEqual({
      ok: false,
      error: "Requête invalide.",
    });
  });
});
