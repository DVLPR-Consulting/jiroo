import { addDays, maxDay, minDay, type Day } from "@/lib/roadmap/days";

/** Inclusive calendar days covered by a bar. */
export type Interval = { start: Day; end: Day };
/**
 * A bar on the roadmap. `derived` when any of its days is computed (from the
 * tasks, the sprint or the epics) rather than set on the item: it is drawn
 * hatched, and dragging it saves those days on the item, as in Jira.
 */
export type Bar = Interval & { derived: boolean };
/** The days set on an item. */
export type OwnDays = { start: Day | null; due: Day | null };

function spanOf(bars: readonly (Bar | null)[]): Interval | null {
  const present = bars.filter((bar): bar is Bar => bar !== null);
  const start = minDay(present.map((bar) => bar.start));
  const end = maxDay(present.map((bar) => bar.end));
  return start && end ? { start, end } : null;
}

/** A single known day shows as a one-day bar. */
function ownBar({ start, due }: OwnDays): Bar | null {
  if (start && due) return { start, end: due, derived: false };
  const day = start ?? due;
  return day ? { start: day, end: day, derived: false } : null;
}

/** A task: its own days, else its sprint's planned days (Jira, Scrum). */
export function taskBar(
  own: OwnDays,
  sprint: { start: Day | null; end: Day | null } | null,
): Bar | null {
  const bar = ownBar(own);
  if (bar) return bar;
  return sprint?.start && sprint.end ? { start: sprint.start, end: sprint.end, derived: true } : null;
}

/**
 * An epic: its own days, else the span of its tasks. A single own day is
 * completed by the derived other one, unless that would end before it starts.
 */
export function epicBar(own: OwnDays, taskBars: readonly (Bar | null)[]): Bar | null {
  if (own.start && own.due) return { start: own.start, end: own.due, derived: false };
  const span = spanOf(taskBars);
  if (!span) return ownBar(own);
  if (own.start) {
    return span.end >= own.start
      ? { start: own.start, end: span.end, derived: true }
      : ownBar(own);
  }
  if (own.due) {
    return span.start <= own.due
      ? { start: span.start, end: own.due, derived: true }
      : ownBar(own);
  }
  return { ...span, derived: true };
}

/** A component (group heading): the span of its epics, read-only. */
export function groupBar(epicBars: readonly (Bar | null)[]): Bar | null {
  const span = spanOf(epicBars);
  return span ? { ...span, derived: true } : null;
}

export function progressOf(categories: readonly string[]): { done: number; total: number } {
  return {
    done: categories.filter((category) => category === "done").length,
    total: categories.length,
  };
}

export function moveBar(bar: Interval, days: number): Interval {
  return { start: addDays(bar.start, days), end: addDays(bar.end, days) };
}

/** Moves one edge to `day`, never past the other edge. */
export function resizeBar(bar: Interval, edge: "start" | "end", day: Day): Interval {
  return edge === "start"
    ? { start: day <= bar.end ? day : bar.end, end: bar.end }
    : { start: bar.start, end: day >= bar.start ? day : bar.start };
}

/** ←/→ move the bar a day; Shift moves the due day, Alt the start day. */
export function keyboardEdit(
  bar: Interval,
  key: string,
  modifiers: { shiftKey?: boolean; altKey?: boolean },
): Interval | null {
  const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
  if (step === 0) return null;
  if (modifiers.shiftKey) return resizeBar(bar, "end", addDays(bar.end, step));
  if (modifiers.altKey) return resizeBar(bar, "start", addDays(bar.start, step));
  return moveBar(bar, step);
}

export type DragMode = "move" | "start" | "end" | "plan";

/**
 * The bar under a pointer dragged `days` from where it was pressed: the whole
 * bar, one edge, or, to plan an item, the span between the pressed day and
 * the current one.
 */
export function dragInterval(mode: DragMode, origin: Interval, days: number): Interval {
  if (mode === "move") return moveBar(origin, days);
  if (mode === "start") return resizeBar(origin, "start", addDays(origin.start, days));
  if (mode === "end") return resizeBar(origin, "end", addDays(origin.end, days));
  const day = addDays(origin.start, days);
  return day < origin.start ? { start: day, end: origin.start } : { start: origin.start, end: day };
}

export function sameInterval(a: Interval, b: Interval): boolean {
  return a.start === b.start && a.end === b.end;
}

export function toDatePatch(bar: Interval): { startDate: Day; dueDate: Day } {
  return { startDate: bar.start, dueDate: bar.end };
}
