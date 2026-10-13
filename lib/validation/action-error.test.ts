import { describe, expect, it } from "vitest";
import {
  mapSprintZodActionError,
  mapZodActionError,
} from "@/lib/validation/action-error";
import { updateItemSchema } from "@/lib/validation/item";
import { startSprintSchema, updateSprintSchema } from "@/lib/validation/sprint";

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

describe("mapSprintZodActionError", () => {
  const ids = {
    id: "22222222-2222-4222-8222-222222222222",
    backlogId: "11111111-1111-4111-8111-111111111111",
  };

  it("keeps planned date and capacity issues of a real update error", () => {
    const parsed = updateSprintSchema.safeParse({
      ...ids,
      plannedStartAt: "2026-10-15T07:00:00.000Z",
      plannedEndAt: "2026-10-14T16:00:00.000Z",
      capacityPoints: 1000,
    });
    if (parsed.success) throw new Error("Expected validation failure");

    expect(mapSprintZodActionError(parsed.error)).toEqual({
      error: "La capacité ne peut pas dépasser 999,99 points.",
      fieldErrors: {
        capacityPoints: ["La capacité ne peut pas dépasser 999,99 points."],
        plannedEndAt: ["La date de fin doit être postérieure à la date de début."],
      },
    });
  });

  it.each([
    [-1, "La capacité doit être positive."],
    [1.234, "La capacité accepte au maximum deux décimales."],
  ])("maps the start capacity %s and the end date of a real start error", (capacityPoints, message) => {
    const parsed = startSprintSchema.safeParse({
      ...ids,
      name: "Sprint 1",
      goal: null,
      startAt: "2026-10-15T07:00:00.000Z",
      endAt: "2026-10-15T07:00:00.000Z",
      capacityPoints,
    });
    if (parsed.success) throw new Error("Expected validation failure");

    expect(mapSprintZodActionError(parsed.error)?.fieldErrors).toEqual({
      capacityPoints: [message],
      endAt: ["La date de fin doit être postérieure à la date de début."],
    });
  });

  it("drops issues outside the sprint form fields and ignores other errors", () => {
    const parsed = updateSprintSchema.safeParse({ ...ids, id: "not-a-uuid" });
    if (parsed.success) throw new Error("Expected validation failure");

    expect(mapSprintZodActionError(parsed.error)).toEqual({
      error: "Identifiant invalide.",
      fieldErrors: {},
    });
    expect(mapSprintZodActionError(new Error("database details"))).toBeNull();
  });
});
