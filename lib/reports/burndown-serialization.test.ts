import { describe, expect, it } from "vitest";
import { serializeBurndownReport } from "@/lib/reports/burndown-serialization";
import type { BurndownPoint } from "@/lib/reports/burndown-calculations";
import type { BurndownReport } from "@/lib/services/sprint-burndown";

const sprint = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sprint R4",
  goal: "Stabiliser la recherche",
  plannedStartAt: new Date("2026-08-03T09:00:00.000Z"),
  plannedEndAt: new Date("2026-08-17T09:00:00.000Z"),
  startedAt: new Date("2026-08-03T09:00:00.000Z"),
  completedAt: null,
};

const baseline: BurndownPoint = {
  occurredAt: new Date("2026-08-03T09:00:00.000Z"),
  sequence: null,
  remainingPoints: 13,
  unestimatedCount: 1,
  deltaPoints: 0,
  itemId: null,
  itemKey: null,
  itemTitle: null,
  cause: "start",
};

const added: BurndownPoint = {
  occurredAt: new Date("2026-08-04T10:00:00.000Z"),
  sequence: BigInt("9007199254740993"),
  remainingPoints: 16,
  unestimatedCount: 1,
  deltaPoints: 3,
  itemId: "item-4",
  itemKey: "CASS-4",
  itemTitle: "Filtre par chambre",
  cause: "item_added",
};

const active: BurndownReport = {
  kind: "active",
  sprint,
  summary: {
    initialRemainingPoints: 13,
    remainingPoints: 16,
    completedPoints: 0,
    unestimatedCount: 1,
  },
  trajectory: { label: "Au-dessus de la trajectoire idéale", insufficientReason: null },
  planningComparison: {
    state: "ready",
    commitmentPoints: 13,
    averageCompletedPoints: 10,
    population: 3,
    difference: 3,
  },
  guideline: {
    state: "available",
    points: [
      { occurredAt: new Date("2026-08-03T09:00:00.000Z"), remainingPoints: 13 },
      { occurredAt: new Date("2026-08-17T09:00:00.000Z"), remainingPoints: 0 },
    ],
  },
  displayPoints: [baseline, added],
  baseline,
  eventPoints: { page: 1, pageSize: 50, total: 1, rows: [added] },
  events: {
    page: 1,
    pageSize: 50,
    total: 1,
    rows: [{
      id: "event-1",
      sequence: BigInt("9007199254740993"),
      eventType: "item_added",
      occurredAt: new Date("2026-08-04T10:00:00.000Z"),
      actor: { id: "actor-1", name: "Ada" },
      itemId: "item-4",
      itemKey: "CASS-4",
      itemTitle: "Filtre par chambre",
      previousEstimate: null,
      nextEstimate: 3,
      previousDone: null,
      nextDone: false,
      relatedSprint: null,
      removalReason: null,
    }],
  },
};

describe("serializeBurndownReport", () => {
  it("turns every date and bigint of a detailed report into strings", () => {
    const serialized = serializeBurndownReport(active);

    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
    expect(serialized).toMatchObject({
      kind: "active",
      statusLabel: "Données en cours",
      sprint: {
        startedAt: "2026-08-03T09:00:00.000Z",
        plannedEndAt: "2026-08-17T09:00:00.000Z",
        completedAt: null,
      },
      baseline: { occurredAt: "2026-08-03T09:00:00.000Z", sequence: null },
      guideline: {
        state: "available",
        points: [
          { occurredAt: "2026-08-03T09:00:00.000Z", remainingPoints: 13 },
          { occurredAt: "2026-08-17T09:00:00.000Z", remainingPoints: 0 },
        ],
      },
      planningComparison: { state: "ready", difference: 3 },
    });
    expect(serialized.kind === "active" && serialized.eventPoints.rows[0]).toEqual({
      occurredAt: "2026-08-04T10:00:00.000Z",
      sequence: "9007199254740993",
      remainingPoints: 16,
      unestimatedCount: 1,
      deltaPoints: 3,
      itemId: "item-4",
      itemKey: "CASS-4",
      itemTitle: "Filtre par chambre",
      cause: "item_added",
    });
    expect(serialized.kind === "active" && serialized.events.rows[0]).toMatchObject({
      sequence: "9007199254740993",
      occurredAt: "2026-08-04T10:00:00.000Z",
    });
  });

  it("labels completed reports as frozen and keeps unavailable guideline reasons", () => {
    const serialized = serializeBurndownReport({
      ...active,
      kind: "completed",
      sprint: { ...sprint, plannedEndAt: null, completedAt: new Date("2026-08-16T17:00:00.000Z") },
      trajectory: { label: "Travail restant à la clôture", insufficientReason: null },
      guideline: { state: "unavailable", reason: "missing_target" },
    });

    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
    expect(serialized).toMatchObject({
      kind: "completed",
      statusLabel: "Historique figé",
      sprint: { plannedEndAt: null, completedAt: "2026-08-16T17:00:00.000Z" },
      guideline: { state: "unavailable", reason: "missing_target" },
    });
  });

  it("keeps legacy identity without inventing totals", () => {
    const serialized = serializeBurndownReport({
      kind: "legacy_unavailable",
      reason: "legacy_history",
      sprint: { ...sprint, completedAt: new Date("2026-08-16T17:00:00.000Z") },
    });

    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
    expect(serialized).toEqual({
      kind: "legacy_unavailable",
      statusLabel: "Historique burndown indisponible",
      reason: "legacy_history",
      sprint: {
        id: sprint.id,
        name: "Sprint R4",
        goal: "Stabiliser la recherche",
        plannedStartAt: "2026-08-03T09:00:00.000Z",
        plannedEndAt: "2026-08-17T09:00:00.000Z",
        startedAt: "2026-08-03T09:00:00.000Z",
        completedAt: "2026-08-16T17:00:00.000Z",
      },
    });
  });
});
