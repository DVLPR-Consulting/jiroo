import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDatedJson } from "@/lib/serialization/dated-json";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  unreadCount: vi.fn(),
  listRecentNotifications: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/notifications", () => ({
  unreadCount: mocks.unreadCount,
  listRecentNotifications: mocks.listRecentNotifications,
}));

import { GET } from "./route";

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "viewer-1" } });
  });

  it("rejects a request without a session before querying", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.unreadCount).not.toHaveBeenCalled();
  });

  it("returns the viewer's bell data, uncached, with dates intact", async () => {
    const createdAt = new Date("2026-10-15T12:00:00.000Z");
    mocks.unreadCount.mockResolvedValue(2);
    mocks.listRecentNotifications.mockResolvedValue([{ id: "n1", createdAt, read: false }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.unreadCount).toHaveBeenCalledWith("viewer-1");
    expect(mocks.listRecentNotifications).toHaveBeenCalledWith("viewer-1");
    expect(parseDatedJson(await response.text())).toEqual({
      unreadCount: 2,
      notifications: [{ id: "n1", createdAt, read: false }],
    });
  });
});
