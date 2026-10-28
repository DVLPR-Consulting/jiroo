import { describe, expect, it } from "vitest";
import { presenceDays } from "@/lib/reports/presence";

describe("presenceDays", () => {
  it.each([
    ["full fortnight, inclusive", "2026-10-19", "2026-10-30", ["a", "b"], [], 20],
    ["weekend", "2026-10-24", "2026-10-25", ["a"], [], 0],
    ["one weekday", "2026-10-26", "2026-10-26", ["a"], [], 1],
    ["no members", "2026-10-19", "2026-10-30", [], [], 0],
    ["distinct people", "2026-10-26", "2026-10-26", ["a", "a"], [], 1],
    ["reversed interval", "2026-10-30", "2026-10-19", ["a"], [], 0],
    ["absence clipped, weekend ignored", "2026-10-19", "2026-10-30", ["a", "b"], [{ user: "a", start: "2026-10-23", end: "2026-11-04" }], 14],
    ["overlaps not double counted; outsiders ignored", "2026-10-26", "2026-10-30", ["a"], [
      { user: "a", start: "2026-10-26", end: "2026-10-28" },
      { user: "a", start: "2026-10-27", end: "2026-10-30" },
      { user: "b", start: "2026-10-26", end: "2026-10-30" },
    ], 0],
    ["DST changes no calendar day", "2026-10-23", "2026-10-26", ["a"], [], 2],
  ] as const)("%s", (_, start, end, members, absences, expected) => {
    expect(presenceDays({ start, end, members, absences })).toBe(expected);
  });
});
