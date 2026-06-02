import { describe, expect, it } from "vitest";
import { formatItemKey } from "@/lib/items/key";

describe("formatItemKey", () => {
  it("joins an uppercased prefix and a number", () => {
    expect(formatItemKey("CASS", 42)).toBe("CASS-42");
  });

  it("uppercases the prefix", () => {
    expect(formatItemKey("cass", 1)).toBe("CASS-1");
  });

  it("rejects a non-positive number", () => {
    expect(() => formatItemKey("CASS", 0)).toThrow();
  });
});
