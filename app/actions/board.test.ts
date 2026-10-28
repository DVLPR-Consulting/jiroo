import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  loadBoardSummary: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: mocks.getBacklogByKeyForUser,
}));
vi.mock("@/lib/services/board-summary", () => ({ loadBoardSummary: mocks.loadBoardSummary }));

import { boardSummaryAction } from "@/app/actions/board";

const backlog = { id: "backlog-1", key: "CASS", name: "Cassation", color: "#475569", archivedAt: null };
const summary = {
  activeSprintId: "sprint-1",
  metrics: {
    itemCount: 2, estimatedPoints: 8, completedPoints: 5, remainingPoints: 3, unestimatedCount: 0,
    capacityPoints: null, overCapacityPoints: 0, velocityComparison: null, commitmentBasis: null,
  },
};

describe("boardSummaryAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "viewer-1", role: "viewer" } });
    mocks.getBacklogByKeyForUser.mockResolvedValue(backlog);
    mocks.loadBoardSummary.mockResolvedValue(summary);
  });

  it("requires an authenticated session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(boardSummaryAction("CASS")).rejects.toThrow("Forbidden");
    expect(mocks.loadBoardSummary).not.toHaveBeenCalled();
  });

  it("reads the summary of a backlog the user may browse", async () => {
    await expect(boardSummaryAction("CASS")).resolves.toEqual({ ok: true, summary });
    expect(mocks.getBacklogByKeyForUser).toHaveBeenCalledWith("CASS", "viewer-1");
    expect(mocks.loadBoardSummary).toHaveBeenCalledWith("backlog-1");
  });

  it("answers an unknown, forbidden or archived backlog alike, without reading", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue(null);
    await expect(boardSummaryAction("NOPE")).resolves.toEqual({ ok: false, error: "Lecture impossible." });
    mocks.getBacklogByKeyForUser.mockResolvedValue({ ...backlog, archivedAt: new Date() });
    await expect(boardSummaryAction("CASS")).resolves.toEqual({ ok: false, error: "Lecture impossible." });
    expect(mocks.loadBoardSummary).not.toHaveBeenCalled();
  });

  it("rejects a malformed key before touching the database", async () => {
    await expect(boardSummaryAction("")).resolves.toEqual({ ok: false, error: "Lecture impossible." });
    await expect(boardSummaryAction("x".repeat(21))).resolves.toEqual({ ok: false, error: "Lecture impossible." });
    expect(mocks.getBacklogByKeyForUser).not.toHaveBeenCalled();
  });

  it("turns a failing read into a plain error", async () => {
    mocks.loadBoardSummary.mockRejectedValue(new Error("boom"));
    await expect(boardSummaryAction("CASS")).resolves.toEqual({ ok: false, error: "Lecture impossible." });
  });
});
