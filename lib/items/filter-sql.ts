import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  itemFixVersions,
  itemLabels,
  items,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import { binaryTextOrder } from "@/lib/db/order";
import { ITEM_KINDS, ITEM_TYPES, PRIORITIES, type ItemKind, type ItemType } from "@/lib/design/constants";
import {
  normalizeSearchText,
  type Filters,
  type GroupKey,
  type SortDir,
  type SortField,
} from "@/lib/items/filter";
import { NO_SPRINT } from "@/lib/items/sprint-filter";

/**
 * The views' filters, sorts and groups compiled to SQL (JIR-143, JIR-120 D1).
 * Every predicate keeps `matchItem`'s semantics (`lib/items/filter.ts`), every
 * order `sortItems`' and every group key `groupItems`': the parity suite
 * (`lib/services/view-rows.integration.test.ts`) compares them on the same data.
 * All expressions read the `items` table of the enclosing query. A query that
 * selects one of them must join another table: Drizzle drops the table name of
 * the columns selected from a single table, and a correlated subquery would
 * then read its own columns.
 */

/** The live items of a backlog: what every view starts from. */
export function liveItemsOf(backlogId: string): SQL {
  return and(eq(items.backlogId, backlogId), isNull(items.deletedAt))!;
}

/**
 * Ids the old string comparison could match: the lower-case canonical form
 * PostgreSQL returns. Any other value (malformed, upper case) matched nothing
 * in memory and must not reach a uuid comparison, which would fail or match.
 */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function canonicalIds(values: readonly string[]): string[] {
  return values.filter((value) => CANONICAL_UUID.test(value));
}

/** A facet of ids: no condition when unused, `false` when nothing can match. */
function idFacet(values: readonly string[], condition: (ids: string[]) => SQL): SQL | undefined {
  if (values.length === 0) return undefined;
  const ids = canonicalIds(values);
  return ids.length === 0 ? sql`false` : condition(ids);
}

let diacriticClass: string | null = null;

/**
 * A PostgreSQL bracket expression holding every code point of the Unicode
 * `Diacritic` property, built from this runtime's own `\p{Diacritic}` so the
 * SQL folding drops exactly what `normalizeSearchText` drops.
 */
function diacriticPattern(): string {
  if (diacriticClass) return diacriticClass;
  const diacritic = /\p{Diacritic}/u;
  const ranges: Array<[number, number]> = [];
  let start = -1;
  for (let codePoint = 0; codePoint <= 0x110000; codePoint += 1) {
    const hit =
      codePoint <= 0x10ffff
      && (codePoint < 0xd800 || codePoint > 0xdfff)
      && diacritic.test(String.fromCodePoint(codePoint));
    if (hit && start < 0) start = codePoint;
    if (!hit && start >= 0) {
      ranges.push([start, codePoint - 1]);
      start = -1;
    }
  }
  const escape = (codePoint: number) =>
    codePoint <= 0xffff
      ? `\\u${codePoint.toString(16).padStart(4, "0")}`
      : `\\U${codePoint.toString(16).padStart(8, "0")}`;
  // Highest ranges first: « ^ » (U+005E) leading the class would negate it.
  diacriticClass = `[${ranges
    .reverse()
    .map(([from, to]) => (from === to ? escape(from) : `${escape(from)}-${escape(to)}`))
    .join("")}]`;
  return diacriticClass;
}

/**
 * `normalizeSearchText(title + " " + key)` in SQL. ICU's lower case is the
 * full Unicode mapping JavaScript applies (İ, final sigma), unlike the
 * database's own locale.
 */
function foldedSearchText(): SQL {
  return sql`regexp_replace(normalize(lower((${items.title} || ' ' || ${items.key}) collate "und-x-icu"), NFD), ${diacriticPattern()}, '', 'g')`;
}

/**
 * The ids an item's path names before its own: its strict ancestors (paths are
 * `root.<id>.<id>…` labels, ids without hyphens, `lib/tree/path.ts`). Looking
 * the ancestors up by primary key, then checking `@>`, avoids comparing every
 * row's path with every other's.
 */
export function ancestorIdsOf(path: SQLWrapper): SQL {
  return sql`string_to_array(ltree2text(subpath(${path}, 1, nlevel(${path}) - 2)), '.')::uuid[]`;
}

/** The item whose sprints count for it: a sous-tâche follows its parent tâche. */
function sprintMemberId(): SQL {
  return sql`case when ${items.type} = 'soustache' and ${items.parentId} is not null then ${items.parentId} else ${items.id} end`;
}

/** Jira's Sprint field: current sprints, and ended ones the item was not taken out of. */
function sprintMembership(backlogId: string, sprintIds: string[] | null): SQL {
  return sql`select 1 from ${sprintItems} inner join ${sprints} on ${sprints.id} = ${sprintItems.sprintId}
    where ${sprints.backlogId} = ${backlogId}
      and ${sprintItems.itemId} = ${sprintMemberId()}
      and (${sprintItems.leftAt} is null or ${sprintItems.outcome} is distinct from 'removed')
      ${sprintIds ? sql`and ${inArray(sprintItems.sprintId, sprintIds)}` : sql``}`;
}

/** `matchItem` as a condition on `items`; `undefined` when no filter is set. */
export function viewFilterCondition(backlogId: string, filters: Filters): SQL | undefined {
  const conditions: Array<SQL | undefined> = [];

  if (filters.types.length > 0) {
    const types = filters.types.filter((type): type is ItemType =>
      (ITEM_TYPES as readonly string[]).includes(type));
    conditions.push(types.length === 0 ? sql`false` : inArray(items.type, types));
  }
  conditions.push(idFacet(filters.statusIds, (ids) => inArray(items.statusId, ids)));
  if (filters.priorities.length > 0) {
    const priorities = filters.priorities.filter((priority) =>
      (PRIORITIES as readonly number[]).includes(priority));
    conditions.push(priorities.length === 0 ? sql`false` : inArray(items.priority, priorities));
  }
  if (filters.assignees.length > 0) {
    const userIds = filters.assignees.filter((value) => value !== "none");
    const unassigned = filters.assignees.includes("none");
    conditions.push(or(
      userIds.length > 0 ? inArray(items.assigneeId, userIds) : undefined,
      unassigned ? isNull(items.assigneeId) : undefined,
    ));
  }
  // OR within each facet, every facet ANDed.
  conditions.push(idFacet(filters.labels, (ids) =>
    sql`exists (select 1 from ${itemLabels}
      where ${itemLabels.itemId} = ${items.id} and ${inArray(itemLabels.labelId, ids)})`));
  conditions.push(idFacet(filters.releaseIds, (ids) =>
    sql`exists (select 1 from ${itemFixVersions}
      where ${itemFixVersions.backlogId} = ${backlogId}
        and ${itemFixVersions.itemId} = ${items.id}
        and ${inArray(itemFixVersions.releaseId, ids)})`));
  if (filters.sprintIds.length > 0) {
    const sprintIds = canonicalIds(filters.sprintIds.filter((value) => value !== NO_SPRINT));
    const noSprint = filters.sprintIds.includes(NO_SPRINT);
    conditions.push(or(
      sprintIds.length > 0 ? sql`exists (${sprintMembership(backlogId, sprintIds)})` : undefined,
      noSprint ? sql`not exists (${sprintMembership(backlogId, null)})` : undefined,
    ) ?? sql`false`);
  }
  if (filters.kind.length > 0) {
    const kinds = filters.kind.filter((kind): kind is ItemKind =>
      (ITEM_KINDS as readonly string[]).includes(kind));
    conditions.push(kinds.length === 0 ? sql`false` : inArray(items.kind, kinds));
  }
  // Under: a live strict ancestor of the item is one of the chosen items.
  conditions.push(idFacet(filters.underIds, (ids) => {
    const ancestor = alias(items, "under_ancestor");
    return sql`exists (select 1 from ${items} ${ancestor}
      where ${ancestor.id} = any(${ancestorIdsOf(items.path)})
        and ${inArray(ancestor.id, ids)}
        and ${ancestor.backlogId} = ${backlogId}
        and ${ancestor.deletedAt} is null
        and ${ancestor.path} @> ${items.path}
        and ${ancestor.id} <> ${items.id})`;
  }));
  const q = filters.q.trim();
  if (q) {
    conditions.push(sql`strpos(${foldedSearchText()}, ${normalizeSearchText(q)}) > 0`);
  }

  const defined = conditions.filter((condition): condition is SQL => condition !== undefined);
  return defined.length === 0 ? undefined : and(...defined);
}

/** The views' natural order: hierarchy depth, then rank (bytewise), then key. */
export function hierarchyOrder(): SQL[] {
  return [asc(items.depth), asc(binaryTextOrder(items.rank)), asc(items.key)];
}

/**
 * Collations created by migration 0025, the database twins of the in-memory
 * comparisons: `localeCompare` with `sensitivity: "base"` (titles equal
 * without case or accents, « Œuvre » = « oeuvre ») and with `numeric: true`
 * (« -9 » before « -10 »), both on ICU's root rules like JavaScript's.
 */
const TITLE_COLLATION = sql.raw(`"jiroo_base"`);
const KEY_COLLATION = sql.raw(`"jiroo_numeric"`);

function sortExpression(backlogId: string, field: SortField): SQL {
  switch (field) {
    case "priority": return sql`${items.priority}`;
    // The old comparison saw JavaScript dates: milliseconds, not microseconds.
    case "created": return sql`date_trunc('milliseconds', ${items.createdAt})`;
    case "updated": return sql`date_trunc('milliseconds', ${items.updatedAt})`;
    case "key": return sql`${items.key} collate ${KEY_COLLATION}`;
    case "title": return sql`${items.title} collate ${TITLE_COLLATION}`;
    // A status of another backlog (never expected) orders as 0, like before.
    case "status": return sql`coalesce((select ${statuses.order} from ${statuses}
      where ${statuses.id} = ${items.statusId} and ${statuses.backlogId} = ${backlogId}), 0)`;
    case "dueDate": return sql`${items.dueDate}`;
  }
}

/**
 * `sortItems`: the chosen field in its direction (due dates always last when
 * missing), ties in hierarchy order whatever the direction.
 */
export function viewOrder(backlogId: string, sort: { field: SortField; dir: SortDir } | null): SQL[] {
  if (!sort) return hierarchyOrder();
  const expression = sortExpression(backlogId, sort.field);
  const ordered = sort.field === "dueDate"
    ? sql`${expression} ${sql.raw(sort.dir === "asc" ? "asc" : "desc")} nulls last`
    : sort.dir === "asc" ? asc(expression) : desc(expression);
  return [ordered, ...hierarchyOrder()];
}

/** `groupItems`' key of a row, as text; `''` when the view is not grouped. */
export function groupKeyExpression(backlogId: string, group: GroupKey | null): SQL<string> {
  switch (group) {
    case null: return sql<string>`''`;
    case "status": return sql<string>`${items.statusId}::text`;
    case "assignee": return sql<string>`coalesce(${items.assigneeId}, 'none')`;
    case "priority": return sql<string>`${items.priority}::text`;
    case "parent": return sql<string>`coalesce(${items.parentId}::text, 'none')`;
    case "component": {
      // The item itself when a composant, else its topmost live composant ancestor.
      const ancestor = alias(items, "component_ancestor");
      return sql<string>`case when ${items.type} = 'composant' then ${items.id}::text else coalesce((
        select ${ancestor.id}::text from ${items} ${ancestor}
        where ${ancestor.id} = any(${ancestorIdsOf(items.path)})
          and ${ancestor.backlogId} = ${backlogId}
          and ${ancestor.deletedAt} is null
          and ${ancestor.type} = 'composant'
          and ${ancestor.path} @> ${items.path}
          and ${ne(ancestor.id, items.id)}
        order by nlevel(${ancestor.path})
        limit 1
      ), 'none') end`;
    }
  }
}
