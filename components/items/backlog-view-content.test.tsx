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
  listItemLabelPairs: vi.fn(),
  listItems: vi.fn(),
  listLabelsForBacklog: vi.fn(),
  listSprintsForBacklog: vi.fn(),
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
    mocks.listItemLabelPairs.mockResolvedValue([]);
    mocks.blockedItemIds.mockResolvedValue([]);
    mocks.listUsers.mockResolvedValue([]);
    mocks.listUsersByIds.mockResolvedValue([]);
    mocks.checkPermission.mockResolvedValue({
      allowed: false,
      permission: "browse_users",
      scope: { type: "global" },
      reasons: [{ type: "no_matching_grant" }],
    });
    mocks.listLabelsForBacklog.mockResolvedValue([]);
    mocks.listSprintsForBacklog.mockResolvedValue({ sprints: [], memberships: [] });
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
});
