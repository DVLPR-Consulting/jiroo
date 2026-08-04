import { describe, expect, it } from "vitest";
import {
  firstSearchParam,
  orderedSearchParamEntries,
} from "@/lib/items/view-url-params";

describe("firstSearchParam", () => {
  it("uses the first value for a repeated scalar selector", () => {
    expect(firstSearchParam(["first", "second"])).toBe("first");
    expect(firstSearchParam([])).toBeUndefined();
  });

  it("retains scalar and undefined values", () => {
    expect(firstSearchParam("only")).toBe("only");
    expect(firstSearchParam(undefined)).toBeUndefined();
  });
});

describe("orderedSearchParamEntries", () => {
  it("preserves key order and every repeated value without comma coercion", () => {
    expect(
      orderedSearchParamEntries({
        view: ["list", "tree"],
        tag: ["a", "b"],
        scalar: "one",
        omitted: undefined,
      }),
    ).toEqual([
      ["view", "list"],
      ["view", "tree"],
      ["tag", "a"],
      ["tag", "b"],
      ["scalar", "one"],
    ]);
  });
});
