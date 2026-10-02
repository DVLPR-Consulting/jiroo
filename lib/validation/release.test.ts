import { describe, expect, it } from "vitest";
import {
  changeItemFixVersionsSchema,
  createReleaseSchema,
  deleteReleaseSchema,
  mergeReleaseSchema,
  publishReleaseSchema,
  releaseNotesOptionsSchema,
  reorderReleaseSchema,
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

describe("release depth commands", () => {
  const backlogId = crypto.randomUUID();
  const releaseId = crypto.randomUUID();
  const targetId = crypto.randomUUID();
  const scopeRev = "0123456789abcdef0123456789abcdef";

  it("requires an explicit disposition when deleting a version", () => {
    expect(() =>
      deleteReleaseSchema.parse({
        backlogId,
        releaseId,
        expectedRevision: 3,
        expectedScopeRevision: scopeRev,
        fixVersions: undefined,
      }),
    ).toThrow();
    expect(
      deleteReleaseSchema.safeParse({
        backlogId,
        releaseId,
        expectedRevision: 3,
        expectedScopeRevision: scopeRev,
        fixVersions: { disposition: "keep" },
      }).success,
    ).toBe(false);
  });

  it("accepts the none, remove and transfer dispositions", () => {
    for (const fixVersions of [
      { disposition: "none" },
      { disposition: "remove" },
      { disposition: "transfer", targetReleaseId: targetId, expectedTargetRevision: 1 },
    ]) {
      expect(
        deleteReleaseSchema.safeParse({
          backlogId,
          releaseId,
          expectedRevision: 3,
          expectedScopeRevision: scopeRev,
          fixVersions,
        }).success,
      ).toBe(true);
    }
  });

  it("refuses extra fields on literal dispositions and a transfer without target", () => {
    expect(
      deleteReleaseSchema.safeParse({
        backlogId,
        releaseId,
        expectedRevision: 3,
        expectedScopeRevision: scopeRev,
        fixVersions: { disposition: "none", targetReleaseId: targetId },
      }).success,
    ).toBe(false);
    expect(
      deleteReleaseSchema.safeParse({
        backlogId,
        releaseId,
        expectedRevision: 3,
        expectedScopeRevision: scopeRev,
        fixVersions: { disposition: "transfer", targetReleaseId: targetId },
      }).success,
    ).toBe(false);
  });

  it("refuses a transfer target equal to the deleted version", () => {
    expect(() =>
      deleteReleaseSchema.parse({
        backlogId,
        releaseId,
        expectedRevision: 3,
        expectedScopeRevision: scopeRev,
        fixVersions: { disposition: "transfer", targetReleaseId: releaseId, expectedTargetRevision: 1 },
      }),
    ).toThrow();
  });

  it("requires a canonical scope revision on delete and merge", () => {
    expect(
      deleteReleaseSchema.safeParse({
        backlogId,
        releaseId,
        expectedRevision: 3,
        expectedScopeRevision: "stale",
        fixVersions: { disposition: "remove" },
      }).success,
    ).toBe(false);
    expect(
      mergeReleaseSchema.safeParse({
        backlogId,
        sourceReleaseId: releaseId,
        expectedSourceRevision: 1,
        targetReleaseId: targetId,
        expectedTargetRevision: 1,
      }).success,
    ).toBe(false);
  });

  it("requires a distinct merge target and its revision", () => {
    const base = {
      backlogId,
      sourceReleaseId: releaseId,
      expectedSourceRevision: 2,
      expectedScopeRevision: scopeRev,
    };
    expect(
      mergeReleaseSchema.safeParse({ ...base, targetReleaseId: targetId, expectedTargetRevision: 1 })
        .success,
    ).toBe(true);
    expect(mergeReleaseSchema.safeParse({ ...base, targetReleaseId: targetId }).success).toBe(false);
    expect(
      mergeReleaseSchema.safeParse({ ...base, targetReleaseId: releaseId, expectedTargetRevision: 2 })
        .success,
    ).toBe(false);
  });

  it("refuses a version as its own neighbour or identical neighbours", () => {
    expect(() =>
      reorderReleaseSchema.parse({
        backlogId,
        releaseId,
        expectedRevision: 1,
        beforeId: releaseId,
        afterId: null,
      }),
    ).toThrow();
    expect(
      reorderReleaseSchema.safeParse({
        backlogId,
        releaseId,
        expectedRevision: 1,
        beforeId: targetId,
        afterId: targetId,
      }).success,
    ).toBe(false);
    expect(
      reorderReleaseSchema.parse({ backlogId, releaseId, expectedRevision: 1, afterId: targetId }),
    ).toMatchObject({ beforeId: null, afterId: targetId });
  });

  it("defaults release notes options to completed items with the description", () => {
    expect(releaseNotesOptionsSchema.parse({})).toEqual({
      includeIncomplete: false,
      includeDescription: true,
    });
    expect(
      releaseNotesOptionsSchema.parse({ includeIncomplete: true, includeDescription: false }),
    ).toEqual({ includeIncomplete: true, includeDescription: false });
  });
});
