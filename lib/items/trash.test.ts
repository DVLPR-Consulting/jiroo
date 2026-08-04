import { describe, expect, it } from "vitest";
import { canRestore, restoreDeadline } from "@/lib/items/trash";

describe("trash restore window", () => {
  const deletedAt = new Date("2026-01-01T00:00:00.000Z");

  it("computes the deadline as exactly 30 days", () => {
    expect(restoreDeadline(deletedAt)).toEqual(new Date("2026-01-31T00:00:00.000Z"));
  });

  it("allows restoration exactly at the deadline", () => {
    expect(canRestore(deletedAt, new Date("2026-01-31T00:00:00.000Z"))).toBe(true);
  });

  it("rejects restoration one millisecond after the deadline", () => {
    expect(canRestore(deletedAt, new Date("2026-01-31T00:00:00.001Z"))).toBe(false);
  });
});
