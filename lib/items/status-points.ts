/**
 * Story points per status category, as Jira shows them in its backlog section
 * headers (« To Do » / « In Progress » / « Done » lozenges). Both in-progress
 * statuses merge into one category; unestimated items add nothing.
 */

export type StatusCategory = "todo" | "in_progress" | "done";

export type PointsByStatusCategory = {
  todo: number;
  inProgress: number;
  done: number;
};

function roundPoints(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** The same totals for items that already know their status category. */
export function pointsByCategory(
  items: ReadonlyArray<{ category: StatusCategory | null; estimatePoints: number | null }>,
): PointsByStatusCategory {
  const totals = { todo: 0, inProgress: 0, done: 0 };
  for (const item of items) {
    if (item.estimatePoints === null) continue;
    // An unknown status counts as to do so the three totals add up to the
    // section's estimated points.
    if (item.category === "done") totals.done += item.estimatePoints;
    else if (item.category === "in_progress") totals.inProgress += item.estimatePoints;
    else totals.todo += item.estimatePoints;
  }
  return {
    todo: roundPoints(totals.todo),
    inProgress: roundPoints(totals.inProgress),
    done: roundPoints(totals.done),
  };
}

export function pointsByStatusCategory(
  items: ReadonlyArray<{ statusId: string; estimatePoints: number | null }>,
  statuses: ReadonlyArray<{ id: string; category: StatusCategory }>,
): PointsByStatusCategory {
  const categoryById = new Map(statuses.map((status) => [status.id, status.category]));
  return pointsByCategory(
    items.map((item) => ({
      category: categoryById.get(item.statusId) ?? null,
      estimatePoints: item.estimatePoints,
    })),
  );
}
