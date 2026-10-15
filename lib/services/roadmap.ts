import "server-only";

import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, releases, sprintItems, sprints, statuses } from "@/lib/db/schema";
import type { Day } from "@/lib/roadmap/days";

/** The levels the roadmap shows; sub-tasks stay out, as in Jira's timeline. */
const ROADMAP_TYPES = ["composant", "epic", "tache"] as const;

export type RoadmapItem = {
  id: string;
  key: string;
  title: string;
  type: (typeof ROADMAP_TYPES)[number];
  parentId: string | null;
  statusId: string;
  category: "todo" | "in_progress" | "done";
  start: Day | null;
  due: Day | null;
  closedAt: Date | null;
  /** The sprint the task currently belongs to. */
  sprintId: string | null;
};

export type RoadmapSprint = {
  id: string;
  name: string;
  state: "planned" | "active";
  /** Instants entered in local time: the browser turns them into its days. */
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
};

export type RoadmapRelease = { id: string; name: string; day: Day | null; released: boolean };

export type RoadmapData = {
  /** Depth-first tree order: component, its epics, each followed by its tasks. */
  items: RoadmapItem[];
  sprints: RoadmapSprint[];
  releases: RoadmapRelease[];
};

/**
 * Everything the roadmap of one backlog draws, in four queries. The caller
 * checks the viewer may browse the backlog.
 */
export async function loadRoadmap(backlogId: string): Promise<RoadmapData> {
  const [itemRows, membershipRows, sprintRows, releaseRows] = await Promise.all([
    db
      .select({
        id: items.id,
        key: items.key,
        title: items.title,
        type: items.type,
        parentId: items.parentId,
        statusId: items.statusId,
        category: statuses.category,
        start: items.startDate,
        due: items.dueDate,
        closedAt: items.closedAt,
      })
      .from(items)
      .innerJoin(statuses, eq(statuses.id, items.statusId))
      .where(
        and(
          eq(items.backlogId, backlogId),
          isNull(items.deletedAt),
          inArray(items.type, [...ROADMAP_TYPES]),
        ),
      )
      .orderBy(asc(items.rank)),
    db
      .select({ itemId: sprintItems.itemId, sprintId: sprintItems.sprintId })
      .from(sprintItems)
      .innerJoin(sprints, eq(sprints.id, sprintItems.sprintId))
      .where(and(eq(sprints.backlogId, backlogId), isNull(sprintItems.leftAt))),
    db
      .select({
        id: sprints.id,
        name: sprints.name,
        state: sprints.state,
        plannedStartAt: sprints.plannedStartAt,
        plannedEndAt: sprints.plannedEndAt,
      })
      .from(sprints)
      .where(and(eq(sprints.backlogId, backlogId), ne(sprints.state, "completed")))
      .orderBy(asc(sprints.rank)),
    db
      .select({
        id: releases.id,
        name: releases.name,
        releaseDate: releases.releaseDate,
        effectiveReleaseDate: releases.effectiveReleaseDate,
        releasedAt: releases.releasedAt,
      })
      .from(releases)
      .where(and(eq(releases.backlogId, backlogId), isNull(releases.archivedAt)))
      .orderBy(asc(releases.releaseDate)),
  ]);

  const sprintOf = new Map(membershipRows.map((row) => [row.itemId, row.sprintId]));
  const rows: RoadmapItem[] = itemRows.map((row) => ({
    ...row,
    type: row.type as RoadmapItem["type"],
    sprintId: sprintOf.get(row.id) ?? null,
  }));

  // Rank orders siblings; walk the tree so each parent precedes its children.
  const childrenOf = new Map<string | null, RoadmapItem[]>();
  for (const row of rows) {
    const siblings = childrenOf.get(row.parentId) ?? [];
    siblings.push(row);
    childrenOf.set(row.parentId, siblings);
  }
  const ordered: RoadmapItem[] = [];
  const visit = (parentId: string | null) => {
    for (const child of childrenOf.get(parentId) ?? []) {
      ordered.push(child);
      visit(child.id);
    }
  };
  visit(null);

  return {
    items: ordered,
    sprints: sprintRows.map((sprint) => ({
      ...sprint,
      state: sprint.state as RoadmapSprint["state"],
    })),
    releases: releaseRows.map((release) => ({
      id: release.id,
      name: release.name,
      // A shipped release sits on the day it actually shipped.
      day: release.releasedAt ? (release.effectiveReleaseDate ?? release.releaseDate) : release.releaseDate,
      released: release.releasedAt !== null,
    })),
  };
}
