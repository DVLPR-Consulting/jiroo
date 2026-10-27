import type { Day } from "@/lib/roadmap/days";

/**
 * Half-days (JIR-124): an absence starts in the morning or the afternoon
 * of a day and ends likewise. Keys compare as text, so « 2026-11-03a »
 * (the morning) precedes « 2026-11-03b » (the afternoon).
 */
export type Half = "am" | "pm";
export const HALVES: readonly Half[] = ["am", "pm"];
export type HalfDay = { day: Day; half: Half };

export const halfKey = (day: Day, half: Half): string => `${day}${half === "am" ? "a" : "b"}`;
export const halfName = (half: Half): string => (half === "am" ? "matin" : "après-midi");
export const isHalf = (value: unknown): value is Half => value === "am" || value === "pm";
