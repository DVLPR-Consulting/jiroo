import { describe, expect, it } from "vitest";
import { bulkUpdateItemsSchema } from "@/lib/validation/bulk-item";

const BACKLOG_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-9222-222222222222";
const STATUS_ID = "33333333-3333-4333-8333-333333333333";

function input(patch: unknown, itemIds = [ITEM_ID]) {
  return { backlogId: BACKLOG_ID, itemIds, patch };
}

describe("bulkUpdateItemsSchema", () => {
  it("accepts every supported bulk patch", () => {
    for (const patch of [
      { field: "statusId", value: STATUS_ID },
      { field: "priority", value: 4 },
      { field: "assigneeId", value: "better-auth-user" },
      { field: "assigneeId", value: null },
      { field: "estimatePoints", value: 5 },
      { field: "estimatePoints", value: 0 },
      { field: "estimatePoints", value: null },
    ]) {
      expect(bulkUpdateItemsSchema.safeParse(input(patch)).success).toBe(true);
    }
  });

  it("requires between one and 500 unique item ids", () => {
    const patch = { field: "priority", value: 2 };
    const tooManyIds = Array.from(
      { length: 501 },
      (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    );

    expect(bulkUpdateItemsSchema.safeParse(input(patch, [])).success).toBe(false);
    expect(
      bulkUpdateItemsSchema.safeParse(input(patch, [ITEM_ID, ITEM_ID])).success,
    ).toBe(false);
    expect(bulkUpdateItemsSchema.safeParse(input(patch, tooManyIds)).success).toBe(false);
  });

  it("rejects malformed identifiers and patch values", () => {
    for (const candidate of [
      { backlogId: "bad", itemIds: [ITEM_ID], patch: { field: "priority", value: 2 } },
      input({ field: "priority", value: 5 }),
      input({ field: "priority", value: 1.5 }),
      input({ field: "statusId", value: "bad" }),
      input({ field: "assigneeId", value: "" }),
      input({ field: "estimatePoints", value: -1 }),
      input({ field: "estimatePoints", value: 1.001 }),
      input({ field: "estimatePoints", value: 1000 }),
      input({ field: "unsupported", value: "x" }),
      input({ field: "priority" }),
    ]) {
      expect(bulkUpdateItemsSchema.safeParse(candidate).success).toBe(false);
    }
  });
});
