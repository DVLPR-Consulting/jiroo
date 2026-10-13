/**
 * Story points and sprint capacity are stored as `numeric(5, 2)`: at most two
 * decimals. Binary floating point cannot test that with
 * `Number.isInteger(value * 100)` (`0.29 * 100 === 28.999999999999996`).
 * Instead, a value is accepted only when it is exactly the double nearest to
 * its own cent: `Math.round(value * 100) / 100` rebuilds that canonical cent,
 * so `0.29` passes while `0.290000001` or `1.230000001` do not. An accepted
 * value is never rewritten.
 */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isFinite(value) && Math.round(value * 100) / 100 === value;
}
