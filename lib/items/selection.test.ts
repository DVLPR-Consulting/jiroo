import { describe, expect, it } from "vitest";
import {
  emptySelection,
  reconcileSelection,
  selectAllVisible,
  toggleItemSelection,
} from "@/lib/items/selection";

const ids = ["a", "b", "c", "d", "e"];

describe("item selection", () => {
  it("toggles one visible item without mutating the previous state", () => {
    const initial = emptySelection();
    const selected = toggleItemSelection(initial, ids, "b", false);
    const cleared = toggleItemSelection(selected, ids, "b", false);

    expect([...initial.selectedIds]).toEqual([]);
    expect([...selected.selectedIds]).toEqual(["b"]);
    expect(selected.anchorId).toBe("b");
    expect([...cleared.selectedIds]).toEqual([]);
    expect(cleared.anchorId).toBeNull();
  });

  it("selects a forward visible range from the stable anchor", () => {
    const anchored = toggleItemSelection(emptySelection(), ids, "b", false);
    const ranged = toggleItemSelection(anchored, ids, "d", true);

    expect([...ranged.selectedIds]).toEqual(["b", "c", "d"]);
    expect(ranged.anchorId).toBe("b");
  });

  it("selects a reverse visible range in visible order", () => {
    const anchored = toggleItemSelection(emptySelection(), ids, "d", false);
    const ranged = toggleItemSelection(anchored, ids, "b", true);

    expect([...ranged.selectedIds]).toEqual(["b", "c", "d"]);
    expect(ranged.anchorId).toBe("d");
  });

  it("replaces the previous range while preserving its original anchor", () => {
    const anchored = toggleItemSelection(emptySelection(), ids, "b", false);
    const firstRange = toggleItemSelection(anchored, ids, "e", true);
    const shorterRange = toggleItemSelection(firstRange, ids, "c", true);

    expect([...shorterRange.selectedIds]).toEqual(["b", "c"]);
    expect(shorterRange.anchorId).toBe("b");
  });

  it("degrades an invalid range anchor to a normal toggle", () => {
    const stale = { selectedIds: new Set(["missing"]), anchorId: "missing" };
    const selected = toggleItemSelection(stale, ids, "c", true);

    expect([...selected.selectedIds]).toEqual(["missing", "c"]);
    expect(selected.anchorId).toBe("c");
  });

  it("selects all visible items and clears on an empty list", () => {
    expect([...selectAllVisible(ids).selectedIds]).toEqual(ids);
    expect(selectAllVisible(ids).anchorId).toBe("a");
    expect([...selectAllVisible([]).selectedIds]).toEqual([]);
    expect(selectAllVisible([]).anchorId).toBeNull();
  });

  it("removes hidden ids and clears an anchor that is no longer visible", () => {
    const state = {
      selectedIds: new Set(["a", "b", "d"]),
      anchorId: "d",
    };
    const reconciled = reconcileSelection(state, ["a", "b", "c"]);

    expect([...reconciled.selectedIds]).toEqual(["a", "b"]);
    expect(reconciled.anchorId).toBeNull();
    expect([...state.selectedIds]).toEqual(["a", "b", "d"]);
  });
});
