import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers, cookies: mocks.cookies }));
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
    mocks.cookies.mockResolvedValue({ toString: () => "" });
  });

  it("reads the session from the request's current cookies, not the raw Cookie header", async () => {
    // After a Server Action rotates the session cookie, Next.js re-renders with
    // updated cookies() while headers() still carries the revoked token.
    mocks.headers.mockResolvedValue(
      new Headers({ cookie: "better-auth.session_token=revoked", "user-agent": "jsdom" }),
    );
    mocks.cookies.mockResolvedValue({ toString: () => "better-auth.session_token=rotated" });
    mocks.authGetSession.mockResolvedValue(session(true));

    await getSession();

    const forwarded = mocks.authGetSession.mock.calls[0]?.[0]?.headers as Headers;
    expect(forwarded.get("cookie")).toBe("better-auth.session_token=rotated");
    expect(forwarded.get("user-agent")).toBe("jsdom");
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
