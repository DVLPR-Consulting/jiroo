import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  loadTreeChildren: vi.fn(),
  loadTreeMatchWindow: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/backlogs", () => ({ getBacklogByKeyForUser: mocks.getBacklogByKeyForUser }));
vi.mock("@/lib/services/tree-window", () => ({
  loadTreeChildren: mocks.loadTreeChildren,
  loadTreeMatchWindow: mocks.loadTreeMatchWindow,
}));

import { loadTreeChildrenAction, loadTreeMatchesAction } from "@/app/actions/tree-window";

const FAILED = { ok: false, error: "Impossible de charger la suite. Réessayez avec « Charger la suite »." };
const PARENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("Arbre window actions (JIR-147)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getBacklogByKeyForUser.mockResolvedValue({ id: "backlog-1", archivedAt: null });
    mocks.loadTreeChildren.mockImplementation(async (_backlogId: string, parentId: string) => ({
      parentId, total: 0, rows: [], nextCursor: null,
    }));
    mocks.loadTreeMatchWindow.mockResolvedValue({ total: 0, rows: [], nextCursor: null });
  });

  it("reads each parent's window in the backlog the user may browse, 100 rows by default", async () => {
    const result = await loadTreeChildrenAction({
      backlogKey: "DEMO",
      parents: [{ parentId: PARENT, cursor: null }, { parentId: OTHER, cursor: "a5", limit: 7 }],
    });
    expect(result).toEqual({
      ok: true,
      windows: [
        { parentId: PARENT, total: 0, rows: [], nextCursor: null },
        { parentId: OTHER, total: 0, rows: [], nextCursor: null },
      ],
    });
    expect(mocks.getBacklogByKeyForUser).toHaveBeenCalledWith("DEMO", "user-1");
    expect(mocks.loadTreeChildren).toHaveBeenCalledWith("backlog-1", PARENT, { cursor: null, limit: 100 });
    expect(mocks.loadTreeChildren).toHaveBeenCalledWith("backlog-1", OTHER, { cursor: "a5", limit: 7 });
  });

  it("answers an unknown, archived or forbidden backlog the same way", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValueOnce(null);
    expect(await loadTreeChildrenAction({ backlogKey: "NOPE", parents: [{ parentId: PARENT, cursor: null }] }))
      .toEqual(FAILED);
    mocks.getBacklogByKeyForUser.mockResolvedValueOnce({ id: "backlog-1", archivedAt: new Date() });
    expect(await loadTreeMatchesAction({ backlogKey: "OLD", viewState: "", cursor: null })).toEqual(FAILED);
    expect(mocks.loadTreeChildren).not.toHaveBeenCalled();
    expect(mocks.loadTreeMatchWindow).not.toHaveBeenCalled();
  });

  it("refuses a read beyond the reload limit or with a malformed cursor", async () => {
    const many = Array.from({ length: 6 }, () => ({ parentId: PARENT, cursor: null }));
    expect(await loadTreeChildrenAction({ backlogKey: "DEMO", parents: many })).toEqual(FAILED);
    expect(await loadTreeChildrenAction({ backlogKey: "DEMO", parents: [{ parentId: "not-a-uuid", cursor: null }] }))
      .toEqual(FAILED);
    expect(await loadTreeMatchesAction({
      backlogKey: "DEMO",
      viewState: "",
      cursor: { depth: -1, rank: "a0" },
    })).toEqual(FAILED);
    expect(mocks.getBacklogByKeyForUser).not.toHaveBeenCalled();
  });

  it("reads the filtered matches with the filters of the view state the page rendered", async () => {
    const statusId = "33333333-3333-4333-8333-333333333333";
    await loadTreeMatchesAction({
      backlogKey: "DEMO",
      viewState: `status=${statusId}`,
      cursor: { depth: 2, rank: "a5" },
      limit: 300,
    });
    expect(mocks.loadTreeMatchWindow).toHaveBeenCalledWith(
      "backlog-1",
      expect.objectContaining({ statusIds: [statusId] }),
      { cursor: { depth: 2, rank: "a5" }, limit: 300 },
    );
  });

  it("refuses an anonymous call", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    await expect(loadTreeChildrenAction({ backlogKey: "DEMO", parents: [{ parentId: PARENT, cursor: null }] }))
      .rejects.toThrow("Forbidden");
  });
});
