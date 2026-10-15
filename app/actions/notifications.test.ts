import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  markAllRead: vi.fn(),
  markRead: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateBacklog: vi.fn(),
  notifyUsers: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/realtime/publish", () => ({ invalidateBacklog: mocks.invalidateBacklog, notifyUsers: mocks.notifyUsers }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/notifications", () => ({
  markAllRead: mocks.markAllRead,
  markRead: mocks.markRead,
}));

import { markAllReadAction, markReadAction } from "@/app/actions/notifications";

describe("notification action ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1", role: "viewer" } });
  });

  it("derives the single-notification owner only from the server session", async () => {
    await expect(markReadAction({ id: "notification-1" })).resolves.toEqual({ ok: true });
    expect(mocks.markRead).toHaveBeenCalledWith("notification-1", "user-1");
    expect(mocks.notifyUsers).toHaveBeenCalledWith(["user-1"], "user-1");
    expect(mocks.markRead.mock.invocationCallOrder[0]).toBeLessThan(mocks.notifyUsers.mock.invocationCallOrder[0]!);
  });

  it("derives the bulk notification owner only from the server session", async () => {
    await expect(markAllReadAction()).resolves.toEqual({ ok: true });
    expect(mocks.markAllRead).toHaveBeenCalledWith("user-1");
    expect(mocks.notifyUsers).toHaveBeenCalledWith(["user-1"], "user-1");
  });

  it("returns a structured error without mutation when the session is absent", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(markReadAction({ id: "notification-1" })).resolves.toEqual({
      ok: false,
      error: "Action impossible.",
    });
    expect(mocks.markRead).not.toHaveBeenCalled();
  });
});
