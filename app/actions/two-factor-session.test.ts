import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  headers: vi.fn(),
  requireItemPermission: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  restoreItem: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: async () => ({ toString: () => "" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.authGetSession } },
}));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireItemPermission: mocks.requireItemPermission,
}));
vi.mock("@/lib/auth/authorization", () => ({
  requirePermission: mocks.requirePermission,
  ResourceNotFoundError: Error,
}));
vi.mock("@/lib/services/items", () => ({
  createItem: vi.fn(),
  moveItem: vi.fn(),
  reparentItem: vi.fn(),
  restoreItem: mocks.restoreItem,
  softDeleteItem: vi.fn(),
  updateItem: vi.fn(),
}));

import { restoreItemAction } from "@/app/actions/items";

describe("Server Action 2FA access guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.authGetSession.mockResolvedValue({
      session: {
        id: "session-1",
        token: "token-1",
        userId: "writer-1",
        expiresAt: new Date("2026-08-05T00:00:00Z"),
        createdAt: new Date("2026-08-04T00:00:00Z"),
        updatedAt: new Date("2026-08-04T00:00:00Z"),
        ipAddress: null,
        userAgent: null,
      },
      user: {
        id: "writer-1",
        name: "Writer",
        email: "writer@example.test",
        emailVerified: true,
        image: null,
        createdAt: new Date("2026-08-04T00:00:00Z"),
        updatedAt: new Date("2026-08-04T00:00:00Z"),
        role: "contributor",
        twoFactorEnabled: false,
      },
    });
    mocks.restoreItem.mockResolvedValue({ id: "item-1" });
  });

  it("refuses a mutation from a password-only session before calling the service", async () => {
    await expect(
      restoreItemAction({ id: "item-1", backlogKey: "DEMO" }),
    ).rejects.toThrow("Forbidden");
    expect(mocks.restoreItem).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
