import { cleanup, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: mocks.getBacklogByKeyForUser,
}));
vi.mock("@/lib/services/items", () => ({
  listItemLabelPairs: mocks.listItemLabelPairs,
  listItems: mocks.listItems,
  listLabelsForBacklog: mocks.listLabelsForBacklog,
  listUsers: mocks.listUsers,
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
vi.mock("@/components/shell/filter-bar", () => ({ FilterBar: () => null }));
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
});
