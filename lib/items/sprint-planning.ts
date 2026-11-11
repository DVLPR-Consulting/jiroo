import type { ItemType } from "@/lib/design/constants";
import {
  calculatePlanningComparison,
  type PlanningComparison,
} from "@/lib/reports/burndown-calculations";

export type SprintPlanningItem = {
  id: string;
  type: ItemType;
  rank: string;
  estimatePoints: number | null;
  done: boolean;
};

export type SprintSummary = {
  id: string;
  name: string;
  goal: string | null;
  state: "planned" | "active" | "completed";
  rank: string;
  capacityPoints: number | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type SprintPlanningMembership = {
  itemId: string;
  sprintId: string;
  leftAt: Date | null;
};

export type SprintMetrics = {
  itemCount: number;
  estimatedPoints: number;
  completedPoints: number;
  remainingPoints: number;
  unestimatedCount: number;
  capacityPoints: number | null;
  overCapacityPoints: number;
  velocityComparison: PlanningComparison | null;
  /**
   * What the velocity comparison measures as the commitment (null without a
   * planning comparison context). Like Jira's velocity chart, an active sprint
   * is committed at its start scope; a planned sprint at its current scope.
   */
  commitmentBasis: CommitmentBasis | null;
};

export type CommitmentBasis =
  | "current_scope"
  | "sprint_start"
  | "sprint_start_unavailable";

export type RecentVelocityContext = {
  population: number;
  averageCompletedPoints: number | null;
};

/**
 * Commitment frozen when the active sprint started: the sum of `estimateAtStart`
 * of its initial memberships. `null` points when legacy start facts are missing.
 */
export type ActiveSprintStartCommitment = {
  sprintId: string;
  commitmentPoints: number | null;
};

/** Frozen start commitment of an active sprint; `points: null` = unavailable. */
export type SprintStartCommitment = { points: number | null };

export type SprintPlanningSection<T> = {
  id: string;
  kind: "active" | "planned" | "backlog";
  sprint: SprintSummary | null;
  metrics: SprintMetrics;
  items: T[];
};

function roundPoints(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function resolveCommitment(
  estimatedPoints: number,
  recentVelocity: RecentVelocityContext | null,
  startCommitment: SprintStartCommitment | null,
): { basis: CommitmentBasis | null; points: number | null } {
  if (recentVelocity === null) return { basis: null, points: null };
  if (startCommitment === null) {
    return { basis: "current_scope", points: estimatedPoints };
  }
  if (startCommitment.points === null) {
    return { basis: "sprint_start_unavailable", points: null };
  }
  return { basis: "sprint_start", points: startCommitment.points };
}

export function calculateSprintMetrics(
  rows: SprintPlanningItem[],
  capacityPoints: number | null,
  recentVelocity: RecentVelocityContext | null = null,
  startCommitment: SprintStartCommitment | null = null,
): SprintMetrics {
  const estimatedPoints = roundPoints(
    rows.reduce((total, row) => total + (row.estimatePoints ?? 0), 0),
  );
  const completedPoints = roundPoints(
    rows.reduce(
      (total, row) => total + (row.done ? (row.estimatePoints ?? 0) : 0),
      0,
    ),
  );
  const remainingPoints = roundPoints(estimatedPoints - completedPoints);
  const overCapacityPoints =
    capacityPoints === null
      ? 0
      : roundPoints(Math.max(0, estimatedPoints - capacityPoints));

  const commitment = resolveCommitment(estimatedPoints, recentVelocity, startCommitment);

  return {
    itemCount: rows.length,
    estimatedPoints,
    completedPoints,
    remainingPoints,
    unestimatedCount: rows.filter((row) => row.estimatePoints === null).length,
    capacityPoints,
    overCapacityPoints,
    velocityComparison:
      recentVelocity === null || commitment.points === null
        ? null
        : calculatePlanningComparison(commitment.points, recentVelocity),
    commitmentBasis: commitment.basis,
  };
}

/**
 * A section's figures with tasks moved in (`added`) and out (`removed`), for
 * a section only part of which is loaded (the Backlog section by windows,
 * JIR-146): its figures cover the whole section, so a drop shifts them
 * instead of recounting the loaded rows. The velocity comparison is kept:
 * the Backlog section has none.
 */
export function shiftSectionMetrics(
  metrics: SprintMetrics,
  added: ReadonlyArray<Pick<SprintPlanningItem, "estimatePoints" | "done">>,
  removed: ReadonlyArray<Pick<SprintPlanningItem, "estimatePoints" | "done">>,
): SprintMetrics {
  const sum = (rows: typeof added, done: boolean) =>
    rows.reduce((total, row) => total + (!done || row.done ? (row.estimatePoints ?? 0) : 0), 0);
  const unestimated = (rows: typeof added) => rows.filter((row) => row.estimatePoints === null).length;
  const estimatedPoints = roundPoints(metrics.estimatedPoints + sum(added, false) - sum(removed, false));
  const completedPoints = roundPoints(metrics.completedPoints + sum(added, true) - sum(removed, true));
  return {
    ...metrics,
    itemCount: metrics.itemCount + added.length - removed.length,
    estimatedPoints,
    completedPoints,
    remainingPoints: roundPoints(estimatedPoints - completedPoints),
    unestimatedCount: metrics.unestimatedCount + unestimated(added) - unestimated(removed),
    overCapacityPoints:
      metrics.capacityPoints === null
        ? 0
        : roundPoints(Math.max(0, estimatedPoints - metrics.capacityPoints)),
  };
}

/**
 * The start commitment to compare for a sprint section: only the active sprint
 * has one. A missing or mismatched record is reported as unavailable rather
 * than falling back to the live scope.
 */
export function sprintStartCommitmentFor(
  sprint: SprintSummary | null,
  activeSprintCommitment: ActiveSprintStartCommitment | null,
): SprintStartCommitment | null {
  if (sprint?.state !== "active") return null;
  return {
    points:
      activeSprintCommitment?.sprintId === sprint.id
        ? activeSprintCommitment.commitmentPoints
        : null,
  };
}

function compareRank(
  left: { rank: string; id: string },
  right: { rank: string; id: string },
) {
  if (left.rank !== right.rank) return left.rank < right.rank ? -1 : 1;
  return left.id.localeCompare(right.id);
}

export function buildSprintSections<T extends SprintPlanningItem>({
  sprints,
  items,
  memberships,
  recentVelocity = null,
  activeSprintCommitment = null,
}: {
  sprints: SprintSummary[];
  items: T[];
  memberships: SprintPlanningMembership[];
  recentVelocity?: RecentVelocityContext | null;
  activeSprintCommitment?: ActiveSprintStartCommitment | null;
}): SprintPlanningSection<T>[] {
  const activeSprints = sprints.filter(
    (sprint): sprint is SprintSummary & { state: "active" } =>
      sprint.state === "active",
  );
  if (activeSprints.length > 1) {
    throw new Error("Un backlog ne peut avoir qu’un sprint actif.");
  }

  const planningSprints = [
    ...activeSprints,
    ...sprints
      .filter(
        (sprint): sprint is SprintSummary & { state: "planned" } =>
          sprint.state === "planned",
      )
      .sort(compareRank),
  ];
  const planningSprintIds = new Set(planningSprints.map((sprint) => sprint.id));
  const currentSprintByItem = new Map<string, string>();
  for (const membership of memberships) {
    if (membership.leftAt !== null) continue;
    if (currentSprintByItem.has(membership.itemId)) {
      throw new Error("Un item ne peut appartenir qu’à un sprint courant.");
    }
    if (!planningSprintIds.has(membership.sprintId)) {
      throw new Error("Un item appartient à un sprint qui n’est plus planifiable.");
    }
    currentSprintByItem.set(membership.itemId, membership.sprintId);
  }

  const taskItems = items.filter((row) => row.type === "tache");
  const itemsBySprint = new Map<string, T[]>();
  for (const sprint of planningSprints) itemsBySprint.set(sprint.id, []);
  const backlogItems: T[] = [];

  for (const row of taskItems) {
    const sprintId = currentSprintByItem.get(row.id);
    if (sprintId) {
      itemsBySprint.get(sprintId)?.push(row);
    } else if (!row.done) {
      backlogItems.push(row);
    }
  }

  const sections: SprintPlanningSection<T>[] = planningSprints.map((sprint) => {
    const rows = (itemsBySprint.get(sprint.id) ?? []).sort(compareRank);
    return {
      id: sprint.id,
      kind: sprint.state,
      sprint,
      metrics: calculateSprintMetrics(
        rows,
        sprint.capacityPoints,
        recentVelocity,
        sprintStartCommitmentFor(sprint, activeSprintCommitment),
      ),
      items: rows,
    };
  });
  backlogItems.sort(compareRank);
  sections.push({
    id: "backlog",
    kind: "backlog",
    sprint: null,
    metrics: calculateSprintMetrics(backlogItems, null),
    items: backlogItems,
  });
  return sections;
}
