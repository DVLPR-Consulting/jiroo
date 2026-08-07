# Jiroo Sprint Report and Velocity Design

Date: 2026-08-07

Status: approved for implementation planning

## Context

Jiroo can plan, start, operate, and complete one sprint per backlog. The current
model already preserves membership intervals, the estimate captured when work
joins a sprint, the commitment estimate captured at sprint start, real sprint
dates, and the final carry-over outcome. It does not preserve a complete,
independent chronology of active-sprint scope and completion changes, and it
does not expose a sprint report or velocity report.

The generic `activities` table is not a sufficient reporting source. It requires
an item, can disappear with that item, stores status identifiers instead of
stable reporting semantics, and does not guarantee an event for every reporting
mutation. Historical Scrum reports must not change when an item is later
renamed, re-estimated, moved, or deleted.

This increment delivers the first reporting slice:

1. a complete sprint event ledger;
2. an active and completed sprint report;
3. velocity across completed sprints.

Burndown and broader planning predictability are the next increment. This design
captures the events they need now so no historical reconstruction is required.

## Product references

The semantics intentionally follow Jira Cloud:

- commitment is the estimate at sprint start and is not rewritten by later
  additions or estimate changes;
- completed work uses the estimates of work completed when the sprint ends and
  includes work added after sprint start;
- work added after start is marked explicitly;
- the sprint report separates completed and incomplete work and shows estimate
  changes;
- velocity compares commitment and completed work over recent sprints;
- estimates from subtasks are excluded.

Official references:

- <https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-sprint-report/>
- <https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-velocity-chart/>
- <https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-burndown-chart/>
- <https://support.atlassian.com/jira-software-cloud/docs/generate-a-report/>

Jiroo improves one ambiguous edge: a sprint with committed work and zero
completed points remains in the velocity average. Only a sprint with neither
committed nor completed points is treated as having no point data and excluded
from the average. The report always explains this rule.

## Goals

- Answer what was committed, what was completed, what was not completed, and
  what changed after sprint start.
- Support progress checks while a sprint is active and retrospectives after it
  is completed.
- Keep completed reports and velocity immutable and independent of current item
  state.
- Expose every scope-affecting change with actor, time, before/after values, and
  stable item identity.
- Make every metric explainable and accessible without relying on chart color or
  hover state.
- Establish the event foundation required by the next burndown increment.

## Non-goals

- Burndown, burnup, release forecasting, or Advanced-Roadmaps-style planning.
- Time tracking, remaining-time estimates, custom estimation statistics, or
  configurable numeric fields.
- Multiple simultaneous active sprints.
- Cross-backlog or cross-board reporting.
- Editing historical events or completed-report snapshots.
- Fabricating reports for completed sprints that predate this event model.

Burndown is not exposed as a disabled or non-functional control in this
increment. The Reports navigation contains only completed features. The
burndown entry is added with its implementation in the next increment.

## Estimation statistic

Story points are the only reporting statistic in this increment. Only top-level
sprint tasks carry sprint points in Jiroo. Subtasks do not contribute points.

An unestimated task contributes zero to point sums but is always counted and
shown separately. The UI must never silently imply that all work was estimated.
Item count is contextual information, not a second velocity statistic.

## Report lifecycle

### Planned sprint

A planned sprint has no report. It remains visible in the Backlog planning
surface only.

### Active sprint

The report becomes available as soon as the sprint starts. It combines the
commitment snapshots already stored on the initial memberships with the
append-only event ledger and the current open memberships. The view is live and
may change after each valid mutation.

### Completed sprint

Completion creates an immutable report header and immutable item rows in the
same transaction that closes the sprint and moves incomplete work. Completed
reports and velocity read only these snapshots, never mutable current items.

## Domain model

### Sprint events

Add an append-only `sprint_events` table scoped by backlog and sprint. A
database enum defines these event types:

- `sprint_started`;
- `item_added`;
- `item_removed`;
- `estimate_changed`;
- `item_completed`;
- `item_reopened`;
- `sprint_completed`.

Every row contains:

- UUID identifier;
- backlog and sprint identifiers;
- optional source membership and item identifiers;
- stable item key and title snapshots for item events;
- actor identifier;
- non-empty bounded request correlation identifier;
- authoritative occurrence timestamp;
- global monotonic sequence used as the deterministic tie-breaker;
- optional previous and next estimates;
- optional previous and next `done` state;
- optional related sprint identifier and stable related sprint name;
- optional removal reason: manual, moved, or deleted.

Columns that do not apply to an event type remain null. Database checks enforce
the required shape for each event type. The item reference is nullable with
`ON DELETE SET NULL`; stable identity fields preserve the historical meaning.
Sprint and backlog ownership is enforced by composite foreign keys.

Database triggers reject update and delete operations on sprint events. Normal
application code may only insert them. Test cleanup uses an explicitly isolated
privileged path rather than weakening production behavior.

Ordering is `occurred_at`, then the monotonic sequence. Timestamp equality must
never make the journal or future burndown nondeterministic.

### Completed report header

Add one immutable `sprint_report_snapshots` row per completed sprint. It stores:

- backlog and sprint identifiers;
- sprint name and goal;
- planned and actual dates;
- creation time and actor;
- initial item count, committed points, and initial unestimated count;
- final item count, completed item count, completed points, and final
  unestimated count;
- gross points added and removed after start;
- net estimate delta after start;
- number of scope events;
- the final destination summary for incomplete work.

The snapshot has a one-to-one restrictive relationship with the sprint and is
append-only after creation. Database triggers reject updates and deletes on the
header and its item rows, using the same explicitly isolated test-cleanup model
as the event ledger.

### Completed report item rows

Add immutable `sprint_report_items` rows associated with the report snapshot.
There is one logical row per item that participated in the sprint, even when an
item left and later rejoined. Membership intervals remain available through the
event journal.

Each row stores:

- optional source item identifier;
- stable key, title, type, and kind;
- first join and final leave timestamps;
- whether it belonged to the initial commitment;
- whether it was added after start;
- whether it was removed after start;
- estimate at start, estimate at final participation, and estimate at
  completion;
- final status category;
- final outcome: completed, removed, carried to backlog, or carried to sprint;
- optional stable destination sprint identifier and name.

The source item reference may become null; the historical row remains usable.
Composite keys and checks prevent cross-backlog or cross-sprint rows.

## Event-writing rules

All reporting events are inserted inside the same transaction as the mutation
they describe. If event insertion fails, the mutation rolls back. No
best-effort or asynchronous reporting path is allowed.

### Starting a sprint

The start transaction locks the backlog, sprint, memberships, and items in
deterministic order, captures `estimateAtStart`, writes one `sprint_started`
event, then activates the sprint. Commitment totals remain derivable from the
typed membership snapshots; the lifecycle event records the authoritative
boundary, actor, and correlation identifier without duplicating those totals.

### Adding or removing work

Moving work into an active sprint writes `item_added` with the estimate at join.
Moving it out writes `item_removed` with the estimate immediately before exit
and the reason. Moving directly between sprints records removal on the source
active sprint and addition on the destination when that destination is active.

Deleting an item from an active sprint closes its open membership and records
an `item_removed` event with reason `deleted`. Restoring the item does not
silently restore its sprint membership; re-adding it is an explicit
`item_added` event.

No scope event is written while all affected sprints are planned. Completed
sprints reject new memberships.

### Changing an estimate

A real estimate change on an item with an open active-sprint membership writes
one `estimate_changed` event containing the before and after values. Null is a
valid value and contributes zero points while affecting the unestimated count.
No-op edits create neither activity nor event.

Single-item and bulk paths use the same transactional event helper. Bulk edits
use one correlation identifier and one event per changed item.

### Completing and reopening work

Crossing from a non-done status category to `done` writes `item_completed`.
Crossing from `done` to a non-done category writes `item_reopened`. Transitions
within the same category do not create reporting events. This keeps the ledger
focused on report semantics rather than duplicating the complete item activity
history.

Single edit, bulk edit, and drag-and-drop status paths apply the same rule.

### Completing a sprint

The completion transaction locks the complete report source before computing
results. It writes the report header and all item rows, emits
`sprint_completed`, closes memberships, creates destination memberships, and
marks the sprint completed atomically.

A late injected database failure must prove rollback of the sprint state,
memberships, destination memberships, events, and report snapshots together.

## Calculation rules

### Commitment

`committedPoints` is the sum of `estimateAtStart` for memberships present when
the sprint starts. Null estimates contribute zero. Later additions, removals,
and estimate changes never rewrite commitment.

### Active scope

`currentScopePoints` is the sum of current estimates on open memberships in the
active sprint. The current unestimated count is shown alongside it.

### Completed work

For an active report, completed points are the current estimates of open sprint
items whose current status category is `done`.

For a completed report, completed points are the estimates captured at sprint
completion for item rows with final outcome `completed`. Added-after-start work
is included. An item removed before closure does not count as completed in that
sprint even if it was temporarily in a done status.

### Scope change

- Adding an estimated item adds its join estimate to gross added points.
- Removing an item adds its pre-exit estimate to gross removed points.
- An estimate change contributes `next - previous` to the net estimate delta.
- Null is treated as zero for point deltas and separately changes the
  unestimated count.
- Adding and later removing the same item may net to zero, but both events and
  both gross measures remain visible.
- Completing or reopening work changes remaining work, not total scope.

### Velocity

The default chart shows the seven most recently completed sprints and may show
up to twelve. Each sprint renders commitment and completed bars from its
immutable report header.

The average is the arithmetic mean of completed points for the sprints currently
shown that contain point data. A sprint is excluded only when both committed
and completed points are zero. A sprint with positive commitment and zero
completion is included. The UI displays the numerator population and the rule.

Before the first eligible completed sprint, the state is `Pas encore de
vélocité`. No forecast is invented.

## Read services

Reporting reads are separate from mutation services:

- `getSprintReport(backlogId, sprintId)` returns the active projection or the
  immutable completed snapshot;
- `getVelocityReport(backlogId, limit)` returns recent completed-sprint bars,
  inclusion flags, and the average;
- `listReportableSprints(backlogId)` returns active and completed selectors.

The service layer returns calculation inputs and results together so tests and
the UI can explain every number. Reads are SQL-filtered by canonical backlog,
batched, bounded, and free of N+1 item queries.

## Navigation and interface

Add a `Rapports` entry next to the backlog views and Releases. The route is
`/b/[key]/reports` with URL-authoritative parameters:

- `report=sprint|velocity`;
- `sprint=<uuid>` for the sprint report;
- `limit=7|12` for velocity.

The default report is the sprint report. It selects the active sprint when one
exists, otherwise the most recently completed sprint. Invalid or foreign sprint
identifiers fail through the same concealed-resource behavior as other backlog
routes and never reveal existence.

### Sprint report layout

The Jira-inspired hierarchy is:

1. report selector and sprint selector;
2. sprint identity, goal, and actual dates;
3. commitment, completed, current/final scope, and unestimated summaries;
4. completed, incomplete, removed, and carried item sections;
5. chronological scope-change journal.

Items added after start display `Ajouté après démarrage`. Estimate evolution is
rendered as `5 → 8 pts`. Existing items link to their detail. Deleted or no
longer accessible items show their frozen identity without a link.

The active report displays a clear `Données en cours` state. The completed
report displays `Historique figé` and the snapshot time.

### Velocity layout

The velocity screen contains:

- side-by-side commitment and completed bars for each sprint;
- an average-completed line;
- accessible labels and exact values;
- a synchronized semantic table containing the same numbers;
- an explanation of included and excluded sprints.

No meaning relies only on color, SVG hover, or pointer interaction. Keyboard and
screen-reader users can reach the same sprint details.

### Empty and exceptional states

Explicit states cover:

- no active or completed sprint;
- only planned sprints;
- an empty active sprint;
- all work unestimated;
- no eligible velocity sprint;
- a pre-event-model completed sprint with no trustworthy snapshot;
- an internally inconsistent report source.

Legacy completed sprints are labeled `Historique détaillé indisponible`; Jiroo
does not calculate a false report from current item state. Because the product
is still in development, test and local databases may be reset rather than
receiving an unverifiable synthetic backfill.

## Permissions and security

Any user with `browse_backlog` may read sprint reports and velocity. Reporting
does not grant item-editing or sprint-management capabilities.

Every route resolves the canonical backlog before reading a sprint. Foreign,
missing, inaccessible, and deleted identifiers use the existing concealed read
semantics. User-facing errors never contain database details, credentials,
headers, or internal identifiers.

Snapshot identity may remain visible to a backlog reader after the source item
is deleted because it is part of the backlog's immutable sprint history. It is
never exposed outside that backlog.

## Error handling and observability

- Mutation failures roll back domain state and reporting state together.
- Reporting read failures render an explicit error boundary with retry rather
  than a partial total.
- Invalid URL parameters are normalized to safe defaults when they do not name
  a resource; invalid resource identifiers remain concealed.
- Expected injected failures are marked explicitly in console and network audit
  evidence. Unexpected console errors, unhandled rejections, HTTP failures, or
  secret leakage fail acceptance.
- Queries and snapshots carry bounded correlation identifiers for diagnosis.

## Performance constraints

- Event writes add a bounded number of rows per changed item and reuse existing
  transaction locks.
- Bulk mutation paths insert events in batches rather than issuing unbounded
  per-row round trips.
- Report list sizes are paginated or bounded; journal pages are independently
  paginated from item sections.
- Velocity reads at most twelve snapshot headers.
- Completed reports never replay the full event history to calculate their
  primary totals.
- Active projections operate only on one sprint's memberships and events.

## Testing strategy

### Unit tests

- commitment, active scope, completed points, and unestimated counts;
- gross add/remove and net estimate deltas;
- repeated add/remove/re-add sequences;
- null-to-value and value-to-null estimate changes;
- velocity inclusion and average rules;
- accessible chart-to-table parity.

### Database integration tests

- start snapshot and event creation;
- single and bulk add, remove, estimate, complete, and reopen events;
- drag-and-drop and direct service parity;
- soft-delete removal and explicit re-add after restore;
- deterministic event order under equal timestamps;
- completed header and item snapshot stability after rename, re-estimate,
  status change, move, soft delete, and hard fixture cleanup;
- append-only trigger rejection;
- cross-backlog and foreign-sprint isolation;
- concurrent mutations and deterministic lock order;
- late-failure rollback across sprint, membership, event, snapshot, and
  destination writes;
- bounded behavior with a large sprint.

### Actions and component tests

- canonical authorization and concealed resources;
- safe user-facing errors;
- report and sprint URL state;
- active and frozen badges;
- every empty state;
- deleted-item frozen identity;
- keyboard and screen-reader access to chart data;
- responsive survival without making mobile parity a release blocker.

### Playwright acceptance

Build three sprints with different commitments and outcomes. Across them:

1. start with estimated and unestimated work;
2. add and remove items after start;
3. re-estimate items in both directions and through null;
4. complete, reopen, and complete work again;
5. use single edit, bulk edit, and drag-and-drop paths;
6. close with carry-over to the backlog and to a planned sprint;
7. rename, re-estimate, move, and delete source items after closure;
8. verify every report row, event, bar, average, inclusion rule, and empty state;
9. reload and repeat critical reads in a second authenticated browser context;
10. repeat read access as viewer and reject foreign-backlog access.

Every scenario monitors JavaScript console errors, failed requests, HTTP status,
and material performance regressions. A screenshot is captured for each defect
and for final report states. Evidence is stored under the run-scoped
`audit/screenshots`, `audit/console`, and `audit/network` directories.

## Audit updates

The implementation session appends findings and evidence to:

- `audit/README.md`;
- `audit/roadmap.md`;
- `audit/bugs.md`;
- `audit/ux.md`;
- `audit/benchmark.md`.

It records what was tested, what remains, and the three next priorities. The
benchmark compares the delivered report and velocity behavior with Jira,
Linear, ClickUp, Azure DevOps, GitHub Projects, and Plane without claiming
parity where evidence is absent.

## Delivery boundary

This is one PR containing the event foundation, sprint report, velocity report,
tests, Playwright evidence, and audit updates. It does not include burndown or
Release PR2. Those remain separate increments:

1. burndown and planning predictability derived from `sprint_events`;
2. release merge, delete/transfer, manual ordering, and release notes.
