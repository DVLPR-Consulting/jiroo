import { describe, expect, it } from "vitest";
import { calculateSprintReview } from "@/lib/reports/bilan-calculations";

const facts = { initial: 10, added: 3, removed: 1, completed: 6, completedPoints: 19.5, finalCount: 12, bugs: 4, presence: 20 };
describe("calculateSprintReview", () => {
  it.each([
    ["active or closed, final scope denominator", facts, { percentage: 50, lowCompletion: true, bugHeavy: false, pointsPerPersonDay: 0.975 }],
    ["unknown start facts", { ...facts, initial: null }, { percentage: null, lowCompletion: false }],
    ["legacy without snapshot", { ...facts, initial: null, added: null, removed: null, completed: null, completedPoints: null, finalCount: null, bugs: null }, { percentage: null, pointsPerPersonDay: null, bugHeavy: false }],
    ["zero scope", { ...facts, initial: 0, added: 0, removed: 0, completed: 0, finalCount: 0, bugs: 0 }, { percentage: null, bugHeavy: false, lowCompletion: false }],
    ["bugs only", { ...facts, bugs: 12 }, { bugHeavy: true }],
    ["exactly sixty percent", { ...facts, initial: 8 }, { percentage: 60, lowCompletion: false }],
    ["rounding does not hide a rate below sixty", { ...facts, initial: 1001, added: 0, removed: 0, completed: 600 }, { percentage: 60, lowCompletion: true }],
    ["no presence", { ...facts, presence: 0 }, { pointsPerPersonDay: null }],
    ["no directory rights", { ...facts, presence: null }, { pointsPerPersonDay: null }],
    ["zero completed points stays zero", { ...facts, completedPoints: 0 }, { pointsPerPersonDay: 0 }],
  ])("%s", (_, input, expected) => {
    expect(calculateSprintReview(input)).toMatchObject(expected);
  });
});
