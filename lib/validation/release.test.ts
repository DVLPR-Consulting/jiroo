import { describe, expect, it } from "vitest";
import {
  changeItemFixVersionsSchema,
  createReleaseSchema,
  publishReleaseSchema,
  updateReleaseSchema,
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

  it("rejects moving incomplete items to the published release", () => {
    const releaseId = crypto.randomUUID();
    expect(
      publishReleaseSchema.safeParse({
        backlogId: crypto.randomUUID(),
        releaseId,
        expectedRevision: 1,
        effectiveDate: "2026-08-07",
        incompleteDisposition: "move",
        destinationReleaseId: releaseId,
      }).success,
    ).toBe(false);
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

  it("allows a target date without a start date", () => {
    expect(
      createReleaseSchema.safeParse({
        backlogId: crypto.randomUUID(),
        name: "1.1",
        releaseDate: "2026-08-07",
      }).success,
    ).toBe(true);
  });

  it("rejects a target date before an explicitly supplied start date", () => {
    const fields = {
      startDate: "2026-08-08",
      releaseDate: "2026-08-07",
    };
    expect(
      createReleaseSchema.safeParse({
        backlogId: crypto.randomUUID(),
        name: "1.2",
        ...fields,
      }).success,
    ).toBe(false);
    expect(
      updateReleaseSchema.safeParse({
        backlogId: crypto.randomUUID(),
        releaseId: crypto.randomUUID(),
        expectedRevision: 1,
        ...fields,
      }).success,
    ).toBe(false);
  });
});
