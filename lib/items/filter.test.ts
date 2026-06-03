import { describe, expect, it } from "vitest";
import { parseViewState, writeViewState, type ViewState } from "./filter";
import { isFiltersActive, matchItem, type FilterItem } from "./filter";

const empty: ViewState = {
  filters: { q: "", types: [], statusIds: [], priorities: [], assignees: [] },
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
});

describe("writeViewState ⇄ parseViewState round-trip", () => {
  it("round-trips a full state", () => {
    const state: ViewState = {
      filters: { q: "abc", types: ["epic"], statusIds: ["s1"], priorities: [0], assignees: ["none"] },
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
});

const item = (over: Partial<FilterItem> = {}): FilterItem => ({
  id: "i1", key: "CASS-1", type: "tache", title: "Générer le QR code", description: "scan",
  statusId: "s1", priority: 2, assigneeId: "u1", parentId: "p1", path: "aa.bb",
  dueDate: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), rank: "a1",
  ...over,
});

describe("isFiltersActive", () => {
  it("is false for the empty filter set", () => {
    expect(isFiltersActive({ q: "", types: [], statusIds: [], priorities: [], assignees: [] })).toBe(false);
  });
  it("is true when any dimension is set", () => {
    expect(isFiltersActive({ q: "", types: ["tache"], statusIds: [], priorities: [], assignees: [] })).toBe(true);
    expect(isFiltersActive({ q: "x", types: [], statusIds: [], priorities: [], assignees: [] })).toBe(true);
  });
});

describe("matchItem", () => {
  const f = (over = {}) => ({ q: "", types: [], statusIds: [], priorities: [], assignees: [], ...over });

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
});
