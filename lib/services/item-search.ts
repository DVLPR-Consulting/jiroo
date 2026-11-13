import { and, asc, eq, gt, ilike, isNull, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { toItemSummary, type ItemSummary } from "@/lib/api/dto";
import { browseAccessPredicate } from "@/lib/auth/accessible-backlogs";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import type { ItemType } from "@/lib/design/constants";

/**
 * The item listing of the REST API and the MCP server (JIR-157, JIR-158):
 * live items of the backlogs the actor may browse, filtered, in creation
 * order, paged by an opaque cursor. Access is enforced in SQL, like the
 * other cross-backlog reads.
 */

export const ITEM_SEARCH_MAX_LIMIT = 100;
export const ITEM_SEARCH_DEFAULT_LIMIT = 50;

export type ItemSearchFilters = {
  backlogKey?: string;
  statusId?: string;
  /** A user id, or `"me"` for the actor. */
  assignee?: string;
  type?: ItemType;
  /** Free text, matched case-insensitively on the key and the title. */
  query?: string;
  limit?: number;
  cursor?: string | null;
};

export type ItemSearchPage = { items: ItemSummary[]; nextCursor: string | null };

const assignee = alias(user, "item_search_assignee");

type Cursor = { createdAt: Date; id: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`, "utf8").toString("base64url");
}

/** `null` for anything that is not a cursor this module produced. */
export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const separator = decoded.indexOf("|");
  if (separator === -1) return null;
  const createdAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { createdAt, id };
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Curseur de pagination invalide.");
    this.name = "InvalidCursorError";
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function searchItemsForActor(actorId: string, filters: ItemSearchFilters = {}): Promise<ItemSearchPage> {
  const limit = Math.min(Math.max(filters.limit ?? ITEM_SEARCH_DEFAULT_LIMIT, 1), ITEM_SEARCH_MAX_LIMIT);
  const cursor = decodeCursor(filters.cursor);
  if (filters.cursor && !cursor) throw new InvalidCursorError();

  const conditions: SQL[] = [isNull(items.deletedAt), browseAccessPredicate(actorId)];
  if (filters.backlogKey) conditions.push(eq(backlogs.key, filters.backlogKey.toUpperCase()));
  if (filters.statusId) conditions.push(eq(items.statusId, filters.statusId));
  if (filters.assignee) conditions.push(eq(items.assigneeId, filters.assignee === "me" ? actorId : filters.assignee));
  if (filters.type) conditions.push(eq(items.type, filters.type));
  const query = filters.query?.trim();
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(or(ilike(items.key, pattern), ilike(items.title, pattern))!);
  }
  if (cursor) {
    conditions.push(
      or(
        gt(items.createdAt, cursor.createdAt),
        and(eq(items.createdAt, cursor.createdAt), gt(items.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select({
      id: items.id,
      key: items.key,
      type: items.type,
      kind: items.kind,
      title: items.title,
      priority: items.priority,
      estimatePoints: items.estimatePoints,
      parentId: items.parentId,
      startDate: items.startDate,
      dueDate: items.dueDate,
      createdAt: items.createdAt,
      updatedAt: items.updatedAt,
      closedAt: items.closedAt,
      backlogId: backlogs.id,
      backlogKey: backlogs.key,
      backlogName: backlogs.name,
      statusId: items.statusId,
      statusName: statuses.name,
      statusCategory: statuses.category,
      assigneeId: items.assigneeId,
      assigneeName: assignee.name,
    })
    .from(items)
    .innerJoin(backlogs, eq(items.backlogId, backlogs.id))
    .innerJoin(statuses, eq(items.statusId, statuses.id))
    .leftJoin(assignee, eq(items.assigneeId, assignee.id))
    .where(and(...conditions))
    .orderBy(asc(items.createdAt), asc(items.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toItemSummary),
    nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

