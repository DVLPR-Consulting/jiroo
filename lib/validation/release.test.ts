import { describe, expect, it } from "vitest";
import {
  changeItemFixVersionsSchema,
  createReleaseSchema,
  publishReleaseSchema,
} from "@/lib/validation/release";

describe("release validation", () => {
  it("requires a destination when incomplete items move", () => {
    expect(() =>
      publishReleaseSchema.parse({
        backlogId: crypto.randomUUID(),
        releaseId: crypto.randomUUID(),
        expectedRevision: 1,
        effectiveDate: "2026-08-07",
        incompleteDisposition: "move",
      }),
    ).toThrow();
  });

  it("keeps multiple unique fix versions", () => {
    const releaseIds = [crypto.randomUUID(), crypto.randomUUID()];
    expect(
      changeItemFixVersionsSchema.parse({
        backlogId: crypto.randomUUID(),
        itemId: crypto.randomUUID(),
        mode: "replace",
        releaseIds,
      }).releaseIds,
    ).toEqual(releaseIds);
  });

  it("rejects duplicate fix versions", () => {
    const releaseId = crypto.randomUUID();
    expect(
      changeItemFixVersionsSchema.safeParse({
        backlogId: crypto.randomUUID(),
        itemId: crypto.randomUUID(),
        mode: "replace",
        releaseIds: [releaseId, releaseId],
      }).success,
    ).toBe(false);
  });

  it("normalizes an optional release date", () => {
    expect(
      createReleaseSchema.parse({
        backlogId: crypto.randomUUID(),
        name: "1.0",
        releaseDate: "",
      }).releaseDate,
    ).toBeNull();
  });
});
