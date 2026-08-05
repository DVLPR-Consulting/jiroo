import { describe, expect, it } from "vitest";
import {
  viewStateToColumns,
  columnsToViewState,
  isViewDirty,
  buildViewUrl,
  applySavedViewParams,
  clearActiveBacklogViewParams,
  createViewInput,
  updateViewStateInput,
  renameViewInput,
  setSharedInput,
  canMutateView,
  partitionViews,
  type DisplayMode,
  type ViewRow,
} from "./views";
import type { ViewState } from "./filter";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const empty: ViewState = {
  filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], kind: [], underIds: [] },
  group: null,
  sort: null,
};

const full: ViewState = {
  filters: {
    q: "bug",
    types: ["tache"],
    statusIds: ["s1", "s2"],
    priorities: [0, 2],
    assignees: ["u1", "none"],
    labels: [],
    kind: [], underIds: [],
  },
  group: "priority",
  sort: { field: "dueDate", dir: "asc" },
};

// ---------------------------------------------------------------------------
// viewStateToColumns
// ---------------------------------------------------------------------------

describe("viewStateToColumns", () => {
  it("serializes null sort to the 'manual' sentinel string", () => {
    const cols = viewStateToColumns(empty, "board");
    expect(cols.sort).toBe("manual");
  });

  it("serializes a real sort to a { field, dir } object", () => {
    const cols = viewStateToColumns(full, "list");
    expect(cols.sort).toEqual({ field: "dueDate", dir: "asc" });
  });

  it("serializes group to groupBy; null group → null groupBy", () => {
    expect(viewStateToColumns(empty, "board").groupBy).toBeNull();
    expect(viewStateToColumns(full, "board").groupBy).toBe("priority");
  });

  it("passes filters through verbatim", () => {
    const cols = viewStateToColumns(full, "board");
    expect(cols.filters).toEqual(full.filters);
  });

  it("includes displayMode in the output", () => {
    expect(viewStateToColumns(empty, "tree").displayMode).toBe("tree");
  });

  it("stores backlog as a first-class display mode", () => {
    expect(
      viewStateToColumns(empty, "backlog" as DisplayMode).displayMode,
    ).toBe("backlog");
  });

  it("preserves priority 0 in filters (regression guard)", () => {
    const state: ViewState = {
      filters: { q: "", types: [], statusIds: [], priorities: [0], assignees: [], labels: [], kind: [], underIds: [] },
      group: null,
      sort: null,
    };
    const cols = viewStateToColumns(state, "board");
    expect(cols.filters.priorities).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// columnsToViewState
// ---------------------------------------------------------------------------

describe("columnsToViewState", () => {
  it("restores a full round-trip", () => {
    const cols = viewStateToColumns(full, "list");
    const { state, displayMode } = columnsToViewState(cols);
    expect(state).toEqual(full);
    expect(displayMode).toBe("list");
  });

  it("serializes and reloads a saved view with non-empty hierarchy ids", () => {
    const state: ViewState = {
      ...full,
      filters: { ...full.filters, underIds: ["component-1", "epic-1"] },
    };

    const columns = viewStateToColumns(state, "tree");

    expect(columns.filters.underIds).toEqual(["component-1", "epic-1"]);
    expect(columnsToViewState(columns)).toEqual({ state, displayMode: "tree" });
  });

  it("restores the empty state round-trip", () => {
    const cols = viewStateToColumns(empty, "board");
    const { state, displayMode } = columnsToViewState(cols);
    expect(state).toEqual(empty);
    expect(displayMode).toBe("board");
  });

  it("restores a saved backlog display mode", () => {
    const { displayMode } = columnsToViewState({
      displayMode: "backlog",
      groupBy: null,
      filters: {},
      sort: "manual",
    });

    expect(displayMode).toBe("backlog");
  });

  it("maps the 'manual' sentinel back to sort: null", () => {
    const { state } = columnsToViewState({
      displayMode: "board",
      groupBy: null,
      filters: {},
      sort: "manual",
    });
    expect(state.sort).toBeNull();
  });

  it("maps a junk sort value back to sort: null", () => {
    const { state } = columnsToViewState({
      displayMode: "board",
      groupBy: null,
      filters: {},
      sort: { field: "bogusField", dir: "sideways" },
    });
    expect(state.sort).toBeNull();
  });

  it("maps a well-formed sort object correctly", () => {
    const { state } = columnsToViewState({
      displayMode: "board",
      groupBy: null,
      filters: {},
      sort: { field: "key", dir: "desc" },
    });
    expect(state.sort).toEqual({ field: "key", dir: "desc" });
  });

  it("maps an unknown groupBy to null", () => {
    const { state } = columnsToViewState({
      displayMode: "board",
      groupBy: "notAGroup",
      filters: {},
      sort: "manual",
    });
    expect(state.group).toBeNull();
  });

  it("maps a valid groupBy correctly", () => {
    const { state } = columnsToViewState({
      displayMode: "board",
      groupBy: "assignee",
      filters: {},
      sort: "manual",
    });
    expect(state.group).toBe("assignee");
  });

  it("defaults missing filter fields to empty (defensive parsing)", () => {
    const { state } = columnsToViewState({
      displayMode: "list",
      groupBy: null,
      filters: {},
      sort: "manual",
    });
    expect(state.filters).toEqual({
      q: "",
      types: [],
      statusIds: [],
      priorities: [],
      assignees: [],
      labels: [],
      kind: [], underIds: [],
    });
  });

  it("restores hierarchy filters only when they are string arrays", () => {
    expect(
      columnsToViewState({
        displayMode: "board",
        groupBy: null,
        filters: { underIds: ["component-1", 42] },
        sort: "manual",
      }).state.filters.underIds,
    ).toEqual(["component-1"]);
    expect(
      columnsToViewState({
        displayMode: "board",
        groupBy: null,
        filters: { underIds: "component-1" },
        sort: "manual",
      }).state.filters.underIds,
    ).toEqual([]);
  });

  it("drops invalid types and priorities defensively", () => {
    const { state } = columnsToViewState({
      displayMode: "board",
      groupBy: null,
      filters: {
        q: "test",
        types: ["tache", "bogusType"],
        statusIds: ["s1"],
        priorities: [2, 99],
        assignees: ["u1"],
      },
      sort: "manual",
    });
    expect(state.filters.types).toEqual(["tache"]);
    expect(state.filters.priorities).toEqual([2]);
  });

  it("preserves priority 0 in round-trip (regression guard)", () => {
    const cols = viewStateToColumns(
      {
        filters: { q: "", types: [], statusIds: [], priorities: [0], assignees: [], labels: [], kind: [], underIds: [] },
        group: null,
        sort: null,
      },
      "board",
    );
    const { state } = columnsToViewState(cols);
    expect(state.filters.priorities).toEqual([0]);
  });

  it("handles a completely null/undefined sort (not 'manual' string)", () => {
    const { state } = columnsToViewState({
      displayMode: "board",
      groupBy: null,
      filters: {},
      sort: null,
    });
    expect(state.sort).toBeNull();
  });

  it("handles unknown displayMode by defaulting to 'board'", () => {
    const { displayMode } = columnsToViewState({
      displayMode: "unknown_mode" as DisplayMode,
      groupBy: null,
      filters: {},
      sort: "manual",
    });
    expect(displayMode).toBe("board");
  });
});

// ---------------------------------------------------------------------------
// isViewDirty
// ---------------------------------------------------------------------------

describe("isViewDirty", () => {
  const saved = { state: full, displayMode: "list" as DisplayMode };

  it("returns false when states are identical", () => {
    expect(isViewDirty(saved, { state: full, displayMode: "list" })).toBe(false);
  });

  it("returns true when displayMode differs", () => {
    expect(isViewDirty(saved, { state: full, displayMode: "board" })).toBe(true);
  });

  it("returns true when sort field differs", () => {
    const current: ViewState = { ...full, sort: { field: "key", dir: "asc" } };
    expect(isViewDirty(saved, { state: current, displayMode: "list" })).toBe(true);
  });

  it("returns true when sort dir differs", () => {
    const current: ViewState = { ...full, sort: { field: "dueDate", dir: "desc" } };
    expect(isViewDirty(saved, { state: current, displayMode: "list" })).toBe(true);
  });

  it("returns true when sort nullity differs", () => {
    const noSort: ViewState = { ...full, sort: null };
    expect(isViewDirty(saved, { state: noSort, displayMode: "list" })).toBe(true);
  });

  it("returns true when group differs", () => {
    const current: ViewState = { ...full, group: "status" };
    expect(isViewDirty(saved, { state: current, displayMode: "list" })).toBe(true);
  });

  it("returns true when q differs", () => {
    const current: ViewState = {
      ...full,
      filters: { ...full.filters, q: "other" },
    };
    expect(isViewDirty(saved, { state: current, displayMode: "list" })).toBe(true);
  });

  it("is order-insensitive for types", () => {
    const current: ViewState = {
      ...full,
      filters: { ...full.filters, types: ["tache"] }, // same as full.filters.types (1 item, no reorder)
    };
    expect(isViewDirty(saved, { state: current, displayMode: "list" })).toBe(false);
  });

  it("is order-insensitive for statusIds", () => {
    const current: ViewState = {
      ...full,
      filters: { ...full.filters, statusIds: ["s2", "s1"] }, // reversed
    };
    expect(isViewDirty(saved, { state: current, displayMode: "list" })).toBe(false);
  });

  it("is order-insensitive for priorities", () => {
    const current: ViewState = {
      ...full,
      filters: { ...full.filters, priorities: [2, 0] }, // reversed
    };
    expect(isViewDirty(saved, { state: current, displayMode: "list" })).toBe(false);
  });

  it("is order-insensitive for assignees", () => {
    const current: ViewState = {
      ...full,
      filters: { ...full.filters, assignees: ["none", "u1"] }, // reversed
    };
    expect(isViewDirty(saved, { state: current, displayMode: "list" })).toBe(false);
  });

  it("detects a length difference in statusIds", () => {
    const current: ViewState = {
      ...full,
      filters: { ...full.filters, statusIds: ["s1"] },
    };
    expect(isViewDirty(saved, { state: current, displayMode: "list" })).toBe(true);
  });

  it("detects a hierarchy filter change", () => {
    const current: ViewState = {
      ...full,
      filters: { ...full.filters, underIds: ["epic-1"] },
    };
    expect(isViewDirty(saved, { state: current, displayMode: "list" })).toBe(true);
  });

  it("preserves priority 0 comparison correctly (regression guard)", () => {
    const withZero: ViewState = {
      filters: { q: "", types: [], statusIds: [], priorities: [0], assignees: [], labels: [], kind: [], underIds: [] },
      group: null,
      sort: null,
    };
    const saved0 = { state: withZero, displayMode: "board" as DisplayMode };
    // same → not dirty
    expect(isViewDirty(saved0, { state: withZero, displayMode: "board" })).toBe(false);
    // different priorities → dirty
    const noPrio: ViewState = {
      ...withZero,
      filters: { ...withZero.filters, priorities: [] },
    };
    expect(isViewDirty(saved0, { state: noPrio, displayMode: "board" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildViewUrl
// ---------------------------------------------------------------------------

describe("buildViewUrl", () => {
  const view = {
    id: "view-abc",
    state: full,
    displayMode: "list" as DisplayMode,
  };

  it("returns a path with query string", () => {
    const url = buildViewUrl(view, "/backlogs/b1");
    expect(url).toMatch(/^\/backlogs\/b1\?/);
  });

  it("includes v=<id> and view=<displayMode>", () => {
    const url = buildViewUrl(view, "/backlogs/b1");
    const sp = new URLSearchParams(url.split("?")[1]);
    expect(sp.get("v")).toBe("view-abc");
    expect(sp.get("view")).toBe("list");
  });

  it("encodes sort into the query string", () => {
    const url = buildViewUrl(view, "/backlogs/b1");
    const sp = new URLSearchParams(url.split("?")[1]);
    expect(sp.get("sort")).toBe("dueDate:asc");
  });

  it("encodes group into the query string", () => {
    const url = buildViewUrl(view, "/backlogs/b1");
    const sp = new URLSearchParams(url.split("?")[1]);
    expect(sp.get("group")).toBe("priority");
  });

  it("encodes q into the query string", () => {
    const url = buildViewUrl(view, "/backlogs/b1");
    const sp = new URLSearchParams(url.split("?")[1]);
    expect(sp.get("q")).toBe("bug");
  });

  it("produces no query string noise for an empty state", () => {
    const emptyView = { id: "v1", state: empty, displayMode: "board" as DisplayMode };
    const url = buildViewUrl(emptyView, "/backlogs/b1");
    const sp = new URLSearchParams(url.split("?")[1]);
    // filter/group/sort params should be absent; only v and view present
    expect(sp.get("v")).toBe("v1");
    expect(sp.get("view")).toBe("board");
    expect(sp.get("q")).toBeNull();
    expect(sp.get("sort")).toBeNull();
    expect(sp.get("group")).toBeNull();
  });

  it("preserves priority 0 in the URL (regression guard)", () => {
    const prioView = {
      id: "v2",
      state: {
        filters: { q: "", types: [], statusIds: [], priorities: [0], assignees: [], labels: [], kind: [], underIds: [] },
        group: null,
        sort: null,
      } satisfies ViewState,
      displayMode: "board" as DisplayMode,
    };
    const url = buildViewUrl(prioView, "/backlogs/b1");
    const sp = new URLSearchParams(url.split("?")[1]);
    expect(sp.get("prio")).toBe("0");
  });

  it("is deterministic across multiple calls", () => {
    const url1 = buildViewUrl(view, "/backlogs/b1");
    const url2 = buildViewUrl(view, "/backlogs/b1");
    expect(url1).toBe(url2);
  });
});

describe("saved-view URL mutations", () => {
  const staleParams = () =>
    new URLSearchParams(
      "q=old&type=epic&status=old&prio=4&assignee=old&label=old" +
        "&kind=bug&under=old&group=status&sort=title%3Adesc" +
        "&view=tree&v=view-old&item=DEMO-1&tag=a&tag=b",
    );

  it("replaces every known saved-view key and closes the selected item", () => {
    const params = staleParams();

    applySavedViewParams(params, {
      id: "view-abc",
      state: full,
      displayMode: "list",
    });

    expect(params.toString()).toBe(
      "tag=a&tag=b&q=bug&type=tache&status=s1%2Cs2&prio=0%2C2" +
        "&assignee=u1%2Cnone&group=priority&sort=dueDate%3Aasc" +
        "&view=list&v=view-abc",
    );
    expect(params.has("item")).toBe(false);
    expect(params.getAll("tag")).toEqual(["a", "b"]);
  });

  it("clears all active-backlog view state without dropping unrelated repeats", () => {
    const params = staleParams();

    clearActiveBacklogViewParams(params);

    expect(params.toString()).toBe("tag=a&tag=b");
    expect(params.getAll("tag")).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

describe("createViewInput", () => {
  it("accepts a valid input", () => {
    const result = createViewInput.safeParse({
      name: "My view",
      backlogId: "5764b39c-d013-4db6-ba82-48183cb28954",
      displayMode: "board",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], kind: [], underIds: [] },
      group: null,
      sort: null,
      shared: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = createViewInput.safeParse({
      name: "",
      displayMode: "board",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], kind: [], underIds: [] },
      group: null,
      sort: null,
      shared: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 80 chars", () => {
    const result = createViewInput.safeParse({
      name: "a".repeat(81),
      displayMode: "board",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], kind: [], underIds: [] },
      group: null,
      sort: null,
      shared: false,
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from the name", () => {
    const result = createViewInput.safeParse({
      name: "  My view  ",
      backlogId: "5764b39c-d013-4db6-ba82-48183cb28954",
      displayMode: "board",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], kind: [], underIds: [] },
      group: null,
      sort: null,
      shared: false,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("My view");
  });

  it("rejects an invalid displayMode", () => {
    const result = createViewInput.safeParse({
      name: "ok",
      displayMode: "kanban",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], kind: [], underIds: [] },
      group: null,
      sort: null,
      shared: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid displayMode values", () => {
    for (const mode of ["backlog", "board", "list", "tree"]) {
      const result = createViewInput.safeParse({
        name: "ok",
        backlogId: "5764b39c-d013-4db6-ba82-48183cb28954",
        displayMode: mode,
        filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], kind: [], underIds: [] },
        group: null,
        sort: null,
        shared: false,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts a valid sort object", () => {
    const result = createViewInput.safeParse({
      name: "ok",
      backlogId: "5764b39c-d013-4db6-ba82-48183cb28954",
      displayMode: "list",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], kind: [], underIds: [] },
      group: "priority",
      sort: { field: "key", dir: "asc" },
      shared: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing backlogId", () => {
    const result = createViewInput.safeParse({
      name: "ok",
      displayMode: "board",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], kind: [], underIds: [] },
      group: null,
      sort: null,
      shared: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID backlogId", () => {
    const result = createViewInput.safeParse({
      name: "ok",
      backlogId: "not-a-uuid",
      displayMode: "board",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], kind: [], underIds: [] },
      group: null,
      sort: null,
      shared: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateViewStateInput", () => {
  const validState = {
    displayMode: "list",
    filters: { q: "bug", types: ["tache"], statusIds: ["s1"], priorities: [2], assignees: ["u1"], labels: [], kind: [], underIds: [] },
    group: "priority",
    sort: { field: "key", dir: "asc" },
  };

  it("accepts a state-only payload", () => {
    const result = updateViewStateInput.safeParse(validState);
    expect(result.success).toBe(true);
  });

  it("accepts backlog as the saved state display mode", () => {
    expect(
      updateViewStateInput.safeParse({
        ...validState,
        displayMode: "backlog",
      }).success,
    ).toBe(true);
  });

  it("strips a stray name field instead of carrying it through", () => {
    const result = updateViewStateInput.safeParse({ ...validState, name: "Renamed" });
    expect(result.success).toBe(true);
    // Zod object strips unknown keys by default → no `name` leaks into the parsed data.
    if (result.success) expect(result.data).not.toHaveProperty("name");
  });

  it("strips stray shared and backlogId fields", () => {
    const result = updateViewStateInput.safeParse({
      ...validState,
      shared: true,
      backlogId: "5764b39c-d013-4db6-ba82-48183cb28954",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("shared");
      expect(result.data).not.toHaveProperty("backlogId");
    }
  });

  it("rejects a missing displayMode", () => {
    const { displayMode: _omit, ...rest } = validState;
    void _omit;
    expect(updateViewStateInput.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid displayMode", () => {
    expect(updateViewStateInput.safeParse({ ...validState, displayMode: "kanban" }).success).toBe(false);
  });
});

describe("renameViewInput", () => {
  it("accepts a valid name", () => {
    expect(renameViewInput.safeParse({ name: "New name" }).success).toBe(true);
  });

  it("trims the name", () => {
    const result = renameViewInput.safeParse({ name: "  Trimmed  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Trimmed");
  });

  it("rejects an empty name after trimming", () => {
    expect(renameViewInput.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 80 chars", () => {
    expect(renameViewInput.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("setSharedInput", () => {
  it("accepts true and false", () => {
    expect(setSharedInput.safeParse({ shared: true }).success).toBe(true);
    expect(setSharedInput.safeParse({ shared: false }).success).toBe(true);
  });

  it("rejects non-boolean", () => {
    expect(setSharedInput.safeParse({ shared: "yes" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canMutateView
// ---------------------------------------------------------------------------

describe("canMutateView", () => {
  it("returns true when the actor is the owner", () => {
    expect(canMutateView({ ownerId: "u1" }, "u1")).toBe(true);
  });

  it("returns false when the actor is not the owner", () => {
    expect(canMutateView({ ownerId: "u1" }, "u2")).toBe(false);
  });

  it("returns false for an empty string userId", () => {
    expect(canMutateView({ ownerId: "u1" }, "")).toBe(false);
  });

  it("returns false when ownerId differs by case", () => {
    expect(canMutateView({ ownerId: "U1" }, "u1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// partitionViews
// ---------------------------------------------------------------------------

/** Minimal factory for test rows. */
function makeRow(
  id: string,
  ownerId: string,
  shared: boolean,
  name = "View",
): ViewRow {
  return { id, ownerId, shared, name };
}

describe("partitionViews", () => {
  it("returns empty buckets for empty input", () => {
    const { personal, shared } = partitionViews([], "u1");
    expect(personal).toEqual([]);
    expect(shared).toEqual([]);
  });

  it("puts the owner's own personal view into personal", () => {
    const row = makeRow("v1", "u1", false);
    const { personal, shared } = partitionViews([row], "u1");
    expect(personal).toEqual([row]);
    expect(shared).toEqual([]);
  });

  it("puts the owner's own shared view into personal (not shared)", () => {
    const row = makeRow("v1", "u1", true);
    const { personal, shared } = partitionViews([row], "u1");
    expect(personal).toEqual([row]);
    expect(shared).toEqual([]);
  });

  it("puts another user's shared view into shared", () => {
    const row = makeRow("v1", "u2", true);
    const { personal, shared } = partitionViews([row], "u1");
    expect(personal).toEqual([]);
    expect(shared).toEqual([row]);
  });

  it("excludes another user's non-shared (personal) view entirely", () => {
    const row = makeRow("v1", "u2", false);
    const { personal, shared } = partitionViews([row], "u1");
    expect(personal).toEqual([]);
    expect(shared).toEqual([]);
  });

  it("partitions a mixed set correctly", () => {
    const ownPrivate   = makeRow("v1", "u1", false, "Own private");
    const ownShared    = makeRow("v2", "u1", true,  "Own shared");
    const othersShared = makeRow("v3", "u2", true,  "Others shared");
    const othersPriv   = makeRow("v4", "u2", false, "Others private");

    const { personal, shared } = partitionViews(
      [ownPrivate, ownShared, othersShared, othersPriv],
      "u1",
    );

    expect(personal).toEqual([ownPrivate, ownShared]);
    expect(shared).toEqual([othersShared]);
    // othersPriv is excluded from both buckets
    expect(personal).not.toContainEqual(othersPriv);
    expect(shared).not.toContainEqual(othersPriv);
  });

  it("preserves input order within each bucket", () => {
    const a = makeRow("v1", "u1", false, "A");
    const b = makeRow("v2", "u1", true,  "B");
    const c = makeRow("v3", "u1", false, "C");
    const d = makeRow("v4", "u2", true,  "D");
    const e = makeRow("v5", "u2", true,  "E");

    const { personal, shared } = partitionViews([a, b, c, d, e], "u1");

    expect(personal.map((r) => r.id)).toEqual(["v1", "v2", "v3"]);
    expect(shared.map((r) => r.id)).toEqual(["v4", "v5"]);
  });

  it("handles all-mine rows with none shared by others", () => {
    const rows = [makeRow("v1", "u1", false), makeRow("v2", "u1", true)];
    const { personal, shared } = partitionViews(rows, "u1");
    expect(personal.length).toBe(2);
    expect(shared.length).toBe(0);
  });

  it("handles all-others-shared rows with none own", () => {
    const rows = [makeRow("v1", "u2", true), makeRow("v2", "u3", true)];
    const { personal, shared } = partitionViews(rows, "u1");
    expect(personal.length).toBe(0);
    expect(shared.length).toBe(2);
  });
});
