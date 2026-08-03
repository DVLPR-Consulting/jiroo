import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveBacklog: vi.fn(),
  createBacklog: vi.fn(),
  getSession: vi.fn(),
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  updateBacklog: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/backlogs", () => ({
  archiveBacklog: mocks.archiveBacklog,
  createBacklog: mocks.createBacklog,
  updateBacklog: mocks.updateBacklog,
}));

import { updateBacklogAction } from "@/app/actions/backlogs";

describe("updateBacklogAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
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
