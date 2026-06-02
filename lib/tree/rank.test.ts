import { describe, expect, it } from "vitest";
import { rankBetween, rankFirst, rankLast } from "@/lib/tree/rank";

describe("fractional rank", () => {
  it("produces a rank before everything (prepend)", () => {
    const a = rankLast(null);
    const before = rankFirst(a);
    expect(before < a).toBe(true);
  });

  it("appends after the last rank", () => {
    const a = rankLast(null);
    const b = rankLast(a);
    expect(b > a).toBe(true);
  });

  it("inserts strictly between two ranks", () => {
    const a = rankLast(null);
    const b = rankLast(a);
    const mid = rankBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
  });

  it("throws on equal bounds", () => {
    const a = rankLast(null);
    expect(() => rankBetween(a, a)).toThrow();
  });
});
