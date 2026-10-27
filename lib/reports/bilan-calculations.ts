export type SprintReviewFacts = {
  initial: number | null;
  added: number | null;
  removed: number | null;
  completed: number | null;
  completedPoints: number | null;
  finalCount: number | null;
  bugs: number | null;
  presence: number | null;
};

/** Unknown history stays unknown. Thresholds use exact ratios, before display rounding. */
export function calculateSprintReview(facts: SprintReviewFacts) {
  const denominator = facts.initial === null || facts.added === null || facts.removed === null
    ? null
    : facts.initial + facts.added - facts.removed;
  const rate = facts.completed === null || denominator === null || denominator <= 0
    ? null
    : facts.completed / denominator;
  return {
    ...facts,
    percentage: rate === null ? null : Math.round(rate * 100),
    lowCompletion: rate !== null && rate < 0.6,
    bugHeavy: facts.bugs !== null && facts.finalCount !== null && facts.finalCount > 0 && facts.bugs * 3 > facts.finalCount,
    pointsPerPersonDay: facts.completedPoints === null || facts.presence === null || facts.presence <= 0
      ? null
      : facts.completedPoints / facts.presence,
  };
}

export type SprintReviewRow = ReturnType<typeof calculateSprintReview> & {
  id: string;
  name: string;
  state: "active" | "completed";
  start: string;
  end: string | null;
};

export type SprintsReview = { rows: SprintReviewRow[]; limited: boolean };
