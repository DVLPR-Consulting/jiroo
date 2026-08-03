import { describe, expect, it } from "vitest";
import { planItemKeyRewrite } from "./backlog-key";

describe("planItemKeyRewrite", () => {
  it("preserves every numeric suffix when a backlog key changes", () => {
    expect(
      planItemKeyRewrite(
        [
          { id: "live", key: "CASS-12" },
          { id: "deleted", key: "CASS-1042" },
        ],
        "CASS",
        "PEN",
      ),
    ).toEqual([
      { id: "live", oldKey: "CASS-12", newKey: "PEN-12" },
      { id: "deleted", oldKey: "CASS-1042", newKey: "PEN-1042" },
    ]);
  });

  it("returns no writes when the normalized backlog key is unchanged", () => {
    expect(
      planItemKeyRewrite([{ id: "item", key: "CASS-12" }], "CASS", "CASS"),
    ).toEqual([]);
  });

  it("rejects malformed persisted keys instead of guessing a suffix", () => {
    expect(() =>
      planItemKeyRewrite([{ id: "item", key: "bad" }], "CASS", "PEN"),
    ).toThrow("Clé d’item invalide: bad");
  });
});
