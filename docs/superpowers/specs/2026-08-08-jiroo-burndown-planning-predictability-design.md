# Jiroo Burndown and Planning Predictability Design

Date: 2026-08-08

Status: approved for specification review

## Context

Jiroo already records an append-only `sprint_events` ledger and exposes active
and frozen sprint reports plus seven- or twelve-sprint velocity. The ledger
captures sprint boundaries, scope entry and exit, estimate changes, completion,
and reopening. Completed sprint snapshots preserve stable identity and totals
after source items are renamed, moved, deleted, or purged.

The remaining reporting gap is a Jira-like sprint burndown and an honest
planning signal. The feature must show how remaining work changed through time,
why each change occurred, and whether the current position is above or below
the ideal trajectory. It must not invent a statistically precise delivery
forecast or reconstruct history from mutable current items.

This is the first of three finalization increments:

1. sprint burndown and planning predictability;
2. Releases PR2: merge, delete/transfer, manual ordering, and release notes;
3. cross-browser, assistive-technology, breakpoint, concurrency, and
   production-volume validation.

## Product alignment

The observable behavior follows Jira Cloud:

- the horizontal axis is the sprint duration;
- the vertical axis is remaining story points;
- a grey guideline shows the theoretical linear path to zero;
- an actual step line shows remaining work;
- additions, removals, and estimate changes are scope changes;
- work burns down when it reaches the backlog's `done` status category;
- standard-level sprint tasks contribute points and subtasks do not;
- exact scope changes and completed, incomplete, removed, and
  completed-outside-sprint work remain inspectable.

Atlassian documents this user-visible behavior but not whether Jira materializes
or replays its internal history. Jiroo therefore matches the public semantics
without claiming an identical storage implementation.

Jiroo adds one deliberately explicit improvement. Instead of an opaque
`On track` score, it labels only the observable relationship to the guideline:

- `Sur la trajectoire idéale`;
- `Au-dessus de la trajectoire idéale`;
- `Données insuffisantes`;
- for a completed sprint, `Objectif atteint` or `Travail restant à la clôture`.

These labels are factual descriptions, not probabilistic guarantees.

## Goals

- Reconstruct exact remaining story points from immutable start facts and
  ordered `sprint_events`.
- Explain every curve movement through a stable item identity and event.
- Preserve completed burndowns after all later source-item mutations and purge.
- Distinguish completed during the sprint from work completed before it joined.
- Show unestimated work separately at every point where it changes.
- Compare planned or active commitment with the recent seven-sprint velocity as
  a separate, non-blocking planning signal.
- Provide exact values without color, hover, SVG interpretation, or pointer
  interaction.
- Keep reads backlog-scoped, fail-closed, bounded to one sprint, and free of
  N+1 queries.

## Non-goals

- A release completion date, release burndown, or Version Report forecast.
- A blended confidence score or machine-learning prediction.
- Time tracking, remaining-hours burndown, item-count estimation mode, custom
  estimation fields, working-day calendars, or team holidays.
- Multiple simultaneous active sprints.
- Reconstructing a trustworthy curve for legacy sprints missing start-state
  facts.
- Replacing the manually entered sprint capacity.
- Releases PR2 or Git/PR/check/deployment readiness.

## Considered architectures

### Selected: deterministic replay on read

A pure calculator receives immutable start facts, ordered events, and the
sprint time window. It replays per-item state and returns exact event points,
display samples, the guideline, summaries, and an explainable trajectory label.
No derived mutable report state is introduced.

This approach has one source of truth, naturally supports completed-report
immutability, and makes every value auditable. The read cost is proportional to
one sprint's events and is measured explicitly before any cache is added.

### Rejected for this increment: write-time curve points

Persisting a curve point during every item mutation would make reads cheap but
would create a second state that every single, bulk, board, sprint, delete, and
rollback path must maintain. It adds divergence risk without production data
showing that replay is too slow.

### Rejected for this increment: daily database rollups

Daily rollups reduce read volume but lose intraday ordering, create timezone
and daylight-saving boundaries, and make same-timestamp event explanations more
complex. They remain a future optimization only if measured production volume
requires them.

## Required historical facts

The existing ledger cannot distinguish two Jira-relevant cases:

1. an initial sprint item that was already done when the sprint started;
2. an item that was already done when added to an active sprint.

The data model is extended without changing existing event meanings:

- `sprint_items.done_at_start` is nullable while a sprint is planned and is set
  atomically for every initial membership when the sprint starts;
- `sprint_events.next_done` is required on `item_added` and records the item's
  done state at active-sprint entry;
- `sprint_report_items.done_at_start` freezes the initial state for completed
  reports and is null for work that was not in the initial commitment.

The start transaction captures `estimate_at_start` and `done_at_start` from the
same locked item/status snapshot. An active-sprint add captures estimate and done
state in its existing `item_added` event. Completion copies the initial done
fact into the immutable participant row.

Existing completed snapshots and events created before these facts exist are
not guessed. Their burndown state is `Historique burndown indisponible`. Local
and test databases may be reset according to the existing reporting policy;
production-like data is never silently synthesized.

Database checks enforce that:

- `item_added` has `next_done` and no `previous_done`;
- `item_completed` remains `false -> true`;
- `item_reopened` remains `true -> false`;
- non-done-related event shapes do not acquire unrelated done fields.

The append-only triggers and composite backlog/sprint foreign keys remain in
force.

## Replay model

### Inputs

The pure calculation receives:

- sprint identifier, start instant, target end instant, optional completion
  instant, and report kind;
- initial logical items with stable key, estimate at start, and done at start;
- all reporting events for that sprint ordered by `occurred_at`, then global
  `sequence`;
- an observation instant for an active sprint;
- recent eligible velocity bars for contextual planning comparison.

The service clamps the active observation instant to no earlier than start. A
completed sprint always observes exactly at its immutable completion instant.

### Per-item state

The calculator keys logical state by frozen `itemKey`, which survives item and
membership deletion. Each entry contains:

- `present`;
- `estimate: number | null`;
- `done`;
- whether it belonged to the initial commitment.

Initial items begin present with their frozen estimate and done state. Events
then apply in authoritative order:

- `item_added`: requires the item to be absent, then sets present, estimate from
  `nextEstimate`, and done from `nextDone`;
- `item_removed`: requires the item to be present, validates the frozen
  pre-removal estimate, then marks it absent;
- `estimate_changed`: requires the item to be present and the previous estimate
  to match replay state, then replaces it;
- `item_completed`: requires present and not done, then marks done;
- `item_reopened`: requires present and done, then marks not done;
- sprint lifecycle events validate boundaries but do not directly change item
  points.

Contradictory history raises `InconsistentBurndownError`. The UI receives the
existing generic report error boundary, never a partial curve.

### Remaining and unestimated work

At any instant:

- remaining points are the sum of estimates for items that are present and not
  done;
- null estimates contribute zero points but increment `unestimatedCount` when
  the item is present and not done;
- an item already done at start or active-sprint entry contributes zero
  remaining points and is classified as completed outside the sprint;
- completing work subtracts its current estimate;
- reopening work adds its current estimate back;
- changing the estimate of incomplete work changes remaining by the delta;
- changing the estimate of done work changes its recorded estimate but not
  remaining until it is reopened;
- removing incomplete work subtracts its current estimate;
- removing done work leaves remaining unchanged.

Point arithmetic uses the existing two-decimal normalization. A negative
remaining total is an inconsistency, not a value to clamp silently.

### Exact and display series

The exact series starts at `startedAt` after initial state capture. It includes
one point after every reporting event. Equal timestamps remain separate and
ordered by `sequence`, so explanations never depend on database row order.

The chart renders a step line from exact points. It also receives one UTC daily
sample and the final observation point so axis labels remain readable. Daily
sampling is display-only; the semantic event table and all calculations retain
exact instants and sequence.

UTC is used consistently with the current report serialization until Jiroo has
a first-class backlog or user reporting timezone. No browser-local rebucketing
may alter the curve.

### Guideline

The guideline is deliberately simple and disclosed:

```text
ideal(t) = initialRemaining * max(0, (targetEnd - t) / (targetEnd - startedAt))
```

It begins at the initial remaining points and reaches zero at the target end.
Scope changes affect the actual line and their markers; they do not rewrite the
historical ideal commitment. This lets users see scope creep instead of moving
the target to hide it.

The guideline and trajectory label are unavailable when:

- the target end is absent or not after the actual start;
- the initial sprint contains no estimated remaining work;
- the observation instant equals the start instant.

The actual curve still renders when enough event history exists.

### Trajectory label

For an active sprint with a valid guideline:

- actual remaining `<=` ideal remaining: `Sur la trajectoire idéale`;
- actual remaining `>` ideal remaining: `Au-dessus de la trajectoire idéale`.

No tolerance or probability is hidden in the comparison. The UI states that
the label compares current remaining work with a linear ideal and is not a
delivery guarantee.

For a completed sprint:

- remaining equals zero: `Objectif atteint`;
- remaining is positive: `Travail restant à la clôture`.

When no reliable guideline exists, the label is `Données insuffisantes` and an
exact reason is returned: missing target, invalid dates, no estimated initial
work, just started, or legacy history.

## Planning predictability

Recent velocity is contextual and never blended into the trajectory label.
The existing seven-sprint velocity inclusion rules remain authoritative. The
planning comparison returns:

- planned or active commitment;
- recent average completed points;
- eligible sprint population;
- signed difference, rounded to two decimals.

When the population is zero, the UI says `Pas encore de vélocité comparable`.
Otherwise it renders factual copy such as:

`Engagement 13 pts · moyenne récente 10 pts · écart +3 pts`.

On planned sprint sections in the Backlog, an engagement above the recent
average displays a non-blocking warning. It does not change `capacityPoints`,
prevent sprint start, or imply that the average is a contractual capacity.
Manual capacity and recent velocity remain separate rows with separate labels.

> **Decision 2026-10-02 (JIR-28 option A, implemented in JIR-46).** For an
> **active** sprint, the Backlog header's `Engagement` is the commitment frozen
> at sprint start — the burndown's `commitmentPoints` (sum of `estimateAtStart`
> of initial memberships, excluding memberships added after start) — and the
> comparison with recent velocity uses it, as Jira's velocity chart
> "Commitment" does. The live estimated total stays visible as a separate
> `Périmètre actuel N pts`. If the start facts are missing (legacy history,
> where the burndown is `legacy_unavailable`), the header shows
> `Engagement au démarrage indisponible` plus `Périmètre actuel` and no
> comparison. When no recent sprint is comparable, an active sprint shows
> `Pas encore de vélocité comparable` plus `Périmètre actuel`. Planned sprints
> are unchanged (current scope; amber warning planned-only); capacity and
> controls are unchanged.

## Read services

Add `getBurndownReport(backlogId, sprintId, now?)` alongside the existing sprint
and velocity services. It returns a discriminated union:

- `active` with a live exact projection;
- `completed` with an immutable projection ending at completion;
- `legacy_unavailable` with sprint identity and a reason.

Detailed reports contain:

- sprint identity, goal, actual start, target end, and optional completion;
- initial, current/final, completed, and unestimated summaries;
- exact event points and UTC display samples;
- guideline points when valid;
- trajectory label and explanation;
- recent velocity comparison;
- the existing independently paginated event journal.

The read performs a fixed number of backlog-scoped queries: canonical sprint
and snapshot, initial baseline, ordered events, and at most seven immutable
velocity headers. It never fetches mutable current items for a completed
burndown and never issues per-item queries.

Planned-sprint summaries reuse a small backlog-level velocity context read
rather than invoking a report query once per sprint.

## URL and route behavior

Extend the authoritative report state to:

```text
report=sprint|velocity|burndown
sprint=<uuid>
limit=7|12
itemPage=<positive integer>
eventPage=<positive integer>
```

`Burndown` appears as a third completed report tab. It uses the same active or
newest-completed default sprint selection and the same GET sprint selector.
Invalid, planned, missing, foreign, or inaccessible sprint identifiers use the
existing concealed-resource behavior.

The route serializes dates, bigint sequences, exact points, and reasons into a
component DTO without widening discriminants. Legacy sprint identity, goal,
start, and completion remain visible while totals and curves remain absent.

## Interface

The burndown view contains, in order:

1. sprint name, goal, actual dates, and live/frozen/legacy state;
2. initial remaining, current/final remaining, completed points, and current or
   final unestimated count;
3. factual trajectory label and recent velocity comparison;
4. a labelled chart with actual step line, grey ideal line, and scope-change
   markers;
5. a semantic table containing every exact event point, remaining value,
   unestimated count, delta, item identity, and human-readable cause;
6. the existing chronological event journal and pagination.

The chart never carries exclusive information. Color is paired with line style,
labels, and table data. Role-bearing groups expose exact accessible names. The
semantic table is reachable by keyboard, and sprint detail links use the frozen
key only when the item remains accessible.

On narrow screens, the chart owns its horizontal scroller. The document itself
must satisfy `scrollWidth <= clientWidth`, the summary cards stack, controls
wrap, and the exact table remains usable without hover.

## Empty and exceptional states

Distinct copy covers:

- no active or completed sprint;
- only planned sprints;
- empty active sprint;
- all remaining work unestimated;
- valid curve but missing guideline;
- active sprint observed exactly at start;
- completed sprint with zero remaining;
- completed sprint with work remaining;
- no comparable velocity;
- legacy sprint with no reliable done-at-entry facts;
- internally inconsistent replay.

No empty state invents zero, a guideline, or a forecast.

## Permissions and security

Any user with `browse_backlog` may read the burndown. Reporting grants no edit,
sprint-management, or release-management capability.

Every route resolves the canonical backlog first. Missing, foreign, malformed,
inaccessible, and deleted resources remain indistinguishable to callers.
Frozen item identity is visible only inside the authorized backlog report.

User-facing failures contain no SQL, table names, credentials, headers,
connection variables, internal stack traces, raw foreign identifiers, or
request secrets. Expected injected failures are marked in run-scoped evidence.

## Performance constraints

- One report replays one sprint only.
- Event order uses the existing `(sprint_id, occurred_at, sequence)` index.
- Reads use a fixed query count and no N+1 item lookup.
- The first delivery must prove 1,000 participant items and 10,000 events.
- The exact series may contain one point per event; the SVG receives a display
  projection rather than unbounded duplicate points at the same pixel.
- The semantic table is independently paginated for rendering, while summary
  calculations always use the complete ordered ledger.
- No cache, rollup table, or truncation is added without measured evidence.

If production measurements later show replay is too slow, a versioned cache may
be derived from the immutable sequence watermark. Such a cache is outside this
increment and may never become a second source of truth.

## Error handling and observability

- Event and start-state writes remain atomic with their domain mutation.
- A late failure in sprint start, active add, or completion rolls back the new
  done-state fact together with memberships and events.
- Replay contradictions fail closed through `InconsistentBurndownError`.
- The reports error boundary renders generic copy and supports retry.
- Navigation status, query duration, event count, exact point count, and display
  point count are recorded in audit evidence.
- Unexpected console errors, failed requests, HTTP failures, secret leakage, or
  partial totals fail acceptance.

## Testing strategy

### Pure calculation tests

- initial estimated, unestimated, and already-done work;
- add incomplete, add already done, remove incomplete, and remove done;
- estimate increases, decreases, null-to-value, and value-to-null;
- complete, reopen, re-estimate while done, and complete again;
- remove and re-add the same stable key;
- equal timestamps ordered by sequence;
- daily UTC sampling across month and daylight-saving boundaries;
- linear guideline at start, midpoint, target, and after target;
- active trajectory labels and completed result labels;
- every insufficient-data reason;
- contradiction detection and two-decimal normalization.

### Database integration tests

- sprint start captures estimate and done state atomically;
- single, bulk, Board, delete, and move paths capture `nextDone` on active add;
- completion freezes done-at-start facts;
- active and completed service projections produce identical values at the
  completion boundary;
- completed curves remain unchanged after rename, re-estimate, status change,
  move, soft delete, and hard fixture purge;
- legacy snapshots return unavailable instead of fabricated data;
- append-only checks, cross-backlog isolation, malformed identifiers,
  deterministic ordering, concurrent mutations, and late-failure rollback;
- fixed query count from five to 1,000 items;
- measured replay of 1,000 participants and 10,000 events.

### Route and component tests

- URL parsing for `burndown` and preservation of independent pagination;
- active/newest-completed defaults and planned-resource concealment;
- DTO date, bigint, reason, and discriminant serialization;
- chart/table exact parity and role-based accessible labels;
- all empty, legacy, trajectory, and velocity-comparison states;
- keyboard access, item links, frozen identity, and no color-only meaning;
- narrow layout without document overflow.

### Playwright acceptance

Create active and completed sprint histories that cover initial done work, add,
remove, re-estimate, complete, reopen, unestimated work, and equal-timestamp
events. Mutations must exercise single edit, bulk, Board, deletion, and sprint
completion paths.

Assert every plotted and tabular point against the stored ledger, reload, then
repeat critical reads in a second authenticated context and as a real reader.
Conceal a real foreign sprint and malformed identifiers. Inject one report read
failure, prove the generic boundary and retry, and scan all console/network
evidence for unexpected failures or secrets.

Capture active and completed views at desktop and 390 x 844. The final product
validation increment later repeats the report in Firefox, WebKit, 768/1024/1440,
200% zoom, and VoiceOver/NVDA; this increment must not introduce a known blocker
for those runs.

## Audit updates

Append the delivered scope, authoritative run, screenshots, durations, volume
measurements, fixed or new bug identifiers, and residual risks to:

- `audit/README.md`;
- `audit/roadmap.md`;
- `audit/bugs.md`;
- `audit/ux.md`;
- `audit/benchmark.md`.

The benchmark may claim Jira-like sprint burndown only for the behaviors proved
above. The factual trajectory label must be described as a Jiroo clarity
improvement, not an Atlassian feature or probabilistic forecast.

## Delivery boundary

This is one independently reviewable increment containing historical-fact
capture, pure replay, the burndown read model, route and interface, planned
velocity context, tests, Playwright evidence, and audit updates.

After acceptance, the next independent increment is Releases PR2. Release date
forecasting remains deferred until Releases PR2 provides the required merge,
delete/transfer, ordering, and snapshot-based note semantics.
