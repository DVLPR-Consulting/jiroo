import { describe, expect, it } from "vitest";
import {
  parseViewState,
  writeViewState,
  isFiltersActive,
  matchItem,
  withAncestors,
  groupItems,
  sortItems,
  type ViewState,
  type FilterItem,
} from "./filter";

const empty: ViewState = {
  filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [] },
  group: null,
  sort: null,
};

describe("parseViewState", () => {
  it("returns an empty state for empty params", () => {
    expect(parseViewState(new URLSearchParams())).toEqual(empty);
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
});

describe("writeViewState ⇄ parseViewState round-trip", () => {
  it("round-trips a full state", () => {
    const state: ViewState = {
      filters: { q: "abc", types: ["epic"], statusIds: ["s1"], priorities: [0], assignees: ["none"], labels: [] },
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
      filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: ["id1", "id2"] },
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
});

const item = (over: Partial<FilterItem> = {}): FilterItem => ({
  id: "i1", key: "CASS-1", type: "tache", title: "Générer le QR code", description: "scan",
  statusId: "s1", priority: 2, assigneeId: "u1", parentId: "p1", path: "aa.bb",
  depth: 0,
  dueDate: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), rank: "a1",
  labelIds: [],
  ...over,
});

describe("isFiltersActive", () => {
  it("is false for the empty filter set", () => {
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [] })).toBe(false);
  });
  it("is true when any dimension is set", () => {
    expect(isFiltersActive({ q: "", types: ["tache"], statusIds: [], priorities: [], assignees: [], labels: [] })).toBe(true);
    expect(isFiltersActive({ q: "x", types: [], statusIds: [], priorities: [], assignees: [], labels: [] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: ["s1"], priorities: [], assignees: [], labels: [] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [2], assignees: [], labels: [] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [], assignees: ["u1"], labels: [] })).toBe(true);
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: ["lbl-1"] })).toBe(true);
  });
});

describe("matchItem", () => {
  const f = (over = {}) => ({ q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [], ...over });

  it("matches everything when no filter is active", () => {
    expect(matchItem(item(), f())).toBe(true);
  });
  it("ANDs across dimensions, ORs within one", () => {
    expect(matchItem(item({ type: "tache", priority: 4 }), f({ types: ["tache", "epic"], priorities: [3, 4] }))).toBe(true);
    expect(matchItem(item({ priority: 1 }), f({ priorities: [3, 4] }))).toBe(false);
  });
  it("text is case- and accent-insensitive over title+description", () => {
    expect(matchItem(item({ title: "Générer" }), f({ q: "gener" }))).toBe(true);
    expect(matchItem(item({ title: "X", description: "Récupération" }), f({ q: "recup" }))).toBe(true);
    expect(matchItem(item({ title: "X", description: null }), f({ q: "zzz" }))).toBe(false);
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
    item({ id: "a", priority: 1, key: "CASS-2", createdAt: new Date("2026-01-03"), dueDate: new Date("2026-02-01") }),
    item({ id: "b", priority: 4, key: "CASS-10", createdAt: new Date("2026-01-01"), dueDate: null }),
    item({ id: "c", priority: 1, key: "CASS-1", createdAt: new Date("2026-01-02"), dueDate: new Date("2026-01-15") }),
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
  it("does not mutate the input array", () => {
    const copy = [...rows];
    sortItems(rows, { field: "priority", dir: "asc" });
    expect(rows).toEqual(copy);
  });
});
