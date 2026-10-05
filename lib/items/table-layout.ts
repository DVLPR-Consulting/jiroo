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

/** Minimum CSS width of a fixed-layout table, given its fixed columns in rem. */
export function fixedTableMinWidth(fixedColumnsRem: readonly number[]): string {
  const fixed = fixedColumnsRem.reduce((total, width) => total + width, 0);
  return `${fixed + TITLE_COLUMN_MIN_REM}rem`;
}
