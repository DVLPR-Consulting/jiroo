import {
  addDays,
  daysBetween,
  maxDay,
  minDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  type Day,
} from "@/lib/roadmap/days";
import type { Interval } from "@/lib/roadmap/intervals";

/** Jira's timeline zoom levels. */
export type Zoom = "weeks" | "months" | "quarters";
export const ZOOMS: readonly Zoom[] = ["weeks", "months", "quarters"];

/** Width of one day, in pixels, at each zoom. */
export const DAY_WIDTH: Record<Zoom, number> = { weeks: 32, months: 10, quarters: 3 };

/** The visible days, from `origin` to `end` inclusive. */
export type Timeline = { origin: Day; end: Day; zoom: Zoom };

const UNIT_START: Record<Zoom, (day: Day) => Day> = {
  weeks: startOfWeek,
  months: startOfMonth,
  quarters: startOfQuarter,
};
/** Days safely past the end of one unit, to reach the next unit's start. */
const UNIT_SPAN: Record<Zoom, number> = { weeks: 7, months: 32, quarters: 93 };
/** A timeline shows at least this many days, so a sparse backlog still reads. */
const MIN_DAYS: Record<Zoom, number> = { weeks: 84, months: 183, quarters: 730 };

function nextUnit(day: Day, zoom: Zoom): Day {
  return UNIT_START[zoom](addDays(UNIT_START[zoom](day), UNIT_SPAN[zoom]));
}

/**
 * Covers every bar and today, with one unit of padding on each side, from the
 * start of a unit (Monday, month or quarter).
 */
export function buildTimeline(bars: readonly Interval[], today: Day, zoom: Zoom): Timeline {
  const first = minDay([today, ...bars.map((bar) => bar.start)]) ?? today;
  const last = maxDay([today, ...bars.map((bar) => bar.end)]) ?? today;
  const origin = UNIT_START[zoom](addDays(UNIT_START[zoom](first), -1));
  let end = addDays(nextUnit(nextUnit(last, zoom), zoom), -1);
  if (daysBetween(origin, end) < MIN_DAYS[zoom]) end = addDays(origin, MIN_DAYS[zoom]);
  return { origin, end, zoom };
}

export function timelineWidth(timeline: Timeline): number {
  return (daysBetween(timeline.origin, timeline.end) + 1) * DAY_WIDTH[timeline.zoom];
}

/** Left edge of a day. */
export function dayToX(timeline: Timeline, day: Day): number {
  return daysBetween(timeline.origin, day) * DAY_WIDTH[timeline.zoom];
}

export function barRect(timeline: Timeline, bar: Interval): { left: number; width: number } {
  return {
    left: dayToX(timeline, bar.start),
    width: (daysBetween(bar.start, bar.end) + 1) * DAY_WIDTH[timeline.zoom],
  };
}

/** The day under a pointer, snapped to whole days. */
export function xToDay(timeline: Timeline, x: number): Day {
  return addDays(timeline.origin, Math.floor(x / DAY_WIDTH[timeline.zoom]));
}

/** A horizontal drag in whole days. */
export function dragDays(timeline: Timeline, dx: number): number {
  return Math.round(dx / DAY_WIDTH[timeline.zoom]) || 0;
}

export type Tick = { day: Day; x: number; label: string };

const weekLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const monthYearLabel = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function tickLabel(day: Day, zoom: Zoom): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (zoom === "weeks") return weekLabel.format(date);
  if (zoom === "months") {
    return (day.slice(5, 7) === "01" ? monthYearLabel : monthLabel).format(date);
  }
  return `T${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1} ${day.slice(0, 4)}`;
}

/** One header mark at each unit start of the timeline. */
export function ticks(timeline: Timeline): Tick[] {
  const result: Tick[] = [];
  let day = UNIT_START[timeline.zoom](timeline.origin);
  if (day < timeline.origin) day = nextUnit(day, timeline.zoom);
  while (day <= timeline.end) {
    result.push({ day, x: dayToX(timeline, day), label: tickLabel(day, timeline.zoom) });
    day = nextUnit(day, timeline.zoom);
  }
  return result;
}
