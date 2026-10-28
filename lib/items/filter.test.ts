import { describe, expect, it } from "vitest";
import * as filterCore from "./filter";
import {
  parseViewState,
  writeViewState,
  isFiltersActive,
  matchItem,
  withAncestors,
  groupItems,
  sortItems,
  enrichHierarchy,
  withKnownReleaseIds,
  isHiddenByFilters,
  type ViewState,
  type Filters,
  type SortField,
  type SortDir,
  type FilterItem,
  type HierarchyItem,
} from "./filter";

const empty: ViewState = {
  filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], releaseIds: [], sprintIds: [], kind: [], underIds: [] },
  group: null,
  sort: null,
};

describe("parseViewState", () => {
  it("returns an empty state for empty params", () => {
    expect(parseViewState(new URLSearchParams())).toEqual(empty);
  });

  it("round-trips the optional Fix versions list column", () => {
    const state = parseViewState(new URLSearchParams("fvcol=1"));
    expect(state.filters.showFixVersions).toBe(true);
    const params = new URLSearchParams();
    writeViewState(params, state);
    expect(params.get("fvcol")).toBe("1");
  });

  it("round-trips the optional Labels and Échéance list columns", () => {
    const state = parseViewState(new URLSearchParams("lblcol=1&duecol=1"));
    expect(state.filters).toMatchObject({ showLabels: true, showDueDate: true });
    const params = new URLSearchParams("lblcol=1&duecol=1");
    writeViewState(params, { ...state, filters: { ...state.filters, showDueDate: false } });
    expect(params.get("lblcol")).toBe("1");
    expect(params.has("duecol")).toBe(false);
  });

  it("parses every dimension", () => {
    const sp = new URLSearchParams(
      "q=qr&type=tache,soustache&status=s1,s2&prio=3,4&assignee=none,u1&group=assignee&sort=priority:desc",
    );
    expect(parseViewState(sp)).toEqual({
      filters: {
        q: "qr",
        types: ["tache", "soustache"],
        statusIds: ["s1", "s2"],
        priorities: [3, 4],
        assignees: ["none", "u1"],
        labels: [],
        releaseIds: [], sprintIds: [],
        kind: [], underIds: [],
      },
      group: "assignee",
      sort: { field: "priority", dir: "desc" },
    });
  });

  it("drops invalid values instead of throwing", () => {
    const sp = new URLSearchParams("type=tache,bogus&prio=9,2&group=nope&sort=title:sideways");
    const s = parseViewState(sp);
    expect(s.filters.types).toEqual(["tache"]);
    expect(s.filters.priorities).toEqual([2]);
    expect(s.group).toBeNull();
    expect(s.sort).toBeNull();
  });

  it("dedups repeated CSV values", () => {
    expect(parseViewState(new URLSearchParams("type=tache,tache")).filters.types).toEqual(["tache"]);
  });

  it("parses kind param correctly", () => {
    const sp = new URLSearchParams("kind=bug");
    expect(parseViewState(sp).filters.kind).toEqual(["bug"]);
  });

  it("parses hierarchy, component grouping, and title sorting", () => {
    const state = parseViewState(
      new URLSearchParams("under=epic-1,component-1&group=component&sort=title:asc"),
    );

    expect(state.filters.underIds).toEqual(["epic-1", "component-1"]);
    expect(state.group).toBe("component");
    expect(state.sort).toEqual({ field: "title", dir: "asc" });
  });

  it("retains parent grouping when decoding a legacy saved URL", () => {
    expect(parseViewState(new URLSearchParams("group=parent")).group).toBe("parent");
  });

  it("filters out invalid kind values on parse", () => {
    const sp = new URLSearchParams("kind=bug,invalid,feature");
    expect(parseViewState(sp).filters.kind).toEqual(["bug", "feature"]);
  });

  it("returns empty kind array when param is absent", () => {
    expect(parseViewState(new URLSearchParams()).filters.kind).toEqual([]);
  });

  it("parses sprint ids and « Aucun sprint » from the sprint param", () => {
    expect(
      parseViewState(new URLSearchParams("sprint=s2,none,s2")).filters.sprintIds,
    ).toEqual(["s2", "none"]);
  });

  it("round-trips the sprint filter and drops the param once cleared", () => {
    const params = new URLSearchParams();
    writeViewState(params, { ...empty, filters: { ...empty.filters, sprintIds: ["s1", "none"] } });
    expect(params.get("sprint")).toBe("s1,none");
    writeViewState(params, empty);
    expect(params.has("sprint")).toBe(false);
  });

  it("parses version ids in URL order and deduplicates them", () => {
    expect(
      parseViewState(new URLSearchParams("version=v2,v1,v2")).filters.releaseIds,
    ).toEqual(["v2", "v1"]);
  });
});

describe("writeViewState ⇄ parseViewState round-trip", () => {
  it("round-trips a full state", () => {
    const state: ViewState = {
      filters: { q: "abc", types: ["epic"], statusIds: ["s1"], priorities: [0], assignees: ["none"], labels: [], releaseIds: [], sprintIds: [], kind: [], underIds: [] },
      group: "priority",
      sort: { field: "key", dir: "asc" },
    };
    const sp = new URLSearchParams("view=list&item=CASS-1");
    writeViewState(sp, state);
    expect(parseViewState(sp)).toEqual(state);
    // preserves unrelated params
    expect(sp.get("view")).toBe("list");
    expect(sp.get("item")).toBe("CASS-1");
  });

  it("removes keys when a dimension is cleared", () => {
    const sp = new URLSearchParams("type=tache&group=status&q=x");
    writeViewState(sp, empty);
    expect(sp.toString()).toBe("");
  });

  it("round-trips label ids", () => {
    const state: ViewState = {
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: ["id1", "id2"], releaseIds: [], sprintIds: [], kind: [], underIds: [] },
      group: null,
      sort: null,
    };
    const sp = new URLSearchParams();
    writeViewState(sp, state);
    expect(sp.get("label")).toBe("id1,id2");
    expect(parseViewState(sp)).toEqual(state);
  });

  it("omits the label param when labels is empty", () => {
    const sp = new URLSearchParams("label=id1");
    writeViewState(sp, empty);
    expect(sp.get("label")).toBeNull();
  });

  it("round-trips kind param", () => {
    const state: ViewState = {
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], releaseIds: [], sprintIds: [], kind: ["bug"], underIds: [] },
      group: null,
      sort: null,
    };
    const sp = new URLSearchParams();
    writeViewState(sp, state);
    expect(sp.get("kind")).toBe("bug");
    expect(parseViewState(sp)).toEqual(state);
  });

  it("round-trips non-empty hierarchy ids through the under URL parameter", () => {
    const state: ViewState = {
      ...empty,
      filters: { ...empty.filters, underIds: ["component-1", "epic-1"] },
    };
    const sp = new URLSearchParams("view=tree");

    writeViewState(sp, state);

    expect(sp.get("under")).toBe("component-1,epic-1");
    expect(parseViewState(sp)).toEqual(state);
    expect(sp.get("view")).toBe("tree");
  });

  it("omits the kind param when kind is empty", () => {
    const sp = new URLSearchParams("kind=bug");
    writeViewState(sp, empty);
    expect(sp.get("kind")).toBeNull();
  });

  it("round-trips version filters without reordering them", () => {
    const state: ViewState = {
      ...empty,
      filters: { ...empty.filters, releaseIds: ["v2", "v1"] },
    };
    const sp = new URLSearchParams();

    writeViewState(sp, state);

    expect(sp.get("version")).toBe("v2,v1");
    expect(parseViewState(sp)).toEqual(state);
  });

  it("removes the version key when the facet is cleared", () => {
    const sp = new URLSearchParams("version=v1");

    writeViewState(sp, empty);

    expect(sp.has("version")).toBe(false);
  });
});

const item = (over: Partial<FilterItem> = {}): FilterItem => ({
  id: "i1", key: "CASS-1", type: "tache", kind: "feature", title: "Générer le QR code",
  statusId: "s1", priority: 2, assigneeId: "u1", parentId: "p1", path: "aa.bb",
  depth: 0,
  dueDate: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), rank: "a1",
  labelIds: [], fixVersionIds: [], sprintIds: [], ancestorIds: [], componentId: null, statusOrder: 0,
  ...over,
});

const hierarchyItem = (over: Partial<FilterItem> = {}): HierarchyItem => {
  const { ancestorIds, componentId, ...row } = item(over);
  void ancestorIds;
  void componentId;
  return row;
};

describe("isFiltersActive", () => {
  it("is false for the empty filter set", () => {
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], releaseIds: [], sprintIds: [], kind: [], underIds: [] })).toBe(false);
  });
  it("is true when any dimension is set", () => {
    expect(isFiltersActive({ q: "", types: ["tache"], statusIds: [], priorities: [], assignees: [], labels: [], releaseIds: [], sprintIds: [], kind: [], underIds: [] })).toBe(true);
    expect(isFiltersActive({ q: "x", types: [], statusIds: [], priorities: [], assignees: [], labels: [], releaseIds: [], sprintIds: [], kind: [], underIds: [] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: ["s1"], priorities: [], assignees: [], labels: [], releaseIds: [], sprintIds: [], kind: [], underIds: [] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [2], assignees: [], labels: [], releaseIds: [], sprintIds: [], kind: [], underIds: [] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [], assignees: ["u1"], labels: [], releaseIds: [], sprintIds: [], kind: [], underIds: [] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: ["lbl-1"], releaseIds: [], sprintIds: [], kind: [], underIds: [] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], releaseIds: [], sprintIds: [], kind: ["bug"], underIds: [] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], releaseIds: [], sprintIds: [], kind: [], underIds: ["epic-1"] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], releaseIds: ["v1"], sprintIds: [], kind: [], underIds: [] })).toBe(true);
  });
});

describe("matchItem", () => {
  const f = (over: Partial<Filters> = {}): Filters => ({ q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], releaseIds: [], sprintIds: [], kind: [], underIds: [], ...over });

  it("matches everything when no filter is active", () => {
    expect(matchItem(item(), f())).toBe(true);
  });

  it("matches descendants selected by the hierarchy facet, excluding the selected ancestor", () => {
    expect(
      matchItem(
        item({ ancestorIds: ["component-1", "epic-1"] }),
        f({ underIds: ["epic-1"] }),
      ),
    ).toBe(true);
    expect(
      matchItem(
        item({ id: "epic-1", ancestorIds: ["component-1"] }),
        f({ underIds: ["epic-1"] }),
      ),
    ).toBe(false);
    expect(
      matchItem(
        item({ ancestorIds: ["component-1", "epic-1"] }),
        f({ underIds: ["component-1"] }),
      ),
    ).toBe(true);
    expect(
      matchItem(
        item({ id: "component-1", ancestorIds: [] }),
        f({ underIds: ["component-1"] }),
      ),
    ).toBe(false);
  });

  it.each([
    ["text", { q: "qr" }, { title: "Générer le QR" }, { title: "Sans correspondance" }],
    ["type", { types: ["tache"] }, { type: "tache" }, { type: "epic" }],
    ["status", { statusIds: ["s1"] }, { statusId: "s1" }, { statusId: "s2" }],
    ["priority", { priorities: [2] }, { priority: 2 }, { priority: 4 }],
    ["assignee", { assignees: ["u1"] }, { assigneeId: "u1" }, { assigneeId: "u2" }],
    ["label", { labels: ["label-1"] }, { labelIds: ["label-1"] }, { labelIds: ["label-2"] }],
    ["version", { releaseIds: ["v2", "v3"] }, { fixVersionIds: ["v1", "v2"] }, { fixVersionIds: ["v1"] }],
    ["sprint", { sprintIds: ["s2"] }, { sprintIds: ["s1", "s2"] }, { sprintIds: ["s1"] }],
    ["kind", { kind: ["feature"] }, { kind: "feature" }, { kind: "bug" }],
    ["hierarchy", { underIds: ["component-1"] }, { ancestorIds: ["component-1"] }, { ancestorIds: ["other"] }],
  ] satisfies Array<[
    string,
    Partial<Filters>,
    Partial<FilterItem>,
    Partial<FilterItem>,
  ]>)("applies the %s facet independently", (_name, filters, matching, rejected) => {
    expect(matchItem(item(matching), f(filters))).toBe(true);
    expect(matchItem(item(rejected), f(filters))).toBe(false);
  });

  it("requires every active facet while accepting any selected value within each facet", () => {
    const filters = f({
      q: "qr",
      types: ["epic", "tache"],
      statusIds: ["s9", "s1"],
      priorities: [4, 2],
      assignees: ["none", "u1"],
      labels: ["label-9", "label-1"],
      releaseIds: ["v9", "v2"], sprintIds: [],
      kind: ["bug", "feature"],
      underIds: ["epic-9", "component-1"],
    });
    const matching = item({
      title: "Générer le QR",
      type: "tache",
      statusId: "s1",
      priority: 2,
      assigneeId: "u1",
      labelIds: ["label-1"],
      fixVersionIds: ["v2"],
      kind: "feature",
      ancestorIds: ["component-1"],
    });

    expect(matchItem(matching, filters)).toBe(true);
    expect([
      item({ ...matching, title: "Sans correspondance" }),
      item({ ...matching, type: "composant" }),
      item({ ...matching, statusId: "s2" }),
      item({ ...matching, priority: 1 }),
      item({ ...matching, assigneeId: "u2" }),
      item({ ...matching, labelIds: ["label-2"] }),
      item({ ...matching, fixVersionIds: ["v1"] }),
      item({ ...matching, kind: "feature", ancestorIds: ["other"] }),
    ].every((candidate) => !matchItem(candidate, filters))).toBe(true);
  });
  it("ANDs across dimensions, ORs within one", () => {
    expect(matchItem(item({ type: "tache", priority: 4 }), f({ types: ["tache", "epic"], priorities: [3, 4] }))).toBe(true);
    expect(matchItem(item({ priority: 1 }), f({ priorities: [3, 4] }))).toBe(false);
  });
  it("text is case- and accent-insensitive over title+key only", () => {
    expect(matchItem(item({ title: "Générer" }), f({ q: "gener" }))).toBe(true);
    expect(matchItem(item({ title: "X", key: "CASS-1042" }), f({ q: "cass-1042" }))).toBe(true);
    const fullRow = { ...item({ title: "X" }), description: "Récupération" };
    expect(matchItem(fullRow, f({ q: "recup" }))).toBe(false);
    expect(matchItem(item({ title: "X" }), f({ q: "zzz" }))).toBe(false);
  });
  it("assignee filter supports the 'none' (unassigned) token", () => {
    expect(matchItem(item({ assigneeId: null }), f({ assignees: ["none"] }))).toBe(true);
    expect(matchItem(item({ assigneeId: "u1" }), f({ assignees: ["none"] }))).toBe(false);
    expect(matchItem(item({ assigneeId: "u1" }), f({ assignees: ["none", "u1"] }))).toBe(true);
  });

  it("label facet: item with one of the selected labels passes (OR within facet)", () => {
    expect(matchItem(item({ labelIds: ["lbl-1", "lbl-2"] }), f({ labels: ["lbl-1"] }))).toBe(true);
    expect(matchItem(item({ labelIds: ["lbl-2"] }), f({ labels: ["lbl-1", "lbl-2"] }))).toBe(true);
  });

  it("label facet: item with none of the selected labels is filtered out", () => {
    expect(matchItem(item({ labelIds: ["lbl-3"] }), f({ labels: ["lbl-1", "lbl-2"] }))).toBe(false);
  });

  it("label facet: item with empty labelIds is filtered out when facet is active", () => {
    expect(matchItem(item({ labelIds: [] }), f({ labels: ["lbl-1"] }))).toBe(false);
  });

  it("label facet: inactive (labels: []) ignores labelIds entirely", () => {
    expect(matchItem(item({ labelIds: [] }), f({ labels: [] }))).toBe(true);
    expect(matchItem(item({ labelIds: ["lbl-1"] }), f({ labels: [] }))).toBe(true);
  });

  it("sprint facet: « Aucun sprint » matches items that never belonged to a sprint", () => {
    expect(matchItem(item({ sprintIds: [] }), f({ sprintIds: ["none"] }))).toBe(true);
    expect(matchItem(item({ sprintIds: ["s1"] }), f({ sprintIds: ["none"] }))).toBe(false);
    expect(matchItem(item({ sprintIds: ["s1"] }), f({ sprintIds: ["none", "s1"] }))).toBe(true);
    expect(matchItem(item({ sprintIds: [] }), f({ sprintIds: ["s1"] }))).toBe(false);
  });

  it("sprint facet makes the filter set active", () => {
    expect(isFiltersActive(f({ sprintIds: ["s1"] }))).toBe(true);
  });

  it("version facet matches any selected Fix version and rejects items without one", () => {
    expect(
      matchItem(item({ fixVersionIds: ["v1", "v2"] }), f({ releaseIds: ["v2", "v3"] })),
    ).toBe(true);
    expect(matchItem(item({ fixVersionIds: ["v1"] }), f({ releaseIds: ["v2", "v3"] }))).toBe(
      false,
    );
    expect(matchItem(item({ fixVersionIds: [] }), f({ releaseIds: ["v2"] }))).toBe(false);
  });

  it("kind facet: item with matching kind passes (feature)", () => {
    expect(matchItem(item({ kind: "feature" }), f({ kind: ["feature"] }))).toBe(true);
  });

  it("kind facet: item with matching kind passes (bug)", () => {
    expect(matchItem(item({ kind: "bug" }), f({ kind: ["bug"] }))).toBe(true);
  });

  it("kind facet: item with non-matching kind is excluded", () => {
    expect(matchItem(item({ kind: "feature" }), f({ kind: ["bug"] }))).toBe(false);
  });

  it("kind facet: inactive ignores item kind entirely", () => {
    expect(matchItem(item({ kind: "feature" }), f({ kind: [], underIds: [] }))).toBe(true);
    expect(matchItem(item({ kind: "bug" }), f({ kind: [], underIds: [] }))).toBe(true);
  });

  it("kind facet: OR within facet — both bug and feature selected matches any kind", () => {
    expect(matchItem(item({ kind: "feature" }), f({ kind: ["bug", "feature"] }))).toBe(true);
    expect(matchItem(item({ kind: "bug" }), f({ kind: ["bug", "feature"] }))).toBe(true);
  });

  it("kind facet is ANDed with other facets (combined gate)", () => {
    // passes both type and kind
    expect(
      matchItem(
        item({ type: "tache", kind: "bug" }),
        f({ types: ["tache"], kind: ["bug"] }),
      ),
    ).toBe(true);
    // fails kind gate even though type passes
    expect(
      matchItem(
        item({ type: "tache", kind: "feature" }),
        f({ types: ["tache"], kind: ["bug"] }),
      ),
    ).toBe(false);
  });

  it("labels are ANDed across other facets (combined gate)", () => {
    // matches both type and label
    expect(
      matchItem(
        item({ type: "tache", labelIds: ["lbl-1"] }),
        f({ types: ["tache"], labels: ["lbl-1"] }),
      ),
    ).toBe(true);
    // fails the label gate even though type passes
    expect(
      matchItem(
        item({ type: "tache", labelIds: ["lbl-3"] }),
        f({ types: ["tache"], labels: ["lbl-1"] }),
      ),
    ).toBe(false);
  });
});

describe("withAncestors", () => {
  // self-inclusive ltree paths: child path = parent path + "." + childHex
  const rows = [
    item({ id: "c", path: "c" }),               // root composant
    item({ id: "e", path: "c.e" }),             // epic under c
    item({ id: "t", path: "c.e.t" }),           // tache under e
    item({ id: "o", path: "o" }),               // unrelated root
  ];

  it("adds the ancestors of every matched id", () => {
    const out = withAncestors(rows, new Set(["t"]));
    expect(out).toEqual(new Set(["t", "e", "c"]));
  });
  it("keeps unrelated matches and adds nothing extra", () => {
    const out = withAncestors(rows, new Set(["o"]));
    expect(out).toEqual(new Set(["o"]));
  });
  it("is a no-op when the matched set already contains the chain", () => {
    const out = withAncestors(rows, new Set(["c", "e", "t"]));
    expect(out).toEqual(new Set(["c", "e", "t"]));
  });
});

describe("enrichHierarchy", () => {
  it("exports the hierarchy enrichment helper", () => {
    expect(filterCore).toHaveProperty("enrichHierarchy");
  });

  it("derives ordered ancestors and the owning component from self-inclusive paths", () => {
    const rows = [
      hierarchyItem({ id: "component-1", type: "composant", path: "component" }),
      hierarchyItem({ id: "epic-1", type: "epic", path: "component.epic" }),
      hierarchyItem({ id: "task-1", type: "tache", path: "component.epic.task" }),
      hierarchyItem({ id: "root-1", type: "tache", path: "root" }),
    ];

    const enriched = enrichHierarchy(rows);

    expect(enriched.find((row) => row.id === "task-1")).toMatchObject({
      ancestorIds: ["component-1", "epic-1"],
      componentId: "component-1",
    });
    expect(enriched.find((row) => row.id === "component-1")).toMatchObject({
      ancestorIds: [],
      componentId: "component-1",
    });
  });

  it("groups a component and all of its descendants under that component", () => {
    const rows = [
      hierarchyItem({ id: "component-1", type: "composant", path: "component" }),
      hierarchyItem({ id: "epic-1", type: "epic", path: "component.epic" }),
      hierarchyItem({ id: "task-1", type: "tache", path: "component.epic.task" }),
      hierarchyItem({ id: "root-1", type: "tache", path: "root" }),
    ];
    const enriched = enrichHierarchy(rows);

    expect(groupItems(enriched, "component").map(([key, grouped]) => [key, grouped.map((row) => row.id)])).toEqual([
      ["component-1", ["component-1", "epic-1", "task-1"]],
      ["none", ["root-1"]],
    ]);
  });
});

describe("groupItems", () => {
  const rows = [
    item({ id: "a", assigneeId: "u1", priority: 4, parentId: "p1", statusId: "s1" }),
    item({ id: "b", assigneeId: null, priority: 4, parentId: "p1", statusId: "s2" }),
    item({ id: "c", assigneeId: "u1", priority: 2, parentId: null, statusId: "s1" }),
  ];
  it("groups by assignee, mapping null to 'none', preserving first-seen order", () => {
    expect(groupItems(rows, "assignee")).toEqual([
      ["u1", [rows[0], rows[2]]],
      ["none", [rows[1]]],
    ]);
  });
  it("groups by priority with numeric string keys", () => {
    expect(groupItems(rows, "priority")).toEqual([
      ["4", [rows[0], rows[1]]],
      ["2", [rows[2]]],
    ]);
  });
  it("groups by parent, mapping null to 'none'", () => {
    expect(groupItems(rows, "parent")).toEqual([
      ["p1", [rows[0], rows[1]]],
      ["none", [rows[2]]],
    ]);
  });
  it("groups by status, keyed by statusId, preserving first-seen order", () => {
    expect(groupItems(rows, "status")).toEqual([
      ["s1", [rows[0], rows[2]]],
      ["s2", [rows[1]]],
    ]);
  });
});

describe("sortItems", () => {
  const rows = [
    item({ id: "a", priority: 1, key: "CASS-2", createdAt: new Date("2026-01-03"), dueDate: "2026-02-01" }),
    item({ id: "b", priority: 4, key: "CASS-10", createdAt: new Date("2026-01-01"), dueDate: null }),
    item({ id: "c", priority: 1, key: "CASS-1", createdAt: new Date("2026-01-02"), dueDate: "2026-01-15" }),
  ];
  it("sorts by priority desc", () => {
    expect(sortItems(rows, { field: "priority", dir: "desc" }).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
  it("sorts by key ascending, numeric-aware (CASS-2 before CASS-10)", () => {
    expect(sortItems(rows, { field: "key", dir: "asc" }).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
  it("sorts by dueDate asc with nulls last", () => {
    expect(sortItems(rows, { field: "dueDate", dir: "asc" }).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
  it("sorts by updated desc", () => {
    const updRows = [
      item({ id: "a", updatedAt: new Date("2026-01-02") }),
      item({ id: "b", updatedAt: new Date("2026-01-05") }),
      item({ id: "c", updatedAt: new Date("2026-01-01") }),
    ];
    expect(sortItems(updRows, { field: "updated", dir: "desc" }).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
  it("sorts titles accent-insensitively and preserves the input order for equal titles", () => {
    const titleRows = [
      item({ id: "a", title: "Éclair" }),
      item({ id: "b", title: "apple" }),
      item({ id: "c", title: "Zebra" }),
      item({ id: "d", title: "apple" }),
    ];

    expect(sortItems(titleRows, { field: "title", dir: "asc" }).map((row) => row.id)).toEqual([
      "b", "d", "a", "c",
    ]);
  });
  it("sorts statuses by their configured order and preserves equal-order input", () => {
    const statusRows = [
      item({ id: "a", statusOrder: 2 }),
      item({ id: "b", statusOrder: 1 }),
      item({ id: "c", statusOrder: 1 }),
      item({ id: "d", statusOrder: 3 }),
    ];

    expect(sortItems(statusRows, { field: "status", dir: "asc" }).map((row) => row.id)).toEqual([
      "b", "c", "a", "d",
    ]);
  });

  it.each([
    ["key", "asc", ["c", "a", "b"]],
    ["key", "desc", ["b", "a", "c"]],
    ["title", "asc", ["b", "a", "c"]],
    ["title", "desc", ["c", "a", "b"]],
    ["status", "asc", ["b", "c", "a"]],
    ["status", "desc", ["a", "b", "c"]],
    ["priority", "asc", ["a", "c", "b"]],
    ["priority", "desc", ["b", "c", "a"]],
    ["dueDate", "asc", ["c", "a", "b"]],
    ["dueDate", "desc", ["a", "c", "b"]],
  ] satisfies Array<[SortField, SortDir, string[]]>) (
    "sorts list field %s in %s order",
    (field, dir, expected) => {
      const listRows = [
        item({ id: "a", key: "CASS-2", title: "Éclair", statusOrder: 2, priority: 1, dueDate: "2026-02-01" }),
        item({ id: "b", key: "CASS-10", title: "apple", statusOrder: 1, priority: 4, dueDate: null }),
        item({ id: "c", key: "CASS-1", title: "Zebra", statusOrder: 1, priority: 2, dueDate: "2026-01-15" }),
      ];

      expect(sortItems(listRows, { field, dir }).map((row) => row.id)).toEqual(expected);
    },
  );
  it("does not mutate the input array", () => {
    const copy = [...rows];
    sortItems(rows, { field: "priority", dir: "asc" });
    expect(rows).toEqual(copy);
  });
});

describe("withKnownReleaseIds", () => {
  it("drops version IDs that no longer exist and keeps the others in order", () => {
    const state = parseViewState(new URLSearchParams("version=deleted,live-b,live-a"));
    const sanitized = withKnownReleaseIds(state.filters, new Set(["live-a", "live-b"]));
    expect(sanitized.releaseIds).toEqual(["live-b", "live-a"]);
  });

  it("makes the Version filter inactive when only unknown versions are selected", () => {
    const state = parseViewState(new URLSearchParams("version=deleted"));
    const sanitized = withKnownReleaseIds(state.filters, new Set(["live"]));
    expect(sanitized.releaseIds).toEqual([]);
    expect(isFiltersActive(sanitized)).toBe(false);
  });

  it("returns the same filters object when every version is known", () => {
    const state = parseViewState(new URLSearchParams("version=live"));
    expect(withKnownReleaseIds(state.filters, new Set(["live"]))).toBe(state.filters);
  });
});

describe("isHiddenByFilters (JIR-92)", () => {
  const composantId = "11111111-1111-4111-8111-111111111111";
  const epicId = "22222222-2222-4222-8222-222222222222";
  const taskId = "33333333-3333-4333-8333-333333333333";
  const created = {
    id: taskId,
    key: "DEMO-3",
    type: "tache" as const,
    kind: "feature" as const,
    title: "Relance par courriel",
    statusId: "todo",
    priority: 0,
    assigneeId: null,
    path: `root.${composantId.replaceAll("-", "")}.${epicId.replaceAll("-", "")}.${taskId.replaceAll("-", "")}`,
    sprintIds: [] as string[] | undefined,
  };
  const filters = (patch: Partial<Filters>): Filters => ({ ...empty.filters, ...patch });

  it("leaves an unknown Sprint out of the check, never claiming « masqué » from it", () => {
    const subtask = { ...created, type: "soustache" as const, sprintIds: undefined };
    expect(isHiddenByFilters(subtask, filters({ sprintIds: ["none"] }))).toBe(false);
    expect(isHiddenByFilters(subtask, filters({ sprintIds: ["s1"] }))).toBe(false);
    // The facets it knows still decide.
    expect(isHiddenByFilters(subtask, filters({ sprintIds: ["s1"], releaseIds: ["v1"] }))).toBe(true);
  });

  it("never hides without an active filter", () => {
    expect(isHiddenByFilters(created, undefined)).toBe(false);
    expect(isHiddenByFilters(created, empty.filters)).toBe(false);
  });

  it("hides an item created without the filtered Version, not one created with it", () => {
    expect(isHiddenByFilters(created, filters({ releaseIds: ["v1"] }))).toBe(true);
    expect(isHiddenByFilters({ ...created, fixVersionIds: ["v1"] }, filters({ releaseIds: ["v1"] }))).toBe(false);
  });

  it("checks the created values against every facet", () => {
    expect(isHiddenByFilters(created, filters({ statusIds: ["todo"], types: ["tache"] }))).toBe(false);
    expect(isHiddenByFilters(created, filters({ statusIds: ["done"] }))).toBe(true);
    expect(isHiddenByFilters(created, filters({ assignees: ["none"] }))).toBe(false);
    expect(isHiddenByFilters(created, filters({ labels: ["l1"] }))).toBe(true);
    expect(isHiddenByFilters({ ...created, labelIds: ["l1"] }, filters({ labels: ["l1"] }))).toBe(false);
    expect(isHiddenByFilters(created, filters({ sprintIds: ["none"] }))).toBe(false);
    expect(isHiddenByFilters({ ...created, sprintIds: ["s1"] }, filters({ sprintIds: ["none"] }))).toBe(true);
    expect(isHiddenByFilters(created, filters({ q: "courriel" }))).toBe(false);
    expect(isHiddenByFilters(created, filters({ q: "facture" }))).toBe(true);
  });

  it("reads the ancestors of the « under » facet from the created path", () => {
    expect(isHiddenByFilters(created, filters({ underIds: [epicId] }))).toBe(false);
    expect(isHiddenByFilters(created, filters({ underIds: [composantId] }))).toBe(false);
    expect(isHiddenByFilters(created, filters({ underIds: [taskId] }))).toBe(true);
  });
});
