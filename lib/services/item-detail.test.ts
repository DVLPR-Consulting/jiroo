import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listItemTemplates: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  resolveBacklogAccess: vi.fn(),
  checkPermission: vi.fn(),
  getItemByKeyForBacklog: vi.fn(),
  getItemLabelIds: vi.fn(),
  listActivities: vi.fn(),
  listAssignableUsersForBacklog: vi.fn(),
  listComments: vi.fn(),
  listItemFixVersionPairs: vi.fn(),
  listChildItems: vi.fn(),
  listItemChoicesByIds: vi.fn(),
  listLabelsForBacklog: vi.fn(),
  listLinksForItem: vi.fn(),
  listRefsForItem: vi.fn(),
  listWebLinksForItem: vi.fn(),
  listReleaseSummaries: vi.fn(),
  listSprintsForBacklog: vi.fn(),
  listUsers: vi.fn(),
  listUsersByIds: vi.fn(),
  statusRows: [] as unknown[],
  repoConnectionRows: [] as { id: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/item-templates", () => ({ listItemTemplates: mocks.listItemTemplates }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        where: () => query,
        orderBy: () => Promise.resolve(mocks.statusRows),
        limit: () => Promise.resolve(mocks.repoConnectionRows),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/auth/accessible-backlogs", () => ({
  resolveBacklogAccess: mocks.resolveBacklogAccess,
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
  listLabelsForBacklog: mocks.listLabelsForBacklog,
  listUsers: mocks.listUsers,
  listUsersByIds: mocks.listUsersByIds,
}));
vi.mock("@/lib/services/item-choices", () => ({
  listChildItems: mocks.listChildItems,
  listItemChoicesByIds: mocks.listItemChoicesByIds,
}));
vi.mock("@/lib/services/links", () => ({ listLinksForItem: mocks.listLinksForItem }));
vi.mock("@/lib/services/refs", () => ({ listRefsForItem: mocks.listRefsForItem }));
vi.mock("@/lib/services/web-links", () => ({ listWebLinksForItem: mocks.listWebLinksForItem }));
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

let canBrowseUsers = true;
function browseUsers(allowed: boolean) {
  canBrowseUsers = allowed;
}
function grantCapabilities(capabilities: typeof CAPABILITIES | null) {
  mocks.resolveBacklogAccess.mockImplementation(async () => ({
    capabilities,
    globalDecisions: new Map([["browse_users", { allowed: canBrowseUsers }]]),
  }));
}

function load(itemKey = detail.key) {
  return loadItemDetailData({ userId: "viewer-1", backlogKey: "demo", itemKey });
}

describe("loadItemDetailData", () => {
  it("loads templates for the drawer's create dialog", async () => {
    const data = await load("DEMO-1");
    expect(mocks.listItemTemplates).toHaveBeenCalledWith(BACKLOG.id);
    expect(data).toMatchObject({ panel: { createDialog: { templates: [{ id: "shared-template", name: "Incident" }] } } });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listItemTemplates.mockResolvedValue([{ id: "shared-template", name: "Incident" }]);
    mocks.repoConnectionRows = [];
    mocks.checkPermission.mockResolvedValue({ allowed: false });
    mocks.statusRows = [
      { id: "status-1", name: "À faire", color: "#999", category: "todo", order: 0, backlogId: "backlog-1" },
    ];
    mocks.getBacklogByKeyForUser.mockResolvedValue(BACKLOG);
    canBrowseUsers = true;
    grantCapabilities(CAPABILITIES);
    mocks.getItemByKeyForBacklog.mockResolvedValue(detail);
    // Targeted reads (JIR-118): the parent by id, the children by parent.
    mocks.listItemChoicesByIds.mockResolvedValue([
      { id: parent.id, key: "DEMO-1", type: "epic", title: "Epic parent" },
    ]);
    mocks.listChildItems.mockResolvedValue([
      { id: child.id, key: "DEMO-3", title: "Titre DEMO-3", type: "soustache", statusId: "status-1" },
    ]);
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
    browseUsers(true);
    mocks.listActivities.mockResolvedValue([{ id: "activity-1", actorId: "user-actor" }]);
    mocks.getItemLabelIds.mockResolvedValue(["label-1"]);
    mocks.listComments.mockResolvedValue([{ id: "comment-1", authorId: "user-author" }]);
    mocks.listLinksForItem.mockResolvedValue([]);
    mocks.listRefsForItem.mockResolvedValue([]);
    mocks.listWebLinksForItem.mockResolvedValue([
      { id: "web-link-1", url: "https://www.figma.com/design/abc", title: "Maquettes", createdAt: new Date(0) },
    ]);
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
    expect(mocks.resolveBacklogAccess).not.toHaveBeenCalled();
    expect(mocks.getItemByKeyForBacklog).not.toHaveBeenCalled();
  });

  it("returns null for an archived backlog", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({ ...BACKLOG, archivedAt: new Date() });

    await expect(load()).resolves.toBeNull();
    expect(mocks.getItemByKeyForBacklog).not.toHaveBeenCalled();
  });

  it("returns null without item details when browse_backlog is denied", async () => {
    grantCapabilities(null);

    await expect(load()).resolves.toBeNull();

    expect(mocks.resolveBacklogAccess).toHaveBeenCalledWith("viewer-1", "backlog-1", ["browse_users"]);
    expect(mocks.listActivities).not.toHaveBeenCalled();
    expect(mocks.listComments).not.toHaveBeenCalled();
    expect(mocks.listWebLinksForItem).not.toHaveBeenCalled();
    expect(mocks.listItemTemplates).not.toHaveBeenCalled();
  });

  it("reports a key missing from the backlog as not found", async () => {
    mocks.getItemByKeyForBacklog.mockResolvedValue(null);

    await expect(load("DEMO-404")).resolves.toEqual({ kind: "not-found", itemKey: "DEMO-404" });

    expect(mocks.getItemByKeyForBacklog).toHaveBeenCalledWith("DEMO-404", "backlog-1");
    expect(mocks.listActivities).not.toHaveBeenCalled();
    expect(mocks.listWebLinksForItem).not.toHaveBeenCalled();
    expect(mocks.listItemTemplates).not.toHaveBeenCalled();
  });

  it("builds the panel props from the whole backlog, with exact capabilities", async () => {
    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");
    const { panel } = data;

    expect(panel.detail).toBe(detail);
    expect(panel.backlogKey).toBe("DEMO");
    expect(panel.currentUserId).toBe("viewer-1");
    expect(panel.hasRepoConnection).toBe(false);
    expect(panel.canAdministerBacklog).toBe(false);
    expect(panel.itemLabelIds).toEqual(["label-1"]);
    expect(mocks.listWebLinksForItem).toHaveBeenCalledWith(detail.id);
    expect(panel.webLinks).toEqual([
      { id: "web-link-1", url: "https://www.figma.com/design/abc", title: "Maquettes", createdAt: new Date(0) },
    ]);
    expect(panel.parent).toEqual({ id: parent.id, key: "DEMO-1", title: "Epic parent", type: "epic" });
    expect(panel.childItems).toEqual([
      { id: child.id, key: "DEMO-3", title: "Titre DEMO-3", type: "soustache", statusId: "status-1" },
    ]);
    expect(panel.historyItems).toEqual([{ id: parent.id, key: "DEMO-1" }]);
    expect(mocks.listChildItems).toHaveBeenCalledWith("backlog-1", detail.id);
    expect(mocks.listItemChoicesByIds).toHaveBeenCalledWith("backlog-1", expect.arrayContaining([parent.id]));
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

  it("passes repository connectivity and backlog administration permission to the panel", async () => {
    mocks.repoConnectionRows = [{ id: "connection-1" }];
    mocks.checkPermission.mockResolvedValue({ allowed: true });

    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");

    expect(data.panel.hasRepoConnection).toBe(true);
    expect(data.panel.canAdministerBacklog).toBe(true);
    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "viewer-1",
      permission: "administer_backlog",
      scope: { type: "backlog", backlogId: "backlog-1" },
    });
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

  it("names users from the directory and projects assignable users into the pickers", async () => {
    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");

    // browse_users is resolved with the capabilities' global batch.
    expect(mocks.resolveBacklogAccess).toHaveBeenCalledWith("viewer-1", "backlog-1", ["browse_users"]);
    // The whole directory already names everyone: no extra lookup.
    expect(mocks.listUsersByIds).not.toHaveBeenCalled();
    expect(data.panel.users).toEqual([
      { id: "user-assignee", name: "Assignée" },
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
    browseUsers(false);

    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");

    expect(mocks.listUsers).not.toHaveBeenCalled();
    // Only the users the backlog and the item reference are named.
    expect(mocks.listUsersByIds).toHaveBeenCalledWith(
      expect.arrayContaining(["user-assignee", "user-reporter", "user-actor", "user-author"]),
    );
    expect(mocks.listAssignableUsersForBacklog).not.toHaveBeenCalled();
    expect(data.panel.assigneeCandidates).toEqual([]);
    expect(data.panel.canBrowseUsers).toBe(false);
    expect(data.panel.createDialog?.fieldOptions?.canBrowseUsers).toBe(false);
    expect(data.panel.reporterCandidates).toEqual([]);
    expect(data.panel.users).toEqual([
      { id: "user-assignee", name: "Assignée" },
      { id: "user-actor", name: "Acteur" },
    ]);
  });

  it("names the parents the history cites by their ids, through one read", async () => {
    mocks.listActivities.mockResolvedValue([
      { id: "activity-1", actorId: "user-actor" },
      { id: "activity-2", actorId: "user-actor", action: "move", field: "parent", oldValue: "item-old-parent", newValue: parent.id },
      { id: "activity-3", actorId: "user-actor", action: "update", field: "assignee", oldValue: "user-old", newValue: "user-new" },
    ]);
    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");
    // The current parent and both sides of every parent change; the service deduplicates.
    expect(mocks.listItemChoicesByIds).toHaveBeenCalledTimes(1);
    expect(mocks.listItemChoicesByIds).toHaveBeenCalledWith("backlog-1", [parent.id, "item-old-parent", parent.id]);
    // What the read found is what the history can name; a deleted parent stays unnamed.
    expect(data.panel.historyItems).toEqual([{ id: parent.id, key: "DEMO-1" }]);
    expect(data.panel.parent).toEqual({ id: parent.id, key: "DEMO-1", title: "Epic parent", type: "epic" });
  });

  it("names the people the history cites when the directory is not browsable", async () => {
    browseUsers(false);
    mocks.listActivities.mockResolvedValue([
      { id: "activity-1", actorId: "user-actor" },
      { id: "activity-3", actorId: "user-actor", action: "update", field: "assignee", oldValue: "user-old", newValue: null },
      { id: "activity-4", actorId: "user-actor", action: "update", field: "reporter", oldValue: null, newValue: "user-new" },
      { id: "activity-5", actorId: "user-actor", action: "update", field: "title", oldValue: "Ancien titre", newValue: "Nouveau titre" },
    ]);
    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");
    expect(mocks.listUsersByIds).toHaveBeenCalledTimes(1);
    const asked = mocks.listUsersByIds.mock.calls[0]![0] as string[];
    expect(asked).toEqual(
      expect.arrayContaining(["user-assignee", "user-reporter", "user-actor", "user-old", "user-new", "user-author"]),
    );
    expect(asked).not.toContain("Ancien titre");
    expect(asked).not.toContain("Nouveau titre");
  });

  it("offers child creation only with create permission", async () => {
    const data = await load();
    if (data?.kind !== "item") throw new Error("expected an item");
    expect(data.panel.createDialog).toEqual(expect.objectContaining({
      backlogId: "backlog-1",
      canScheduleItems: true,
      statuses: [{ id: "status-1", name: "À faire", category: "todo" }],
      releaseOptions: [
        { id: "release-active", name: "2026.10", released: false, archived: false },
      ],
      fieldOptions: {
        users: [{ id: "user-assignee", name: "Assignée" }],
        canAssign: true,
        canBrowseUsers: true,
        currentUserId: "viewer-1",
        sprints: [{ id: "sprint-active", name: "Sprint 2" }],
        labels: [{ id: "label-1", name: "Urgent", color: "#f00" }],
      },
    }));

    grantCapabilities({ ...CAPABILITIES, createItems: false });
    const denied = await load();
    if (denied?.kind !== "item") throw new Error("expected an item");
    expect(denied.panel.createDialog).toBeUndefined();
  });
});
