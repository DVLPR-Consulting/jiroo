import "server-only";

import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { listAccessibleBacklogIds } from "@/lib/auth/accessible-backlogs";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  comments,
  itemFixVersions,
  itemLinks,
  items,
  releases,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import { assembleLePoint, type LePointSource } from "@/lib/le-point/assemble";
import type { Day, LePointDataset } from "@/lib/le-point/model";
import { dayInZone } from "@/lib/roadmap/days";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";

/**
 * « Le point » pilot (JIR-107): the read-only facts of one real backlog, as
 * the reader may see them. Nothing is written. A dependency in a backlog the
 * reader cannot browse keeps only whether it is still open.
 */

const sourceItem = alias(items, "le_point_source_item");
const sourceStatus = alias(statuses, "le_point_source_status");

/**
 * The reader's « Le point » on a backlog, or null when they may not browse
 * it. The reader is the viewer of both perspectives: the perspective is a
 * reading choice, never a permission.
 */
export async function loadLePoint(input: {
  userId: string;
  backlogKey: string;
  lastVisit: Day | null;
  now?: Date;
}): Promise<LePointDataset | null> {
  const backlog = await getBacklogByKeyForUser(input.backlogKey, input.userId);
  if (!backlog || backlog.archivedAt) return null;
  const today = dayInZone(input.now ?? new Date());
  const weekAgo = dayInZone(new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 86_400_000));

  const rows = await db
    .select({
      id: items.id,
      key: items.key,
      title: items.title,
      type: items.type,
      kind: items.kind,
      parentId: items.parentId,
      status: statuses.name,
      category: statuses.category,
      assigneeId: items.assigneeId,
      dueDate: items.dueDate,
      closedAt: items.closedAt,
    })
    .from(items)
    .innerJoin(statuses, eq(statuses.id, items.statusId))
    .where(and(eq(items.backlogId, backlog.id), isNull(items.deletedAt)))
    .orderBy(asc(items.rank));
  const ids = rows.map((row) => row.id);
  const liveIds = sql`(select ${items.id} from ${items} where ${items.backlogId} = ${backlog.id} and ${items.deletedAt} is null)`;

  const [links, commentRows, activityRows, releaseRows, versionRows, sprintRows, accessible] = await Promise.all([
    ids.length === 0
      ? []
      : db
          .select({
            sourceId: itemLinks.sourceId,
            targetId: itemLinks.targetId,
            sourceBacklogId: sourceItem.backlogId,
            key: sourceItem.key,
            title: sourceItem.title,
            type: sourceItem.type,
            kind: sourceItem.kind,
            status: sourceStatus.name,
            category: sourceStatus.category,
            assigneeId: sourceItem.assigneeId,
            dueDate: sourceItem.dueDate,
            closedAt: sourceItem.closedAt,
          })
          .from(itemLinks)
          .innerJoin(sourceItem, eq(sourceItem.id, itemLinks.sourceId))
          .innerJoin(sourceStatus, eq(sourceStatus.id, sourceItem.statusId))
          .where(and(eq(itemLinks.type, "blocks"), inArray(itemLinks.targetId, ids), isNull(sourceItem.deletedAt))),
    db
      .select({ itemId: comments.itemId, authorId: comments.authorId, mentions: comments.mentions, at: comments.createdAt, body: comments.body })
      .from(comments)
      .where(and(sql`${comments.itemId} in ${liveIds}`, isNull(comments.deletedAt), sql`cardinality(${comments.mentions}) > 0`)),
    db
      .select({ itemId: activities.itemId, at: max(activities.at) })
      .from(activities)
      .where(sql`${activities.itemId} in ${liveIds}`)
      .groupBy(activities.itemId),
    db
      .select({
        id: releases.id,
        name: releases.name,
        planned: releases.releaseDate,
        releasedAt: releases.releasedAt,
        effective: releases.effectiveReleaseDate,
      })
      .from(releases)
      .where(and(eq(releases.backlogId, backlog.id), isNull(releases.archivedAt))),
    db
      .select({ itemId: itemFixVersions.itemId, releaseId: itemFixVersions.releaseId })
      .from(itemFixVersions)
      .where(eq(itemFixVersions.backlogId, backlog.id)),
    db
      .select({ id: sprints.id, name: sprints.name, startedAt: sprints.startedAt, plannedStartAt: sprints.plannedStartAt, plannedEndAt: sprints.plannedEndAt })
      .from(sprints)
      .where(and(eq(sprints.backlogId, backlog.id), eq(sprints.state, "active")))
      .limit(1),
    listAccessibleBacklogIds(input.userId),
  ]);

  // Outside dependencies: everything when the reader may browse their
  // backlog; otherwise nothing leaves the server but « still open ».
  const visibleBacklogs = new Set(accessible);
  const outside = new Map<string, LePointSource["outside"][number]>();
  const blocks: LePointSource["blocks"] = [];
  for (const link of links) {
    const { sourceId, targetId } = link;
    if (link.sourceBacklogId === backlog.id) {
      blocks.push({ sourceId, targetId });
      continue;
    }
    if (visibleBacklogs.has(link.sourceBacklogId)) {
      outside.set(sourceId, {
        id: sourceId,
        key: link.key,
        title: link.title,
        type: link.type,
        kind: link.kind,
        parentId: null,
        status: link.status,
        category: link.category,
        assigneeId: link.assigneeId,
        dueDate: link.dueDate,
        closedAt: link.closedAt,
      });
      blocks.push({ sourceId, targetId });
    } else if (link.category !== "done") {
      blocks.push({ sourceId: null, targetId });
    }
  }

  const peopleIds = new Set<string>([input.userId]);
  for (const row of [...rows, ...outside.values()]) if (row.assigneeId) peopleIds.add(row.assigneeId);
  for (const comment of commentRows) {
    peopleIds.add(comment.authorId);
    for (const id of comment.mentions) peopleIds.add(id);
  }
  const people = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, [...peopleIds]));

  const sprint = sprintRows[0];
  const sprintItemIds = sprint
    ? (await db
        .select({ itemId: sprintItems.itemId })
        .from(sprintItems)
        .where(and(eq(sprintItems.sprintId, sprint.id), isNull(sprintItems.leftAt)))).map((row) => row.itemId)
    : null;
  const sprintStart = sprint?.startedAt ?? sprint?.plannedStartAt;
  return assembleLePoint({
    viewerId: input.userId,
    today,
    lastVisit: input.lastVisit && input.lastVisit < today ? input.lastVisit : weekAgo,
    firstVisit: !input.lastVisit,
    backlog: { key: backlog.key, name: backlog.name },
    items: rows,
    blocks,
    outside: [...outside.values()],
    comments: commentRows,
    lastActivity: activityRows.flatMap((row) => (row.at ? [{ itemId: row.itemId, at: row.at }] : [])),
    releases: releaseRows.map((row) => ({
      id: row.id,
      name: row.name,
      planned: row.planned,
      released: row.releasedAt ? row.effective : null,
    })),
    fixVersions: versionRows,
    sprint: sprint && sprintStart && sprint.plannedEndAt
      ? { name: sprint.name, start: dayInZone(sprintStart), end: dayInZone(sprint.plannedEndAt) }
      : null,
    sprintItemIds,
    people,
  });
}
