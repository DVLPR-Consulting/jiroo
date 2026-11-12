import { describe, expect, it } from "vitest";
import { pointsByCategory, pointsByStatusCategory, shiftStatusPoints } from "@/lib/items/status-points";

const statuses = [
  { id: "todo", category: "todo" as const },
  { id: "doing", category: "in_progress" as const },
  { id: "review", category: "in_progress" as const },
  { id: "done", category: "done" as const },
];

describe("pointsByStatusCategory", () => {
  it("returns zero for every category without items", () => {
    expect(pointsByStatusCategory([], statuses)).toEqual({ todo: 0, inProgress: 0, done: 0 });
  });

  it("sums estimates by Jira status category, merging the in-progress statuses", () => {
    expect(
      pointsByStatusCategory(
        [
          { statusId: "todo", estimatePoints: 3 },
          { statusId: "doing", estimatePoints: 2 },
          { statusId: "review", estimatePoints: 5 },
          { statusId: "done", estimatePoints: 8 },
          { statusId: "todo", estimatePoints: 1 },
        ],
        statuses,
      ),
    ).toEqual({ todo: 4, inProgress: 7, done: 8 });
  });

  it("ignores unestimated items", () => {
    expect(
      pointsByStatusCategory(
        [
          { statusId: "todo", estimatePoints: null },
          { statusId: "done", estimatePoints: 2 },
        ],
        statuses,
      ),
    ).toEqual({ todo: 0, inProgress: 0, done: 2 });
  });

  it("rounds decimal estimates to two decimals", () => {
    expect(
      pointsByStatusCategory(
        [
          { statusId: "doing", estimatePoints: 0.1 },
          { statusId: "doing", estimatePoints: 0.2 },
        ],
        statuses,
      ),
    ).toEqual({ todo: 0, inProgress: 0.3, done: 0 });
  });

  it("counts an unknown status as to do so the categories add up to the total", () => {
    expect(
      pointsByStatusCategory([{ statusId: "missing", estimatePoints: 3 }], statuses),
    ).toEqual({ todo: 3, inProgress: 0, done: 0 });
  });
});

describe("pointsByCategory", () => {
  it("sums estimates of items that carry their category, unknown ones as to do", () => {
    expect(
      pointsByCategory([
        { category: "todo", estimatePoints: 2 },
        { category: "in_progress", estimatePoints: 1.5 },
        { category: "done", estimatePoints: 3 },
        { category: null, estimatePoints: 1 },
        { category: "done", estimatePoints: null },
      ]),
    ).toEqual({ todo: 3, inProgress: 1.5, done: 3 });
  });
});

describe("shiftStatusPoints (JIR-146)", () => {
  it("adds the points of the tasks moved in and takes off those moved out, by category", () => {
    const whole = [
      { statusId: "todo", estimatePoints: 3 },
      { statusId: "doing", estimatePoints: 1.1 },
      { statusId: "review", estimatePoints: null },
    ];
    const added = [{ statusId: "done", estimatePoints: 2.2 }, { statusId: "todo", estimatePoints: 0.1 }];
    const removed = [whole[1]!];
    expect(shiftStatusPoints(pointsByStatusCategory(whole, statuses), added, removed, statuses)).toEqual(
      pointsByStatusCategory([whole[0]!, whole[2]!, ...added], statuses),
    );
  });
});
