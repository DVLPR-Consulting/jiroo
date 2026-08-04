import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  listBacklogs: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.authGetSession } },
}));
vi.mock("@/lib/services/backlogs", () => ({ listBacklogs: mocks.listBacklogs }));

import AppIndex from "@/app/(app)/page";

describe("AppIndex 2FA access guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
    mocks.listBacklogs.mockResolvedValue([]);
  });

  it("refuses a pending-enrollment session before reading app data", async () => {
    mocks.authGetSession.mockResolvedValue({
      session: {
        id: "session-1",
        token: "token-1",
        userId: "user-1",
        expiresAt: new Date("2026-08-05T00:00:00Z"),
        createdAt: new Date("2026-08-04T00:00:00Z"),
        updatedAt: new Date("2026-08-04T00:00:00Z"),
        ipAddress: null,
        userAgent: null,
      },
      user: {
        id: "user-1",
        name: "Marie Martin",
        email: "marie@example.test",
        emailVerified: true,
        image: null,
        createdAt: new Date("2026-08-04T00:00:00Z"),
        updatedAt: new Date("2026-08-04T00:00:00Z"),
        role: "contributor",
        twoFactorEnabled: false,
      },
    });

    await expect(AppIndex()).rejects.toThrow("redirect:/2fa/enroll");
    expect(mocks.listBacklogs).not.toHaveBeenCalled();
  });
});
