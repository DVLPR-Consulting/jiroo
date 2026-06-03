import { describe, expect, it } from "vitest";
import { parseViewState, writeViewState, type ViewState } from "./filter";

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
