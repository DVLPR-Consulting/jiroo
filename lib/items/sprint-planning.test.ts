import { describe, expect, it } from "vitest";
import {
  buildSprintSections,
  calculateSprintMetrics,
  type SprintPlanningItem,
  type SprintSummary,
} from "@/lib/items/sprint-planning";

function item(
  id: string,
  overrides: Partial<SprintPlanningItem> = {},
): SprintPlanningItem {
  return {
    id,
    type: "tache",
    rank: id,
    estimatePoints: null,
    done: false,
    ...overrides,
  };
}

function sprint(
  id: string,
  state: SprintSummary["state"],
  rank: string,
  capacityPoints: number | null = null,
): SprintSummary {
  return {
    id,
    name: id,
    goal: null,
    state,
    rank,
    capacityPoints,
    plannedStartAt: null,
    plannedEndAt: null,
    startedAt: state === "planned" ? null : new Date("2026-08-05T09:00:00Z"),
    completedAt:
      state === "completed" ? new Date("2026-08-19T09:00:00Z") : null,
  };
}

describe("sprint planning", () => {
  it("calculates points, remaining work, unestimated work, and over-capacity", () => {
    expect(
      calculateSprintMetrics(
        [
          item("one", { estimatePoints: 8 }),
          item("two", { estimatePoints: 5, done: true }),
          item("three"),
        ],
        10,
      ),
    ).toEqual({
      itemCount: 3,
      estimatedPoints: 13,
      completedPoints: 5,
      remainingPoints: 8,
      unestimatedCount: 1,
      capacityPoints: 10,
      overCapacityPoints: 3,
    });
  });

  it("rounds decimal totals without floating-point artifacts", () => {
    expect(
      calculateSprintMetrics(
        [item("one", { estimatePoints: 0.1 }), item("two", { estimatePoints: 0.2 })],
        0.25,
      ),
    ).toMatchObject({
      estimatedPoints: 0.3,
      remainingPoints: 0.3,
      overCapacityPoints: 0.05,
    });
  });

  it("orders active, planned, then unscheduled work without duplicating an item", () => {
    const sprints = [
      sprint("completed", "completed", "a0"),
      sprint("future-b", "planned", "aBl"),
      sprint("active", "active", "a1", 8),
      sprint("future-a", "planned", "aBV"),
    ];
    const items = [
      item("active-item", { rank: "a0", estimatePoints: 5 }),
      item("future-a-item", { rank: "a1" }),
      item("future-b-item", { rank: "a2" }),
      item("unscheduled", { rank: "a3" }),
      item("done-unscheduled", { rank: "a4", done: true }),
      item("structure", { rank: "a5", type: "epic" }),
    ];
    const memberships = [
      { itemId: "active-item", sprintId: "active", leftAt: null },
      { itemId: "future-a-item", sprintId: "future-a", leftAt: null },
      { itemId: "future-b-item", sprintId: "future-b", leftAt: null },
      {
        itemId: "unscheduled",
        sprintId: "completed",
        leftAt: new Date("2026-08-04T09:00:00Z"),
      },
    ];

    const sections = buildSprintSections({ sprints, items, memberships });

    expect(sections.map((section) => section.id)).toEqual([
      "active",
      "future-a",
      "future-b",
      "backlog",
    ]);
    expect(
      sections.flatMap((section) => section.items.map((row) => row.id)),
    ).toEqual([
      "active-item",
      "future-a-item",
      "future-b-item",
      "unscheduled",
    ]);
    expect(sections[0]?.metrics).toMatchObject({
      itemCount: 1,
      estimatedPoints: 5,
      capacityPoints: 8,
    });
  });

  it("rejects two current sprint memberships for the same item", () => {
    expect(() =>
      buildSprintSections({
        sprints: [
          sprint("future-a", "planned", "a0"),
          sprint("future-b", "planned", "a1"),
        ],
        items: [item("duplicate")],
        memberships: [
          { itemId: "duplicate", sprintId: "future-a", leftAt: null },
          { itemId: "duplicate", sprintId: "future-b", leftAt: null },
        ],
      }),
    ).toThrow("Un item ne peut appartenir qu’à un sprint courant.");
  });
});
