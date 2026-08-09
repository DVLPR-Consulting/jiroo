import { describe, expect, it } from "vitest";
import {
  calculateBurndown,
  calculatePlanningComparison,
  InconsistentBurndownError,
  projectBurndownPoints,
  type BurndownEvent,
  type BurndownInput,
  type BurndownPoint,
} from "@/lib/reports/burndown-calculations";

const startedAt = new Date("2026-08-10T09:00:00.000Z");
const targetEndAt = new Date("2026-08-20T09:00:00.000Z");
const observedAt = new Date("2026-08-15T09:00:00.000Z");

function event<T extends BurndownEvent>(value: T): T {
  return value;
}

function add(
  itemKey: string,
  sequence: bigint,
  occurredAt: string,
  nextEstimate: number | null,
  nextDone = false,
): BurndownEvent {
  return event({
    type: "item_added",
    itemId: `item-${itemKey}`,
    itemKey,
    itemTitle: itemKey,
    sequence,
    occurredAt: new Date(occurredAt),
    nextEstimate,
    nextDone,
  });
}

function estimate(
  itemKey: string,
  sequence: bigint,
  occurredAt: string,
  previousEstimate: number | null,
  nextEstimate: number | null,
): BurndownEvent {
  return event({
    type: "estimate_changed",
    itemId: `item-${itemKey}`,
    itemKey,
    itemTitle: itemKey,
    sequence,
    occurredAt: new Date(occurredAt),
    previousEstimate,
    nextEstimate,
  });
}

function complete(itemKey: string, sequence: bigint, occurredAt: string): BurndownEvent {
  return event({
    type: "item_completed",
    itemId: `item-${itemKey}`,
    itemKey,
    itemTitle: itemKey,
    sequence,
    occurredAt: new Date(occurredAt),
  });
}

function reopen(itemKey: string, sequence: bigint, occurredAt: string): BurndownEvent {
  return event({
    type: "item_reopened",
    itemId: `item-${itemKey}`,
    itemKey,
    itemTitle: itemKey,
    sequence,
    occurredAt: new Date(occurredAt),
  });
}

function remove(
  itemKey: string,
  sequence: bigint,
  occurredAt: string,
  previousEstimate: number | null,
): BurndownEvent {
  return event({
    type: "item_removed",
    itemId: `item-${itemKey}`,
    itemKey,
    itemTitle: itemKey,
    sequence,
    occurredAt: new Date(occurredAt),
    previousEstimate,
  });
}

function input(overrides: Partial<BurndownInput> = {}): BurndownInput {
  return {
    startedAt,
    targetEndAt,
    completedAt: null,
    observedAt,
    initial: [{ itemId: "item-1", itemKey: "CASS-1", itemTitle: "API", estimate: 8, done: false }],
    events: [],
    ...overrides,
  };
}

describe("calculateBurndown", () => {
  it("replays immutable facts into one exact point per event", () => {
    const result = calculateBurndown(input({
      initial: [
        { itemId: "item-1", itemKey: "CASS-1", itemTitle: "API", estimate: 8, done: false },
        { itemId: "item-2", itemKey: "CASS-2", itemTitle: "UI", estimate: 3, done: true },
        { itemId: "item-3", itemKey: "CASS-3", itemTitle: "Docs", estimate: null, done: false },
      ],
      events: [
        add("CASS-4", BigInt(1), "2026-08-11T09:00:00.000Z", 5),
        estimate("CASS-1", BigInt(2), "2026-08-12T09:00:00.000Z", 8, 13),
        complete("CASS-1", BigInt(3), "2026-08-13T09:00:00.000Z"),
        reopen("CASS-1", BigInt(4), "2026-08-14T09:00:00.000Z"),
        remove("CASS-4", BigInt(5), "2026-08-15T09:00:00.000Z", 5),
      ],
    }));

    expect(result.exactPoints.map((point) => point.remainingPoints)).toEqual([8, 13, 18, 5, 18, 13]);
    expect(result.exactPoints.map((point) => point.unestimatedCount)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(result.summary).toEqual({ initialRemainingPoints: 8, remainingPoints: 13, completedPoints: 3, unestimatedCount: 1 });
  });

  it("counts an already-completed addition as no remaining work", () => {
    const result = calculateBurndown(input({ events: [add("CASS-2", BigInt(1), "2026-08-11T09:00:00.000Z", 5, true)] }));
    expect(result.exactPoints.at(-1)).toMatchObject({ remainingPoints: 8, deltaPoints: 0, cause: "item_added", itemKey: "CASS-2" });
  });

  it("does not count completed null-estimate work as unestimated", () => {
    const baseline = calculateBurndown(input({
      initial: [{ itemId: "item-1", itemKey: "CASS-1", itemTitle: "API", estimate: null, done: true }],
    }));
    const addition = calculateBurndown(input({
      events: [add("CASS-2", BigInt(1), "2026-08-11T09:00:00.000Z", null, true)],
    }));

    expect(baseline.exactPoints[0]).toMatchObject({ remainingPoints: 0, unestimatedCount: 0 });
    expect(baseline.summary.unestimatedCount).toBe(0);
    expect(addition.exactPoints.at(-1)).toMatchObject({ remainingPoints: 8, unestimatedCount: 0 });
    expect(addition.summary.unestimatedCount).toBe(0);
  });

  it("does not alter remaining work when an estimate changes while done", () => {
    const result = calculateBurndown(input({
      initial: [{ itemId: "item-1", itemKey: "CASS-1", itemTitle: "API", estimate: 8, done: true }],
      events: [estimate("CASS-1", BigInt(1), "2026-08-11T09:00:00.000Z", 8, 13)],
    }));
    expect(result.exactPoints.map((point) => [point.remainingPoints, point.deltaPoints])).toEqual([[0, 0], [0, 0]]);
  });

  it("handles null estimate transitions", () => {
    const result = calculateBurndown(input({
      initial: [{ itemId: "item-1", itemKey: "CASS-1", itemTitle: "API", estimate: null, done: false }],
      events: [
        estimate("CASS-1", BigInt(1), "2026-08-11T09:00:00.000Z", null, 3),
        estimate("CASS-1", BigInt(2), "2026-08-12T09:00:00.000Z", 3, null),
      ],
    }));
    expect(result.exactPoints.map((point) => [point.remainingPoints, point.unestimatedCount])).toEqual([[0, 1], [3, 0], [0, 1]]);
  });

  it("restores the current estimate when a completed item is reopened", () => {
    const result = calculateBurndown(input({ events: [complete("CASS-1", BigInt(1), "2026-08-11T09:00:00.000Z"), reopen("CASS-1", BigInt(2), "2026-08-12T09:00:00.000Z")] }));
    expect(result.exactPoints.map((point) => point.remainingPoints)).toEqual([8, 0, 8]);
  });

  it("allows a stable key to be removed and added again", () => {
    const result = calculateBurndown(input({ events: [remove("CASS-1", BigInt(1), "2026-08-11T09:00:00.000Z", 8), add("CASS-1", BigInt(2), "2026-08-12T09:00:00.000Z", 3)] }));
    expect(result.exactPoints.map((point) => point.remainingPoints)).toEqual([8, 0, 3]);
  });

  it("orders equal timestamps by sequence without changing caller events", () => {
    const first = estimate("CASS-1", BigInt(2), "2026-08-11T09:00:00.000Z", 3, 5);
    const second = estimate("CASS-1", BigInt(1), "2026-08-11T09:00:00.000Z", 8, 3);
    const events = [first, second];
    const result = calculateBurndown(input({ events }));
    expect(result.exactPoints.map((point) => point.remainingPoints)).toEqual([8, 3, 5]);
    expect(result.displayPoints
      .filter((point) => point.occurredAt.toISOString() === "2026-08-11T09:00:00.000Z")
      .map((point) => point.remainingPoints)).toEqual([3, 5]);
    expect(events).toEqual([first, second]);
  });

  it("rejects contradictory histories and invalid numeric or date state", () => {
    const invalids: BurndownInput[] = [
      input({ events: [estimate("CASS-1", BigInt(1), "2026-08-11T09:00:00.000Z", 7, 3)] }),
      input({ events: [add("CASS-1", BigInt(1), "2026-08-11T09:00:00.000Z", 3)] }),
      input({ initial: [{ itemId: "item-1", itemKey: "CASS-1", itemTitle: "API", estimate: -1, done: false }] }),
      input({ events: [add("CASS-2", BigInt(1), "invalid", 3)] }),
      input({ completedAt: new Date("2026-08-09T09:00:00.000Z") }),
    ];
    for (const invalid of invalids) expect(() => calculateBurndown(invalid)).toThrow(InconsistentBurndownError);
  });

  it("rejects events outside the observed history and malformed replay ordering", () => {
    const malformedSequence = add("CASS-2", BigInt(1), "2026-08-11T09:00:00.000Z", 3);
    (malformedSequence as unknown as { sequence: unknown }).sequence = "not-a-bigint";
    const invalids: BurndownInput[] = [
      input({ events: [add("CASS-2", BigInt(1), "2026-08-09T09:00:00.000Z", 3)] }),
      input({ events: [add("CASS-2", BigInt(1), "2026-08-16T09:00:00.000Z", 3)] }),
      input({ completedAt: new Date("2026-08-14T09:00:00.000Z"), events: [complete("CASS-1", BigInt(1), "2026-08-15T09:00:00.000Z")] }),
      input({ events: [malformedSequence] }),
      input({ events: [
        add("CASS-2", BigInt(1), "2026-08-11T09:00:00.000Z", 3),
        add("CASS-3", BigInt(1), "2026-08-11T09:00:00.000Z", 3),
      ] }),
    ];
    for (const invalid of invalids) expect(() => calculateBurndown(invalid)).toThrow(InconsistentBurndownError);
  });

  it("rejects finite item estimates whose aggregate would overflow", () => {
    expect(() => calculateBurndown(input({
      initial: [
        { itemId: "item-1", itemKey: "CASS-1", itemTitle: "One", estimate: Number.MAX_VALUE, done: false },
        { itemId: "item-2", itemKey: "CASS-2", itemTitle: "Two", estimate: Number.MAX_VALUE, done: false },
      ],
    }))).toThrow(InconsistentBurndownError);
  });

  it("samples UTC calendar days across DST and month boundaries", () => {
    const result = calculateBurndown(input({
      startedAt: new Date("2026-10-30T23:00:00.000Z"),
      targetEndAt: new Date("2026-11-02T23:00:00.000Z"),
      observedAt: new Date("2026-11-02T23:00:00.000Z"),
    }));
    expect(result.displayPoints.map((point) => point.occurredAt.toISOString())).toEqual([
      "2026-10-30T23:00:00.000Z",
      "2026-10-31T00:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
      "2026-11-02T00:00:00.000Z",
      "2026-11-02T23:00:00.000Z",
    ]);
  });

  it("creates an unrebasable ideal guideline and active factual labels", () => {
    const result = calculateBurndown(input({ events: [add("CASS-2", BigInt(1), "2026-08-11T09:00:00.000Z", 5)] }));
    expect(result.guideline).toEqual({
      state: "available",
      points: [
        { occurredAt: startedAt, remainingPoints: 8 },
        { occurredAt: observedAt, remainingPoints: 4 },
        { occurredAt: targetEndAt, remainingPoints: 0 },
      ],
    });
    expect(result.trajectory).toEqual({ label: "Au-dessus de la trajectoire idéale", insufficientReason: null });
  });

  it("labels an active curve at or below its ideal as on trajectory", () => {
    const result = calculateBurndown(input({
      events: [complete("CASS-1", BigInt(1), "2026-08-11T09:00:00.000Z")],
    }));
    expect(result.trajectory).toEqual({ label: "Sur la trajectoire idéale", insufficientReason: null });
  });

  it("uses completed outcomes exactly at completion", () => {
    expect(calculateBurndown(input({ completedAt: observedAt, events: [complete("CASS-1", BigInt(1), "2026-08-15T09:00:00.000Z")] })).trajectory)
      .toEqual({ label: "Objectif atteint", insufficientReason: null });
    expect(calculateBurndown(input({ completedAt: observedAt })).trajectory)
      .toEqual({ label: "Travail restant à la clôture", insufficientReason: null });
  });

  it.each([
    [input({ targetEndAt: null }), "missing_target"],
    [input({ targetEndAt: startedAt }), "invalid_dates"],
    [input({ initial: [{ itemId: "item-1", itemKey: "CASS-1", itemTitle: "API", estimate: null, done: false }] }), "no_estimated_initial_work"],
    [input({ observedAt: startedAt }), "just_started"],
    [input({ legacyHistory: true } as Partial<BurndownInput>), "legacy_history"],
  ] as const)("returns factual insufficient reason %s", (value, insufficientReason) => {
    expect(calculateBurndown(value).trajectory).toEqual({ label: "Données insuffisantes", insufficientReason });
  });
});

describe("projectBurndownPoints", () => {
  it("caps display points while preserving endpoints and bucket extrema", () => {
    const points: BurndownPoint[] = Array.from({ length: 1_000 }, (_, index) => ({
      occurredAt: new Date(1_700_000_000_000 + index),
      sequence: BigInt(index),
      remainingPoints: index === 10 ? -100 : index === 11 ? 10_000 : index,
      unestimatedCount: 0,
      deltaPoints: 0,
      itemId: null,
      itemKey: `CASS-${index}`,
      itemTitle: "Point",
      cause: "item_added",
    }));
    const projection = projectBurndownPoints(points, 600);
    expect(projection).toHaveLength(600);
    expect(projection[0]).toBe(points[0]);
    expect(projection.at(-1)).toBe(points.at(-1));
    expect(projection).toContain(points[10]);
    expect(projection).toContain(points[11]);
    expect(points).toHaveLength(1_000);
  });

  it("preserves first and last points for odd and tiny valid caps", () => {
    const points: BurndownPoint[] = Array.from({ length: 7 }, (_, index) => ({
      occurredAt: new Date(1_700_000_000_000 + index),
      sequence: BigInt(index),
      remainingPoints: index,
      unestimatedCount: 0,
      deltaPoints: 0,
      itemId: null,
      itemKey: `CASS-${index}`,
      itemTitle: "Point",
      cause: "item_added",
    }));
    for (const maximum of [2, 3, 5]) {
      const projection = projectBurndownPoints(points, maximum);
      expect(projection.length).toBeLessThanOrEqual(maximum);
      expect(projection[0]).toBe(points[0]);
      expect(projection.at(-1)).toBe(points.at(-1));
    }
    expect(() => projectBurndownPoints(points, 1)).toThrow(InconsistentBurndownError);
    expect(() => projectBurndownPoints(points, 2, [3])).toThrow(InconsistentBurndownError);
  });

  it("keeps both extrema when mandatory samples leave an odd extrema budget", () => {
    const points: BurndownPoint[] = Array.from({ length: 8 }, (_, index) => ({
      occurredAt: new Date(1_700_000_000_000 + index),
      sequence: BigInt(index),
      remainingPoints: [0, 0, -5, 1, 0, 10, 100, 0][index]!,
      unestimatedCount: 0,
      deltaPoints: 0,
      itemId: null,
      itemKey: `CASS-${index}`,
      itemTitle: "Point",
      cause: "item_added",
    }));
    const projection = projectBurndownPoints(points, 6, [4]);
    expect(projection.length).toBeLessThanOrEqual(6);
    expect(projection).toContain(points[0]);
    expect(projection).toContain(points[4]);
    expect(projection).toContain(points[6]);
    expect(projection).toContain(points[7]);
  });

  it("rejects an invalid projection cap", () => {
    const point: BurndownPoint = {
      occurredAt: startedAt,
      sequence: null,
      remainingPoints: 0,
      unestimatedCount: 0,
      deltaPoints: 0,
      itemId: null,
      itemKey: null,
      itemTitle: null,
      cause: "start",
    };
    expect(() => projectBurndownPoints([point], 0)).toThrow(RangeError);
    expect(() => projectBurndownPoints([point], 1.5)).toThrow(RangeError);
  });
});

describe("calculateBurndown display boundaries", () => {
  it("keeps observation and target samples in a dense projected series", () => {
    const events = Array.from({ length: 700 }, (_, index) => estimate(
      "CASS-1",
      BigInt(index + 1),
      new Date(startedAt.getTime() + (index + 1) * 1_000).toISOString(),
      index % 2 === 0 ? 8 : 9,
      index % 2 === 0 ? 9 : 8,
    ));
    const result = calculateBurndown(input({ events }));
    const times = result.displayPoints.map((point) => point.occurredAt.getTime());

    expect(result.displayPoints.length).toBeLessThanOrEqual(600);
    expect(times).toContain(observedAt.getTime());
    expect(times).toContain(targetEndAt.getTime());
    expect(result.displayPoints[0]!.occurredAt).toEqual(startedAt);
    expect(result.displayPoints.at(-1)!.occurredAt).toEqual(targetEndAt);
  });
});

describe("calculatePlanningComparison", () => {
  it("keeps planning velocity separate and reports no population as unavailable", () => {
    expect(calculatePlanningComparison(8.456, { averageCompletedPoints: 6.666, population: 3 }))
      .toEqual({ state: "ready", commitmentPoints: 8.46, averageCompletedPoints: 6.67, population: 3, difference: 1.79 });
    expect(calculatePlanningComparison(8.456, { averageCompletedPoints: null, population: 0 }))
      .toEqual({ state: "unavailable", commitmentPoints: 8.46, averageCompletedPoints: null, population: 0, difference: null });
  });

  it("rejects invalid planning numerics", () => {
    const invalids: Array<[number, { averageCompletedPoints: number | null; population: number }]> = [
      [-1, { averageCompletedPoints: null, population: 0 }],
      [Number.NaN, { averageCompletedPoints: null, population: 0 }],
      [Number.POSITIVE_INFINITY, { averageCompletedPoints: null, population: 0 }],
      [8, { averageCompletedPoints: -1, population: 1 }],
      [8, { averageCompletedPoints: Number.NaN, population: 1 }],
      [8, { averageCompletedPoints: Number.POSITIVE_INFINITY, population: 1 }],
      [8, { averageCompletedPoints: null, population: -1 }],
      [8, { averageCompletedPoints: null, population: Number.NaN }],
      [8, { averageCompletedPoints: null, population: Number.POSITIVE_INFINITY }],
      [8, { averageCompletedPoints: null, population: 1.5 }],
    ];
    for (const [commitment, velocity] of invalids) {
      expect(() => calculatePlanningComparison(commitment, velocity)).toThrow(InconsistentBurndownError);
    }
  });
});
