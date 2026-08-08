const points = (value: number | null | undefined): number => value ?? 0;

const roundPoints = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export type SprintScopeEvent =
  | { type: "item_added"; nextEstimate: number | null }
  | { type: "item_removed"; previousEstimate: number | null }
  | {
      type: "estimate_changed";
      previousEstimate: number | null;
      nextEstimate: number | null;
    }
  | { type: "item_completed" | "item_reopened" };

export type SprintScopeMetrics = {
  initialItemCount: number;
  committedPoints: number;
  initialUnestimatedCount: number;
  currentItemCount: number;
  currentScopePoints: number;
  currentUnestimatedCount: number;
  completedItemCount: number;
  completedPoints: number;
  grossAddedPoints: number;
  grossRemovedPoints: number;
  netEstimateDelta: number;
  scopeEventCount: number;
};

export function calculateSprintScopeMetrics(input: {
  initial: readonly { estimateAtStart: number | null }[];
  current: readonly { estimate: number | null; done: boolean }[];
  events: readonly SprintScopeEvent[];
}): SprintScopeMetrics {
  const completed = input.current.filter((item) => item.done);
  let grossAddedPoints = 0;
  let grossRemovedPoints = 0;
  let netEstimateDelta = 0;
  let scopeEventCount = 0;

  for (const event of input.events) {
    switch (event.type) {
      case "item_added":
        grossAddedPoints += points(event.nextEstimate);
        scopeEventCount += 1;
        break;
      case "item_removed":
        grossRemovedPoints += points(event.previousEstimate);
        scopeEventCount += 1;
        break;
      case "estimate_changed":
        netEstimateDelta += points(event.nextEstimate) - points(event.previousEstimate);
        scopeEventCount += 1;
        break;
      case "item_completed":
      case "item_reopened":
        break;
    }
  }

  return {
    initialItemCount: input.initial.length,
    committedPoints: roundPoints(
      input.initial.reduce((sum, item) => sum + points(item.estimateAtStart), 0),
    ),
    initialUnestimatedCount: input.initial.filter(
      (item) => item.estimateAtStart === null,
    ).length,
    currentItemCount: input.current.length,
    currentScopePoints: roundPoints(
      input.current.reduce((sum, item) => sum + points(item.estimate), 0),
    ),
    currentUnestimatedCount: input.current.filter((item) => item.estimate === null)
      .length,
    completedItemCount: completed.length,
    completedPoints: roundPoints(
      completed.reduce((sum, item) => sum + points(item.estimate), 0),
    ),
    grossAddedPoints: roundPoints(grossAddedPoints),
    grossRemovedPoints: roundPoints(grossRemovedPoints),
    netEstimateDelta: roundPoints(netEstimateDelta),
    scopeEventCount,
  };
}

export type CompletedParticipantOutcome =
  | "completed"
  | "removed"
  | "carried_to_backlog"
  | "carried_to_sprint";

export type CompletedParticipantInput = {
  membershipId: string;
  itemKey: string;
  joinedAt: Date;
  leftAt: Date | null;
  estimateAtJoin: number | null;
  estimateAtStart: number | null;
  currentEstimate: number | null;
  completionOutcome: Exclude<CompletedParticipantOutcome, "removed">;
};

export type CompletedParticipantEvent =
  | {
      type: "item_added";
      membershipId: string;
      itemKey: string;
      occurredAt: Date;
      nextEstimate: number | null;
    }
  | {
      type: "item_removed";
      membershipId: string;
      itemKey: string;
      occurredAt: Date;
      previousEstimate: number | null;
    };

export type CompletedParticipantRow = {
  itemKey: string;
  firstJoinedAt: Date;
  finalLeftAt: Date;
  initialCommitment: boolean;
  addedAfterStart: boolean;
  removedAfterStart: boolean;
  estimateAtStart: number | null;
  estimateAtFinalParticipation: number | null;
  estimateAtCompletion: number | null;
  finalOutcome: CompletedParticipantOutcome;
};

export function buildCompletedParticipantRows(input: {
  startedAt: Date;
  completedAt: Date;
  participants: readonly CompletedParticipantInput[];
  events: readonly CompletedParticipantEvent[];
}): CompletedParticipantRow[] {
  const byKey = new Map<string, CompletedParticipantInput[]>();
  for (const participant of input.participants) {
    const existing = byKey.get(participant.itemKey) ?? [];
    existing.push(participant);
    byKey.set(participant.itemKey, existing);
  }

  const rows: CompletedParticipantRow[] = [];
  for (const [itemKey, unsortedIntervals] of byKey) {
    const itemEvents = input.events.filter(
      (event) => event.itemKey === itemKey,
    );
    const participatingMembershipIds = new Set(
      itemEvents.map((event) => event.membershipId),
    );
    const intervals = unsortedIntervals.filter(
      (interval) =>
        interval.leftAt === null ||
        interval.estimateAtStart !== null ||
        participatingMembershipIds.has(interval.membershipId),
    ).sort(
      (left, right) =>
        left.joinedAt.getTime() - right.joinedAt.getTime() ||
        left.membershipId.localeCompare(right.membershipId),
    );
    if (intervals.length === 0) continue;
    const initialInterval = intervals.find(
      (interval) =>
        !itemEvents.some(
          (event) =>
            event.type === "item_added" &&
            event.membershipId === interval.membershipId,
        ),
    );
    const finalInterval = intervals.at(-1)!;
    const finalOutcome: CompletedParticipantOutcome =
      finalInterval.leftAt === null
        ? finalInterval.completionOutcome
        : "removed";
    let estimateAtFinalParticipation = finalInterval.currentEstimate;
    if (finalInterval.leftAt !== null) {
      const finalRemoval = itemEvents.find(
        (
          event,
        ): event is Extract<CompletedParticipantEvent, { type: "item_removed" }> =>
          event.type === "item_removed" &&
          event.membershipId === finalInterval.membershipId,
      );
      if (!finalRemoval) throw new Error(`Missing removal event for ${itemKey}.`);
      estimateAtFinalParticipation = finalRemoval.previousEstimate;
    }

    rows.push({
      itemKey,
      firstJoinedAt: intervals[0]!.joinedAt,
      finalLeftAt: finalInterval.leftAt ?? input.completedAt,
      initialCommitment: initialInterval !== undefined,
      addedAfterStart: itemEvents.some((event) => event.type === "item_added"),
      removedAfterStart: itemEvents.some((event) => event.type === "item_removed"),
      estimateAtStart: initialInterval?.estimateAtStart ?? null,
      estimateAtFinalParticipation,
      estimateAtCompletion:
        finalOutcome === "completed" ? estimateAtFinalParticipation : null,
      finalOutcome,
    });
  }

  return rows.sort((left, right) => left.itemKey.localeCompare(right.itemKey));
}

export type VelocityInput = {
  hasSnapshot: boolean;
  committedPoints: number | null;
  completedPoints: number | null;
};

export type VelocityCalculation = {
  population: number;
  averageCompletedPoints: number | null;
};

export function calculateVelocity(
  rows: readonly VelocityInput[],
): VelocityCalculation {
  const included = rows.filter(
    (row) =>
      row.hasSnapshot &&
      row.committedPoints !== null &&
      row.completedPoints !== null &&
      (row.committedPoints !== 0 || row.completedPoints !== 0),
  );
  return {
    population: included.length,
    averageCompletedPoints:
      included.length === 0
        ? null
        : roundPoints(
            included.reduce(
              (sum, row) => sum + points(row.completedPoints),
              0,
            ) / included.length,
          ),
  };
}
