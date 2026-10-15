import { describe, expect, it } from "vitest";
import {
  DAY_WIDTH,
  barRect,
  buildTimeline,
  dayToX,
  dragDays,
  ticks,
  xToDay,
} from "@/lib/roadmap/scale";

const TODAY = "2026-10-15";

describe("buildTimeline", () => {
  it("covers every bar and today, padded and aligned on the zoom unit", () => {
    const timeline = buildTimeline(
      [{ start: "2026-09-10", end: "2026-12-20" }],
      TODAY,
      "months",
    );
    // One month of padding each side, from a month start.
    expect(timeline.origin).toBe("2026-08-01");
    expect(timeline.end >= "2027-01-31").toBe(true);
  });

  it("starts weeks on a Monday and quarters on a quarter", () => {
    expect(buildTimeline([], TODAY, "weeks").origin).toBe("2026-10-05");
    expect(buildTimeline([], TODAY, "quarters").origin).toBe("2026-07-01");
  });

  it("keeps a minimum span around today without bars", () => {
    const timeline = buildTimeline([], TODAY, "months");
    expect(timeline.origin <= TODAY && timeline.end > "2027-01-01").toBe(true);
  });
});

describe("pixels", () => {
  const timeline = { origin: "2026-10-01", end: "2026-12-31", zoom: "weeks" as const };
  const w = DAY_WIDTH.weeks;

  it("places a day at its offset from the origin", () => {
    expect(dayToX(timeline, "2026-10-01")).toBe(0);
    expect(dayToX(timeline, "2026-10-04")).toBe(3 * w);
  });

  it("draws a bar over its inclusive days", () => {
    expect(barRect(timeline, { start: "2026-10-02", end: "2026-10-02" })).toEqual({
      left: w,
      width: w,
    });
    expect(barRect(timeline, { start: "2026-10-02", end: "2026-10-05" })).toEqual({
      left: w,
      width: 4 * w,
    });
  });

  it("reads the day under a pointer, snapping to whole days", () => {
    expect(xToDay(timeline, 0)).toBe("2026-10-01");
    expect(xToDay(timeline, w - 1)).toBe("2026-10-01");
    expect(xToDay(timeline, w * 3 + 1)).toBe("2026-10-04");
    expect(xToDay(timeline, -1)).toBe("2026-09-30");
  });

  it("turns a drag distance into whole days", () => {
    expect(dragDays(timeline, w * 2.4)).toBe(2);
    expect(dragDays(timeline, -w * 0.6)).toBe(-1);
    expect(dragDays(timeline, w * 0.4)).toBe(0);
  });
});

describe("ticks", () => {
  it("marks each Monday in weeks", () => {
    const result = ticks({ origin: "2026-10-12", end: "2026-10-31", zoom: "weeks" });
    expect(result.map((tick) => tick.day)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(result[0]).toMatchObject({ x: 0, label: "12 oct." });
  });

  it("marks each month start in months, with the year on January", () => {
    const result = ticks({ origin: "2026-11-01", end: "2027-02-15", zoom: "months" });
    expect(result.map((tick) => tick.label)).toEqual(["nov.", "déc.", "janv. 2027", "févr."]);
  });

  it("marks each quarter in quarters", () => {
    const result = ticks({ origin: "2026-07-01", end: "2027-03-31", zoom: "quarters" });
    expect(result.map((tick) => tick.label)).toEqual(["T3 2026", "T4 2026", "T1 2027"]);
  });
});
