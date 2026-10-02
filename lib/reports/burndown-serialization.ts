import type {
  BurndownCalculation,
  BurndownInsufficientReason,
  BurndownPoint,
  PlanningComparison,
} from "@/lib/reports/burndown-calculations";
import type {
  BurndownReport,
  BurndownSprintIdentity,
  DetailedBurndownReport,
} from "@/lib/services/sprint-burndown";
import type { SprintReportEvent } from "@/lib/services/sprint-reports";

/** Component DTO: dates are ISO strings and bigint sequences decimal strings. */
export type SerializableBurndownSprint = {
  id: string;
  name: string;
  goal: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type SerializableBurndownPoint = Omit<BurndownPoint, "occurredAt" | "sequence"> & {
  occurredAt: string;
  sequence: string | null;
};

export type SerializableBurndownGuideline =
  | { state: "available"; points: { occurredAt: string; remainingPoints: number }[] }
  | { state: "unavailable"; reason: BurndownInsufficientReason };

export type SerializableBurndownEvent = Omit<SprintReportEvent, "occurredAt" | "sequence"> & {
  occurredAt: string;
  sequence: string;
};

type SerializablePage<T> = { page: number; pageSize: number; total: number; rows: T[] };

type SerializableDetailedBurndown = {
  sprint: SerializableBurndownSprint;
  summary: BurndownCalculation["summary"];
  trajectory: BurndownCalculation["trajectory"];
  planningComparison: PlanningComparison;
  guideline: SerializableBurndownGuideline;
  displayPoints: SerializableBurndownPoint[];
  baseline: SerializableBurndownPoint;
  observedAt: string;
  eventPoints: SerializablePage<SerializableBurndownPoint>;
  events: SerializablePage<SerializableBurndownEvent>;
};

export type SerializableBurndownReport =
  | ({ kind: "active"; statusLabel: "Données en cours" } & SerializableDetailedBurndown)
  | ({ kind: "completed"; statusLabel: "Historique figé" } & SerializableDetailedBurndown)
  | {
      kind: "legacy_unavailable";
      statusLabel: "Historique burndown indisponible";
      reason: "legacy_history";
      sprint: SerializableBurndownSprint;
    };

const iso = (value: Date | null) => value?.toISOString() ?? null;

function serializeSprint(sprint: BurndownSprintIdentity): SerializableBurndownSprint {
  return {
    id: sprint.id,
    name: sprint.name,
    goal: sprint.goal,
    plannedStartAt: iso(sprint.plannedStartAt),
    plannedEndAt: iso(sprint.plannedEndAt),
    startedAt: sprint.startedAt.toISOString(),
    completedAt: iso(sprint.completedAt),
  };
}

function serializePoint(point: BurndownPoint): SerializableBurndownPoint {
  return {
    ...point,
    occurredAt: point.occurredAt.toISOString(),
    sequence: point.sequence?.toString() ?? null,
  };
}

function serializeDetailed(report: DetailedBurndownReport): SerializableDetailedBurndown {
  return {
    sprint: serializeSprint(report.sprint),
    summary: { ...report.summary },
    trajectory: { ...report.trajectory },
    planningComparison: { ...report.planningComparison },
    guideline: report.guideline.state === "available"
      ? {
          state: "available",
          points: report.guideline.points.map((point) => ({
            occurredAt: point.occurredAt.toISOString(),
            remainingPoints: point.remainingPoints,
          })),
        }
      : { state: "unavailable", reason: report.guideline.reason },
    displayPoints: report.displayPoints.map(serializePoint),
    baseline: serializePoint(report.baseline),
    observedAt: report.observedAt.toISOString(),
    eventPoints: { ...report.eventPoints, rows: report.eventPoints.rows.map(serializePoint) },
    events: {
      ...report.events,
      rows: report.events.rows.map((event) => ({
        ...event,
        occurredAt: event.occurredAt.toISOString(),
        sequence: event.sequence.toString(),
      })),
    },
  };
}

export function serializeBurndownReport(report: BurndownReport): SerializableBurndownReport {
  switch (report.kind) {
    case "legacy_unavailable":
      return {
        kind: "legacy_unavailable",
        statusLabel: "Historique burndown indisponible",
        reason: report.reason,
        sprint: serializeSprint(report.sprint),
      };
    case "completed":
      return { kind: "completed", statusLabel: "Historique figé", ...serializeDetailed(report) };
    case "active":
      return { kind: "active", statusLabel: "Données en cours", ...serializeDetailed(report) };
  }
}
