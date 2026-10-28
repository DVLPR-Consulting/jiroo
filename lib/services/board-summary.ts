import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, sprintItems, sprints, statuses } from "@/lib/db/schema/domain";
import { calculateSprintMetrics, type SprintMetrics } from "@/lib/items/sprint-planning";

export type BoardSummary = {
  activeSprintId: string | null;
  /** The active sprint's figures the Board shows above its columns; null without one. */
  metrics: SprintMetrics | null;
};

/**
 * The active sprint's figures (points remaining, done, unestimated), read
 * apart from the page so the Board can refresh them after an action without
 * a page render (JIR-119): four small reads instead of the view's fifty.
 * Same figures as the Board's render: every live task of the sprint, done
 * when its status is in the done category. The caller has checked the
 * backlog is browsable.
 */
export async function loadBoardSummary(backlogId: string): Promise<BoardSummary> {
  const [sprint] = await db
    .select({ id: sprints.id, capacityPoints: sprints.capacityPoints })
    .from(sprints)
    .where(and(eq(sprints.backlogId, backlogId), eq(sprints.state, "active")))
    .limit(1);
  if (!sprint) return { activeSprintId: null, metrics: null };

  const memberships = await db
    .select({ itemId: sprintItems.itemId })
    .from(sprintItems)
    .where(and(eq(sprintItems.sprintId, sprint.id), isNull(sprintItems.leftAt)));
  const itemIds = memberships.map((membership) => membership.itemId);
  const rows =
    itemIds.length === 0
      ? []
      : await db
          .select({
            id: items.id,
            type: items.type,
            rank: items.rank,
            estimatePoints: items.estimatePoints,
            category: statuses.category,
          })
          .from(items)
          .innerJoin(statuses, eq(items.statusId, statuses.id))
          .where(
            and(
              inArray(items.id, itemIds),
              eq(items.backlogId, backlogId),
              eq(items.type, "tache"),
              isNull(items.deletedAt),
            ),
          );

  const metrics = calculateSprintMetrics(
    rows.map((row) => ({
      id: row.id,
      type: row.type,
      rank: row.rank,
      estimatePoints: row.estimatePoints,
      done: row.category === "done",
    })),
    sprint.capacityPoints,
  );
  return { activeSprintId: sprint.id, metrics };
}
