/**
 * Story points and sprint capacity are stored as `numeric(5, 2)`: at most two
 * decimals. Binary floating point cannot test that with
 * `Number.isInteger(value * 100)` (`0.29 * 100 === 28.999999999999996`), so the
 * product is compared with its nearest integer within a tolerance far below one
 * hundredth and far above the rounding error of values up to 999.99.
 */
const CENT_TOLERANCE = 1e-6;

/** True when `value` has at most two decimals in its decimal representation. */
export function hasAtMostTwoDecimals(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const cents = value * 100;
  return Math.abs(cents - Math.round(cents)) < CENT_TOLERANCE;
}

/** Snaps a two-decimal value to its exact cent, dropping float artifacts. */
export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
