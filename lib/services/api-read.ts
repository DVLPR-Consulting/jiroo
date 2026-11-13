import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { isoDate, toApiComment, toBacklogSummary, toItemDetail, toItemSummary } from "@/lib/api/dto";
import { requireBacklogReadPermissionByKey } from "@/lib/auth/action-authorization";
import { ResourceNotFoundError } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { apiTokens, itemLabels, items, labels, statuses } from "@/lib/db/schema/domain";
import { getBacklogSummary, listBacklogsForUser } from "@/lib/services/backlogs";
import { listComments } from "@/lib/services/comments";
import { getItemByIdForBacklog, getItemByKeyForBacklog, listActivities, listUsersByIds } from "@/lib/services/items";
import { listStatusesForBacklog } from "@/lib/services/statuses";

export async function getApiMe(actorId: string, tokenId: string) {
  const [row] = await db.select({ user: { id: user.id, name: user.name, email: user.email },
    token: { id: apiTokens.id, name: apiTokens.name, scope: apiTokens.scope, expiresAt: apiTokens.expiresAt },
  }).from(apiTokens).innerJoin(user, eq(apiTokens.userId, user.id))
    .where(and(eq(apiTokens.id, tokenId), eq(user.id, actorId))).limit(1);
  if (!row) throw new ResourceNotFoundError("token", tokenId);
  return { user: row.user, token: { ...row.token, expiresAt: isoDate(row.token.expiresAt) } };
}
export async function listApiBacklogs(actorId: string) {
  return (await listBacklogsForUser(actorId, { includeArchived: true })).map(toBacklogSummary);
}
export function resolveApiBacklog(actorId: string, key: string) {
  return requireBacklogReadPermissionByKey({ actorId, backlogKey: key, permission: "browse_backlog" });
}
export async function listApiStatuses(actorId: string, key: string) {
  const backlog = await resolveApiBacklog(actorId, key);
  return listStatusesForBacklog(backlog.backlogId);
}
export async function resolveApiItem(actorId: string, key: string) {
  const backlog = await resolveApiBacklog(actorId, key.slice(0, key.lastIndexOf("-")));
  const item = await getItemByKeyForBacklog(key, backlog.backlogId);
  if (!item) throw new ResourceNotFoundError("item", key);
  return item;
}
async function summarizeItem(item: Awaited<ReturnType<typeof resolveApiItem>>) {
  const [backlog, statusRows, assignees] = await Promise.all([
    getBacklogSummary(item.backlogId),
    db.select({ name: statuses.name, category: statuses.category }).from(statuses).where(and(eq(statuses.id, item.statusId), eq(statuses.backlogId, item.backlogId))).limit(1),
    listUsersByIds(item.assigneeId ? [item.assigneeId] : []),
  ]);
  if (!backlog || !statusRows[0]) throw new Error("Inconsistent item summary");
  return toItemSummary({ ...item, backlogKey: backlog.key, backlogName: backlog.name,
    statusName: statusRows[0].name, statusCategory: statusRows[0].category, assigneeName: assignees[0]?.name ?? null });
}
export async function getApiItemSummary(actorId: string, key: string) {
  return summarizeItem(await resolveApiItem(actorId, key));
}
export async function getApiItemDetail(actorId: string, key: string) {
  const item = await resolveApiItem(actorId, key);
  const [summary, parent, children, itemLabelRows, commentRows, activityRows] = await Promise.all([
    summarizeItem(item), item.parentId ? getItemByIdForBacklog(item.parentId, item.backlogId) : null,
    db.select({ id: items.id, key: items.key, title: items.title, statusId: items.statusId }).from(items)
      .where(and(eq(items.parentId, item.id), eq(items.backlogId, item.backlogId), isNull(items.deletedAt))).orderBy(asc(items.createdAt), asc(items.id)),
    db.select({ id: labels.id, name: labels.name, color: labels.color }).from(itemLabels)
      .innerJoin(labels, eq(itemLabels.labelId, labels.id)).where(eq(itemLabels.itemId, item.id)).orderBy(asc(labels.name), asc(labels.id)),
    listComments(item.id), listActivities(item.id),
  ]);
  const people = await listUsersByIds([item.reporterId, ...activityRows.map((row) => row.actorId)]);
  const names = new Map(people.map((person) => [person.id, person]));
  return toItemDetail(summary, {
    description: item.description, reporter: names.get(item.reporterId) ?? null,
    parent: parent ? { id: parent.id, key: parent.key, title: parent.title } : null, children, labels: itemLabelRows,
    comments: commentRows.map((row) => ({ id: row.id, author: { id: row.authorId, name: row.authorName }, body: row.body, createdAt: row.createdAt, editedAt: row.editedAt, deletedAt: row.deletedAt })),
    activities: activityRows.map((row) => ({ id: row.id, actor: names.get(row.actorId) ?? { id: row.actorId, name: row.actorId }, action: row.action, field: row.field, oldValue: row.oldValue, newValue: row.newValue, source: row.source, at: row.at })),
  });
}
export async function getApiComment(actorId: string, key: string, commentId: string) {
  const item = await resolveApiItem(actorId, key);
  const row = (await listComments(item.id)).find((comment) => comment.id === commentId);
  if (!row) throw new ResourceNotFoundError("comment", commentId);
  return toApiComment({ ...row, author: { id: row.authorId, name: row.authorName } });
}
