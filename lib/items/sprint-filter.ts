import { z } from "zod";
import type { Filters } from "@/lib/items/filter";

/**
 * The « Sprint » filter (JIR-81), Jiroo's `Sprint = "<name>"` search.
 *
 * Membership rule, aligned with Jira's Sprint field: an item belongs to every
 * sprint it is in now, and keeps every sprint that ended with it inside —
 * completed there, or carried over to the backlog or the next sprint. An item
 * taken out of a sprint (`outcome = removed`: moved elsewhere or sent back to
 * the backlog before the end) no longer belongs to it, as Jira drops the value
 * when an issue leaves a sprint before it closes. This matches the sprint
 * report, whose « Retirés du sprint » section is the only one listing items
 * that are not in the sprint's final scope. Sous-tâches never join a sprint on
 * their own: like in Jira they follow their parent tâche.
 *
 * See https://support.atlassian.com/jira/kb/how-to-find-jira-issues-that-belong-to-a-closed-sprint/
 */

/** The « Aucun sprint » value: Jira's `Sprint is EMPTY`. */
export const NO_SPRINT = "none";

type SprintOutcome = "completed" | "removed" | "carried_to_backlog" | "carried_to_sprint";

export function countsAsSprintMember(membership: {
  leftAt: Date | null;
  outcome: SprintOutcome | null;
}): boolean {
  return membership.leftAt === null || membership.outcome !== "removed";
}

/** Each item's sprints under the rule above, in first-joined order. */
export function sprintIdsByItem(
  memberships: ReadonlyArray<{
    itemId: string;
    sprintId: string;
    joinedAt: Date;
    leftAt: Date | null;
    outcome: SprintOutcome | null;
  }>,
  items: ReadonlyArray<{ id: string; type: string; parentId: string | null }>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const ordered = [...memberships].sort(
    (left, right) => left.joinedAt.getTime() - right.joinedAt.getTime(),
  );
  for (const membership of ordered) {
    if (!countsAsSprintMember(membership)) continue;
    const ids = result.get(membership.itemId) ?? [];
    if (!ids.includes(membership.sprintId)) ids.push(membership.sprintId);
    result.set(membership.itemId, ids);
  }
  for (const item of items) {
    if (item.type !== "soustache" || item.parentId === null) continue;
    const inherited = result.get(item.parentId);
    if (inherited) result.set(item.id, [...inherited]);
    else result.delete(item.id);
  }
  return result;
}

const sprintFilterValue = z.union([z.literal(NO_SPRINT), z.uuid()]);

/**
 * Keeps only « Aucun sprint » and the sprints of the current backlog: a
 * malformed id or a sprint of another backlog is ignored, never matched.
 * `null` means the view does not offer the facet (Board and Backlog are
 * already laid out by sprint), which clears it.
 */
export function withKnownSprintIds(
  filters: Filters,
  knownSprintIds: ReadonlySet<string> | null,
): Filters {
  const sprintIds = knownSprintIds === null
    ? []
    : filters.sprintIds.filter(
        (value) =>
          sprintFilterValue.safeParse(value).success
          && (value === NO_SPRINT || knownSprintIds.has(value)),
      );
  return sprintIds.length === filters.sprintIds.length ? filters : { ...filters, sprintIds };
}

export type SprintFilterState = "active" | "planned" | "completed";

/**
 * The facet's order: the active sprint, the planned ones in their backlog
 * order (input order), then the completed ones, most recently closed first.
 */
export function orderSprintsForFilter<
  T extends { state: SprintFilterState; completedAt: Date | null },
>(sprints: readonly T[]): T[] {
  const byState = (state: SprintFilterState) => sprints.filter((sprint) => sprint.state === state);
  return [
    ...byState("active"),
    ...byState("planned"),
    ...byState("completed").sort(
      (left, right) => (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0),
    ),
  ];
}
