import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  filterBarProps: vi.fn(),
  listItemTemplates: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  getBacklogCapabilities: vi.fn(),
  itemBacklogProps: vi.fn(),
  itemBoardProps: vi.fn(),
  itemDetailDrawerProps: vi.fn(),
  loadItemDetailData: vi.fn(),
  itemListProps: vi.fn(),
  listColumnsMenuProps: vi.fn(),
  itemTreeProps: vi.fn(),
  viewActionsProps: vi.fn(),
  listItemFixVersionPairs: vi.fn(),
  listItemLabelPairs: vi.fn(),
  listItemsWithAncestors: vi.fn(),
  listItems: vi.fn(),
  listLiveItemTypes: vi.fn(),
  listBacklogStructure: vi.fn(),
  /** What the Parent picker's search finds (JIR-118). */
  choices: [] as ItemChoice[],
  createItemAction: vi.fn(),
  listLabelsForBacklog: vi.fn(),
  renderRealViews: { current: false },
  listAssignableUsersForBacklog: vi.fn(),
  listSprintsForBacklog: vi.fn(),
  loadBoardSummary: vi.fn(),
  listReleaseSummaries: vi.fn(),
  listUsers: vi.fn(),
  listUsersByIds: vi.fn(),
  blockedItemIds: vi.fn(),
  getViewByIdForUser: vi.fn(),
  getPreviousSprintsVelocityContext: vi.fn(),
  getActiveSprintStartCommitment: vi.fn(),
  notFound: vi.fn(),
  requireAppPageSession: vi.fn(),
  select: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/item-templates", () => ({ listItemTemplates: mocks.listItemTemplates }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  usePathname: () => "/b/DEMO",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
vi.mock("@/lib/services/item-choices", () => ({
  listBacklogStructure: mocks.listBacklogStructure,
  STRUCTURE_ITEM_TYPES: ["composant", "epic"],
}));
vi.mock("@/app/actions/item-choices", () => ({
  searchBacklogItemsAction: vi.fn(async ({ q = "", types }: { q?: string; types?: string[] }) => ({
    ok: true as const,
    items: mocks.choices.filter(
      (item) => (!types || types.includes(item.type)) && item.title.toLowerCase().includes(q.toLowerCase()),
    ),
    limit: 20,
  })),
}));
vi.mock("@/lib/services/items", () => ({
  listItemLabelPairs: mocks.listItemLabelPairs,
  listItemsWithAncestors: mocks.listItemsWithAncestors,
  listItems: mocks.listItems,
  listLiveItemTypes: mocks.listLiveItemTypes,
  listLabelsForBacklog: mocks.listLabelsForBacklog,
  listUsers: mocks.listUsers,
  listUsersByIds: mocks.listUsersByIds,
}));
vi.mock("@/lib/services/links", () => ({
  blockedItemIds: mocks.blockedItemIds,
}));
// The views' rows come from SQL (JIR-143), proven equal to the former
// in-memory computation by lib/services/view-rows.integration.test.ts. Here
// that computation stands in for the database, fed with the mocked reads, so
// these tests keep checking what each view receives.
vi.mock("@/lib/services/view-rows", async () => {
  const legacy = await import("@/test-utils/legacy-view-rows");
  type State = Parameters<typeof legacy.legacyListRows>[0]["state"];
  const last = async (fn: { mock: { results: Array<{ value: unknown }> } }) =>
    (await fn.mock.results.at(-1)?.value) as never;
  async function input(state: State) {
    // The page awaits these rows after its own reads, which all resolve
    // within microtasks: let them settle, then reuse what they returned.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const releaseActive = state.filters.releaseIds.length > 0;
    const releaseCall = mocks.listItems.mock.calls.findIndex(
      ([, options]) => ((options as { releaseIds?: string[] } | undefined)?.releaseIds ?? []).length > 0,
    );
    const releaseRows = releaseActive
      ? ((await mocks.listItems.mock.results[releaseCall]?.value) as Array<{ id: string }>)
      : null;
    const snapshot = (await last(mocks.listSprintsForBacklog)) as Awaited<
      ReturnType<typeof import("@/lib/services/sprints").listSprintsForBacklog>
    >;
    return {
      items: releaseActive ? await last(mocks.listItemsWithAncestors) : await last(mocks.listItems),
      releaseMatchedIds: releaseRows ? new Set(releaseRows.map((row) => row.id)) : null,
      labelPairs: await last(mocks.listItemLabelPairs),
      fixVersionPairs: await last(mocks.listItemFixVersionPairs),
      sprints: snapshot.sprints,
      memberships: snapshot.memberships,
      // The statuses read (db.select) returns no rows in these tests.
      statuses: [],
      state,
    };
  }
  return {
    listViewRows: async (_backlogId: string, state: State) => legacy.legacyListRows(await input(state)),
    // Sprint sections only: the Backlog section comes by windows (JIR-146).
    backlogViewRows: async (_backlogId: string, state: State) => {
      const served = legacy.legacyBacklogRows(await input(state));
      const backlog = served.sections.get("backlog") ?? [];
      const sections = new Map([...served.sections].filter(([section]) => section !== "backlog"));
      return { total: served.total - backlog.reduce((count, group) => count + group.itemIds.length, 0), sections };
    },
    treeViewRows: async (_backlogId: string, filters: State["filters"]) =>
      legacy.legacyTreeRows(await input({ filters, sort: null, group: null })),
    matchingTaskIds: async (_backlogId: string, filters: State["filters"]) =>
      legacy.legacyMatchingTaskIds(await input({ filters, sort: null, group: null })),
    viewRowsInput: input,
  };
});
// The Liste's first window (JIR-145), proven a slice of the same rows by
// lib/services/view-rows.integration.test.ts: here the first rows of the
// legacy computation, shaped from the mocked reads as the service shapes them.
vi.mock("@/lib/services/list-window", async () => {
  const legacy = await import("@/test-utils/legacy-view-rows");
  const viewRows = (await import("@/lib/services/view-rows")) as unknown as {
    viewRowsInput: (state: unknown) => Promise<Parameters<typeof legacy.legacyListRows>[0]>;
  };
  type State = Parameters<typeof legacy.legacyListRows>[0]["state"];
  return {
    loadListWindow: async (_backlogId: string, state: State, options: { limit?: number }) => {
      const data = await viewRows.viewRowsInput(state);
      const served = legacy.legacyListRows(data);
      const limit = options.limit ?? 100;
      const flat = served.groups.flatMap((group) => group.itemIds.map((id) => ({ id, groupKey: group.key })));
      const window = flat.slice(0, limit);
      const itemById = new Map(data.items.map((item) => [item.id, item]));
      const releases = ((await mocks.listReleaseSummaries.mock.results.at(-1)?.value) ?? []) as Array<{
        id: string; name: string; released: boolean; archived: boolean;
      }>;
      const blocked = new Set(((await mocks.blockedItemIds.mock.results.at(-1)?.value) ?? []) as string[]);
      const keys = [...new Set(window.map((row) => row.groupKey))];
      const label = (key: string) => {
        if (!state.group) return "";
        if (key === "none") {
          return state.group === "assignee" ? "Non assigné" : state.group === "component" ? "Sans composant" : "Sans parent";
        }
        return itemById.get(key)?.title ?? key;
      };
      return {
        total: served.total,
        rows: window.flatMap(({ id, groupKey }) => {
          const item = itemById.get(id);
          if (!item) return [];
          const parent = item.parentId ? itemById.get(item.parentId) : undefined;
          return [{
            id: item.id,
            key: item.key,
            type: item.type,
            kind: item.kind,
            title: item.title,
            statusId: item.statusId,
            priority: item.priority,
            estimatePoints: item.estimatePoints,
            depth: item.depth,
            dueDate: item.dueDate,
            assigneeId: item.assigneeId,
            assigneeName: null,
            labels: (data.labelPairs as Array<{ itemId: string; labelId: string; name: string; color: string }>)
              .filter((pair) => pair.itemId === id)
              .map((pair) => ({ id: pair.labelId, name: pair.name, color: pair.color })),
            fixVersions: data.fixVersionPairs
              .filter((pair) => pair.itemId === id)
              .flatMap((pair) => releases.filter((release) => release.id === pair.releaseId))
              .map(({ id: releaseId, name, released, archived }) => ({ id: releaseId, name, released, archived })),
            blocked: blocked.has(id),
            parent: parent ? { key: parent.key, title: parent.title, type: parent.type } : null,
            groupKey,
          }];
        }),
        groups: keys.map((key) => ({
          key,
          label: label(key),
          summary: served.groups.find((group) => group.key === key)!.summary,
        })),
        nextCursor: flat.length > limit ? { group: "", first: ["0"], last: ["0"] } : null,
      };
    },
  };
});
// The Backlog section's first window (JIR-146), proven a slice of the same
// rows by lib/services/view-rows.integration.test.ts: here the legacy
// computation's Backlog section, shaped from the mocked reads.
// The filtered Arbre's first window (JIR-147), proven a slice of the same
// matches by lib/services/tree-window.integration.test.ts: here the first
// matches of the legacy computation with their ancestors, in hierarchy order.
vi.mock("@/lib/services/tree-window", async () => {
  const legacy = await import("@/test-utils/legacy-view-rows");
  const viewRows = (await import("@/lib/services/view-rows")) as unknown as {
    viewRowsInput: (state: unknown) => Promise<Parameters<typeof legacy.legacyTreeRows>[0]>;
  };
  type Filters = Parameters<typeof legacy.legacyTreeRows>[0]["state"]["filters"];
  return {
    loadTreeMatchWindow: async (_backlogId: string, filters: Filters, options: { limit?: number }) => {
      const data = await viewRows.viewRowsInput({ filters, sort: null, group: null });
      const served = legacy.legacyTreeRows(data);
      const limit = options.limit ?? 100;
      const page = new Set(served.matchedIds.slice(0, limit));
      const context = new Set(served.contextIds);
      const itemById = new Map(data.items.map((item) => [item.id, item]));
      const needed = new Set<string>();
      for (const id of page) {
        for (let parentId = itemById.get(id)?.parentId ?? null; parentId; parentId = itemById.get(parentId)?.parentId ?? null) {
          if (context.has(parentId)) needed.add(parentId);
        }
      }
      return {
        total: served.matchedIds.length,
        rows: data.items
          .filter((item) => page.has(item.id) || needed.has(item.id))
          .map((item) => ({
            id: item.id,
            key: item.key,
            type: item.type,
            title: item.title,
            parentId: item.parentId,
            statusId: item.statusId,
            priority: item.priority,
            depth: item.depth,
            rank: item.rank,
            path: item.path,
            labels: [],
            assigneeId: item.assigneeId,
            assigneeName: null,
            matched: page.has(item.id),
          })),
        nextCursor: served.matchedIds.length > limit ? { depth: 0, rank: "0" } : null,
      };
    },
  };
});
vi.mock("@/lib/services/backlog-window", async () => {
  const legacy = await import("@/test-utils/legacy-view-rows");
  const viewRows = (await import("@/lib/services/view-rows")) as unknown as {
    viewRowsInput: (state: unknown) => Promise<Parameters<typeof legacy.legacyBacklogRows>[0]>;
  };
  type State = Parameters<typeof legacy.legacyBacklogRows>[0]["state"];
  return {
    loadBacklogWindow: async (_backlogId: string, state: State, options: { limit?: number }) => {
      const data = await viewRows.viewRowsInput(state);
      const groups = legacy.legacyBacklogRows(data).sections.get("backlog") ?? [];
      const limit = options.limit ?? 100;
      const flat = groups.flatMap((group) => group.itemIds.map((id) => ({ id, groupKey: group.key })));
      const window = flat.slice(0, limit);
      const itemById = new Map(data.items.map((item) => [item.id, item]));
      const blocked = new Set(((await mocks.blockedItemIds.mock.results.at(-1)?.value) ?? []) as string[]);
      const keys = [...new Set(window.map((row) => row.groupKey))];
      return {
        total: flat.length,
        rows: window.flatMap(({ id, groupKey }) => {
          const item = itemById.get(id);
          if (!item) return [];
          const parent = item.parentId ? itemById.get(item.parentId) : undefined;
          return [{
            id: item.id,
            key: item.key,
            title: item.title,
            type: "tache" as const,
            kind: item.kind,
            statusId: item.statusId,
            priority: item.priority,
            estimatePoints: item.estimatePoints,
            assigneeId: item.assigneeId,
            assigneeName: null,
            rank: item.rank,
            blocked: blocked.has(id),
            fixVersions: [],
            parent: parent ? { key: parent.key, title: parent.title, type: parent.type } : null,
            groupKey,
          }];
        }),
        groups: keys.map((key) => ({
          key,
          label: state.group ? (itemById.get(key)?.title ?? key) : "",
          count: groups.find((group) => group.key === key)!.itemIds.length,
        })),
        nextCursor: flat.length > limit ? { group: "", first: ["0"], last: ["0"] } : null,
      };
    },
  };
});
vi.mock("@/lib/services/item-fix-versions", () => ({
  listItemFixVersionPairs: mocks.listItemFixVersionPairs,
}));
vi.mock("@/lib/services/releases", () => ({
  listReleaseSummaries: mocks.listReleaseSummaries,
}));
vi.mock("@/lib/services/sprints", () => ({
  listSprintsForBacklog: mocks.listSprintsForBacklog,
}));
vi.mock("@/lib/services/board-summary", () => ({
  loadBoardSummary: mocks.loadBoardSummary,
}));
vi.mock("@/lib/services/sprint-burndown", () => ({
  getPreviousSprintsVelocityContext: mocks.getPreviousSprintsVelocityContext,
  getActiveSprintStartCommitment: mocks.getActiveSprintStartCommitment,
}));
vi.mock("@/lib/services/views", () => ({
  getViewByIdForUser: mocks.getViewByIdForUser,
}));
vi.mock("@/app/actions/items", () => ({
  moveItemAction: vi.fn(),
  reparentItemAction: vi.fn(),
  rankBacklogItemAction: vi.fn(),
  createItemAction: mocks.createItemAction,
  softDeleteItemAction: vi.fn(),
  bulkUpdateItemsAction: vi.fn(),
  updateItemAction: vi.fn(),
}));

vi.mock("@/app/actions/board", () => ({
  boardSummaryAction: vi.fn(async () => ({ ok: true as const, summary: { activeSprintId: null, metrics: null } })),
}));
vi.mock("@/components/items/item-backlog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/items/item-backlog")>();
  return {
    ItemBacklog: (props: React.ComponentProps<typeof actual.ItemBacklog>) => {
      mocks.itemBacklogProps(props);
      return mocks.renderRealViews.current ? <actual.ItemBacklog {...props} /> : null;
    },
  };
});
vi.mock("@/components/items/item-board", () => ({
  ItemBoard: (props: unknown) => {
    mocks.itemBoardProps(props);
    return null;
  },
}));
vi.mock("@/lib/services/item-detail", () => ({
  loadItemDetailData: mocks.loadItemDetailData,
}));
vi.mock("@/components/items/item-detail-sheet", () => ({
  ItemDetailDrawer: (props: unknown) => {
    mocks.itemDetailDrawerProps(props);
    return null;
  },
}));
// The Liste and Arbre probes can render the real views (JIR-88 regression).
vi.mock("@/components/items/item-list", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/items/item-list")>();
  return {
    ItemList: (props: React.ComponentProps<typeof actual.ItemList>) => {
      mocks.itemListProps(props);
      return mocks.renderRealViews.current ? <actual.ItemList {...props} /> : null;
    },
    ListColumnsMenu: (props: React.ComponentProps<typeof actual.ListColumnsMenu>) => {
      mocks.listColumnsMenuProps(props);
      return null;
    },
  };
});
vi.mock("@/components/items/item-tree", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/items/item-tree")>();
  return {
    ItemTree: (props: React.ComponentProps<typeof actual.ItemTree>) => {
      mocks.itemTreeProps(props);
      return mocks.renderRealViews.current ? <actual.ItemTree {...props} /> : null;
    },
  };
});
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ title, actions }: { title?: React.ReactNode; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));
vi.mock("@/components/shell/display-menu", () => ({ DisplayMenu: () => null }));
vi.mock("@/components/shell/filter-bar", () => ({
  FilterBar: (props: unknown) => {
    mocks.filterBarProps(props);
    return null;
  },
}));
vi.mock("@/components/shell/view-actions", () => ({
  ViewActions: (props: unknown) => {
    mocks.viewActionsProps(props);
    return null;
  },
}));
vi.mock("@/components/items/new-item-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/items/new-item-dialog")>();
  return {
    ...actual,
    NewItemButton: (props: React.ComponentProps<typeof actual.NewItemButton>) =>
      mocks.renderRealViews.current ? <actual.NewItemButton {...props} /> : null,
  };
});
// « + Créer » renders its real dialog in place (no top bar slot here).
vi.mock("@/components/shell/create-item-trigger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/create-item-trigger")>();
  const { NewItemButton } = await import("@/components/items/new-item-dialog");
  return {
    TopbarCreateItem: (props: React.ComponentProps<typeof actual.TopbarCreateItem>) =>
      mocks.renderRealViews.current
        ? <NewItemButton {...props} trigger={<actual.CreateItemTrigger />} />
        : null,
  };
});
vi.mock("@/components/statuses/status-manager-dialog", () => ({
  StatusManagerDialog: () => null,
}));

import { BacklogViewContent } from "@/components/items/backlog-view-content";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
import type { ItemChoice } from "@/components/items/item-picker";

describe("BacklogViewContent read boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listItemTemplates.mockResolvedValue([{ id: "shared-template", name: "Incident" }]);
    mocks.requireAppPageSession.mockResolvedValue({ user: { id: "viewer-1" } });
    mocks.notFound.mockImplementation(() => {
      throw new Error("not-found");
    });
    mocks.renderRealViews.current = false;
    mocks.listItems.mockResolvedValue([]);
    mocks.listLiveItemTypes.mockResolvedValue([]);
    mocks.listBacklogStructure.mockResolvedValue([]);
    mocks.choices = [];
    mocks.listItemsWithAncestors.mockResolvedValue([]);
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
    mocks.loadBoardSummary.mockResolvedValue({ activeSprintId: null, metrics: null });
    mocks.listReleaseSummaries.mockResolvedValue([]);
    mocks.getViewByIdForUser.mockResolvedValue(null);
    mocks.getPreviousSprintsVelocityContext.mockResolvedValue({
      population: 0,
      averageCompletedPoints: null,
    });
    mocks.getActiveSprintStartCommitment.mockResolvedValue(null);
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
    expect(mocks.listItemTemplates).not.toHaveBeenCalled();
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
    expect(mocks.listItemTemplates).toHaveBeenCalledWith("backlog-1");
    expect(probe()).toHaveBeenCalledWith(expect.objectContaining({ createDialogProps: expect.objectContaining({ templates: [{ id: "shared-template", name: "Incident" }] }) }));
    cleanup();
  });

  it("hands the drawer the detail loaded for the requested item", async () => {
    const detailPromise = Promise.resolve(null);
    mocks.loadItemDetailData.mockReturnValue(detailPromise);
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

    // The drawer frame opens with the URL; its detail, loaded on its own,
    // streams in (lib/services/item-detail owns the detail capabilities).
    expect(mocks.loadItemDetailData).toHaveBeenCalledWith({
      userId: "viewer-1",
      backlogKey: "DEMO",
      itemKey: "DEMO-1",
    });
    expect(mocks.itemDetailDrawerProps).toHaveBeenCalledWith({
      backlogKey: "DEMO",
      itemKey: "DEMO-1",
      detail: detailPromise,
      viewFilters: expect.objectContaining({ releaseIds: [] }),
    });
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
      expect.objectContaining({ users: [], canBrowseUsers: false }),
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

  it("delegates OR-version filtering to SQL, ANDs other facets, and keeps a selected archived option", async () => {
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
    const item = (id: string, key: string, rank: string, statusId = "status-1") => ({
      id,
      backlogId: "backlog-1",
      key,
      sequence: Number(key.split("-")[1]),
      type: "tache",
      kind: "story",
      title: key,
      statusId,
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
    const filteredItems = [
      item("item-2", "DEMO-2", "b"),
      item("item-3", "DEMO-3", "c", "status-2"),
    ];
    mocks.listItems.mockResolvedValueOnce(filteredItems);
    mocks.listItemsWithAncestors.mockResolvedValue(filteredItems);
    mocks.listItemFixVersionPairs.mockResolvedValue([
      { itemId: "item-2", releaseId: "release-selected", name: "2026.09" },
      { itemId: "item-3", releaseId: "release-selected", name: "2026.09" },
      { itemId: "item-detail", releaseId: "release-active", name: "2026.10" },
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
          status: "status-1",
          fvcol: "1",
          item: "DEMO-9",
        }),
      }),
    );

    expect(mocks.listItems).toHaveBeenCalledWith("backlog-1", {
      releaseIds: ["release-selected"],
    });
    // The drawer loads its own whole-backlog items (lib/services/item-detail).
    expect(mocks.listItems).toHaveBeenCalledOnce();
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
    expect(mocks.listColumnsMenuProps).toHaveBeenCalledWith({
      showLabels: false,
      showDueDate: false,
      showFixVersions: true,
    });
    expect(listProps.releaseCapabilities).toEqual({
      manage: false,
      assignItems: false,
      bulkAssignItems: false,
    });
  });

  it("keeps unmatched ancestors for hierarchy facets and dimmed tree context", async () => {
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
    const row = (
      id: string,
      key: string,
      type: "epic" | "tache",
      parentId: string | null,
      path: string,
      depth: number,
    ) => ({
      id,
      backlogId: "backlog-1",
      key,
      sequence: Number(key.split("-")[1]),
      type,
      kind: "story",
      title: key,
      statusId: "status-1",
      priority: 2,
      estimatePoints: null,
      assigneeId: null,
      reporterId: null,
      parentId,
      path,
      depth,
      dueDate: null,
      rank: depth === 0 ? "a" : "a0",
      deletedAt: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const parent = row("parent-1", "DEMO-1", "epic", null, "root.parent", 0);
    const child = row("child-1", "DEMO-2", "tache", parent.id, "root.parent.child", 1);
    mocks.listItems.mockResolvedValue([child]);
    mocks.listItemsWithAncestors.mockResolvedValue([parent, child]);
    mocks.listItemFixVersionPairs.mockResolvedValue([
      { itemId: child.id, releaseId: "release-selected", name: "2026.09" },
    ]);
    mocks.listReleaseSummaries.mockResolvedValue([
      { id: "release-selected", name: "2026.09", released: false, archived: false },
    ]);

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({
          view: "list",
          version: "release-selected",
          under: parent.id,
          group: "parent",
        }),
      }),
    );

    expect(mocks.listItemsWithAncestors).toHaveBeenCalledWith("backlog-1", [child.id]);
    expect(mocks.itemListProps).toHaveBeenCalledWith(expect.objectContaining({
      groups: [expect.objectContaining({
        key: parent.id,
        label: parent.title,
        items: [expect.objectContaining({ id: child.id })],
      })],
    }));
    cleanup();

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({
          view: "tree",
          version: "release-selected",
        }),
      }),
    );

    expect(mocks.listItems).toHaveBeenCalledWith("backlog-1", {
      releaseIds: ["release-selected"],
    });
    expect(mocks.listItemsWithAncestors).toHaveBeenCalledWith("backlog-1", [child.id]);
    expect(mocks.itemTreeProps).toHaveBeenCalledWith(expect.objectContaining({
      items: [
        expect.objectContaining({ id: parent.id }),
        expect.objectContaining({ id: child.id }),
      ],
      contextIds: [parent.id],
      window: { total: 1, nextCursor: null },
    }));
  });

  it("sends the unfiltered Arbre its Composants and Epics only, each with its live children counted (JIR-147)", async () => {
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
      manageSprints: false,
      manageWorkflow: false,
      manageMembers: false,
      bulkChangeItems: false,
    });
    const row = (id: string, type: "composant" | "epic" | "tache" | "soustache", parentId: string | null, depth: number) => ({
      id,
      backlogId: "backlog-1",
      key: `DEMO-${id}`,
      sequence: 1,
      type,
      kind: "story",
      title: id,
      statusId: "status-1",
      priority: 2,
      estimatePoints: null,
      assigneeId: null,
      reporterId: null,
      parentId,
      path: `root.${id}`,
      depth,
      dueDate: null,
      rank: `a${id}`,
      deletedAt: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    mocks.listItems.mockResolvedValue([
      row("c1", "composant", null, 0),
      row("e1", "epic", "c1", 1),
      row("e2", "epic", "c1", 1),
      row("t1", "tache", "e1", 2),
      row("t2", "tache", "e1", 2),
      row("s1", "soustache", "t1", 3),
    ]);

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "tree" }),
      }),
    );

    const props = mocks.itemTreeProps.mock.calls.at(-1)![0] as {
      items: Array<{ id: string; childCount?: number }>;
      window: unknown;
      contextIds: string[];
    };
    expect(props.items.map(({ id, childCount }) => ({ id, childCount }))).toEqual([
      { id: "c1", childCount: 2 },
      { id: "e1", childCount: 2 },
      { id: "e2", childCount: 0 },
    ]);
    expect(props.window).toBeNull();
    expect(props.contextIds).toEqual([]);
  });

  describe("Board figures under the Version filter (JIR-119)", () => {
    const S = "22222222-2222-4222-8222-222222222222";
    const task = (id: string, key: string, estimatePoints: number) => ({
      id,
      backlogId: "backlog-1",
      key,
      sequence: Number(key.split("-")[1]),
      type: "tache",
      kind: "story",
      title: key,
      statusId: "status-1",
      priority: 2,
      estimatePoints,
      assigneeId: null,
      reporterId: null,
      parentId: null,
      path: `root.${id}`,
      depth: 0,
      dueDate: null,
      rank: key,
      deletedAt: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const small = task("task-small", "DEMO-1", 3);
    const large = task("task-large", "DEMO-2", 8);
    const membership = (itemId: string) => ({
      id: `${itemId}-${S}`,
      sprintId: S,
      itemId,
      joinedAt: new Date("2026-08-01T00:00:00.000Z"),
      joinedBy: "viewer-1",
      estimateAtJoin: null,
      estimateAtStart: null,
      leftAt: null,
      outcome: null,
      destinationSprintId: null,
    });
    const wholeSprint = {
      itemCount: 2,
      estimatedPoints: 11,
      completedPoints: 0,
      remainingPoints: 11,
      unestimatedCount: 0,
      capacityPoints: null,
      overCapacityPoints: 0,
      velocityComparison: null,
      commitmentBasis: null,
    };

    beforeEach(() => {
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
      // Only the small task belongs to the selected version.
      mocks.listItems.mockImplementation(async (_backlogId: string, options?: { releaseIds?: string[] }) =>
        options?.releaseIds?.length ? [small] : [small, large],
      );
      mocks.listItemsWithAncestors.mockResolvedValue([small]);
      mocks.listReleaseSummaries.mockResolvedValue([
        { id: "release-selected", name: "2026.09", released: false, archived: false },
      ]);
      mocks.listItemFixVersionPairs.mockResolvedValue([
        { itemId: "task-small", releaseId: "release-selected", name: "2026.09" },
      ]);
      mocks.listSprintsForBacklog.mockResolvedValue({
        sprints: [{ id: S, name: "Sprint 2", state: "active", completedAt: null, capacityPoints: null }],
        memberships: [membership("task-small"), membership("task-large")],
      });
      mocks.loadBoardSummary.mockResolvedValue({ activeSprintId: S, metrics: wholeSprint });
    });

    const boardMetrics = () =>
      (mocks.itemBoardProps.mock.calls[0]?.[0] as { activeSprintMetrics: { remainingPoints: number } | null })
        .activeSprintMetrics;

    it("gives the Board the whole sprint's figures under the Version filter, as after an action", async () => {
      render(
        await BacklogViewContent({
          paramsPromise: Promise.resolve({ key: "DEMO" }),
          searchParamsPromise: Promise.resolve({ view: "board", version: "release-selected" }),
        }),
      );

      expect(mocks.loadBoardSummary).toHaveBeenCalledWith("backlog-1");
      // The cards stay the version's; the pills describe the sprint.
      expect(mocks.itemBoardProps).toHaveBeenCalledWith(
        expect.objectContaining({ items: [expect.objectContaining({ id: "task-small" })] }),
      );
      expect(boardMetrics()).toEqual(wholeSprint);
    });

    it("computes the same figures from its own rows without the Version filter", async () => {
      render(
        await BacklogViewContent({
          paramsPromise: Promise.resolve({ key: "DEMO" }),
          searchParamsPromise: Promise.resolve({ view: "board" }),
        }),
      );

      expect(mocks.loadBoardSummary).not.toHaveBeenCalled();
      expect(boardMetrics()).toEqual(expect.objectContaining({ itemCount: 2, remainingPoints: 11 }));
    });

    it("keeps the sections' figures for the other views", async () => {
      render(
        await BacklogViewContent({
          paramsPromise: Promise.resolve({ key: "DEMO" }),
          searchParamsPromise: Promise.resolve({ view: "list", version: "release-selected" }),
        }),
      );

      expect(mocks.loadBoardSummary).not.toHaveBeenCalled();
    });
  });

  it("ignores deleted versions in the Version filter instead of showing an empty list", async () => {
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
    const row = {
      id: "item-1",
      backlogId: "backlog-1",
      key: "DEMO-1",
      sequence: 1,
      type: "tache",
      kind: "feature",
      title: "Toujours visible",
      statusId: "status-1",
      priority: 2,
      estimatePoints: null,
      assigneeId: null,
      reporterId: null,
      parentId: null,
      path: "root.item1",
      depth: 0,
      dueDate: null,
      rank: "a",
      deletedAt: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    mocks.listItems.mockImplementation(async (_backlogId: string, options?: { releaseIds?: string[] }) =>
      options?.releaseIds?.length ? [] : [row],
    );
    mocks.listReleaseSummaries.mockResolvedValue([
      { id: "release-live", name: "2026.10", released: false, archived: false },
    ]);

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "list", version: "release-deleted" }),
      }),
    );

    expect(mocks.listItems).toHaveBeenLastCalledWith("backlog-1");
    expect(mocks.listItemsWithAncestors).not.toHaveBeenCalled();
    expect(mocks.filterBarProps).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          filters: expect.objectContaining({ releaseIds: [] }),
        }),
      }),
    );
    const listProps = mocks.itemListProps.mock.calls[0]?.[0] as {
      groups: Array<{ items: Array<{ id: string }> }>;
    };
    expect(listProps.groups.flatMap((group) => group.items).map((item) => item.id)).toEqual([
      "item-1",
    ]);
    cleanup();
    vi.clearAllMocks();
    mocks.listItems.mockResolvedValue([row]);
    mocks.listItemsWithAncestors.mockResolvedValue([row]);
    mocks.listItemFixVersionPairs.mockResolvedValue([]);
    mocks.listItemLabelPairs.mockResolvedValue([]);
    mocks.blockedItemIds.mockResolvedValue([]);
    mocks.getViewByIdForUser.mockResolvedValue(null);
    mocks.listSprintsForBacklog.mockResolvedValue({ sprints: [], memberships: [] });
    mocks.listLabelsForBacklog.mockResolvedValue([]);

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({
          view: "list",
          version: "release-deleted,release-live",
        }),
      }),
    );
    expect(mocks.filterBarProps).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          filters: expect.objectContaining({ releaseIds: ["release-live"] }),
        }),
      }),
    );
  });

  describe("first steps under a Version filter (JIR-88)", () => {
    function liveRow(id: string, type: "composant" | "epic", parentPath = "root") {
      return {
        id,
        backlogId: "backlog-1",
        key: `DEMO-${id}`,
        sequence: 1,
        type,
        kind: "feature",
        title: id,
        statusId: "status-1",
        priority: 2,
        estimatePoints: null,
        assigneeId: null,
        reporterId: null,
        parentId: null,
        path: `${parentPath}.${id}`,
        depth: 0,
        dueDate: null,
        rank: "a",
        deletedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      };
    }

    beforeEach(() => {
      mocks.getBacklogByKeyForUser.mockResolvedValue({
        id: "backlog-1",
        key: "DEMO",
        name: "Demo",
        color: "#2563eb",
        archivedAt: null,
      });
      mocks.getBacklogCapabilities.mockResolvedValue({
        createItems: true,
        editItems: true,
        transitionItems: true,
        scheduleItems: true,
        assignItems: true,
        manageSprints: false,
        manageWorkflow: false,
        manageMembers: false,
        bulkChangeItems: false,
      });
      // The backlog has its hierarchy; the known version has no item yet.
      const hierarchy = [liveRow("comp", "composant"), liveRow("epic", "epic", "root.comp")];
      mocks.listItems.mockImplementation(async (_backlogId: string, options?: { releaseIds?: string[] }) =>
        options?.releaseIds?.length ? [] : hierarchy,
      );
      mocks.listLiveItemTypes.mockResolvedValue(["composant", "epic"]);
      mocks.listBacklogStructure.mockResolvedValue(
        hierarchy.map(({ id, key, type, title }) => ({ id, key, type, title })),
      );
      // The Parent picker searches the live backlog, whatever the filter (JIR-118).
      mocks.choices = hierarchy.map(({ id, key, type, title }) => ({ id, key, type, title }));
      mocks.listReleaseSummaries.mockResolvedValue([
        { id: "release-empty", name: "2026.11", released: false, archived: false },
      ]);
    });

    it.each(["list", "tree"])(
      "shows « Aucun résultat » in the %s view, not the new-backlog guide",
      async (view) => {
        mocks.renderRealViews.current = true;
        const page = await BacklogViewContent({
          paramsPromise: Promise.resolve({ key: "DEMO" }),
          searchParamsPromise: Promise.resolve({ view, version: "release-empty" }),
        });
        render(
          <ViewUrlStateProvider initialEntries={[["view", view], ["version", "release-empty"]]}>
            {page}
          </ViewUrlStateProvider>,
        );

        expect(mocks.listLiveItemTypes).toHaveBeenCalledWith("backlog-1");
        const probe = view === "list" ? mocks.itemListProps : mocks.itemTreeProps;
        expect(probe).toHaveBeenCalledWith(
          expect.objectContaining({ filtersActive: true, hasItems: true, startStep: null }),
        );
        expect(screen.getByRole("heading", { name: "Aucun résultat" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Effacer les filtres" })).toHaveAttribute(
          "href",
          `/b/DEMO?view=${view}`,
        );
        expect(screen.queryByText(/Commencez par créer un Composant/)).not.toBeInTheDocument();
        expect(screen.queryByRole("note")).not.toBeInTheDocument();
      },
    );

    it("hands the Backlog view the live step, not the filtered candidates'", async () => {
      render(
        await BacklogViewContent({
          paramsPromise: Promise.resolve({ key: "DEMO" }),
          searchParamsPromise: Promise.resolve({ view: "backlog", version: "release-empty" }),
        }),
      );

      expect(mocks.itemBacklogProps).toHaveBeenCalledWith(
        expect.objectContaining({ startStep: null, filtersActive: true }),
      );
    });

    it("offers no dead-end Epic dialog in the Backlog view while the filter hides the Composant", async () => {
      const user = userEvent.setup();
      mocks.renderRealViews.current = true;
      // A Composant and no Epic: the step is « epic », but the filtered
      // candidates hold no parent for it.
      mocks.listItems.mockImplementation(async (_backlogId: string, options?: { releaseIds?: string[] }) =>
        options?.releaseIds?.length ? [] : [liveRow("comp", "composant")],
      );
      mocks.listLiveItemTypes.mockResolvedValue(["composant"]);
      mocks.listBacklogStructure.mockResolvedValue([
        { id: "comp", key: "DEMO-comp", type: "composant", title: "comp" },
      ]);
      const page = await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "backlog", version: "release-empty" }),
      });
      render(
        <ViewUrlStateProvider initialEntries={[["view", "backlog"], ["version", "release-empty"]]}>
          {page}
        </ViewUrlStateProvider>,
      );

      expect(mocks.itemBacklogProps).toHaveBeenCalledWith(
        expect.objectContaining({ startStep: "epic", filtersActive: true }),
      );
      const backlog = screen.getByRole("region", { name: "Backlog" });
      expect(screen.queryByRole("button", { name: /Nouvelle Epic/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Créer un item/ })).not.toBeInTheDocument();
      const clear = within(backlog).getByRole("link", { name: "Effacer les filtres" });
      expect(clear).toHaveAttribute("href", "/b/DEMO?view=backlog");

      // Without the filter, the same step offers a completable Epic dialog.
      cleanup();
      const unfiltered = await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "backlog" }),
      });
      render(
        <ViewUrlStateProvider initialEntries={[["view", "backlog"]]}>{unfiltered}</ViewUrlStateProvider>,
      );
      await user.click(screen.getByRole("button", { name: "Nouvelle Epic (Backlog)" }));
      const dialog = screen.getByRole("dialog", { name: "Nouvel item" });
      expect(within(dialog).getByRole("combobox", { name: /Parent/ })).toHaveValue("DEMO-comp — comp");
      await user.type(within(dialog).getByRole("textbox", { name: /Titre/ }), "Dépôt en ligne");
      expect(within(dialog).getByRole("button", { name: "Créer" })).toBeEnabled();
    });

    it("hands creation the live parents, which the Version filter does not narrow (JIR-92)", async () => {
      render(
        await BacklogViewContent({
          paramsPromise: Promise.resolve({ key: "DEMO" }),
          searchParamsPromise: Promise.resolve({ view: "list", version: "release-empty" }),
        }),
      );

      expect(mocks.listBacklogStructure).toHaveBeenCalledWith("backlog-1");
      const [props] = mocks.itemListProps.mock.calls.at(-1)!;
      expect(props.createDialogProps.structure).toEqual([
        { id: "comp", key: "DEMO-comp", type: "composant", title: "comp" },
        { id: "epic", key: "DEMO-epic", type: "epic", title: "epic" },
      ]);
      expect(props.createDialogProps).not.toHaveProperty("backlogItemTypes");
      // The effective filters, so a create they leave out says so.
      expect(props.createDialogProps.viewFilters).toEqual(
        expect.objectContaining({ releaseIds: ["release-empty"] }),
      );
      // The drawer's child creation gets them too, opened by URL or History API.
      expect(mocks.itemDetailDrawerProps).toHaveBeenCalledWith(
        expect.objectContaining({ viewFilters: props.createDialogProps.viewFilters }),
      );
    });

    it("creates a Tâche inline under the hidden Epic in the Backlog view (JIR-92)", async () => {
      const user = userEvent.setup();
      mocks.renderRealViews.current = true;
      mocks.createItemAction.mockResolvedValue({
        ok: true,
        item: {
          id: "new", key: "DEMO-3", type: "tache", kind: "feature", title: "Relance automatique",
          statusId: "status-1", priority: 0, assigneeId: null, path: "root.comp.epic.new",
        },
      });
      const page = await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "backlog", version: "release-empty" }),
      });
      render(
        <ViewUrlStateProvider initialEntries={[["view", "backlog"], ["version", "release-empty"]]}>
          {page}
        </ViewUrlStateProvider>,
      );

      const backlog = screen.getByRole("region", { name: "Backlog" });
      await user.click(within(backlog).getByRole("button", { name: "Créer un item dans Backlog" }));
      // The only Epic stands in as the parent; no stale « no epic » copy.
      expect(within(backlog).getByRole("combobox", { name: "Epic parent" })).toHaveTextContent(
        "DEMO-epic — epic",
      );
      expect(within(backlog).queryByText(/Aucun epic disponible|Aucune Epic/)).not.toBeInTheDocument();
      await user.type(
        within(backlog).getByRole("textbox", { name: "Titre du nouvel item dans Backlog" }),
        "Relance automatique{Enter}",
      );

      expect(mocks.createItemAction).toHaveBeenCalledWith(
        expect.objectContaining({
          backlogKey: "DEMO",
          type: "tache",
          parentId: "epic",
          title: "Relance automatique",
        }),
      );
      // The field stays open for the next task, with no error.
      await waitFor(() =>
        expect(
          within(backlog).getByRole("textbox", { name: "Titre du nouvel item dans Backlog" }),
        ).toHaveValue(""),
      );
      expect(within(backlog).queryByRole("alert")).not.toBeInTheDocument();
    });

    it("offers the hidden Epic and Composant as parents in « Nouvel item » (JIR-92)", async () => {
      const user = userEvent.setup();
      mocks.renderRealViews.current = true;
      const page = await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "backlog", version: "release-empty" }),
      });
      render(
        <ViewUrlStateProvider initialEntries={[["view", "backlog"], ["version", "release-empty"]]}>
          {page}
        </ViewUrlStateProvider>,
      );

      await user.click(screen.getByRole("button", { name: "Créer" }));
      const dialog = screen.getByRole("dialog", { name: "Nouvel item" });
      await user.click(within(dialog).getByRole("combobox", { name: "Type" }));
      await user.click(screen.getByRole("option", { name: "Tâche" }));
      await user.click(within(dialog).getByRole("combobox", { name: /Parent/ }));
      expect(await screen.findByRole("option", { name: "DEMO-epic — epic" })).toBeVisible();
      await user.keyboard("{Escape}");

      await user.click(within(dialog).getByRole("combobox", { name: "Type" }));
      await user.click(screen.getByRole("option", { name: "Epic" }));
      const parent = within(dialog).getByRole("combobox", { name: /Parent/ });
      // Only the rule (JIR-69), not the « Aucun Composant » hint of a missing parent.
      expect(parent).toHaveAccessibleDescription("Une Epic se rattache toujours à un Composant.");
      await user.click(parent);
      expect(screen.getByRole("option", { name: "DEMO-comp — comp" })).toBeVisible();
      expect(within(dialog).queryByText(/le filtre de la vue peut masquer/)).not.toBeInTheDocument();
    });

    it("keeps « + Créer » on a Board without an active sprint, tagged with the backlog color (JIR-112)", async () => {
      const user = userEvent.setup();
      mocks.renderRealViews.current = true;
      const page = await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "board" }),
      });
      render(
        <ViewUrlStateProvider initialEntries={[["view", "board"]]}>
          {page}
        </ViewUrlStateProvider>,
      );

      await user.click(screen.getByRole("button", { name: "Créer" }));
      // No sprint to add to: Jira creates the item in the backlog.
      const dialog = screen.getByRole("dialog", { name: "Nouvel item" });
      expect(within(dialog).getByText("DEMO")).toHaveStyle({ background: "#2563eb" });
    });

    it("reads the step from the unfiltered rows without a Version filter", async () => {
      mocks.listItems.mockResolvedValue([liveRow("comp", "composant")]);
      render(
        await BacklogViewContent({
          paramsPromise: Promise.resolve({ key: "DEMO" }),
          searchParamsPromise: Promise.resolve({ view: "list" }),
        }),
      );

      expect(mocks.listLiveItemTypes).not.toHaveBeenCalled();
      // Without a row-narrowing filter, creation reuses the loaded rows.
      expect(mocks.listBacklogStructure).not.toHaveBeenCalled();
      expect(mocks.itemListProps).toHaveBeenCalledWith(
        expect.objectContaining({ startStep: "epic", hasItems: true }),
      );
    });
  });

  it("loads recent velocity and the active start commitment once for every sprint section", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({
      id: "backlog-1",
      key: "DEMO",
      name: "Demo",
      color: "#2563eb",
      archivedAt: null,
    });
    mocks.getBacklogCapabilities.mockResolvedValue({
      createItems: true,
      editItems: true,
      transitionItems: true,
      scheduleItems: true,
      assignItems: true,
      manageSprints: true,
      manageWorkflow: false,
      manageMembers: false,
      bulkChangeItems: true,
    });
    const sprintBase = {
      goal: null,
      capacityPoints: null,
      plannedStartAt: null,
      plannedEndAt: null,
      startedAt: null,
      completedAt: null,
    };
    const recentVelocity = { population: 3, averageCompletedPoints: 10 };
    let resolveVelocity: (value: typeof recentVelocity) => void = () => undefined;
    let sprintsRequestedBeforeVelocityResolved = false;
    mocks.getPreviousSprintsVelocityContext.mockReturnValue(
      new Promise((resolve) => {
        resolveVelocity = resolve;
      }),
    );
    const activeSprintCommitment = { sprintId: "sprint-active", commitmentPoints: 4 };
    mocks.getActiveSprintStartCommitment.mockResolvedValue(activeSprintCommitment);
    mocks.listSprintsForBacklog.mockImplementation(async () => {
      sprintsRequestedBeforeVelocityResolved = true;
      return {
        sprints: [
          {
            ...sprintBase,
            id: "sprint-active",
            name: "Sprint actif",
            state: "active",
            rank: "a",
            startedAt: new Date("2026-08-01T09:00:00.000Z"),
          },
          { ...sprintBase, id: "sprint-a", name: "Sprint A", state: "planned", rank: "a0" },
          { ...sprintBase, id: "sprint-b", name: "Sprint B", state: "planned", rank: "a1" },
        ],
        memberships: [],
      };
    });

    const pending = BacklogViewContent({
      paramsPromise: Promise.resolve({ key: "DEMO" }),
      searchParamsPromise: Promise.resolve({ view: "backlog" }),
    });
    await vi.waitFor(() => expect(mocks.getPreviousSprintsVelocityContext).toHaveBeenCalled());
    expect(sprintsRequestedBeforeVelocityResolved).toBe(true);
    resolveVelocity(recentVelocity);
    render(await pending);

    expect(mocks.getPreviousSprintsVelocityContext).toHaveBeenCalledOnce();
    expect(mocks.getPreviousSprintsVelocityContext).toHaveBeenCalledWith("backlog-1");
    expect(mocks.getActiveSprintStartCommitment).toHaveBeenCalledOnce();
    expect(mocks.getActiveSprintStartCommitment).toHaveBeenCalledWith("backlog-1");
    const props = mocks.itemBacklogProps.mock.calls.at(-1)?.[0] as {
      recentVelocity: unknown;
      activeSprintCommitment: unknown;
      sections: Array<{ kind: string; metrics: { velocityComparison: unknown } }>;
    };
    expect(props.recentVelocity).toEqual(recentVelocity);
    expect(props.activeSprintCommitment).toEqual(activeSprintCommitment);
    expect(props.sections.map((section) => [section.kind, section.metrics.velocityComparison]))
      .toEqual([
        [
          "active",
          expect.objectContaining({ state: "ready", commitmentPoints: 4, difference: -6 }),
        ],
        ["planned", expect.objectContaining({ state: "ready", averageCompletedPoints: 10 })],
        ["planned", expect.objectContaining({ state: "ready", averageCompletedPoints: 10 })],
        ["backlog", null],
      ]);
  });

  it("does not read recent velocity outside the Backlog view", async () => {
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

    render(
      await BacklogViewContent({
        paramsPromise: Promise.resolve({ key: "DEMO" }),
        searchParamsPromise: Promise.resolve({ view: "list" }),
      }),
    );

    expect(mocks.getPreviousSprintsVelocityContext).not.toHaveBeenCalled();
    expect(mocks.getActiveSprintStartCommitment).not.toHaveBeenCalled();
  });

  describe("Sprint facet (JIR-81)", () => {
    const S1 = "11111111-1111-4111-8111-111111111111";
    const S2 = "22222222-2222-4222-8222-222222222222";
    const FOREIGN = "33333333-3333-4333-8333-333333333333";
    const ended = new Date("2026-08-14T00:00:00.000Z");
    const row = (id: string, key: string, type: "tache" | "soustache", parentId: string | null) => ({
      id,
      backlogId: "backlog-1",
      key,
      sequence: Number(key.split("-")[1]),
      type,
      kind: "story",
      title: key,
      statusId: "status-1",
      priority: 2,
      estimatePoints: null,
      assigneeId: null,
      reporterId: null,
      parentId,
      path: parentId ? `root.${parentId}.${id}` : `root.${id}`,
      depth: parentId ? 1 : 0,
      dueDate: null,
      rank: "a",
      deletedAt: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const membership = (
      itemId: string,
      sprintId: string,
      leftAt: Date | null,
      outcome: string | null,
    ) => ({
      id: `${itemId}-${sprintId}-${outcome ?? "current"}`,
      sprintId,
      itemId,
      joinedAt: new Date("2026-08-01T00:00:00.000Z"),
      joinedBy: "viewer-1",
      estimateAtJoin: null,
      estimateAtStart: null,
      leftAt,
      outcome,
      destinationSprintId: outcome === "carried_to_sprint" ? S2 : null,
    });

    beforeEach(() => {
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
      mocks.listItems.mockResolvedValue([
        row("done-1", "DEMO-1", "tache", null),
        row("carried-1", "DEMO-2", "tache", null),
        row("removed-1", "DEMO-3", "tache", null),
        row("sub-1", "DEMO-4", "soustache", "carried-1"),
        row("loose-1", "DEMO-5", "tache", null),
      ]);
      mocks.listSprintsForBacklog.mockResolvedValue({
        sprints: [
          { id: S1, name: "Sprint 1", state: "completed", completedAt: ended },
          { id: S2, name: "Sprint 2", state: "active", completedAt: null },
        ],
        memberships: [
          membership("done-1", S1, ended, "completed"),
          membership("carried-1", S1, ended, "carried_to_sprint"),
          membership("carried-1", S2, null, null),
          membership("removed-1", S1, ended, "removed"),
        ],
      });
    });

    const listedIds = () => {
      const props = mocks.itemListProps.mock.calls[0]?.[0] as {
        groups: Array<{ items: Array<{ id: string }> }>;
      };
      return props.groups.flatMap((group) => group.items.map((item) => item.id));
    };

    it("lists a completed sprint's items in Liste, carried-over ones and their sous-tâches included", async () => {
      render(
        await BacklogViewContent({
          paramsPromise: Promise.resolve({ key: "DEMO" }),
          searchParamsPromise: Promise.resolve({ view: "list", sprint: `${S1},${FOREIGN},bogus` }),
        }),
      );

      expect(listedIds()).toEqual(["done-1", "carried-1", "sub-1"]);
      // The flat Liste names each parent in a pill (JIR-93).
      const listed = (mocks.itemListProps.mock.calls[0]?.[0] as {
        groups: Array<{ items: Array<{ id: string; parent?: unknown }> }>;
      }).groups.flatMap((group) => group.items);
      expect(listed.find((item) => item.id === "sub-1")?.parent).toEqual({
        key: "DEMO-2",
        title: "DEMO-2",
        type: "tache",
      });
      expect(listed.find((item) => item.id === "done-1")?.parent).toBeNull();
      expect(mocks.filterBarProps).toHaveBeenCalledWith(expect.objectContaining({
        sprints: [
          { id: S2, name: "Sprint 2", state: "active" },
          { id: S1, name: "Sprint 1", state: "completed" },
        ],
        state: expect.objectContaining({
          filters: expect.objectContaining({ sprintIds: [S1] }),
        }),
      }));
    });

    it("lists items that never belonged to a sprint under « Aucun sprint »", async () => {
      render(
        await BacklogViewContent({
          paramsPromise: Promise.resolve({ key: "DEMO" }),
          searchParamsPromise: Promise.resolve({ view: "list", sprint: "none" }),
        }),
      );

      expect(listedIds()).toEqual(["removed-1", "loose-1"]);
    });

    it("ignores the facet on the Board, which is laid out by sprint, but keeps it for saved views", async () => {
      render(
        await BacklogViewContent({
          paramsPromise: Promise.resolve({ key: "DEMO" }),
          searchParamsPromise: Promise.resolve({ view: "board", sprint: S1 }),
        }),
      );

      expect(mocks.filterBarProps).toHaveBeenCalledWith(expect.objectContaining({
        sprints: undefined,
        state: expect.objectContaining({
          filters: expect.objectContaining({ sprintIds: [] }),
        }),
      }));
      // FilterBar renders ViewActions, mocked away: read the actions prop.
      const barProps = mocks.filterBarProps.mock.calls[0]?.[0] as {
        actions: { props: { filters: { sprintIds: string[] } } };
      };
      expect(barProps.actions.props.filters.sprintIds).toEqual([S1]);
    });
  });

  it("sends only parent types to the hierarchy facet and no documents to the List", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue({
      id: "backlog-1", key: "DEMO", name: "Demo", color: "#2563eb", archivedAt: null,
    });
    mocks.getBacklogCapabilities.mockResolvedValue({
      createItems: false, editItems: false, transitionItems: false, scheduleItems: false,
      assignItems: false, manageSprints: false, manageWorkflow: false,
      manageMembers: false, bulkChangeItems: false,
    });
    mocks.listItems.mockResolvedValue([
      { id: "component", type: "composant", parentId: null, path: "root.component", depth: 0 },
      { id: "epic", type: "epic", parentId: "component", path: "root.component.epic", depth: 1 },
      { id: "task", type: "tache", parentId: "epic", path: "root.component.epic.task", depth: 2 },
      { id: "subtask", type: "soustache", parentId: "task", path: "root.component.epic.task.subtask", depth: 3 },
    ].map((row, index) => ({
      ...row, key: `DEMO-${index + 1}`, kind: "feature", title: row.id,
      backlogId: "backlog-1", statusId: "status-1", priority: 0,
      assigneeId: null, reporterId: "viewer-1", rank: `a${index}`,
      estimatePoints: null, startDate: null, dueDate: null,
      createdAt: new Date(0), updatedAt: new Date(0), closedAt: null, deletedAt: null,
    })));
    render(await BacklogViewContent({
      paramsPromise: Promise.resolve({ key: "DEMO" }),
      searchParamsPromise: Promise.resolve({ view: "list" }),
    }));

    const facet = mocks.filterBarProps.mock.calls[0]![0] as { hierarchy: { id: string }[] };
    expect(facet.hierarchy.map(({ id }) => id)).toEqual(["component", "epic"]);
    const list = mocks.itemListProps.mock.calls[0]![0] as { groups: { items: object[] }[] };
    const rows = list.groups.flatMap((group) => group.items);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).not.toHaveProperty("description");
      expect(row).not.toHaveProperty("search");
    }
  });

});
