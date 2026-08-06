import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { browseAccessPredicate } from "@/lib/auth/accessible-backlogs";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import { readRecentKeys } from "@/lib/items/recent";
import { isBlankQuery, toPrefixTsQuery } from "@/lib/items/search";

// ---------------------------------------------------------------------------
// SearchResult — shape of each row returned by searchItems
// ---------------------------------------------------------------------------

export type SearchResult = {
  id: string;
  key: string;
  type: string;
  title: string;
  backlogKey: string;
  statusId: string;
  statusName: string;
  statusColor: string;
  assigneeName: string | null;
};

// ---------------------------------------------------------------------------
// searchItems
//
// Cross-backlog full-text search. Any authenticated user may call this —
// RBAC enforcement (session check) lives in the server action layer above.
//
// Strategy:
//   - Blank query → return [] immediately (to_tsquery('french','') would error).
//   - Build a safe prefix tsquery via toPrefixTsQuery (injection-safe: tsq is
//     passed as a BOUND parameter inside the sql`` template, never concatenated).
//   - WHERE: not-deleted AND (full-text hit OR key ILIKE '<prefix>%').
//     The ILIKE predicate is always included so that typing "CASS-39" finds the
//     exact item even when the tsquery is empty (e.g. purely numeric suffix after
//     the hyphen is not meaningful to the french text-search dictionary).
//   - When tsq === "" (query survived but produced no ts-terms, e.g. "39"):
//     skip the @@ predicate entirely — calling to_tsquery('french','') errors.
//   - ORDER: key-prefix matches first, then ts_rank (desc), then key (asc).
// ---------------------------------------------------------------------------

export async function searchItems(
  userId: string,
  rawQuery: string,
  limit = 20,
): Promise<SearchResult[]> {
  if (isBlankQuery(rawQuery)) return [];

  const tsq = toPrefixTsQuery(rawQuery);
  // keyLike is bound as a parameter — never interpolated as a raw string
  const keyLike = `${rawQuery.trim()}%`;

  // Build the WHERE clause depending on whether we have a valid tsquery.
  // When tsq === "" we only match by key ILIKE (avoids to_tsquery('french','') error).
  const textOrKeyCondition =
    tsq === ""
      ? ilike(items.key, keyLike)
      : or(
          sql`${items.search} @@ to_tsquery('french', ${tsq})`,
          ilike(items.key, keyLike),
        );

  // ORDER BY: key-prefix hits float first, then relevance, then stable key sort.
  // The CASE expression and to_tsquery call both receive bound params.
  const keyMatchOrder = sql<number>`case when ${items.key} ilike ${keyLike} then 0 else 1 end`;

  const baseQuery = db
    .select({
      id: items.id,
      key: items.key,
      type: items.type,
      title: items.title,
      backlogKey: backlogs.key,
      statusId: statuses.id,
      statusName: statuses.name,
      statusColor: statuses.color,
      assigneeName: user.name,
    })
    .from(items)
    .innerJoin(backlogs, sql`${items.backlogId} = ${backlogs.id}`)
    .innerJoin(statuses, sql`${items.statusId} = ${statuses.id}`)
    .leftJoin(user, eq(items.assigneeId, user.id))
    .where(
      and(
        isNull(items.deletedAt),
        isNull(backlogs.archivedAt),
        browseAccessPredicate(userId),
        textOrKeyCondition,
      ),
    )
    .limit(limit);

  if (tsq === "") {
    return baseQuery.orderBy(asc(keyMatchOrder), asc(items.key));
  }

  return baseQuery.orderBy(
    asc(keyMatchOrder),
    // Higher ts_rank = better match → DESC so best matches come first
    sql`ts_rank(${items.search}, to_tsquery('french', ${tsq})) desc`,
    asc(items.key),
  );
}

export async function recentItems(
  userId: string,
  keys: string[],
): Promise<SearchResult[]> {
  // Keep this DAL primitive bounded even when called outside its server action.
  const requestedKeys = readRecentKeys(JSON.stringify(keys));
  if (requestedKeys.length === 0) return [];

  const rows = await db
    .select({
      id: items.id,
      key: items.key,
      type: items.type,
      title: items.title,
      backlogKey: backlogs.key,
      statusId: statuses.id,
      statusName: statuses.name,
      statusColor: statuses.color,
      assigneeName: user.name,
    })
    .from(items)
    .innerJoin(backlogs, eq(items.backlogId, backlogs.id))
    .innerJoin(statuses, eq(items.statusId, statuses.id))
    .leftJoin(user, eq(items.assigneeId, user.id))
    .where(
      and(
        inArray(items.key, requestedKeys),
        isNull(items.deletedAt),
        isNull(backlogs.archivedAt),
        browseAccessPredicate(userId),
      ),
    );

  const byKey = new Map(rows.map((row) => [row.key, row]));
  return requestedKeys.flatMap((key) => {
    const row = byKey.get(key);
    return row ? [row] : [];
  });
}
