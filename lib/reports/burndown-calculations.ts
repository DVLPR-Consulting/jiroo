type BurndownItemIdentity = {
  itemId: string | null;
  itemKey: string;
  itemTitle: string;
};

export type BurndownEvent =
  | (BurndownItemIdentity & {
      type: "item_added";
      occurredAt: Date;
      sequence: bigint;
      nextEstimate: number | null;
      nextDone: boolean;
    })
  | (BurndownItemIdentity & {
      type: "item_removed";
      occurredAt: Date;
      sequence: bigint;
      previousEstimate: number | null;
    })
  | (BurndownItemIdentity & {
      type: "estimate_changed";
      occurredAt: Date;
      sequence: bigint;
      previousEstimate: number | null;
      nextEstimate: number | null;
    })
  | (BurndownItemIdentity & {
      type: "item_completed" | "item_reopened";
      occurredAt: Date;
      sequence: bigint;
    });

export type BurndownInput = {
  startedAt: Date;
  targetEndAt: Date | null;
  completedAt: Date | null;
  observedAt: Date;
  initial: readonly (BurndownItemIdentity & { estimate: number | null; done: boolean })[];
  events: readonly BurndownEvent[];
  /** Set by the read model when immutable done facts are unavailable. */
  legacyHistory?: boolean;
};

export class InconsistentBurndownError extends Error {
  constructor() {
    super("L’historique du burndown est incohérent.");
    this.name = "InconsistentBurndownError";
  }
}

export type BurndownPoint = {
  occurredAt: Date;
  sequence: bigint | null;
  remainingPoints: number;
  unestimatedCount: number;
  deltaPoints: number;
  itemId: string | null;
  itemKey: string | null;
  itemTitle: string | null;
  cause: "start" | BurndownEvent["type"];
};

export type BurndownInsufficientReason =
  | "missing_target"
  | "invalid_dates"
  | "no_estimated_initial_work"
  | "just_started"
  | "legacy_history";

export type BurndownCalculation = {
  exactPoints: BurndownPoint[];
  displayPoints: BurndownPoint[];
  summary: {
    initialRemainingPoints: number;
    remainingPoints: number;
    completedPoints: number;
    unestimatedCount: number;
  };
  guideline:
    | {
        state: "available";
        points: { occurredAt: Date; remainingPoints: number }[];
      }
    | { state: "unavailable"; reason: BurndownInsufficientReason };
  trajectory: {
    label:
      | "Sur la trajectoire idéale"
      | "Au-dessus de la trajectoire idéale"
      | "Données insuffisantes"
      | "Objectif atteint"
      | "Travail restant à la clôture";
    insufficientReason: BurndownInsufficientReason | null;
  };
};

export type PlanningComparison =
  | {
      state: "ready";
      commitmentPoints: number;
      averageCompletedPoints: number;
      population: number;
      difference: number;
    }
  | {
      state: "unavailable";
      commitmentPoints: number;
      averageCompletedPoints: null;
      population: 0;
      difference: null;
    };

type ItemState = BurndownItemIdentity & {
  present: boolean;
  estimate: number | null;
  done: boolean;
};

const pointValue = (estimate: number | null): number => estimate ?? 0;

const round = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const sameEstimate = (left: number | null, right: number | null): boolean =>
  left === right;

const isValidDate = (value: Date): boolean =>
  value instanceof Date && Number.isFinite(value.getTime());

function assertValidEstimate(value: number | null): void {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new InconsistentBurndownError();
  }
}

function assertConsistent(condition: unknown): asserts condition {
  if (!condition) throw new InconsistentBurndownError();
}

function stateTotals(states: Iterable<ItemState>) {
  let remaining = 0;
  let completed = 0;
  let unestimated = 0;

  for (const item of states) {
    if (!item.present) continue;
    if (!item.done && item.estimate === null) unestimated += 1;
    if (item.done) completed += pointValue(item.estimate);
    else remaining += pointValue(item.estimate);
  }

  assertConsistent(
    Number.isFinite(remaining) &&
      Number.isFinite(completed) &&
      remaining >= 0 &&
      completed >= 0,
  );
  return { remaining, completed, unestimated };
}

function pointFromState(
  occurredAt: Date,
  sequence: bigint | null,
  totals: ReturnType<typeof stateTotals>,
  previousRemaining: number,
  identity: BurndownItemIdentity | null,
  cause: BurndownPoint["cause"],
): BurndownPoint {
  return {
    occurredAt: new Date(occurredAt.getTime()),
    sequence,
    remainingPoints: round(totals.remaining),
    unestimatedCount: totals.unestimated,
    deltaPoints: round(totals.remaining - previousRemaining),
    itemId: identity?.itemId ?? null,
    itemKey: identity?.itemKey ?? null,
    itemTitle: identity?.itemTitle ?? null,
    cause,
  };
}

function insufficientReason(
  input: BurndownInput,
  initialRemaining: number,
  observedAt: Date,
): BurndownInsufficientReason | null {
  if (input.legacyHistory) return "legacy_history";
  if (input.targetEndAt === null) return "missing_target";
  if (input.targetEndAt.getTime() <= input.startedAt.getTime()) return "invalid_dates";
  if (initialRemaining === 0) return "no_estimated_initial_work";
  if (observedAt.getTime() === input.startedAt.getTime()) return "just_started";
  return null;
}

function uniqueTimes(times: readonly Date[]): Date[] {
  const byTime = new Map<number, Date>();
  for (const time of times) byTime.set(time.getTime(), new Date(time.getTime()));
  return [...byTime.values()].sort((left, right) => left.getTime() - right.getTime());
}

function dailyUtcTimes(startedAt: Date, endAt: Date): Date[] {
  if (endAt.getTime() <= startedAt.getTime()) return [];
  const nextMidnight = new Date(Date.UTC(
    startedAt.getUTCFullYear(),
    startedAt.getUTCMonth(),
    startedAt.getUTCDate() + 1,
  ));
  const times: Date[] = [];
  for (let at = nextMidnight; at.getTime() < endAt.getTime(); at = new Date(Date.UTC(
    at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1,
  ))) {
    times.push(at);
  }
  return times;
}

function createDisplayPoints(
  exactPoints: readonly BurndownPoint[],
  startedAt: Date,
  observedAt: Date,
  targetEndAt: Date | null,
): BurndownPoint[] {
  const endAt = targetEndAt && targetEndAt.getTime() > observedAt.getTime()
    ? targetEndAt
    : observedAt;
  const boundaries = [startedAt, observedAt, ...dailyUtcTimes(startedAt, endAt)];
  if (targetEndAt !== null && targetEndAt.getTime() >= startedAt.getTime()) {
    boundaries.push(targetEndAt);
  }
  const exactTimes = new Set(exactPoints.map((point) => point.occurredAt.getTime()));
  const syntheticSamples = uniqueTimes(boundaries)
    .filter((at) => !exactTimes.has(at.getTime()))
    .map((at) => {
      let latest = exactPoints[0]!;
      for (const point of exactPoints) {
        if (point.occurredAt.getTime() <= at.getTime()) latest = point;
        else break;
      }
      return {
        occurredAt: at,
        sequence: null,
        remainingPoints: latest.remainingPoints,
        unestimatedCount: latest.unestimatedCount,
        deltaPoints: 0,
        itemId: null,
        itemKey: null,
        itemTitle: null,
        cause: "start" as const,
      };
    });

  const sampled = [...exactPoints, ...syntheticSamples].sort((left, right) =>
    left.occurredAt.getTime() - right.occurredAt.getTime() ||
    (left.sequence === null ? -1 : right.sequence === null ? 1 :
      left.sequence < right.sequence ? -1 : left.sequence > right.sequence ? 1 : 0),
  );

  const mandatoryTimes = uniqueTimes([
    startedAt,
    observedAt,
    ...(targetEndAt === null || targetEndAt.getTime() < startedAt.getTime()
      ? []
      : [targetEndAt]),
  ]);
  const mandatoryIndexes = mandatoryTimes.map((at) => {
    const index = sampled.findLastIndex(
      (point) => point.occurredAt.getTime() === at.getTime(),
    );
    assertConsistent(index >= 0);
    return index;
  });

  return projectBurndownPoints(sampled, 600, mandatoryIndexes);
}

/**
 * Reduces graph data without discarding the endpoints or a high/low turning
 * point from any time bucket. The source array is never changed.
 */
export function projectBurndownPoints(
  points: readonly BurndownPoint[],
  maximum = 600,
  mandatoryIndexes: readonly number[] = [],
): BurndownPoint[] {
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new RangeError("maximum must be a positive integer");
  }
  if (points.length <= maximum) return [...points];
  if (maximum < 2) throw new InconsistentBurndownError();

  const mandatory = new Set<number>([0, points.length - 1, ...mandatoryIndexes]);
  for (const index of mandatory) {
    assertConsistent(Number.isInteger(index) && index >= 0 && index < points.length);
  }
  assertConsistent(mandatory.size <= maximum);

  const candidates = Array.from({ length: points.length }, (_, index) => index)
    .filter((index) => !mandatory.has(index));
  const slots = maximum - mandatory.size;
  const bucketCount = Math.floor(slots / 2);
  const selected = new Set(mandatory);

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const from = Math.floor((bucket * candidates.length) / bucketCount);
    const to = Math.floor(((bucket + 1) * candidates.length) / bucketCount);
    if (from >= to) continue;
    let minIndex = candidates[from]!;
    let maxIndex = candidates[from]!;
    for (let index = from; index < to; index += 1) {
      const pointIndex = candidates[index]!;
      if (points[pointIndex]!.remainingPoints < points[minIndex]!.remainingPoints) minIndex = pointIndex;
      if (points[pointIndex]!.remainingPoints > points[maxIndex]!.remainingPoints) maxIndex = pointIndex;
    }
    for (const index of minIndex === maxIndex ? [minIndex] : [minIndex, maxIndex]) {
      if (selected.size < maximum) selected.add(index);
    }
  }

  return [...selected]
    .sort((left, right) => left - right)
    .map((index) => points[index]!);
}

export function calculateBurndown(input: BurndownInput): BurndownCalculation {
  assertConsistent(isValidDate(input.startedAt) && isValidDate(input.observedAt));
  if (input.targetEndAt !== null) assertConsistent(isValidDate(input.targetEndAt));
  if (input.completedAt !== null) assertConsistent(isValidDate(input.completedAt));

  const observedAt = input.completedAt ?? input.observedAt;
  assertConsistent(observedAt.getTime() >= input.startedAt.getTime());
  const states = new Map<string, ItemState>();
  for (const initial of input.initial) {
    assertValidEstimate(initial.estimate);
    assertConsistent(!states.has(initial.itemKey));
    states.set(initial.itemKey, { ...initial, present: true });
  }

  const initialTotals = stateTotals(states.values());
  const exactPoints: BurndownPoint[] = [pointFromState(
    input.startedAt,
    null,
    initialTotals,
    initialTotals.remaining,
    null,
    "start",
  )];

  const orderingKeys = new Set<string>();
  for (const current of input.events) {
    assertConsistent(
      isValidDate(current.occurredAt) &&
        typeof current.sequence === "bigint" &&
        current.occurredAt.getTime() >= input.startedAt.getTime() &&
        current.occurredAt.getTime() <= observedAt.getTime(),
    );
    const orderingKey = `${current.occurredAt.getTime()}:${current.sequence}`;
    assertConsistent(!orderingKeys.has(orderingKey));
    orderingKeys.add(orderingKey);
  }
  const events = [...input.events].sort(
    (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() ||
      (left.sequence < right.sequence ? -1 : left.sequence > right.sequence ? 1 : 0),
  );
  let previousRemaining = initialTotals.remaining;

  for (const current of events) {
    const state = states.get(current.itemKey);
    switch (current.type) {
      case "item_added":
        assertValidEstimate(current.nextEstimate);
        assertConsistent(state === undefined || !state.present);
        states.set(current.itemKey, {
          itemId: current.itemId,
          itemKey: current.itemKey,
          itemTitle: current.itemTitle,
          present: true,
          estimate: current.nextEstimate,
          done: current.nextDone,
        });
        break;
      case "item_removed":
        assertValidEstimate(current.previousEstimate);
        assertConsistent(state?.present && sameEstimate(state.estimate, current.previousEstimate));
        state.present = false;
        break;
      case "estimate_changed":
        assertValidEstimate(current.previousEstimate);
        assertValidEstimate(current.nextEstimate);
        assertConsistent(state?.present && sameEstimate(state.estimate, current.previousEstimate));
        state.estimate = current.nextEstimate;
        state.itemId = current.itemId;
        state.itemTitle = current.itemTitle;
        break;
      case "item_completed":
        assertConsistent(state?.present && !state.done);
        state.done = true;
        state.itemId = current.itemId;
        state.itemTitle = current.itemTitle;
        break;
      case "item_reopened":
        assertConsistent(state?.present && state.done);
        state.done = false;
        state.itemId = current.itemId;
        state.itemTitle = current.itemTitle;
        break;
    }

    const totals = stateTotals(states.values());
    exactPoints.push(pointFromState(
      current.occurredAt,
      current.sequence,
      totals,
      previousRemaining,
      current,
      current.type,
    ));
    previousRemaining = totals.remaining;
  }

  const totals = stateTotals(states.values());
  const reason = insufficientReason(input, initialTotals.remaining, observedAt);
  const observedIdeal = reason === null && input.targetEndAt !== null
    ? round(initialTotals.remaining * Math.max(0,
        (input.targetEndAt.getTime() - observedAt.getTime()) /
          (input.targetEndAt.getTime() - input.startedAt.getTime()),
      ))
    : null;
  const guideline = reason === null && input.targetEndAt !== null
    ? {
        state: "available" as const,
        points: uniqueTimes([input.startedAt, observedAt, input.targetEndAt]).map((at) => ({
          occurredAt: at,
          remainingPoints: round(initialTotals.remaining * Math.max(0,
            (input.targetEndAt!.getTime() - at.getTime()) /
              (input.targetEndAt!.getTime() - input.startedAt.getTime()),
          )),
        })),
      }
    : { state: "unavailable" as const, reason: reason! };

  const trajectory = input.completedAt !== null
    ? {
        label: totals.remaining === 0
          ? "Objectif atteint" as const
          : "Travail restant à la clôture" as const,
        insufficientReason: null,
      }
    : reason !== null
      ? { label: "Données insuffisantes" as const, insufficientReason: reason }
      : {
          label: totals.remaining <= observedIdeal!
            ? "Sur la trajectoire idéale" as const
            : "Au-dessus de la trajectoire idéale" as const,
          insufficientReason: null,
        };

  return {
    exactPoints,
    displayPoints: createDisplayPoints(exactPoints, input.startedAt, observedAt, input.targetEndAt),
    summary: {
      initialRemainingPoints: round(initialTotals.remaining),
      remainingPoints: round(totals.remaining),
      completedPoints: round(totals.completed),
      unestimatedCount: totals.unestimated,
    },
    guideline,
    trajectory,
  };
}

export function calculatePlanningComparison(
  commitmentPoints: number,
  velocity: { averageCompletedPoints: number | null; population: number },
): PlanningComparison {
  assertConsistent(
    Number.isFinite(commitmentPoints) &&
      commitmentPoints >= 0 &&
      Number.isFinite(velocity.population) &&
      Number.isInteger(velocity.population) &&
      velocity.population >= 0 &&
      (velocity.averageCompletedPoints === null ||
        (Number.isFinite(velocity.averageCompletedPoints) &&
          velocity.averageCompletedPoints >= 0)),
  );
  if (velocity.population === 0 || velocity.averageCompletedPoints === null) {
    return {
      state: "unavailable",
      commitmentPoints: round(commitmentPoints),
      averageCompletedPoints: null,
      population: 0,
      difference: null,
    };
  }
  return {
    state: "ready",
    commitmentPoints: round(commitmentPoints),
    averageCompletedPoints: round(velocity.averageCompletedPoints),
    population: velocity.population,
    difference: round(commitmentPoints - velocity.averageCompletedPoints),
  };
}
