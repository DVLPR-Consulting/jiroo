/**
 * Item tables use `table-fixed`: the title column only receives what the
 * fixed-width columns leave over, which is nothing on a phone (JIR-42). Each
 * table therefore floors its width at its fixed columns plus a readable title
 * column, and its own scroll container absorbs the overflow instead.
 *
 * The floor stays below the title width both tables already get at 1440 px,
 * so wide screens keep their layout.
 */
export const TITLE_COLUMN_MIN_REM = 12;

/**
 * A fixed-width table column: the Tailwind width class its `<col>` renders
 * (a static string, so Tailwind generates it) and the same width in rem for
 * the table floor. The unit test keeps the two in step.
 */
export type FixedColumn = { readonly className: string; readonly rem: number };

/** Optional checkbox column, first in both item tables. */
export const SELECTION_COLUMN = { className: "w-10", rem: 2.5 } as const satisfies FixedColumn;

/**
 * Backlog / sprint tables, in colgroup order. The flexible title column sits
 * between `key` and `status`.
 */
export const BACKLOG_COLUMNS = {
  order: { className: "w-10", rem: 2.5 },
  key: { className: "w-32", rem: 8 },
  status: { className: "w-40", rem: 10 },
  priority: { className: "w-28", rem: 7 },
  points: { className: "w-24", rem: 6 },
  fixVersions: { className: "w-44", rem: 11 },
  assignee: { className: "w-44", rem: 11 },
} as const satisfies Record<string, FixedColumn>;

/**
 * List view table, in colgroup order. The flexible title column sits between
 * `key` and `status`; `fixVersions` (last) is optional.
 */
export const LIST_COLUMNS = {
  key: { className: "w-32", rem: 8 },
  status: { className: "w-40", rem: 10 },
  priority: { className: "w-16", rem: 4 },
  points: { className: "w-24", rem: 6 },
  labels: { className: "w-48", rem: 12 },
  dueDate: { className: "w-32", rem: 8 },
  assignee: { className: "w-44", rem: 11 },
  fixVersions: { className: "w-44", rem: 11 },
} as const satisfies Record<string, FixedColumn>;

/** Minimum CSS width of a fixed-layout table, given its fixed columns. */
export function fixedTableMinWidth(columns: readonly FixedColumn[]): string {
  const fixed = columns.reduce((total, column) => total + column.rem, 0);
  return `${fixed + TITLE_COLUMN_MIN_REM}rem`;
}
