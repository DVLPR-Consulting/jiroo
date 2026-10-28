// @vitest-environment node
import { describe, expect, it } from "vitest";
import { announcedDropStatus, compareDrop, estimateDropSeriesMs, offscreenDropTargets, readDropAction } from "../e2e/support/drops";

const STATUSES = [{ id: "todo-id", name: "À faire" }, { id: "review-id", name: "En revue" }, { id: "done-id", name: "Terminé" }];
const LABEL = "DRPM-1 — Synthetic moving card";
const GOOD = { itemKey: "DRPM-1", expected: "review-id", announced: "review-id", sent: "review-id", reloaded: "review-id" };

describe("offscreen target selection", () => {
  it("selects wholly offscreen columns nearest first, excluding partial and source columns", () => {
    const columns = [
      { id: "far", name: "Far", left: 930, right: 1226 },
      { id: "partial", name: "Partial", left: 320, right: 616 },
      { id: "nearest", name: "Nearest", left: 630, right: 926 },
      { id: "origin", name: "Origin", left: 0, right: 296 },
    ];
    const before = structuredClone(columns);
    expect(offscreenDropTargets(columns, { left: 0, right: 390 }, "origin").map(({ id }) => id)).toEqual(["nearest", "far"]);
    expect(columns).toEqual(before);
  });
  it("handles a nonzero viewport origin and an exact offscreen boundary", () => {
    const columns = [
      { id: "left", name: "Left", left: -200, right: 96 },
      { id: "right", name: "Right", left: 500, right: 796 },
      { id: "visible", name: "Visible", left: 100, right: 396 },
    ];
    expect(offscreenDropTargets(columns, { left: 100, right: 500 }, "visible").map(({ id }) => id)).toEqual(["right", "left"]);
    expect(offscreenDropTargets([], { left: 0, right: 390 }, "origin")).toEqual([]);
  });
  it("rejects missing or invalid geometry rather than silently reducing coverage", () => {
    expect(() => offscreenDropTargets([], { left: 0, right: 0 }, "origin")).toThrow();
    expect(() => offscreenDropTargets([{ id: "x", name: "X", left: Number.NaN, right: 900 }], { left: 0, right: 390 }, "origin")).toThrow();
  });
});

describe("independent live-region and action observations", () => {
  it("accepts only an exact announcement about the moving card and known column", () => {
    expect(announcedDropStatus(`${LABEL} déplacé vers En revue.`, LABEL, STATUSES)).toBe("review-id");
    expect(announcedDropStatus("Other card déplacé vers En revue.", LABEL, STATUSES)).toBeNull();
    expect(announcedDropStatus(`${LABEL} déposé dans En revue.`, LABEL, STATUSES)).toBeNull();
    expect(announcedDropStatus(`${LABEL} déplacé vers Unknown.`, LABEL, STATUSES)).toBeNull();
  });
  it("reads the actual statusId of exactly one matching server-action argument", () => {
    expect(readDropAction('[{"id":"moving","statusId":"done-id"}]', "moving")).toEqual({ statusId: "done-id" });
    expect(readDropAction('[{"id":"other","statusId":"review-id"},{"id":"moving","statusId":"done-id"}]', "moving")).toEqual({ statusId: "done-id" });
    expect(readDropAction('[{"id":"moving"}]', "moving")).toEqual({ statusId: null });
  });
  it.each([null, "not JSON", "{}", '[{"id":"other","statusId":"done-id"}]', '[{"id":"moving","statusId":"a"},{"id":"moving","statusId":"b"}]'])("refuses unrelated or ambiguous payload %s", (body) => {
    expect(readDropAction(body, "moving")).toBeNull();
  });
});

describe("drop consistency", () => {
  it("requires all three independent values to match the intended column", () => {
    expect(compareDrop(GOOD, STATUSES).matches).toBe(true);
    expect(compareDrop({ ...GOOD, announced: "done-id", sent: "done-id", reloaded: "done-id" }, STATUSES).matches).toBe(false);
  });
  it.each(["announced", "sent", "reloaded"] as const)("reports a divergent or missing %s with business labels", (field) => {
    for (const value of ["done-id", null]) {
      const result = compareDrop({ ...GOOD, [field]: value }, STATUSES);
      expect(result.matches).toBe(false);
      expect(result.message).toContain("DRPM-1");
      expect(result.message).toContain("expected=En revue");
      expect(result.message).toContain(`${field}=${value === null ? "unavailable" : "Terminé"}`);
    }
  });
  it("does not accept an unknown intended status even if every value agrees", () => {
    expect(compareDrop({ itemKey: "DRPM-1", expected: "unknown", announced: "unknown", sent: "unknown", reloaded: "unknown" }, STATUSES).matches).toBe(false);
  });
});

describe("optional series time estimate", () => {
  it("projects measured fixed work plus distance-dependent auto-scroll with a 25% margin", () => {
    expect(estimateDropSeriesMs({ drops: 50, wallMs: 100000, scrollMs: 25000, scrollPx: 12500 }, 1000, 50)).toBe(218750);
  });
  it("rejects estimates without real positive scroll observations", () => {
    expect(() => estimateDropSeriesMs({ drops: 50, wallMs: 1000, scrollMs: 0, scrollPx: 0 }, 1000, 50)).toThrow();
  });
});
