import { describe, expect, it } from "vitest";
import {
  chipValue,
  hasSavableViewState,
  SECONDARY_FILTERS,
  splitSecondaryFilters,
  toggleValue,
} from "@/lib/items/filter-chips";
import type { Filters, ViewState } from "@/lib/items/filter";

const none: Filters = {
  q: "",
  types: [],
  statusIds: [],
  priorities: [],
  assignees: [],
  labels: [],
  releaseIds: [],
  kind: [],
  underIds: [],
};

describe("filter chips", () => {
  it("puts Priorité, Label, Version and Nature behind « + Filtre », in that order", () => {
    expect(SECONDARY_FILTERS.map((filter) => filter.label)).toEqual([
      "Priorité",
      "Label",
      "Version",
      "Nature",
    ]);
  });

  it("turns active secondary filters into chips and leaves the rest in the menu", () => {
    const { active, available } = splitSecondaryFilters({
      ...none,
      priorities: [3],
      kind: ["bug"],
    });

    expect(active.map((filter) => filter.key)).toEqual(["priorities", "kind"]);
    expect(available.map((filter) => filter.key)).toEqual(["labels", "releaseIds"]);
  });

  it("offers every secondary filter when none is active", () => {
    const { active, available } = splitSecondaryFilters(none);

    expect(active).toEqual([]);
    expect(available).toHaveLength(4);
  });

  it("names a chip value by its first selection and counts the others", () => {
    const options = [
      { value: "a", label: "Urgent" },
      { value: "b", label: "Client" },
      { value: "c", label: "Interne" },
    ];

    expect(chipValue(options, ["b"])).toBe("Client");
    expect(chipValue(options, ["b", "a", "c"])).toBe("Client +2");
    expect(chipValue(options, [])).toBeUndefined();
  });

  it("falls back to the count when the first selection is unknown", () => {
    expect(chipValue([], ["gone", "other"])).toBe("2");
  });

  it("toggles a value in a selection without mutating it", () => {
    const selected = ["marie"];

    expect(toggleValue(selected, "none")).toEqual(["marie", "none"]);
    expect(toggleValue(selected, "marie")).toEqual([]);
    expect(selected).toEqual(["marie"]);
  });

  it("only offers saving a view once something differs from the defaults", () => {
    const base: ViewState = { filters: none, group: null, sort: null };

    expect(hasSavableViewState(base)).toBe(false);
    expect(hasSavableViewState({ ...base, filters: { ...none, q: "auth" } })).toBe(true);
    expect(hasSavableViewState({ ...base, filters: { ...none, assignees: ["none"] } })).toBe(true);
    expect(hasSavableViewState({ ...base, group: "priority" })).toBe(true);
    expect(hasSavableViewState({ ...base, sort: { field: "title", dir: "asc" } })).toBe(true);
  });
});
