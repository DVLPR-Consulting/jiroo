import { generateKeyBetween } from "fractional-indexing";

export function rankFirst(next: string | null): string {
  return generateKeyBetween(null, next);
}

export function rankLast(prev: string | null): string {
  return generateKeyBetween(prev, null);
}

export function rankBetween(a: string, b: string): string {
  if (a === b) throw new Error("rankBetween: bounds must differ");
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return generateKeyBetween(lo, hi);
}
