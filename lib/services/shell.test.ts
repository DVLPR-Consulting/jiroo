import { describe, expect, it, vi } from "vitest";
import { toCountMap } from "@/lib/services/shell";

vi.mock("server-only", () => ({}));

describe("toCountMap", () => {
  it("coerces SQL counts and adds repeated backlog rows", () => {
    expect(
      toCountMap([
        { backlogKey: "CASS", count: "2" },
        { backlogKey: "CASS", count: 3 },
        { backlogKey: "PEN", count: "4" },
      ]),
    ).toEqual({ CASS: 5, PEN: 4 });
  });

  it("normalizes backlog keys before grouping", () => {
    expect(
      toCountMap([
        { backlogKey: "cass", count: "1" },
        { backlogKey: "CASS", count: "2" },
      ]),
    ).toEqual({ CASS: 3 });
  });
});
