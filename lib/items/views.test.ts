import { describe, expect, it } from "vitest";
import {
  viewStateToColumns,
  columnsToViewState,
  isViewDirty,
  buildViewUrl,
  createViewInput,
  renameViewInput,
  setSharedInput,
  type DisplayMode,
} from "./views";
import type { ViewState } from "./filter";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const empty: ViewState = {
  filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [] },
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

  it("preserves priority 0 in filters (regression guard)", () => {
    const state: ViewState = {
      filters: { q: "", types: [], statusIds: [], priorities: [0], assignees: [] },
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

  it("restores the empty state round-trip", () => {
    const cols = viewStateToColumns(empty, "board");
    const { state, displayMode } = columnsToViewState(cols);
    expect(state).toEqual(empty);
    expect(displayMode).toBe("board");
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
    });
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
        filters: { q: "", types: [], statusIds: [], priorities: [0], assignees: [] },
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

  it("preserves priority 0 comparison correctly (regression guard)", () => {
    const withZero: ViewState = {
      filters: { q: "", types: [], statusIds: [], priorities: [0], assignees: [] },
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
        filters: { q: "", types: [], statusIds: [], priorities: [0], assignees: [] },
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

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

describe("createViewInput", () => {
  it("accepts a valid input", () => {
    const result = createViewInput.safeParse({
      name: "My view",
      displayMode: "board",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [] },
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
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [] },
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
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [] },
      group: null,
      sort: null,
      shared: false,
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from the name", () => {
    const result = createViewInput.safeParse({
      name: "  My view  ",
      displayMode: "board",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [] },
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
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [] },
      group: null,
      sort: null,
      shared: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid displayMode values", () => {
    for (const mode of ["board", "list", "tree"]) {
      const result = createViewInput.safeParse({
        name: "ok",
        displayMode: mode,
        filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [] },
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
      displayMode: "list",
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [] },
      group: "priority",
      sort: { field: "key", dir: "asc" },
      shared: true,
    });
    expect(result.success).toBe(true);
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
