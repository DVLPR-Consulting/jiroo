import { describe, expect, it } from "vitest";
import { fixedTableMinWidth, TITLE_COLUMN_MIN_REM } from "./table-layout";

describe("fixedTableMinWidth", () => {
  it("adds the title column floor to the fixed columns", () => {
    expect(fixedTableMinWidth([2.5, 8, 10])).toBe(`${20.5 + TITLE_COLUMN_MIN_REM}rem`);
  });

  it("reserves the title floor when every other column is optional", () => {
    expect(fixedTableMinWidth([])).toBe(`${TITLE_COLUMN_MIN_REM}rem`);
  });
});
