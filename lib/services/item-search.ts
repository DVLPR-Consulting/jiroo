import { and, asc, eq, gt, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
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

/**
 * The creation instant travels as PostgreSQL's own text (microseconds kept):
 * a JavaScript Date would round it to the millisecond and the comparison
 * would then see the last item of a page again on the next one.
 */
type Cursor = { createdAt: string; id: string };

const PG_TIMESTAMPTZ = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?([+-]\d{2})(:?\d{2})?$/;

/** A PostgreSQL timestamptz text whose calendar parts exist, so the cast cannot fail. */
function isValidInstantText(value: string): boolean {
  const match = PG_TIMESTAMPTZ.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, fraction = "", offsetHours, offsetMinutes = "00"] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction.slice(0, 4)}${offsetHours}:${offsetMinutes.replace(":", "")}`;
  // Date.parse refuses an impossible date; comparing the day back rules out an accepted rollover.
  const parsed = new Date(iso);
  const offsetMinutesTotal = Math.abs(Number(offsetHours)) * 60 + Number(offsetMinutes.replace(":", ""));
  return !Number.isNaN(parsed.getTime())
    // PostgreSQL has no year 0 and caps a zone offset at 15:59.
    && Number(year) >= 1
    && offsetMinutesTotal <= 15 * 60 + 59 && Number(offsetMinutes.replace(":", "")) < 60
    && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60
    && Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1
    && Number(day) <= new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString("base64url");
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
  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (!isValidInstantText(createdAt) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
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

const summaryColumns = {
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
  // The exact instant, for the cursor (see Cursor).
  createdAtExact: sql<string>`${items.createdAt}::text`,
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
};

function summaryQuery() {
  return db
    .select(summaryColumns)
    .from(items)
    .innerJoin(backlogs, eq(items.backlogId, backlogs.id))
    .innerJoin(statuses, eq(items.statusId, statuses.id))
    .leftJoin(assignee, eq(items.assigneeId, assignee.id));
}

/** One live item by key, as the actor may see it; `null` when unknown or unreadable. */
export async function findItemSummaryByKey(actorId: string, key: string): Promise<ItemSummary | null> {
  const [row] = await summaryQuery()
    .where(and(eq(items.key, key.toUpperCase()), isNull(items.deletedAt), browseAccessPredicate(actorId)))
    .limit(1);
  return row ? toItemSummary(row) : null;
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
    // Compared in PostgreSQL at its own precision, never through a JS Date.
    const after = sql`${cursor.createdAt}::timestamptz`;
    conditions.push(
      or(
        sql`${items.createdAt} > ${after}`,
        and(sql`${items.createdAt} = ${after}`, gt(items.id, cursor.id)),
      )!,
    );
  }

  const rows = await summaryQuery()
    .where(and(...conditions))
    .orderBy(asc(items.createdAt), asc(items.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toItemSummary),
    nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.createdAtExact, id: last.id }) : null,
  };
}

