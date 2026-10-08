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

export function pointsByStatusCategory(
  items: ReadonlyArray<{ statusId: string; estimatePoints: number | null }>,
  statuses: ReadonlyArray<{ id: string; category: StatusCategory }>,
): PointsByStatusCategory {
  const categoryById = new Map(statuses.map((status) => [status.id, status.category]));
  const totals = { todo: 0, inProgress: 0, done: 0 };
  for (const item of items) {
    if (item.estimatePoints === null) continue;
    // An unknown status counts as to do so the three totals add up to the
    // section's estimated points.
    const category = categoryById.get(item.statusId) ?? "todo";
    if (category === "done") totals.done += item.estimatePoints;
    else if (category === "in_progress") totals.inProgress += item.estimatePoints;
    else totals.todo += item.estimatePoints;
  }
  return {
    todo: roundPoints(totals.todo),
    inProgress: roundPoints(totals.inProgress),
    done: roundPoints(totals.done),
  };
}
