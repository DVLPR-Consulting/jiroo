import { describe, expect, it } from "vitest";
import {
  fixedTableMinWidth,
  LIST_COLUMNS,
  SELECTION_COLUMN,
  TITLE_COLUMN_MIN_REM,
  type FixedColumn,
} from "./table-layout";

describe("fixedTableMinWidth", () => {
  it("adds the title column floor to the fixed columns", () => {
    expect(
      fixedTableMinWidth([SELECTION_COLUMN, LIST_COLUMNS.key, LIST_COLUMNS.status]),
    ).toBe(`${20.5 + TITLE_COLUMN_MIN_REM}rem`);
  });

  it("reserves the title floor when every other column is optional", () => {
    expect(fixedTableMinWidth([])).toBe(`${TITLE_COLUMN_MIN_REM}rem`);
  });
});

describe("table columns", () => {
  const columns: [string, FixedColumn][] = [
    ["selection", SELECTION_COLUMN],
    ...Object.entries(LIST_COLUMNS).map(
      ([name, column]): [string, FixedColumn] => [`list.${name}`, column],
    ),
  ];

  it.each(columns)("%s reserves the width its class renders", (_, column) => {
    // Tailwind's default spacing scale: `w-N` is N × 0.25rem.
    const match = /^w-(\d+(?:\.5)?)$/.exec(column.className);
    expect(match, `${column.className} is not a spacing-scale width`).not.toBeNull();
    expect(Number(match?.[1]) * 0.25).toBe(column.rem);
  });
});
