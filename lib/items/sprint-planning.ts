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
};

export type RecentVelocityContext = {
  population: number;
  averageCompletedPoints: number | null;
};

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

export function calculateSprintMetrics(
  rows: SprintPlanningItem[],
  capacityPoints: number | null,
  recentVelocity: RecentVelocityContext | null = null,
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

  return {
    itemCount: rows.length,
    estimatedPoints,
    completedPoints,
    remainingPoints,
    unestimatedCount: rows.filter((row) => row.estimatePoints === null).length,
    capacityPoints,
    overCapacityPoints,
    velocityComparison:
      recentVelocity === null
        ? null
        : calculatePlanningComparison(estimatedPoints, recentVelocity),
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
}: {
  sprints: SprintSummary[];
  items: T[];
  memberships: SprintPlanningMembership[];
  recentVelocity?: RecentVelocityContext | null;
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
      metrics: calculateSprintMetrics(rows, sprint.capacityPoints, recentVelocity),
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
