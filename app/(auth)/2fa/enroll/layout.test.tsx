import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: async () => ({ toString: () => "" }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.authGetSession } },
}));

import EnrollmentLayout from "@/app/(auth)/2fa/enroll/layout";

function authSession(twoFactorEnabled: boolean) {
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
      twoFactorEnabled,
    },
  };
}

describe("EnrollmentLayout access guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it("redirects an already enrolled account to the app", async () => {
    mocks.authGetSession.mockResolvedValue(authSession(true));

    await expect(EnrollmentLayout({ children: "enrollment" })).rejects.toThrow("redirect:/");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("allows a password-only session to complete enrollment", async () => {
    mocks.authGetSession.mockResolvedValue(authSession(false));

    await expect(EnrollmentLayout({ children: "enrollment" })).resolves.toBe("enrollment");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects an anonymous request to login", async () => {
    mocks.authGetSession.mockResolvedValue(null);

    await expect(EnrollmentLayout({ children: "enrollment" })).rejects.toThrow("redirect:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
