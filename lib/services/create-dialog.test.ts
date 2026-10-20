import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBacklogByKeyForUser: vi.fn(),
  resolveBacklogAccess: vi.fn(),
  listAssignableUsersForBacklog: vi.fn(),
  listLiveParentCandidates: vi.fn(),
  listLabelsForBacklog: vi.fn(),
  listReleaseSummaries: vi.fn(),
  statusRows: vi.fn(),
  sprintRows: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/backlogs", () => ({ getBacklogByKeyForUser: mocks.getBacklogByKeyForUser }));
vi.mock("@/lib/auth/accessible-backlogs", () => ({ resolveBacklogAccess: mocks.resolveBacklogAccess }));
vi.mock("@/lib/auth/authorization", () => ({
  listAssignableUsersForBacklog: mocks.listAssignableUsersForBacklog,
}));
vi.mock("@/lib/services/items", () => ({
  listLiveParentCandidates: mocks.listLiveParentCandidates,
  listLabelsForBacklog: mocks.listLabelsForBacklog,
}));
vi.mock("@/lib/services/releases", () => ({ listReleaseSummaries: mocks.listReleaseSummaries }));
vi.mock("@/lib/db", async () => {
  const { sprints } = await import("@/lib/db/schema/domain");
  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({ orderBy: table === sprints ? mocks.sprintRows : mocks.statusRows }),
        }),
      }),
    },
  };
});

import { loadBacklogCreateDialog } from "./create-dialog";

const BACKLOG = { id: "b1", key: "PORT", name: "Portail", color: "#0f766e", archivedAt: null };

function access(createItems: boolean, browseUsers = true) {
  return {
    capabilities: { createItems, scheduleItems: true, assignItems: true },
    globalDecisions: new Map([["browse_users", { allowed: browseUsers }]]),
  };
}

describe("loadBacklogCreateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBacklogByKeyForUser.mockResolvedValue(BACKLOG);
    mocks.resolveBacklogAccess.mockResolvedValue(access(true));
    mocks.listLiveParentCandidates.mockResolvedValue([
      { id: "e1", key: "PORT-1", type: "epic", title: "Epic", parentId: null },
    ]);
    mocks.statusRows.mockResolvedValue([{ id: "s1", name: "À faire", category: "todo" }]);
    mocks.listLabelsForBacklog.mockResolvedValue([{ id: "l1", name: "ux", color: "#000", backlogId: "b1" }]);
    // The query keeps open sprints only (state <> completed).
    mocks.sprintRows.mockResolvedValue([{ id: "sp1", name: "Sprint 1" }]);
    mocks.listReleaseSummaries.mockResolvedValue([
      { id: "r1", name: "1.0", released: false, archived: false },
      { id: "r0", name: "0.9", released: true, archived: true },
    ]);
    mocks.listAssignableUsersForBacklog.mockResolvedValue([{ id: "u2", name: "Bea" }]);
  });

  it("returns the dialog of a backlog the user may create in, with its color", async () => {
    const dialog = await loadBacklogCreateDialog({ userId: "u1", backlogKey: "port" });
    expect(dialog).toEqual({
      backlogId: "b1",
      backlogKey: "PORT",
      backlogColor: "#0f766e",
      canScheduleItems: true,
      items: [{ id: "e1", key: "PORT-1", type: "epic", title: "Epic" }],
      statuses: [{ id: "s1", name: "À faire", category: "todo" }],
      releaseOptions: [{ id: "r1", name: "1.0", released: false, archived: false }],
      fieldOptions: {
        users: [{ id: "u2", name: "Bea" }],
        canAssign: true,
        canBrowseUsers: true,
        currentUserId: "u1",
        sprints: [{ id: "sp1", name: "Sprint 1" }],
        labels: [{ id: "l1", name: "ux", color: "#000" }],
      },
    });
  });

  it("offers no directory without the browse users permission", async () => {
    mocks.resolveBacklogAccess.mockResolvedValue(access(true, false));
    const dialog = await loadBacklogCreateDialog({ userId: "u1", backlogKey: "PORT" });
    expect(dialog?.fieldOptions).toMatchObject({ users: [], canBrowseUsers: false });
    expect(mocks.listAssignableUsersForBacklog).not.toHaveBeenCalled();
  });

  it.each([
    ["the backlog is not browsable", () => mocks.getBacklogByKeyForUser.mockResolvedValue(null)],
    ["the backlog is archived", () => mocks.getBacklogByKeyForUser.mockResolvedValue({ ...BACKLOG, archivedAt: new Date() })],
    ["the user may not create items", () => mocks.resolveBacklogAccess.mockResolvedValue(access(false))],
    ["the user has no capabilities", () => mocks.resolveBacklogAccess.mockResolvedValue({ capabilities: null, globalDecisions: new Map() })],
  ])("returns null when %s", async (_case, arrange) => {
    arrange();
    expect(await loadBacklogCreateDialog({ userId: "u1", backlogKey: "PORT" })).toBeNull();
    expect(mocks.listLiveParentCandidates).not.toHaveBeenCalled();
  });
});
