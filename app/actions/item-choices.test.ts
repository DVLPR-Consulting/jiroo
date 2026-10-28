import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  searchBacklogItems: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: mocks.getBacklogByKeyForUser,
}));
vi.mock("@/lib/services/item-choices", () => ({
  ITEM_CHOICE_LIMIT: 20,
  searchBacklogItems: mocks.searchBacklogItems,
}));

import { searchBacklogItemsAction } from "@/app/actions/item-choices";

const backlog = { id: "backlog-1", key: "CASS", name: "Cassation", color: "#475569", archivedAt: null };
const epic = { id: "0f0e0d0c-0b0a-4c09-8807-060504030201", key: "CASS-2", type: "epic", title: "Connexion" };

describe("searchBacklogItemsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "viewer-1", role: "viewer" } });
    mocks.getBacklogByKeyForUser.mockResolvedValue(backlog);
    mocks.searchBacklogItems.mockResolvedValue([epic]);
  });

  it("requires an authenticated session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(searchBacklogItemsAction({ backlogKey: "CASS" })).rejects.toThrow("Forbidden");
    expect(mocks.getBacklogByKeyForUser).not.toHaveBeenCalled();
    expect(mocks.searchBacklogItems).not.toHaveBeenCalled();
  });

  it("searches the backlog the user may browse, with the validated options and the server's limit", async () => {
    await expect(
      searchBacklogItemsAction({
        backlogKey: "CASS",
        q: "conn",
        types: ["epic"],
        excludeIds: [epic.id],
        excludeLinksOf: "1f1e1d1c-1b1a-4c09-8807-060504030201",
      }),
    ).resolves.toEqual({ ok: true, items: [epic], limit: 20 });
    expect(mocks.getBacklogByKeyForUser).toHaveBeenCalledWith("CASS", "viewer-1");
    expect(mocks.searchBacklogItems).toHaveBeenCalledWith("backlog-1", {
      q: "conn",
      types: ["epic"],
      excludeIds: [epic.id],
      excludeLinksOf: "1f1e1d1c-1b1a-4c09-8807-060504030201",
    });
  });

  it("answers an unknown, forbidden or archived backlog alike, without searching", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue(null);
    await expect(searchBacklogItemsAction({ backlogKey: "NOPE" })).resolves.toEqual({
      ok: false,
      error: "Recherche impossible.",
    });
    mocks.getBacklogByKeyForUser.mockResolvedValue({ ...backlog, archivedAt: new Date() });
    await expect(searchBacklogItemsAction({ backlogKey: "CASS" })).resolves.toEqual({
      ok: false,
      error: "Recherche impossible.",
    });
    expect(mocks.searchBacklogItems).not.toHaveBeenCalled();
  });

  it("rejects malformed input before touching the database", async () => {
    const malformed = [
      { backlogKey: "" },
      { backlogKey: "CASS", q: "x".repeat(101) },
      { backlogKey: "CASS", types: ["story"] },
      { backlogKey: "CASS", excludeIds: ["not-a-uuid"] },
      { backlogKey: "CASS", excludeIds: Array.from({ length: 51 }, () => epic.id) },
      { backlogKey: "CASS", excludeLinksOf: "item-1" },
    ];
    for (const input of malformed) {
      await expect(
        searchBacklogItemsAction(input as Parameters<typeof searchBacklogItemsAction>[0]),
      ).resolves.toEqual({ ok: false, error: "Recherche impossible." });
    }
    expect(mocks.getBacklogByKeyForUser).not.toHaveBeenCalled();
    expect(mocks.searchBacklogItems).not.toHaveBeenCalled();
  });

  it("turns a failing search into a plain error", async () => {
    mocks.searchBacklogItems.mockRejectedValue(new Error("boom"));
    await expect(searchBacklogItemsAction({ backlogKey: "CASS", q: "a" })).resolves.toEqual({
      ok: false,
      error: "Recherche impossible.",
    });
  });
});
