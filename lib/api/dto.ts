import type { ItemKind, ItemType } from "@/lib/design/constants";

/**
 * The shapes the REST API (JIR-157) and the MCP server (JIR-158) hand out.
 * Dates travel as ISO 8601 strings; calendar days as YYYY-MM-DD.
 */

export type UserRef = { id: string; name: string };

export type BacklogSummary = {
  id: string;
  key: string;
  name: string;
  color: string;
  archivedAt: string | null;
};

export type StatusSummary = {
  id: string;
  name: string;
  category: "todo" | "in_progress" | "done";
  color: string;
  order: number;
};

export type ItemSummary = {
  id: string;
  key: string;
  backlog: { id: string; key: string; name: string };
  type: ItemType;
  kind: ItemKind;
  title: string;
  status: { id: string; name: string; category: "todo" | "in_progress" | "done" };
  priority: number;
  estimatePoints: number | null;
  assignee: UserRef | null;
  parentId: string | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

/** The columns `toItemSummary` needs, as the item-search query selects them. */
export type ItemSummaryRow = {
  id: string;
  key: string;
  type: ItemType;
  kind: ItemKind;
  title: string;
  priority: number;
  estimatePoints: string | number | null;
  parentId: string | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  backlogId: string;
  backlogKey: string;
  backlogName: string;
  statusId: string;
  statusName: string;
  statusCategory: "todo" | "in_progress" | "done";
  assigneeId: string | null;
  assigneeName: string | null;
};

export function isoDate(value: Date): string;
export function isoDate(value: Date | null | undefined): string | null;
export function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** `numeric` columns arrive as strings from pg; the API speaks numbers. */
export function points(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toItemSummary(row: ItemSummaryRow): ItemSummary {
  return {
    id: row.id,
    key: row.key,
    backlog: { id: row.backlogId, key: row.backlogKey, name: row.backlogName },
    type: row.type,
    kind: row.kind,
    title: row.title,
    status: { id: row.statusId, name: row.statusName, category: row.statusCategory },
    priority: row.priority,
    estimatePoints: points(row.estimatePoints),
    assignee: row.assigneeId ? { id: row.assigneeId, name: row.assigneeName ?? row.assigneeId } : null,
    parentId: row.parentId,
    startDate: row.startDate,
    dueDate: row.dueDate,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
    closedAt: isoDate(row.closedAt),
  };
}

export function toBacklogSummary(row: { id: string; key: string; name: string; color: string; archivedAt: Date | null }): BacklogSummary {
  return { id: row.id, key: row.key, name: row.name, color: row.color, archivedAt: isoDate(row.archivedAt) };
}

export type ApiComment = {
  id: string; author: UserRef; body: string; createdAt: string; updatedAt: string | null; deletedAt: string | null;
};
export type ApiActivity = {
  id: string; actor: UserRef; action: string; field: string | null; oldValue: string | null; newValue: string | null;
  source: "ui" | "api" | "mcp" | "webhook"; at: string;
};
export type ItemDetail = ItemSummary & {
  description: string | null;
  reporter: UserRef | null;
  parent: { id: string; key: string; title: string } | null;
  children: { id: string; key: string; title: string; statusId: string }[];
  labels: { id: string; name: string; color: string }[];
  comments: ApiComment[];
  activities: ApiActivity[];
  url: string;
};
export type CommentDtoRow = Omit<ApiComment, "createdAt" | "updatedAt" | "deletedAt"> & {
  createdAt: Date; editedAt: Date | null; deletedAt: Date | null;
};
export function toApiComment(row: CommentDtoRow): ApiComment {
  return { id: row.id, author: row.author, body: row.deletedAt ? "" : row.body,
    createdAt: isoDate(row.createdAt), updatedAt: isoDate(row.editedAt), deletedAt: isoDate(row.deletedAt) };
}
export function toItemDetail(summary: ItemSummary, detail: Omit<ItemDetail, keyof ItemSummary | "comments" | "activities" | "url"> & {
  comments: CommentDtoRow[]; activities: (Omit<ApiActivity, "at"> & { at: Date })[];
}): ItemDetail {
  return { ...summary, ...detail, comments: detail.comments.map(toApiComment),
    activities: detail.activities.map((activity) => ({ ...activity, at: isoDate(activity.at) })),
    url: `/b/${summary.backlog.key}?item=${summary.key}` };
}
