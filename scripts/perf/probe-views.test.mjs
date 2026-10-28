// @vitest-environment node
import { describe, expect, it } from "vitest";
import { countSql, formatTable, percentile, totp, validatePanel } from "./probe-views.mjs";

describe("serial view probe", () => {
  it("accepts the actual nested drawer payload and rejects missing or wrong items", () => {
    expect(() => validatePanel(JSON.stringify({ kind: "item", panel: { detail: { id: "id-1", key: "PERFA-3" } } }), "PERFA-3")).not.toThrow();
    expect(() => validatePanel(JSON.stringify({ kind: "not-found" }), "PERFA-3")).toThrow(/Panel/);
    expect(() => validatePanel(JSON.stringify({ kind: "item", panel: { detail: { id: "id-1", key: "PERFA-4" } } }), "PERFA-3")).toThrow(/Panel/);
  });
  it("uses nearest-rank percentiles without mutating the samples", () => {
    const samples = [5, 1, 4, 2, 3];
    expect(percentile(samples, 0.5)).toBe(3);
    expect(percentile(samples, 0.95)).toBe(5);
    expect(samples).toEqual([5, 1, 4, 2, 3]);
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 0.95)).toBe(19);
    expect(() => percentile([], 0.5)).toThrow(/samples/);
  });

  it("formats decoded MiB and timing with two decimals, preserving SQL variability", () => {
    const table = formatTable({
      date: "2026-10-28T10:00:00.000Z", commit: "7710c1b", requests: 20,
      results: [{ operation: "List", bytes: { p50: 1048576 },
        fullMs: { p50: 1, p95: 2, max: 3 }, sql: { p50: 2, min: 2, max: 3 } }],
    });
    expect(table).toContain("7710c1b");
    expect(table).toContain("2026-10-28T10:00:00.000Z");
    expect(table).toContain("20");
    expect(table).toContain("| List | 1048576 | 1.00 | 1.00 | 2.00 | 3.00 | 2 [2–3] |");
  });

  it("generates six-digit SHA-1 TOTP from the RFC 6238 test secret", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    // RFC 6238 Appendix B, eight-digit results reduced to six digits.
    expect(totp(secret, 59000)).toBe("287082");
    expect(totp(secret, 1111111109000)).toBe("081804");
  });

  it("counts only completed SQL for the runtime role/database between unique markers", () => {
    const log = [
      "[1] owner@sample LOG: duration: 0.1 ms statement: SELECT 'before'",
      "[2] runtime@sample LOG: duration: 1.0 ms execute <unnamed>: SELECT 1",
      "[2] runtime@sample DETAIL: parameters: $1 = 'statement: example'",
      "[3] other@sample LOG: duration: 1.0 ms statement: SELECT 1",
      "[4] runtime@another LOG: duration: 1.0 ms statement: SELECT 1",
      "[2] runtime@sample LOG: duration: 0.1 ms statement: BEGIN",
      "[1] owner@sample LOG: duration: 0.1 ms statement: SELECT 'after'",
      "[2] runtime@sample LOG: duration: 0.1 ms statement: COMMIT",
    ].join("\n");
    expect(countSql(log, "before", "after", "runtime", "sample")).toBe(2);
    expect(() => countSql(log, "missing", "after", "runtime", "sample")).toThrow(/marker/);
    expect(() => countSql(log, "after", "before", "runtime", "sample")).toThrow(/marker/);
  });
});
