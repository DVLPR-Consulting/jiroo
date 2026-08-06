import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  recentItems: vi.fn(),
  searchItems: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/search", () => ({
  recentItems: mocks.recentItems,
  searchItems: mocks.searchItems,
}));

import { recentItemsAction, searchAction } from "@/app/actions/search";

describe("recentItemsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "viewer-1", role: "viewer", twoFactorEnabled: true },
    });
    mocks.recentItems.mockResolvedValue([]);
  });

  it("requires an authenticated session before resolving keys", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(recentItemsAction(["DEMO-1"])).rejects.toThrow("Forbidden");
    expect(mocks.recentItems).not.toHaveBeenCalled();
  });

  it("passes validated keys to the secure resolver in caller order", async () => {
    const keys = ["DEMO-8", "DEMO-3", "DEMO-5"];

    await expect(recentItemsAction(keys)).resolves.toEqual({
      ok: true,
      results: [],
    });
    expect(mocks.recentItems).toHaveBeenCalledWith("viewer-1", keys);
  });

  it("passes the authenticated server identity to text search", async () => {
    mocks.searchItems.mockResolvedValue([]);

    await expect(searchAction("DEMO")).resolves.toEqual({ ok: true, results: [] });
    expect(mocks.searchItems).toHaveBeenCalledWith("viewer-1", "DEMO");
  });

  it.each([
    { name: "a non-array payload", keys: "DEMO-1" },
    { name: "an invalid key", keys: ["DEMO-1", "demo-2"] },
    {
      name: "more than eight keys",
      keys: [
        "DEMO-1",
        "DEMO-2",
        "DEMO-3",
        "DEMO-4",
        "DEMO-5",
        "DEMO-6",
        "DEMO-7",
        "DEMO-8",
        "DEMO-9",
      ],
    },
  ])("rejects $name without querying", async ({ keys }) => {
    await expect(recentItemsAction(keys as string[])).resolves.toEqual({
      ok: false,
      error: "Recherche impossible.",
    });
    expect(mocks.recentItems).not.toHaveBeenCalled();
  });
});
