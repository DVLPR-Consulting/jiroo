import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  getBacklogCapabilities: vi.fn(),
  getItemByKeyForBacklog: vi.fn(),
  getItemLabelIds: vi.fn(),
  listActivities: vi.fn(),
  listAssignableUsersForBacklog: vi.fn(),
  listComments: vi.fn(),
  listItemFixVersionPairs: vi.fn(),
  listItems: vi.fn(),
  listLabelsForBacklog: vi.fn(),
  listLinksForItem: vi.fn(),
  listRefsForItem: vi.fn(),
  listReleaseSummaries: vi.fn(),
  listSprintsForBacklog: vi.fn(),
  listUsers: vi.fn(),
  listUsersByIds: vi.fn(),
  statusRows: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        where: () => query,
        orderBy: () => Promise.resolve(mocks.statusRows),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/auth/accessible-backlogs", () => ({
  getBacklogCapabilities: mocks.getBacklogCapabilities,
}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
  listAssignableUsersForBacklog: mocks.listAssignableUsersForBacklog,
}));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: mocks.getBacklogByKeyForUser,
}));
vi.mock("@/lib/services/comments", () => ({ listComments: mocks.listComments }));
vi.mock("@/lib/services/item-fix-versions", () => ({
  listItemFixVersionPairs: mocks.listItemFixVersionPairs,
}));
vi.mock("@/lib/services/items", () => ({
  getItemByKeyForBacklog: mocks.getItemByKeyForBacklog,
  getItemLabelIds: mocks.getItemLabelIds,
  listActivities: mocks.listActivities,
  listItems: mocks.listItems,
  listLabelsForBacklog: mocks.listLabelsForBacklog,
  listUsers: mocks.listUsers,
  listUsersByIds: mocks.listUsersByIds,
}));
vi.mock("@/lib/services/links", () => ({ listLinksForItem: mocks.listLinksForItem }));
vi.mock("@/lib/services/refs", () => ({ listRefsForItem: mocks.listRefsForItem }));
vi.mock("@/lib/services/releases", () => ({
  listReleaseSummaries: mocks.listReleaseSummaries,
}));
vi.mock("@/lib/services/sprints", () => ({
  listSprintsForBacklog: mocks.listSprintsForBacklog,
}));

import { loadItemDetailData } from "@/lib/services/item-detail";

const BACKLOG = { id: "backlog-1", key: "DEMO", name: "Demo", color: "#2563eb", archivedAt: null };
const CAPABILITIES = {
  createItems: true,
  editItems: false,
  transitionItems: true,
  scheduleItems: true,
  assignItems: true,
  deleteItems: true,
  restoreItems: false,
  addComments: true,
  editOwnComments: true,
  deleteOwnComments: true,
  deleteAllComments: false,
  linkItems: true,
  manageSprints: false,
  manageWorkflow: false,
  manageReleases: false,
  manageMembers: false,
  bulkChangeItems: false,
};

function row(id: string, key: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    backlogId: "backlog-1",
    key,
    type: "tache",
    kind: "story",
    title: `Titre ${key}`,
    statusId: "status-1",
    assigneeId: null,
    reporterId: null,
    parentId: null,
    rank: "a",
    ...overrides,
  };
}

const parent = row("item-parent", "DEMO-1", { type: "epic", title: "Epic parent" });
const detail = row("item-detail", "DEMO-2", {
  parentId: parent.id,
  assigneeId: "user-assignee",
  reporterId: "user-reporter",
});
const child = row("item-child", "DEMO-3", { type: "soustache", parentId: detail.id });

function load(itemKey = detail.key) {
  return loadItemDetailData({ userId: "viewer-1", backlogKey: "demo", itemKey });
}

describe("loadItemDetailData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.statusRows = [
      { id: "status-1", name: "À faire", color: "#999", category: "todo", order: 0, backlogId: "backlog-1" },
    ];
    mocks.getBacklogByKeyForUser.mockResolvedValue(BACKLOG);
    mocks.getBacklogCapabilities.mockResolvedValue(CAPABILITIES);
    mocks.getItemByKeyForBacklog.mockResolvedValue(detail);
    mocks.listItems.mockResolvedValue([parent, detail, child]);
    mocks.listLabelsForBacklog.mockResolvedValue([
      { id: "label-1", name: "Urgent", color: "#f00", backlogId: "backlog-1" },
    ]);
    mocks.listSprintsForBacklog.mockResolvedValue({
      sprints: [
        { id: "sprint-done", name: "Sprint 1", state: "completed" },
        { id: "sprint-active", name: "Sprint 2", state: "active" },
      ],
      memberships: [
        { itemId: detail.id, sprintId: "sprint-done", leftAt: new Date("2026-09-01") },
        { itemId: detail.id, sprintId: "sprint-active", leftAt: null },
      ],
    });
    mocks.listReleaseSummaries.mockResolvedValue([
      { id: "release-active", name: "2026.10", released: false, archived: false, progress: {} },
      { id: "release-archived", name: "2026.08", released: true, archived: true, progress: {} },
    ]);
    mocks.listItemFixVersionPairs.mockResolvedValue([
      { itemId: detail.id, releaseId: "release-archived" },
      { itemId: child.id, releaseId: "release-active" },
    ]);
    mocks.checkPermission.mockResolvedValue({ allowed: true });
    mocks.listActivities.mockResolvedValue([{ id: "activity-1", actorId: "user-actor" }]);
    mocks.getItemLabelIds.mockResolvedValue(["label-1"]);
    mocks.listComments.mockResolvedValue([{ id: "comment-1", authorId: "user-author" }]);
    mocks.listLinksForItem.mockResolvedValue([]);
    mocks.listRefsForItem.mockResolvedValue([]);
    mocks.listUsers.mockResolvedValue([
      { id: "user-assignee", name: "Assignée", email: "private@example.test" },
      { id: "user-other", name: "Autre", email: "other@example.test" },
    ]);
    mocks.listAssignableUsersForBacklog.mockResolvedValue([
      { id: "user-assignee", name: "Assignée" },
    ]);
    mocks.listUsersByIds.mockResolvedValue([
      { id: "user-assignee", name: "Assignée" },
      { id: "user-actor", name: "Acteur" },
    ]);
  });

  it("returns null for a backlog the user cannot browse, without loading anything else", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue(null);

    await expect(load()).resolves.toBeNull();

    expect(mocks.getBacklogByKeyForUser).toHaveBeenCalledWith("demo", "viewer-1");
    expect(mocks.getBacklogCapabilities).not.toHaveBeenCalled();
    expect(mocks.getItemByKeyForBacklog).not.toHaveBeenCalled();
  });

  it("returns null for an archived backlog", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({ ...BACKLOG, archivedAt: new Date() });

    await expect(load()).resolves.toBeNull();
    expect(mocks.getItemByKeyForBacklog).not.toHaveBeenCalled();
  });

  it("returns null without item details when browse_backlog is denied", async () => {
    mocks.getBacklogCapabilities.mockResolvedValue(null);

    await expect(load()).resolves.toBeNull();

    expect(mocks.getBacklogCapabilities).toHaveBeenCalledWith("viewer-1", "backlog-1");
    expect(mocks.listActivities).not.toHaveBeenCalled();
    expect(mocks.listComments).not.toHaveBeenCalled();
  });

  it("reports a key missing from the backlog as not found", async () => {
    mocks.getItemByKeyForBacklog.mockResolvedValue(null);

    await expect(load("DEMO-404")).resolves.toEqual({ kind: "not-found", itemKey: "DEMO-404" });

    expect(mocks.getItemByKeyForBacklog).toHaveBeenCalledWith("DEMO-404", "backlog-1");
    expect(mocks.listActivities).not.toHaveBeenCalled();
  });

  it("builds the panel props from the whole backlog, with exact capabilities", async () => {
    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");
    const { panel } = data;

    expect(panel.detail).toBe(detail);
    expect(panel.backlogKey).toBe("DEMO");
    expect(panel.currentUserId).toBe("viewer-1");
    expect(panel.itemLabelIds).toEqual(["label-1"]);
    expect(panel.parent).toEqual({ key: "DEMO-1", title: "Epic parent", type: "epic" });
    expect(panel.childItems).toEqual([
      { id: child.id, key: "DEMO-3", title: "Titre DEMO-3", type: "soustache", statusId: "status-1" },
    ]);
    expect(panel.candidates.map((candidate) => candidate.key)).toEqual(["DEMO-1", "DEMO-2", "DEMO-3"]);
    expect(panel.statuses).toEqual([
      { id: "status-1", name: "À faire", color: "#999", category: "todo", order: 0 },
    ]);
    // Edit is not a substitute for the narrower permissions.
    expect(panel).toEqual(expect.objectContaining({
      canEditItems: false,
      canTransitionItems: true,
      canAssignItems: true,
    }));
    expect(panel.itemCapabilities).toEqual(expect.objectContaining({
      edit: false,
      transition: false,
      delete: true,
      addComments: true,
      link: true,
    }));
    expect(panel.planningCapabilities).toEqual(expect.objectContaining({ rank: true, manageSprints: false }));
    expect(panel.releaseCapabilities).toEqual({ manage: false, assignItems: false, bulkAssignItems: false });
  });

  it("keeps the item's archived fix versions but offers only unarchived ones", async () => {
    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");

    expect(data.panel.fixVersions).toEqual([
      { id: "release-archived", name: "2026.08", released: true, archived: true },
    ]);
    expect(data.panel.releaseOptions).toEqual([
      { id: "release-active", name: "2026.10", released: false, archived: false },
    ]);
  });

  it("offers open sprints and selects the item's current sprint", async () => {
    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");

    expect(data.panel.sprints).toEqual([{ id: "sprint-active", name: "Sprint 2" }]);
    expect(data.panel.sprintId).toBe("sprint-active");
  });

  it("names every referenced user and projects assignable users into the pickers", async () => {
    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");

    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "viewer-1",
      permission: "browse_users",
      scope: { type: "global" },
    });
    expect(mocks.listUsersByIds).toHaveBeenCalledWith(
      expect.arrayContaining(["user-assignee", "user-reporter", "user-actor", "user-author"]),
    );
    expect(data.panel.users).toEqual([
      { id: "user-assignee", name: "Assignée" },
      { id: "user-actor", name: "Acteur" },
      { id: "user-other", name: "Autre" },
    ]);
    expect(data.panel.assigneeCandidates).toEqual([{ id: "user-assignee", name: "Assignée" }]);
    // Directory rows are narrowed to id and name: no email reaches the client.
    expect(data.panel.reporterCandidates).toEqual([
      { id: "user-assignee", name: "Assignée" },
      { id: "user-other", name: "Autre" },
    ]);
  });

  it("does not materialize the user directory when browse_users is denied", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: false });

    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");

    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.listAssignableUsersForBacklog).not.toHaveBeenCalled();
    expect(data.panel.assigneeCandidates).toEqual([]);
    expect(data.panel.reporterCandidates).toEqual([]);
    expect(data.panel.users).toEqual([
      { id: "user-assignee", name: "Assignée" },
      { id: "user-actor", name: "Acteur" },
    ]);
  });

  it("offers child creation among the whole backlog only with create permission", async () => {
    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");
    expect(data.panel.createDialog).toEqual(expect.objectContaining({
      backlogId: "backlog-1",
      canScheduleItems: true,
      items: [
        { id: parent.id, key: "DEMO-1", type: "epic", title: "Epic parent" },
        { id: detail.id, key: "DEMO-2", type: "tache", title: "Titre DEMO-2" },
        { id: child.id, key: "DEMO-3", type: "soustache", title: "Titre DEMO-3" },
      ],
      statuses: [{ id: "status-1", name: "À faire", category: "todo" }],
      releaseOptions: [
        { id: "release-active", name: "2026.10", released: false, archived: false },
      ],
      fieldOptions: {
        users: [{ id: "user-assignee", name: "Assignée" }],
        canAssign: true,
        currentUserId: "viewer-1",
        sprints: [{ id: "sprint-active", name: "Sprint 2" }],
        labels: [{ id: "label-1", name: "Urgent", color: "#f00" }],
      },
    }));

    mocks.getBacklogCapabilities.mockResolvedValue({ ...CAPABILITIES, createItems: false });
    const denied = await load();
    if (denied?.kind !== "item") throw new Error("expected an item");
    expect(denied.panel.createDialog).toBeUndefined();
  });
});
