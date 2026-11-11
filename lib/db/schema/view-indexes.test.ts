// @vitest-environment node
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { items } from "./domain";

describe("view window query indexes", () => {
  it("provides backlog-scoped status and ordered sibling lookups", () => {
    const indexes = getTableConfig(items).indexes.map(({ config }) => ({
      columns: config.columns.map((column) => "name" in column ? column.name : null),
      unique: config.unique,
    }));
    expect(indexes).toContainEqual({ columns: ["backlog_id", "status_id"], unique: false });
    expect(indexes).toContainEqual({ columns: ["backlog_id", "parent_id", "rank"], unique: false });
  });
});
