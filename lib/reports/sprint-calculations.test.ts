import { describe, expect, it } from "vitest";
import {
  buildCompletedParticipantRows,
  calculateSprintScopeMetrics,
  calculatePreviousSprintsVelocity,
  calculateVelocity,
  PREVIOUS_SPRINTS_WINDOW,
} from "@/lib/reports/sprint-calculations";

describe("calculateSprintScopeMetrics", () => {
  it("keeps commitment stable while exposing gross and net scope", () => {
    expect(
      calculateSprintScopeMetrics({
        initial: [{ estimateAtStart: 5 }, { estimateAtStart: null }],
        current: [
          { estimate: 8, done: true },
          { estimate: 3, done: false },
          { estimate: null, done: false },
        ],
        events: [
          { type: "estimate_changed", previousEstimate: 5, nextEstimate: 8 },
          { type: "item_added", nextEstimate: 3 },
          { type: "item_added", nextEstimate: null },
          { type: "item_removed", previousEstimate: 3 },
        ],
      }),
    ).toEqual({
      initialItemCount: 2,
      committedPoints: 5,
      initialUnestimatedCount: 1,
      currentItemCount: 3,
      currentScopePoints: 11,
      currentUnestimatedCount: 1,
      completedItemCount: 1,
      completedPoints: 8,
      grossAddedPoints: 3,
      grossRemovedPoints: 3,
      netEstimateDelta: 3,
      scopeEventCount: 4,
    });
  });

  it("keeps repeated add/remove/re-add gross history while ignoring done events", () => {
    expect(
      calculateSprintScopeMetrics({
        initial: [],
        current: [{ estimate: 5, done: false }],
        events: [
          { type: "item_added", nextEstimate: 5 },
          { type: "item_completed" },
          { type: "item_reopened" },
          { type: "item_removed", previousEstimate: 5 },
          { type: "item_added", nextEstimate: 5 },
        ],
      }),
    ).toMatchObject({
      currentItemCount: 1,
      currentScopePoints: 5,
      completedItemCount: 0,
      grossAddedPoints: 10,
      grossRemovedPoints: 5,
      netEstimateDelta: 0,
      scopeEventCount: 3,
    });
  });

  it("normalizes nulls, negative deltas, and decimal sums", () => {
    expect(
      calculateSprintScopeMetrics({
        initial: [
          { estimateAtStart: 0.1 },
          { estimateAtStart: 0.2 },
          { estimateAtStart: null },
        ],
        current: [{ estimate: null, done: false }],
        events: [
          { type: "item_added", nextEstimate: null },
          { type: "item_removed", previousEstimate: null },
          { type: "estimate_changed", previousEstimate: 8, nextEstimate: 3 },
        ],
      }),
    ).toMatchObject({
      committedPoints: 0.3,
      initialUnestimatedCount: 1,
      currentUnestimatedCount: 1,
      grossAddedPoints: 0,
      grossRemovedPoints: 0,
      netEstimateDelta: -5,
      scopeEventCount: 3,
    });
  });
});

describe("buildCompletedParticipantRows", () => {
  const startedAt = new Date("2026-08-01T09:00:00.000Z");
  const completedAt = new Date("2026-08-15T09:00:00.000Z");

  it("deduplicates re-entry by stable key and preserves initial commitment", () => {
    const firstJoinedAt = new Date("2026-07-30T09:00:00.000Z");
    const removedAt = new Date("2026-08-05T09:00:00.000Z");
    const rejoinedAt = new Date("2026-08-07T09:00:00.000Z");

    expect(
      buildCompletedParticipantRows({
        startedAt,
        completedAt,
        participants: [
          {
            membershipId: "membership-1",
            itemKey: "CASS-42",
            joinedAt: firstJoinedAt,
            leftAt: removedAt,
            estimateAtJoin: 3,
            estimateAtStart: 3,
            doneAtStart: true,
            currentEstimate: 5,
            completionOutcome: "completed",
          },
          {
            membershipId: "membership-2",
            itemKey: "CASS-42",
            joinedAt: rejoinedAt,
            leftAt: null,
            estimateAtJoin: 5,
            estimateAtStart: null,
            doneAtStart: false,
            currentEstimate: 5,
            completionOutcome: "completed",
          },
        ],
        events: [
          {
            type: "item_removed",
            membershipId: "membership-1",
            itemKey: "CASS-42",
            occurredAt: removedAt,
            previousEstimate: 3,
          },
          {
            type: "item_added",
            membershipId: "membership-2",
            itemKey: "CASS-42",
            occurredAt: rejoinedAt,
            nextEstimate: 5,
          },
        ],
      }),
    ).toEqual([
      {
        itemKey: "CASS-42",
        firstJoinedAt,
        finalLeftAt: completedAt,
        initialCommitment: true,
        addedAfterStart: true,
        removedAfterStart: true,
        estimateAtStart: 3,
        doneAtStart: true,
        estimateAtFinalParticipation: 5,
        estimateAtCompletion: 5,
        finalOutcome: "completed",
      },
    ]);
  });

  it("uses the removal-side estimate for a final removed interval", () => {
    const joinedAt = new Date("2026-08-03T09:00:00.000Z");
    const leftAt = new Date("2026-08-10T09:00:00.000Z");
    expect(
      buildCompletedParticipantRows({
        startedAt,
        completedAt,
        participants: [
          {
            membershipId: "membership-removed",
            itemKey: "CASS-99",
            joinedAt,
            leftAt,
            estimateAtJoin: null,
            estimateAtStart: null,
            doneAtStart: false,
            currentEstimate: 13,
            completionOutcome: "carried_to_backlog",
          },
        ],
        events: [
          {
            type: "item_added",
            membershipId: "membership-removed",
            itemKey: "CASS-99",
            occurredAt: joinedAt,
            nextEstimate: null,
          },
          {
            type: "item_removed",
            membershipId: "membership-removed",
            itemKey: "CASS-99",
            occurredAt: leftAt,
            previousEstimate: 8,
          },
        ],
      }),
    ).toEqual([
      {
        itemKey: "CASS-99",
        firstJoinedAt: joinedAt,
        finalLeftAt: leftAt,
        initialCommitment: false,
        addedAfterStart: true,
        removedAfterStart: true,
        estimateAtStart: null,
        doneAtStart: null,
        estimateAtFinalParticipation: 8,
        estimateAtCompletion: null,
        finalOutcome: "removed",
      },
    ]);
  });

  it("keeps an initially unestimated item in the commitment", () => {
    const joinedAt = new Date("2026-07-31T09:00:00.000Z");
    expect(
      buildCompletedParticipantRows({
        startedAt,
        completedAt,
        participants: [
          {
            membershipId: "membership-unestimated",
            itemKey: "CASS-7",
            joinedAt,
            leftAt: null,
            estimateAtJoin: null,
            estimateAtStart: null,
            doneAtStart: false,
            currentEstimate: null,
            completionOutcome: "carried_to_backlog",
          },
        ],
        events: [],
      }),
    ).toEqual([
      expect.objectContaining({
        itemKey: "CASS-7",
        initialCommitment: true,
        estimateAtStart: null,
        estimateAtFinalParticipation: null,
        estimateAtCompletion: null,
        finalOutcome: "carried_to_backlog",
      }),
    ]);
  });

  it("ignores planning-only intervals when reassigned before a backdated start", () => {
    const planningJoinedAt = new Date("2026-08-02T08:00:00.000Z");
    const planningLeftAt = new Date("2026-08-02T09:00:00.000Z");
    const committedJoinedAt = new Date("2026-08-02T10:00:00.000Z");

    expect(
      buildCompletedParticipantRows({
        startedAt,
        completedAt,
        participants: [
          {
            membershipId: "planning-only",
            itemKey: "CASS-8",
            joinedAt: planningJoinedAt,
            leftAt: planningLeftAt,
            estimateAtJoin: null,
            estimateAtStart: null,
            doneAtStart: null,
            currentEstimate: null,
            completionOutcome: "carried_to_backlog",
          },
          {
            membershipId: "initial-commitment",
            itemKey: "CASS-8",
            joinedAt: committedJoinedAt,
            leftAt: null,
            estimateAtJoin: null,
            estimateAtStart: null,
            doneAtStart: false,
            currentEstimate: null,
            completionOutcome: "carried_to_backlog",
          },
        ],
        events: [],
      }),
    ).toEqual([
      expect.objectContaining({
        itemKey: "CASS-8",
        firstJoinedAt: committedJoinedAt,
        initialCommitment: true,
      }),
    ]);
  });

  it("omits an item removed during planning with no active-sprint interval", () => {
    expect(
      buildCompletedParticipantRows({
        startedAt,
        completedAt,
        participants: [
          {
            membershipId: "planning-only",
            itemKey: "CASS-9",
            joinedAt: new Date("2026-08-02T08:00:00.000Z"),
            leftAt: new Date("2026-08-02T09:00:00.000Z"),
            estimateAtJoin: 3,
            estimateAtStart: null,
            doneAtStart: false,
            currentEstimate: 3,
            completionOutcome: "carried_to_backlog",
          },
        ],
        events: [],
      }),
    ).toEqual([]);
  });

  it("trusts sprint-scoped events even before the selected start timestamp", () => {
    const eventAt = new Date("2026-07-31T09:00:00.000Z");
    const removedAt = new Date("2026-07-31T10:00:00.000Z");
    expect(
      buildCompletedParticipantRows({
        startedAt,
        completedAt,
        participants: [
          {
            membershipId: "added-open",
            itemKey: "CASS-10",
            joinedAt: eventAt,
            leftAt: null,
            estimateAtJoin: 3,
            estimateAtStart: null,
            doneAtStart: false,
            currentEstimate: 3,
            completionOutcome: "carried_to_backlog",
          },
          {
            membershipId: "added-removed",
            itemKey: "CASS-11",
            joinedAt: eventAt,
            leftAt: removedAt,
            estimateAtJoin: 2,
            estimateAtStart: null,
            doneAtStart: false,
            currentEstimate: 2,
            completionOutcome: "carried_to_backlog",
          },
        ],
        events: [
          {
            type: "item_added",
            membershipId: "added-open",
            itemKey: "CASS-10",
            occurredAt: eventAt,
            nextEstimate: 3,
          },
          {
            type: "item_added",
            membershipId: "added-removed",
            itemKey: "CASS-11",
            occurredAt: eventAt,
            nextEstimate: 2,
          },
          {
            type: "item_removed",
            membershipId: "added-removed",
            itemKey: "CASS-11",
            occurredAt: removedAt,
            previousEstimate: 2,
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        itemKey: "CASS-10",
        initialCommitment: false,
        addedAfterStart: true,
        removedAfterStart: false,
      }),
      expect.objectContaining({
        itemKey: "CASS-11",
        initialCommitment: false,
        addedAfterStart: true,
        removedAfterStart: true,
        finalOutcome: "removed",
      }),
    ]);
  });

  it("keeps retained initial intervals committed when removed before a future start", () => {
    const removedAt = new Date("2026-07-31T10:00:00.000Z");
    expect(
      buildCompletedParticipantRows({
        startedAt,
        completedAt,
        participants: [
          {
            membershipId: "initial-estimated",
            itemKey: "CASS-12",
            joinedAt: new Date("2026-07-30T09:00:00.000Z"),
            leftAt: removedAt,
            estimateAtJoin: 4,
            estimateAtStart: 4,
            doneAtStart: false,
            currentEstimate: 4,
            completionOutcome: "carried_to_backlog",
          },
          {
            membershipId: "initial-unestimated",
            itemKey: "CASS-13",
            joinedAt: new Date("2026-07-30T10:00:00.000Z"),
            leftAt: removedAt,
            estimateAtJoin: null,
            estimateAtStart: null,
            doneAtStart: false,
            currentEstimate: null,
            completionOutcome: "carried_to_backlog",
          },
        ],
        events: [
          {
            type: "item_removed",
            membershipId: "initial-estimated",
            itemKey: "CASS-12",
            occurredAt: removedAt,
            previousEstimate: 4,
          },
          {
            type: "item_removed",
            membershipId: "initial-unestimated",
            itemKey: "CASS-13",
            occurredAt: removedAt,
            previousEstimate: null,
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        itemKey: "CASS-12",
        initialCommitment: true,
        estimateAtStart: 4,
      }),
      expect.objectContaining({
        itemKey: "CASS-13",
        initialCommitment: true,
        estimateAtStart: null,
      }),
    ]);
  });
});

describe("calculateVelocity", () => {
  it("includes positive commitment with zero completion and excludes zero/zero and legacy", () => {
    expect(
      calculateVelocity([
        { hasSnapshot: true, committedPoints: 10, completedPoints: 0 },
        { hasSnapshot: true, committedPoints: 0, completedPoints: 0 },
        { hasSnapshot: true, committedPoints: 8, completedPoints: 5 },
        { hasSnapshot: false, committedPoints: null, completedPoints: null },
      ]),
    ).toEqual({ population: 2, averageCompletedPoints: 2.5 });
  });

  it("returns no average when no completed snapshot qualifies", () => {
    expect(
      calculateVelocity([
        { hasSnapshot: true, committedPoints: 0, completedPoints: 0 },
        { hasSnapshot: false, committedPoints: 8, completedPoints: 5 },
      ]),
    ).toEqual({ population: 0, averageCompletedPoints: null });
  });
});

describe("calculatePreviousSprintsVelocity", () => {
  const sprint = (sprintId: string, completedPoints: number | null, extra: Partial<{
    hasSnapshot: boolean;
    committedPoints: number | null;
  }> = {}) => ({
    sprintId,
    hasSnapshot: extra.hasSnapshot ?? true,
    committedPoints: extra.committedPoints === undefined ? 10 : extra.committedPoints,
    completedPoints,
  });

  it("averages the five most recent completed sprints for a sprint not yet completed", () => {
    expect(PREVIOUS_SPRINTS_WINDOW).toBe(5);
    expect(
      calculatePreviousSprintsVelocity(
        [sprint("s7", 7), sprint("s6", 6), sprint("s5", 5), sprint("s4", 4), sprint("s3", 3), sprint("s2", 2)],
        null,
      ),
    ).toEqual({ population: 5, averageCompletedPoints: 5 });
  });

  it("excludes the considered sprint and every sprint completed after it", () => {
    expect(
      calculatePreviousSprintsVelocity(
        [
          sprint("newer", 100),
          sprint("self", 50),
          sprint("p5", 5),
          sprint("p4", 4),
          sprint("p3", 3),
          sprint("p2", 2),
          sprint("p1", 1),
          sprint("older", 100),
        ],
        "self",
      ),
    ).toEqual({ population: 5, averageCompletedPoints: 3 });
  });

  it("applies the velocity inclusion rules inside the five-sprint window", () => {
    expect(
      calculatePreviousSprintsVelocity(
        [
          sprint("self", 50),
          sprint("p5", 6),
          sprint("zero", 0, { committedPoints: 0 }),
          sprint("legacy", null, { hasSnapshot: false, committedPoints: null }),
          sprint("p2", 2),
          sprint("p1", 0, { committedPoints: 4 }),
          sprint("outside", 100),
        ],
        "self",
      ),
    ).toEqual({ population: 3, averageCompletedPoints: 2.67 });
  });

  it("uses fewer than five sprints when history is short, and none when there is no previous sprint", () => {
    expect(
      calculatePreviousSprintsVelocity([sprint("p2", 3), sprint("p1", 4)], null),
    ).toEqual({ population: 2, averageCompletedPoints: 3.5 });
    expect(
      calculatePreviousSprintsVelocity([sprint("self", 8)], "self"),
    ).toEqual({ population: 0, averageCompletedPoints: null });
    expect(calculatePreviousSprintsVelocity([], null))
      .toEqual({ population: 0, averageCompletedPoints: null });
  });
});
