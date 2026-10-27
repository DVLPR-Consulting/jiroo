import "server-only";

import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { checkPermission, listAssignableUsersForBacklog } from "@/lib/auth/authorization";
import { listAccessibleBacklogs } from "@/lib/auth/accessible-backlogs";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  comments,
  itemFixVersions,
  itemLinks,
  items,
  releases,
  sprintEvents,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import { assembleLePoint, type LePointSource } from "@/lib/le-point/assemble";
import type { Day, LePointDataset } from "@/lib/le-point/model";
import { dayInZone } from "@/lib/roadmap/days";
import { calculatePreviousSprintsVelocity } from "@/lib/reports/sprint-calculations";
import { listAbsences } from "@/lib/services/absences";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { getVelocityReport } from "@/lib/services/sprint-reports";

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
      estimatePoints: items.estimatePoints,
    })
    .from(items)
    .innerJoin(statuses, eq(statuses.id, items.statusId))
    .where(and(eq(items.backlogId, backlog.id), isNull(items.deletedAt)))
    .orderBy(asc(items.rank));
  const ids = rows.map((row) => row.id);
  const liveIds = sql`(select ${items.id} from ${items} where ${items.backlogId} = ${backlog.id} and ${items.deletedAt} is null)`;

  const [links, commentRows, activityRows, releaseRows, versionRows, sprintRows, accessible, directoryAccess] = await Promise.all([
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
            estimatePoints: sourceItem.estimatePoints,
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
        archivedAt: releases.archivedAt,
      })
      .from(releases)
      // Archived ones too: a fix version pointing at one still tells whether the work shipped.
      .where(eq(releases.backlogId, backlog.id)),
    db
      .select({ itemId: itemFixVersions.itemId, releaseId: itemFixVersions.releaseId })
      .from(itemFixVersions)
      .where(eq(itemFixVersions.backlogId, backlog.id)),
    db
      .select({ id: sprints.id, name: sprints.name, goal: sprints.goal, startedAt: sprints.startedAt, plannedStartAt: sprints.plannedStartAt, plannedEndAt: sprints.plannedEndAt })
      .from(sprints)
      .where(and(eq(sprints.backlogId, backlog.id), eq(sprints.state, "active")))
      .limit(1),
    // Archived backlogs cannot be opened: their tickets stay hidden.
    listAccessibleBacklogs(input.userId),
    checkPermission({ actorId: input.userId, permission: "browse_users", scope: { type: "global" } }),
  ]);

  // Outside dependencies: everything when the reader may browse their
  // backlog; otherwise nothing leaves the server but « still open ».
  const visibleBacklogs = new Set(accessible.map((row) => row.id));
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
        estimatePoints: link.estimatePoints,
      });
      blocks.push({ sourceId, targetId });
    } else if (link.category !== "done") {
      blocks.push({ sourceId: null, targetId });
    }
  }

  const sprint = sprintRows[0];
  const sprintStart = sprint?.startedAt ?? sprint?.plannedStartAt;
  // Every membership of the sprint, left ones included (JIR-124). Added after
  // the start, as the burndown reads it: the membership has an « item_added »
  // sprint event, which only a join into a started sprint writes; a backdated
  // start never makes the initial scope look added.
  const [sprintMembers, sprintChanges, velocityReport, members] = await Promise.all([
    sprint
      ? db
          .select({
            itemId: sprintItems.itemId,
            leftAt: sprintItems.leftAt,
            doneAtStart: sprintItems.doneAtStart,
            estimateAtStart: sprintItems.estimateAtStart,
            addedAfterStart: sql<boolean>`exists (
              select 1 from sprint_events added_event
              where added_event.backlog_id = ${backlog.id}
                and added_event.sprint_id = ${sprint.id}
                and added_event.source_membership_id = ${sprintItems.id}
                and added_event.event_type = 'item_added'
            )`,
          })
          .from(sprintItems)
          .where(eq(sprintItems.sprintId, sprint.id))
      : null,
    sprint
      ? db
          .select({
            kind: sql<"added" | "removed">`case when ${sprintEvents.eventType} = 'item_added' then 'added' else 'removed' end`,
            // The journal owns the identity, including after deletion or purge.
            key: sql<string>`coalesce(${sprintEvents.itemKey}, ${items.key})`,
            title: sql<string>`coalesce(${sprintEvents.itemTitle}, ${items.title})`,
            // Zero is known; only an unknown event estimate falls back to the current item.
            points: sql<number | null>`coalesce(case when ${sprintEvents.eventType} = 'item_added'
              then ${sprintEvents.nextEstimate} else ${sprintEvents.previousEstimate} end, ${items.estimatePoints})`.mapWith(items.estimatePoints),
            at: sprintEvents.occurredAt,
            actor: sprintEvents.actorId,
          })
          .from(sprintEvents)
          .leftJoin(items, and(eq(items.id, sprintEvents.itemId), eq(items.backlogId, backlog.id)))
          .where(and(
            eq(sprintEvents.backlogId, backlog.id), eq(sprintEvents.sprintId, sprint.id),
            inArray(sprintEvents.eventType, ["item_added", "item_removed"]),
          ))
          .orderBy(asc(sprintEvents.occurredAt), asc(sprintEvents.sequence))
      : [],
    // The report reads at most seven headers. Reuse its inclusion rules, with a three-sprint window below.
    sprint ? getVelocityReport(backlog.id, 7) : null,
    directoryAccess.allowed ? listAssignableUsersForBacklog(backlog.id) : [],
  ]);
  const sprintVelocity = velocityReport && sprint
    ? calculatePreviousSprintsVelocity(
        [...velocityReport.bars].reverse().map((bar) => ({
          sprintId: bar.sprintId,
          hasSnapshot: bar.excludedReason !== "history_unavailable",
          committedPoints: bar.committedPoints,
          completedPoints: bar.completedPoints,
        })),
        sprint.id,
        3,
      ).averageCompletedPoints
    : null;

  const peopleIds = new Set<string>([input.userId]);
  for (const row of [...rows, ...outside.values()]) if (row.assigneeId) peopleIds.add(row.assigneeId);
  for (const comment of commentRows) {
    peopleIds.add(comment.authorId);
    for (const id of comment.mentions) peopleIds.add(id);
  }
  for (const change of sprintChanges) peopleIds.add(change.actor);
  const people = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, [...peopleIds]));

  // Declared absences of everyone shown, from three months back (idle days
  // skip them) to two months past the sprint's end (« en congé jusqu'au »).
  const dayShift = (days: number) => dayInZone(new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000));
  const sprintEnd = sprint?.plannedEndAt ? dayInZone(sprint.plannedEndAt) : today;
  const [absenceRows, administers, managesMembers] = await Promise.all([
    listAbsences({
      userIds: [...new Set([...peopleIds, ...members.map((member) => member.id)])],
      startDate: dayShift(-90),
      endDate: dayShift(60) > sprintEnd ? dayShift(60) : sprintEnd,
    }),
    // Declaring someone else's absence takes the same right as opening the backlog's settings.
    checkPermission({ actorId: input.userId, permission: "administer_backlog", scope: { type: "backlog", backlogId: backlog.id } }),
    checkPermission({ actorId: input.userId, permission: "manage_members", scope: { type: "backlog", backlogId: backlog.id } }),
  ]);
  const canManageAbsences = administers.allowed || managesMembers.allowed;

  const current = sprintMembers?.filter((row) => row.leftAt === null) ?? null;
  const sprintItemIds = current?.map((row) => row.itemId) ?? null;
  const sprintAddedItemIds = current?.filter((row) => row.addedAfterStart).map((row) => row.itemId) ?? [];
  // The scope frozen at the start: the start facts are written for every
  // membership present then, removed since or not. A sprint started before
  // those facts were kept has none, and its commitment stays unknown.
  const initial = sprintMembers?.filter((row) => row.doneAtStart !== null) ?? [];
  const legacy = initial.length === 0 && (current ?? []).some((row) => !row.addedAfterStart);
  const commitment = legacy
    ? undefined
    : { points: initial.reduce((total, row) => total + (row.estimateAtStart ?? 0), 0), tickets: initial.length };
  return assembleLePoint({
    viewerId: input.userId,
    today,
    lastVisit: input.lastVisit && input.lastVisit < today ? input.lastVisit : weekAgo,
    firstVisit: !input.lastVisit,
    backlog: { id: backlog.id, key: backlog.key, name: backlog.name },
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
      archived: row.archivedAt !== null,
    })),
    fixVersions: versionRows,
    sprint: sprint && sprintStart && sprint.plannedEndAt
      ? {
          name: sprint.name,
          goal: sprint.goal,
          start: dayInZone(sprintStart),
          end: dayInZone(sprint.plannedEndAt),
          ...(commitment ? { commitment } : {}),
        }
      : null,
    sprintChanges,
    sprintVelocity,
    members,
    absences: absenceRows,
    canManageAbsences,
    sprintItemIds,
    sprintAddedItemIds,
    people,
  });
}
