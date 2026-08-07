import { describe, expect, it } from "vitest";
import {
  changeItemFixVersionsSchema,
  createReleaseSchema,
  publishReleaseSchema,
  updateReleaseSchema,
} from "@/lib/validation/release";

describe("release validation", () => {
  it("requires a canonical publication scope revision", () => {
    expect(
      publishReleaseSchema.safeParse({
        backlogId: crypto.randomUUID(),
        releaseId: crypto.randomUUID(),
        expectedRevision: 1,
        effectiveDate: "2026-08-07",
        incompleteDisposition: "keep",
      }).success,
    ).toBe(false);
    expect(
      publishReleaseSchema.safeParse({
        backlogId: crypto.randomUUID(),
        releaseId: crypto.randomUUID(),
        expectedRevision: 1,
        expectedScopeRevision: "not-a-scope-revision",
        effectiveDate: "2026-08-07",
        incompleteDisposition: "keep",
      }).success,
    ).toBe(false);
  });

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

  it("preserves the canonical driver and target date command fields", () => {
    expect(
      createReleaseSchema.parse({
        backlogId: crypto.randomUUID(),
        name: "1.0",
        driverId: "driver-a",
        targetDate: "",
      }),
    ).toMatchObject({ driverId: "driver-a", targetDate: null });
    expect(
      updateReleaseSchema.parse({
        backlogId: crypto.randomUUID(),
        releaseId: crypto.randomUUID(),
        expectedRevision: 1,
        driverId: null,
      }).driverId,
    ).toBeNull();
    expect(
      createReleaseSchema.safeParse({
        backlogId: crypto.randomUUID(),
        name: "legacy",
        driverId: "driver-a",
        releaseDate: "2026-08-07",
      }).success,
    ).toBe(false);
  });

  it("allows a target date without a start date", () => {
    expect(
      createReleaseSchema.safeParse({
        backlogId: crypto.randomUUID(),
        name: "1.1",
        driverId: "driver-a",
        targetDate: "2026-08-07",
      }).success,
    ).toBe(true);
  });

  it("rejects a target date before an explicitly supplied start date", () => {
    const fields = {
      startDate: "2026-08-08",
      targetDate: "2026-08-07",
    };
    expect(
      createReleaseSchema.safeParse({
        backlogId: crypto.randomUUID(),
        name: "1.2",
        driverId: "driver-a",
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

  it("rejects an update with no metadata change", () => {
    expect(
      updateReleaseSchema.safeParse({
        backlogId: crypto.randomUUID(),
        releaseId: crypto.randomUUID(),
        expectedRevision: 1,
      }).success,
    ).toBe(false);
  });
});
