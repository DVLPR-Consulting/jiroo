import { describe, expect, it } from "vitest";
import { extractItemKeys } from "@/lib/repo-webhooks/item-keys";

describe("extractItemKeys", () => {
  it("finds keys in branch names and titles, case-insensitively, upper-cased", () => {
    expect(
      extractItemKeys(["feature/cass-12-login", "CASS-7: fix", "Merge Cass-3 into main"], "CASS"),
    ).toEqual(["CASS-12", "CASS-7", "CASS-3"]);
  });

  it("ignores another backlog's keys", () => {
    expect(extractItemKeys(["LABS-4 and CASS-5", "CASSE-6"], "CASS")).toEqual(["CASS-5"]);
  });

  it("ignores keys glued to other word characters", () => {
    expect(
      extractItemKeys(["ABC-12x", "CASS-12x", "xCASS-12", "CASS-12_fix", "CASS-", "CASS12"], "CASS"),
    ).toEqual([]);
    expect(extractItemKeys(["ABC-12x ABC-13"], "ABC")).toEqual(["ABC-13"]);
  });

  it("deduplicates keys, keeping their first appearance", () => {
    expect(extractItemKeys(["CASS-2 cass-1", "CASS-2"], "cass")).toEqual(["CASS-2", "CASS-1"]);
  });

  it("refuses a backlog key that is not 2 to 6 letters", () => {
    expect(extractItemKeys(["A.-1"], "A.")).toEqual([]);
  });
});
