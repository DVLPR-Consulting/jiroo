import { describe, expect, it } from "vitest";
import {
  assignSprintItemsSchema,
  completeSprintSchema,
  moveSprintItemSchema,
  startSprintSchema,
  updateSprintSchema,
} from "@/lib/validation/sprint";

const backlogId = "11111111-1111-4111-8111-111111111111";
const sprintId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";

describe("sprint validation", () => {
  it("accepts nullable, zero, integer, and decimal capacity", () => {
    for (const capacityPoints of [null, 0, 13, 21.5, 999.99]) {
      expect(
        updateSprintSchema.parse({ id: sprintId, backlogId, capacityPoints }),
      ).toMatchObject({ capacityPoints });
    }
  });

  it("accepts two-decimal capacities whose float product is not an integer (JIR-90)", () => {
    // 0.29 * 100 === 28.999999999999996 in IEEE 754 floating point.
    for (const capacityPoints of [0.29, 1.15, 4.35, 8.2, 0.57, 2.01, 999.99]) {
      expect(
        updateSprintSchema.parse({ id: sprintId, backlogId, capacityPoints }),
      ).toMatchObject({ capacityPoints });
      expect(
        startSprintSchema.safeParse({
          id: sprintId,
          backlogId,
          name: "Sprint 1",
          startAt: "2026-08-12T09:00:00.000Z",
          endAt: "2026-08-26T09:00:00.000Z",
          goal: null,
          capacityPoints,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects negative, over-precise, and oversized capacity", () => {
    for (const capacityPoints of [-1, 1.001, 1.234, 0.299, 1000, 999.991, Number.NaN]) {
      expect(
        updateSprintSchema.safeParse({ id: sprintId, backlogId, capacityPoints })
          .success,
      ).toBe(false);
    }
  });

  it("rejects a sprint ending before it starts", () => {
    expect(
      startSprintSchema.safeParse({
        id: sprintId,
        backlogId,
        name: "Sprint 1",
        startAt: "2026-08-12T09:00:00.000Z",
        endAt: "2026-08-12T08:00:00.000Z",
        goal: null,
        capacityPoints: 20,
      }).success,
    ).toBe(false);
  });

  it("requires unique task ids for a bulk sprint assignment", () => {
    expect(
      assignSprintItemsSchema.safeParse({
        backlogId,
        sprintId,
        itemIds: [itemId, itemId],
      }).success,
    ).toBe(false);
  });

  it("rejects an item used as its own drop neighbor", () => {
    expect(
      moveSprintItemSchema.safeParse({
        backlogId,
        itemId,
        sprintId,
        beforeId: itemId,
        afterId: null,
      }).success,
    ).toBe(false);
  });

  it("accepts each explicit completion destination", () => {
    expect(
      completeSprintSchema.parse({
        id: sprintId,
        backlogId,
        destination: { type: "backlog" },
      }).destination,
    ).toEqual({ type: "backlog" });

    expect(
      completeSprintSchema.parse({
        id: sprintId,
        backlogId,
        destination: { type: "existing_sprint", sprintId },
      }).destination,
    ).toEqual({ type: "existing_sprint", sprintId });

    expect(
      completeSprintSchema.parse({
        id: sprintId,
        backlogId,
        destination: { type: "new_sprint", name: "Sprint suivant" },
      }).destination,
    ).toEqual({ type: "new_sprint", name: "Sprint suivant" });
  });
});
