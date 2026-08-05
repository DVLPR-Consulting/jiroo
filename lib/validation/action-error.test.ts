import { describe, expect, it } from "vitest";
import { mapZodActionError } from "@/lib/validation/action-error";
import { updateItemSchema } from "@/lib/validation/item";

describe("mapZodActionError", () => {
  it("returns the description issue as a field error and summary", () => {
    const parsed = updateItemSchema.safeParse({
      id: "22222222-2222-4222-9222-222222222222",
      description: "A".repeat(20_001),
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected validation failure");

    expect(mapZodActionError(parsed.error)).toEqual({
      error: "Description trop longue (20 000 max).",
      fieldErrors: {
        description: ["Description trop longue (20 000 max)."],
      },
    });
  });

  it("returns null for an unknown exception", () => {
    expect(mapZodActionError(new Error("database details"))).toBeNull();
  });
});
