// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import * as itemReads from "@/lib/services/items";

vi.mock("server-only", () => ({}));

describe("item view projection", () => {
  it("excludes large document fields while retaining the view and hierarchy fields", () => {
    expect(itemReads).toHaveProperty("itemViewColumns");
    const columns = Object.keys(itemReads.itemViewColumns);
    expect(columns).not.toContain("description");
    expect(columns).not.toContain("search");
    expect(columns).toEqual(expect.arrayContaining([
      "title", "rank", "path", "depth", "statusId", "estimatePoints", "dueDate",
    ]));
  });
});
