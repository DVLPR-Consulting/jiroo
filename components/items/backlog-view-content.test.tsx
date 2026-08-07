import { cleanup, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  filterBarProps: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  getBacklogCapabilities: vi.fn(),
  itemBacklogProps: vi.fn(),
  itemBoardProps: vi.fn(),
  itemDetailProps: vi.fn(),
  itemListProps: vi.fn(),
  itemTreeProps: vi.fn(),
  listItemFixVersionPairs: vi.fn(),
  listItemLabelPairs: vi.fn(),
  listItems: vi.fn(),
  listLabelsForBacklog: vi.fn(),
  listAssignableUsersForBacklog: vi.fn(),
  listSprintsForBacklog: vi.fn(),
  listReleaseSummaries: vi.fn(),
  listUsers: vi.fn(),
  listUsersByIds: vi.fn(),
  blockedItemIds: vi.fn(),
  getViewByIdForUser: vi.fn(),
  notFound: vi.fn(),
  requireAppPageSession: vi.fn(),
  select: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));
vi.mock("@/lib/auth/session", () => ({
  requireAppPageSession: mocks.requireAppPageSession,
}));
vi.mock("@/lib/auth/accessible-backlogs", () => ({
  getBacklogCapabilities: mocks.getBacklogCapabilities,
}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
  listAssignableUsersForBacklog: mocks.listAssignableUsersForBacklog,
}));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: mocks.getBacklogByKeyForUser,
}));
vi.mock("@/lib/services/items", () => ({
  listItemLabelPairs: mocks.listItemLabelPairs,
  listItems: mocks.listItems,
  listLabelsForBacklog: mocks.listLabelsForBacklog,
  listUsers: mocks.listUsers,
  listUsersByIds: mocks.listUsersByIds,
}));
vi.mock("@/lib/services/links", () => ({
  blockedItemIds: mocks.blockedItemIds,
}));
vi.mock("@/lib/services/item-fix-versions", () => ({
  listItemFixVersionPairs: mocks.listItemFixVersionPairs,
}));
vi.mock("@/lib/services/releases", () => ({
  listReleaseSummaries: mocks.listReleaseSummaries,
}));
vi.mock("@/lib/services/sprints", () => ({
  listSprintsForBacklog: mocks.listSprintsForBacklog,
}));
vi.mock("@/lib/services/views", () => ({
  getViewByIdForUser: mocks.getViewByIdForUser,
}));
vi.mock("@/app/actions/items", () => ({
  moveItemAction: vi.fn(),
  reparentItemAction: vi.fn(),
}));
vi.mock("@/components/items/item-backlog", () => ({
  ItemBacklog: (props: unknown) => {
    mocks.itemBacklogProps(props);
    return null;
  },
}));
vi.mock("@/components/items/item-board", () => ({
  ItemBoard: (props: unknown) => {
    mocks.itemBoardProps(props);
    return null;
  },
}));
vi.mock("@/components/items/item-detail-content", () => ({
  ItemDetailContent: (props: unknown) => {
    mocks.itemDetailProps(props);
    return null;
  },
}));
vi.mock("@/components/items/item-list", () => ({
  ItemList: (props: unknown) => {
    mocks.itemListProps(props);
    return null;
  },
}));
vi.mock("@/components/items/item-tree", () => ({
  ItemTree: (props: unknown) => {
    mocks.itemTreeProps(props);
    return null;
  },
}));
vi.mock("@/components/shell/view-bar", () => ({ ViewBar: () => null }));
vi.mock("@/components/shell/group-control", () => ({ GroupControl: () => null }));
vi.mock("@/components/shell/filter-bar", () => ({
  FilterBar: (props: unknown) => {
    mocks.filterBarProps(props);
    return null;
  },
}));
vi.mock("@/components/shell/view-actions", () => ({ ViewActions: () => null }));
vi.mock("@/components/items/new-item-dialog", () => ({ NewItemButton: () => null }));
vi.mock("@/components/statuses/status-manager-dialog", () => ({
  StatusManagerDialog: () => null,
}));

import { BacklogViewContent } from "@/components/items/backlog-view-content";

describe("BacklogViewContent read boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAppPageSession.mockResolvedValue({ user: { id: "viewer-1" } });
    mocks.notFound.mockImplementation(() => {
      throw new Error("not-found");
    });
    mocks.listItems.mockResolvedValue([]);
    mocks.listItemFixVersionPairs.mockResolvedValue([]);
    mocks.listItemLabelPairs.mockResolvedValue([]);
    mocks.blockedItemIds.mockResolvedValue([]);
    mocks.listUsers.mockResolvedValue([]);
    mocks.listUsersByIds.mockResolvedValue([]);
    mocks.listAssignableUsersForBacklog.mockResolvedValue([]);
    mocks.checkPermission.mockResolvedValue({
      allowed: false,
      permission: "browse_users",
      scope: { type: "global" },
      reasons: [{ type: "no_matching_grant" }],
    });
    mocks.listLabelsForBacklog.mockResolvedValue([]);
    mocks.listSprintsForBacklog.mockResolvedValue({ sprints: [], memberships: [] });
    mocks.listReleaseSummaries.mockResolvedValue([]);
    mocks.getViewByIdForUser.mockResolvedValue(null);
    mocks.select.mockImplementation(() => {
      const query = {
        from: vi.fn(),
        where: vi.fn(),
        orderBy: vi.fn(),
        groupBy: vi.fn(),
        then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
      };
      query.from.mockReturnValue(query);
      query.where.mockReturnValue(query);
      query.orderBy.mockReturnValue(query);
      query.groupBy.mockReturnValue(query);
      return query;
    });
  });

  it("turns an unreadable direct backlog key into not-found without loading capabilities", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue(null);

    await expect(
      BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "SECRET" }),
        searchParamsPromise: Promise.resolve({}),
      }),
    ).rejects.toThrow("not-found");

    expect(mocks.getBacklogByKeyForUser).toHaveBeenCalledWith("SECRET", "viewer-1");
    expect(mocks.getBacklogCapabilities).not.toHaveBeenCalled();
  });

  it.each([
    {
      view: "backlog",
      probe: () => mocks.itemBacklogProps,
      expected: {
        canCreateItems: true,
        canEditItems: false,
        canTransitionItems: true,
        canScheduleItems: false,
        canAssignItems: true,
        canManageSprints: false,
        canBulkChangeItems: true,
      },
    },
    {
      view: "list",
      probe: () => mocks.itemListProps,
      expected: {
        canCreateItems: true,
        canEditItems: false,
        canTransitionItems: true,
        canAssignItems: true,
        canBulkChangeItems: true,
      },
    },
    {
      view: "board",
      probe: () => mocks.itemBoardProps,
      expected: {
        canCreateItems: true,
        canEditItems: false,
        canTransitionItems: true,
        canScheduleItems: false,
      },
    },
    {
      view: "tree",
      probe: () => mocks.itemTreeProps,
      expected: {
        canCreateItems: true,
        canScheduleItems: false,
      },
    },
  ])("passes exact disjoint capabilities to the $view controls", async ({ view, probe, expected }) => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({
      id: "backlog-1",
      key: "DEMO",
      name: "Demo",
      color: "#2563eb",
      archivedAt: null,
    });
    mocks.getBacklogCapabilities.mockResolvedValue({
      createItems: true,
      editItems: false,
      transitionItems: true,
      scheduleItems: false,
      assignItems: true,
      manageSprints: false,
      manageWorkflow: true,
      manageMembers: false,
      bulkChangeItems: true,
    });

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view }),
      }),
    );

    expect(probe()).toHaveBeenCalledWith(expect.objectContaining(expected));
    cleanup();
  });

  it("passes exact detail capabilities without using edit as a substitute", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({
      id: "backlog-1",
      key: "DEMO",
      name: "Demo",
      color: "#2563eb",
      archivedAt: null,
    });
    mocks.getBacklogCapabilities.mockResolvedValue({
      createItems: false,
      editItems: false,
      transitionItems: true,
      scheduleItems: false,
      assignItems: true,
      manageSprints: false,
      manageWorkflow: false,
      manageMembers: false,
      bulkChangeItems: true,
    });

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "list", item: "DEMO-1" }),
      }),
    );

    expect(mocks.itemDetailProps).toHaveBeenCalledWith(
      expect.objectContaining({
        canEditItems: false,
        canTransitionItems: true,
        canAssignItems: true,
      }),
    );
  });

  it("projects safe permission booleans into focused product capability props", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({
      id: "backlog-1",
      key: "DEMO",
      name: "Demo",
      color: "#2563eb",
      archivedAt: null,
    });
    mocks.getBacklogCapabilities.mockResolvedValue({
      createItems: false,
      editItems: false,
      transitionItems: false,
      scheduleItems: true,
      assignItems: false,
      deleteItems: true,
      restoreItems: false,
      addComments: true,
      editOwnComments: true,
      deleteOwnComments: true,
      deleteAllComments: false,
      linkItems: true,
      manageSprints: false,
      manageWorkflow: false,
      manageMembers: false,
      bulkChangeItems: true,
    });

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "backlog", item: "DEMO-1" }),
      }),
    );

    expect(mocks.itemBacklogProps).toHaveBeenCalledWith(expect.objectContaining({
      itemCapabilities: expect.objectContaining({ edit: false, delete: true }),
      planningCapabilities: expect.objectContaining({ rank: true, manageSprints: false }),
      bulkCapabilities: { edit: false, transition: false, assign: false, schedule: true },
    }));
    expect(mocks.itemDetailProps).toHaveBeenCalledWith(expect.objectContaining({
      itemCapabilities: expect.objectContaining({
        edit: false,
        delete: true,
        addComments: true,
        link: true,
      }),
      planningCapabilities: expect.objectContaining({ rank: true }),
    }));
  });

  it("does not materialize the user directory when browse_users is denied", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({
      id: "backlog-1",
      key: "DEMO",
      name: "Demo",
      color: "#2563eb",
      archivedAt: null,
    });
    mocks.getBacklogCapabilities.mockResolvedValue({
      createItems: false,
      editItems: true,
      transitionItems: false,
      scheduleItems: false,
      assignItems: true,
      manageSprints: false,
      manageWorkflow: false,
      manageMembers: false,
      bulkChangeItems: false,
    });
    mocks.listUsersByIds.mockResolvedValue([
      { id: "referenced-1", name: "Referenced User" },
    ]);
    mocks.listUsers.mockResolvedValue([
      { id: "directory-1", name: "Directory User", email: "private@example.test" },
    ]);

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "list", item: "DEMO-1" }),
      }),
    );

    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "viewer-1",
      permission: "browse_users",
      scope: { type: "global" },
    });
    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.listAssignableUsersForBacklog).not.toHaveBeenCalled();
    expect(mocks.filterBarProps).toHaveBeenCalledWith(
      expect.objectContaining({
        users: [{ id: "referenced-1", name: "Referenced User" }],
      }),
    );
    expect(mocks.itemListProps).toHaveBeenCalledWith(
      expect.objectContaining({ users: [] }),
    );
    expect(mocks.itemDetailProps).toHaveBeenCalledWith(
      expect.objectContaining({
        users: [{ id: "referenced-1", name: "Referenced User" }],
        assigneeCandidates: [],
        reporterCandidates: [],
      }),
    );
  });

  it("projects only assignable directory users into assignment pickers", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({
      id: "backlog-1",
      key: "DEMO",
      name: "Demo",
      color: "#2563eb",
      archivedAt: null,
    });
    mocks.getBacklogCapabilities.mockResolvedValue({
      createItems: false,
      editItems: true,
      transitionItems: false,
      scheduleItems: false,
      assignItems: true,
      manageSprints: false,
      manageWorkflow: false,
      manageMembers: false,
      bulkChangeItems: false,
    });
    mocks.listUsersByIds.mockResolvedValue([
      { id: "referenced-1", name: "Referenced User" },
    ]);
    mocks.listUsers.mockResolvedValue([
      { id: "blocked-1", name: "Blocked User", email: "blocked@example.test" },
      { id: "assignable-1", name: "Assignable User", email: "assignable@example.test" },
    ]);
    mocks.listAssignableUsersForBacklog.mockResolvedValue([
      { id: "assignable-1", name: "Assignable User" },
    ]);
    mocks.checkPermission.mockImplementation(async ({ actorId, permission }) => ({
      allowed: permission === "browse_users" || actorId === "assignable-1",
      permission,
      scope: permission === "browse_users"
        ? { type: "global" }
        : { type: "backlog", backlogId: "backlog-1" },
      reasons: [],
    }));

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "list", item: "DEMO-1" }),
      }),
    );

    expect(mocks.itemListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        users: [{ id: "assignable-1", name: "Assignable User" }],
      }),
    );
    expect(mocks.itemDetailProps).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeCandidates: [{ id: "assignable-1", name: "Assignable User" }],
        reporterCandidates: [
          { id: "blocked-1", name: "Blocked User" },
          { id: "assignable-1", name: "Assignable User" },
        ],
      }),
    );
  });

  it("resolves a large assignable directory with one bounded DAL call", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({
      id: "backlog-1",
      key: "DEMO",
      name: "Demo",
      color: "#2563eb",
      archivedAt: null,
    });
    mocks.getBacklogCapabilities.mockResolvedValue({
      createItems: false,
      editItems: true,
      transitionItems: false,
      scheduleItems: false,
      assignItems: true,
      manageSprints: false,
      manageWorkflow: false,
      manageMembers: false,
      bulkChangeItems: false,
    });
    const directoryUsers = Array.from({ length: 128 }, (_, index) => ({
      id: `directory-${index}`,
      name: `Directory User ${index}`,
    }));
    const assignableUsers = [directoryUsers[7]!, directoryUsers[93]!];
    mocks.listUsers.mockResolvedValue(directoryUsers);
    mocks.listAssignableUsersForBacklog.mockResolvedValue(assignableUsers);
    mocks.checkPermission.mockResolvedValue({
      allowed: true,
      permission: "browse_users",
      scope: { type: "global" },
      reasons: [{ type: "user_grant", id: "viewer-1", label: "Viewer" }],
    });

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "list" }),
      }),
    );

    expect(mocks.listAssignableUsersForBacklog).toHaveBeenCalledOnce();
    expect(mocks.listAssignableUsersForBacklog).toHaveBeenCalledWith("backlog-1");
    expect(mocks.checkPermission).toHaveBeenCalledTimes(1);
    expect(mocks.itemListProps).toHaveBeenCalledWith(
      expect.objectContaining({ users: assignableUsers }),
    );
  });

  it("batch-projects fix versions, filters by version, and keeps a selected archived option", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({
      id: "backlog-1",
      key: "DEMO",
      name: "Demo",
      color: "#2563eb",
      archivedAt: null,
    });
    mocks.getBacklogCapabilities.mockResolvedValue({
      createItems: false,
      editItems: false,
      transitionItems: false,
      scheduleItems: false,
      assignItems: false,
      manageSprints: false,
      manageWorkflow: false,
      manageMembers: false,
      bulkChangeItems: false,
    });
    const item = (id: string, key: string, rank: string) => ({
      id,
      backlogId: "backlog-1",
      key,
      sequence: Number(key.split("-")[1]),
      type: "tache",
      kind: "story",
      title: key,
      description: null,
      statusId: "status-1",
      priority: 2,
      estimatePoints: null,
      assigneeId: null,
      reporterId: null,
      parentId: null,
      path: id,
      depth: 0,
      dueDate: null,
      rank,
      deletedAt: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    mocks.listItems.mockResolvedValue([
      item("item-1", "DEMO-1", "a"),
      item("item-2", "DEMO-2", "b"),
    ]);
    mocks.listItemFixVersionPairs.mockResolvedValue([
      { itemId: "item-1", releaseId: "release-active", name: "2026.10" },
      { itemId: "item-2", releaseId: "release-selected", name: "2026.09" },
    ]);
    mocks.listReleaseSummaries.mockResolvedValue([
      { id: "release-active", name: "2026.10", released: false, archived: false },
      { id: "release-published", name: "2026.09.1", released: true, archived: false },
      { id: "release-selected", name: "2026.09", released: true, archived: true },
      { id: "release-hidden", name: "2026.08", released: true, archived: true },
    ]);

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({
          view: "list",
          version: "release-selected",
          fvcol: "1",
          item: "DEMO-2",
        }),
      }),
    );

    expect(mocks.listItemFixVersionPairs).toHaveBeenCalledOnce();
    expect(mocks.listItemFixVersionPairs).toHaveBeenCalledWith("backlog-1");
    expect(mocks.listReleaseSummaries).toHaveBeenCalledOnce();
    expect(mocks.listReleaseSummaries).toHaveBeenCalledWith("backlog-1", {
      includeArchived: true,
    });
    expect(mocks.filterBarProps).toHaveBeenCalledWith(
      expect.objectContaining({
        releases: [
          { id: "release-active", name: "2026.10", released: false, archived: false },
          { id: "release-published", name: "2026.09.1", released: true, archived: false },
          { id: "release-selected", name: "2026.09", released: true, archived: true },
        ],
        state: expect.objectContaining({
          filters: expect.objectContaining({ releaseIds: ["release-selected"] }),
        }),
      }),
    );
    const listProps = mocks.itemListProps.mock.calls[0]?.[0] as {
      groups: Array<{ items: Array<Record<string, unknown>> }>;
      createDialogProps: Record<string, unknown>;
      releaseOptions: unknown[];
      releaseCapabilities: unknown;
      showFixVersions: boolean;
    };
    expect(listProps.groups.flatMap((group) => group.items)).toEqual([
      expect.objectContaining({
        id: "item-2",
        fixVersionIds: ["release-selected"],
        fixVersions: [
          { id: "release-selected", name: "2026.09", released: true, archived: true },
        ],
      }),
    ]);
    const assignableReleases = [
      { id: "release-active", name: "2026.10", released: false, archived: false },
      { id: "release-published", name: "2026.09.1", released: true, archived: false },
    ];
    expect(listProps.createDialogProps).toEqual(expect.objectContaining({
      releaseOptions: assignableReleases,
    }));
    expect(listProps.releaseOptions).toEqual(assignableReleases);
    expect(listProps.showFixVersions).toBe(true);
    expect(listProps.releaseCapabilities).toEqual({
      manage: false,
      assignItems: false,
      bulkAssignItems: false,
    });
    expect(mocks.itemDetailProps).toHaveBeenCalledWith(expect.objectContaining({
      fixVersions: [
        { id: "release-selected", name: "2026.09", released: true, archived: true },
      ],
      releaseOptions: assignableReleases,
      releaseCapabilities: {
        manage: false,
        assignItems: false,
        bulkAssignItems: false,
      },
    }));
  });
});
