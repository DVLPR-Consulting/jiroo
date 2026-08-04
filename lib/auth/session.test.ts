import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.authGetSession } },
}));

import { getSession } from "@/lib/auth/session";

function session(twoFactorEnabled: boolean | null | undefined) {
  return {
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
      ...(twoFactorEnabled === undefined ? {} : { twoFactorEnabled }),
    },
  };
}

describe("getSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
  });

  it.each([false, null, undefined])(
    "fails closed unless twoFactorEnabled is exactly true (%s)",
    async (twoFactorEnabled) => {
      mocks.authGetSession.mockResolvedValue(session(twoFactorEnabled));

      await expect(getSession()).resolves.toBeNull();
    },
  );

  it("returns null without a session", async () => {
    mocks.authGetSession.mockResolvedValue(null);

    await expect(getSession()).resolves.toBeNull();
  });

  it("returns a fully enrolled session", async () => {
    const enrolled = session(true);
    mocks.authGetSession.mockResolvedValue(enrolled);

    await expect(getSession()).resolves.toBe(enrolled);
  });
});
