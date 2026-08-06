import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveBacklog: vi.fn(),
  createBacklog: vi.fn(),
  getSession: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  updateBacklog: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
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
  updateBacklog: mocks.updateBacklog,
}));

import {
  archiveBacklogAction,
  createBacklogAction,
  updateBacklogAction,
} from "@/app/actions/backlogs";

describe("backlog action permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "admin-1", role: "admin", twoFactorEnabled: true },
    });
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
    expect(new Set(mocks.revalidatePath.mock.calls.map(([path]) => path))).toEqual(
      new Set(["/admin", "/", "/mine", "/trash", "/b/WEB", "/b/PLAT"]),
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
