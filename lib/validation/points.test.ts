import { describe, expect, it } from "vitest";
import { hasAtMostTwoDecimals, roundToCents } from "@/lib/validation/points";

describe("hasAtMostTwoDecimals", () => {
  it("accepts two-decimal values whose float product with 100 is not an integer (JIR-90)", () => {
    for (const value of [0.29, 1.15, 4.35, 8.2, 0.57, 1.13, 2.01]) {
      expect(Number.isInteger(value * 100)).toBe(false);
      expect(hasAtMostTwoDecimals(value)).toBe(true);
    }
  });

  it("accepts integers, one and two decimals", () => {
    for (const value of [0, 1, 13, 21.5, 0.01, 0.1, 999.99]) {
      expect(hasAtMostTwoDecimals(value)).toBe(true);
    }
  });

  it("rejects more than two decimals and non-finite values", () => {
    for (const value of [1.234, 1.001, 0.299, 999.991, 0.005, 1.0001, Number.NaN, Infinity]) {
      expect(hasAtMostTwoDecimals(value)).toBe(false);
    }
  });

  it("agrees with the decimal string of every cent from 0 to 999.99", () => {
    const mismatches: number[] = [];
    for (let cents = 0; cents <= 99_999; cents += 1) {
      const value = Number((cents / 100).toFixed(2));
      if (!hasAtMostTwoDecimals(value) || roundToCents(value) !== value) mismatches.push(value);
    }
    expect(mismatches).toEqual([]);
  });
});

describe("roundToCents", () => {
  it("snaps float artifacts to the exact cent", () => {
    expect(roundToCents(0.1 + 0.2)).toBe(0.3);
    expect(roundToCents(28.999999999999996 / 100)).toBe(0.29);
    expect(roundToCents(4.35)).toBe(4.35);
  });
});
