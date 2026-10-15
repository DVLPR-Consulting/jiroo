import { describe, expect, it } from "vitest";
import {
  epicBar,
  groupBar,
  keyboardEdit,
  moveBar,
  progressOf,
  resizeBar,
  taskBar,
  toDatePatch,
} from "@/lib/roadmap/intervals";

const SPRINT = { start: "2026-10-12", end: "2026-10-25" };

describe("taskBar", () => {
  it("uses the task's own days", () => {
    expect(taskBar({ start: "2026-10-01", due: "2026-10-10" }, SPRINT)).toEqual({
      start: "2026-10-01",
      end: "2026-10-10",
      derived: false,
    });
  });

  it("shows a single known day as a one-day bar", () => {
    expect(taskBar({ start: null, due: "2026-10-10" }, null)).toEqual({
      start: "2026-10-10",
      end: "2026-10-10",
      derived: false,
    });
    expect(taskBar({ start: "2026-10-03", due: null }, SPRINT)).toMatchObject({
      start: "2026-10-03",
      end: "2026-10-03",
    });
  });

  it("falls back on its sprint's planned days, as derived", () => {
    expect(taskBar({ start: null, due: null }, SPRINT)).toEqual({ ...SPRINT, derived: true });
  });

  it("has no bar without days nor sprint", () => {
    expect(taskBar({ start: null, due: null }, null)).toBeNull();
    expect(taskBar({ start: null, due: null }, { start: null, end: null })).toBeNull();
  });
});

describe("epicBar", () => {
  const children = [
    { start: "2026-10-05", end: "2026-10-09", derived: false },
    null,
    { start: "2026-10-12", end: "2026-10-25", derived: true },
  ];

  it("prefers the epic's own days", () => {
    expect(epicBar({ start: "2026-09-01", due: "2026-12-31" }, children)).toEqual({
      start: "2026-09-01",
      end: "2026-12-31",
      derived: false,
    });
  });

  it("spans its tasks when it has no days of its own", () => {
    expect(epicBar({ start: null, due: null }, children)).toEqual({
      start: "2026-10-05",
      end: "2026-10-25",
      derived: true,
    });
  });

  it("completes a single own day with the derived other one", () => {
    expect(epicBar({ start: "2026-10-01", due: null }, children)).toEqual({
      start: "2026-10-01",
      end: "2026-10-25",
      derived: true,
    });
    expect(epicBar({ start: null, due: "2026-11-30" }, children)).toEqual({
      start: "2026-10-05",
      end: "2026-11-30",
      derived: true,
    });
  });

  it("never ends before it starts when completing", () => {
    expect(epicBar({ start: "2026-11-01", due: null }, children)).toEqual({
      start: "2026-11-01",
      end: "2026-11-01",
      derived: false,
    });
  });

  it("is a one-day bar with a single own day and no tasks", () => {
    expect(epicBar({ start: null, due: "2026-11-30" }, [])).toEqual({
      start: "2026-11-30",
      end: "2026-11-30",
      derived: false,
    });
  });

  it("has no bar without days nor scheduled tasks", () => {
    expect(epicBar({ start: null, due: null }, [null])).toBeNull();
  });
});

describe("groupBar", () => {
  it("spans its epics, always derived", () => {
    expect(
      groupBar([
        { start: "2026-10-01", end: "2026-10-10", derived: false },
        null,
        { start: "2026-09-15", end: "2026-10-05", derived: true },
      ]),
    ).toEqual({ start: "2026-09-15", end: "2026-10-10", derived: true });
    expect(groupBar([null])).toBeNull();
  });
});

describe("progressOf", () => {
  it("counts done tasks over all tasks", () => {
    expect(progressOf(["done", "todo", "in_progress", "done"])).toEqual({ done: 2, total: 4 });
    expect(progressOf([])).toEqual({ done: 0, total: 0 });
  });
});

describe("bar edits", () => {
  const bar = { start: "2026-10-05", end: "2026-10-09" };

  it("moves both days together", () => {
    expect(moveBar(bar, 3)).toEqual({ start: "2026-10-08", end: "2026-10-12" });
    expect(moveBar(bar, -5)).toEqual({ start: "2026-09-30", end: "2026-10-04" });
  });

  it("resizes one edge, never past the other", () => {
    expect(resizeBar(bar, "start", "2026-10-01")).toEqual({ start: "2026-10-01", end: "2026-10-09" });
    expect(resizeBar(bar, "end", "2026-10-20")).toEqual({ start: "2026-10-05", end: "2026-10-20" });
    expect(resizeBar(bar, "start", "2026-10-15")).toEqual({ start: "2026-10-09", end: "2026-10-09" });
    expect(resizeBar(bar, "end", "2026-10-01")).toEqual({ start: "2026-10-05", end: "2026-10-05" });
  });

  it("maps arrow keys: move, Shift for the due day, Alt for the start day", () => {
    expect(keyboardEdit(bar, "ArrowRight", {})).toEqual({ start: "2026-10-06", end: "2026-10-10" });
    expect(keyboardEdit(bar, "ArrowLeft", {})).toEqual({ start: "2026-10-04", end: "2026-10-08" });
    expect(keyboardEdit(bar, "ArrowRight", { shiftKey: true })).toEqual({
      start: "2026-10-05",
      end: "2026-10-10",
    });
    expect(keyboardEdit(bar, "ArrowLeft", { altKey: true })).toEqual({
      start: "2026-10-04",
      end: "2026-10-09",
    });
    expect(keyboardEdit(bar, "Enter", {})).toBeNull();
  });

  it("turns a bar into the item's date patch", () => {
    expect(toDatePatch(bar)).toEqual({ startDate: "2026-10-05", dueDate: "2026-10-09" });
  });
});
