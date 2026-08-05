# Jiroo — Jira-like Backlog, Bulk Triage, Estimates and Sprints Design

**Date:** 2026-08-05
**Status:** Draft for written review; product direction approved in conversation
**Audit driver:** `BUG-JIR-015`
**Delivery:** two independently reviewable pull requests

## Goal

Let a product team plan and execute work end to end in Jiroo with the current
Jira Scrum mental model: rank a product backlog, estimate standard work, plan
future sprints, start one active sprint, execute only that sprint on the board,
and deliberately carry incomplete work forward when the sprint ends.

The design keeps the existing `Liste` and `Arbre` views. It adds a distinct
`Backlog` view because inventory, hierarchy, and Scrum planning are different
jobs and must not overload one interaction model.

## Delivery Boundaries

### Pull request 1 — Product backlog foundation

- expose the existing persisted rank in a dedicated Backlog view;
- reorder backlog work with mouse and keyboard;
- add nullable story-point estimates;
- add checkbox, range, and filtered-result selection;
- add transactional bulk edits for status, priority, assignee, and estimate;
- preserve the existing Board, Liste, and Arbre behavior.

This pull request is useful on its own and contains no dormant sprint control.

### Pull request 2 — Scrum sprint lifecycle

- add planned, active, and completed sprints;
- add current and historical sprint membership;
- add sprint assignment to the bulk toolbar;
- show planned and active sprint sections above the unplanned backlog;
- make the Board the execution view of the active sprint;
- start and complete sprints with Jira-like commitment and carry-over rules;
- calculate planning signals from estimates and completed sprint history.

The two pull requests share this product design but receive separate
implementation plans, migrations, browser acceptance runs, and audit history.

## Product Vocabulary

Jiroo uses these French labels consistently:

- `Backlog` — unplanned standard work in persisted manual order;
- `Sprint` — manually controlled Scrum timebox;
- `Points` — relative estimate, not elapsed time;
- `Engagement` — estimate snapshot at sprint start;
- `Vélocité` — completed points averaged from recent completed sprints;
- `Capacité indicative` — comparison against velocity, never a hard limit;
- `Travail non estimé` — standard items whose estimate is null.

`Cycle` is not used as a synonym in the interface. The product direction is
explicitly Jira-like Scrum, so the user-facing term is `Sprint`.

## Existing Model Reused

Every item already has a unique backlog-local fractional `rank`. Board and Tree
mutations already send neighbor ids to the server, which derives the final rank
transactionally. The new Backlog view reuses that invariant rather than adding
a second ordering field.

Rank remains a total order across the backlog. Temporary table sorts never
rewrite it. The Backlog view is manually ordered when no explicit sort is
active. If the user applies a non-manual sort or a group, reordering is disabled
and the interface explains that manual order is available after clearing that
presentation state.

## Work Eligible for Scrum Planning

Jiroo keeps its current hierarchy:

- `Composant` and `Epic` provide structure;
- `Tâche`, with `bug` or `feature` nature, is standard executable work;
- `Sous-tâche` is implementation detail beneath a task.

Only live `Tâche` items appear as primary Backlog rows, receive story-point
estimates, and join sprints in this increment. Components and epics remain
available through filters and hierarchy context. Subtasks remain attached to
their parent task and do not consume sprint points independently. This prevents
double-counting and matches the existing mono-level Board.

Items in a `done` status and without an active sprint membership do not clutter
the product Backlog. They remain searchable and visible in Liste, Arbre, saved
views, detail history, and completed sprint history.

## Pull Request 1 Design

### Dedicated Backlog View

`/b/:key?view=backlog` becomes a fourth persisted display mode and appears
before Board, Liste, and Arbre in the primary view switcher.

The initial Backlog surface contains one section:

- heading `Backlog`;
- count of visible work;
- total estimated points;
- number of unestimated items;
- compact rows with selection, drag handle, key, title, status, priority,
  estimate, and assignee;
- inline creation at the bottom, preserving the insertion position.

Filters restrict what is visible. Ranking while filters are active is allowed
only when the dragged item's immediate visible neighbors define an unambiguous
gap; the server remains authoritative. Selecting all selects the complete
filtered result, not hidden unmatched work.

### Manual Ranking

Writable rows expose a labelled drag handle and keyboard sortable behavior.
Mouse insertion lines distinguish `before` and `after`; keyboard instructions
and live announcements use item keys and titles.

The client submits only:

- moved item id;
- previous visible neighbor id or null;
- next visible neighbor id or null;
- backlog key for revalidation.

The server validates that the item and submitted neighbors are live standard
items in the same backlog, locks the relevant order, and derives the fractional
rank. It retries serialization or unique-rank collisions using the established
rank service. A failed mutation restores the exact client snapshot and leaves
selection intact.

### Story-point Estimates

Items gain nullable `estimatePoints`. The domain value is a non-negative number
with at most two decimal places and a maximum of `999.99`. Null means
unestimated; zero is an explicit zero-point estimate.

The Backlog row and item detail expose an inline numeric editor. The initial
quick choices are `1`, `2`, `3`, `5`, `8`, and `13`, while manual numerical
entry remains possible to stay compatible with Jira's numerical estimates.
Only a `Tâche` accepts an estimate. Creation does not require one.

Estimate changes produce activity with stable old and new values. Clearing an
estimate stores null and records the removal. The UI distinguishes `—` from
`0`.

### Selection Model

Every writable Backlog and Liste row exposes a checkbox on pointer hover and
keyboard focus; the checkbox remains visually present while selected. Read-only
users see no selection control because there is no permitted bulk mutation.

Supported selection gestures are:

- click a checkbox to toggle one item;
- Shift-click to select the visible range from the last anchor;
- the header checkbox selects or clears the filtered result;
- `Cmd/Ctrl+A` selects the filtered result only when focus is inside the work
  table and no text editor, menu, or dialog is active;
- `Escape` clears selection before it closes any surrounding detail panel.

Selection is id-based. It survives a successful bulk edit if every selected
item remains visible, and removes items that no longer match active filters.
Navigation, backlog change, or switching display mode clears it.

### Bulk Toolbar

Selecting one or more rows opens a sticky toolbar announcing the count. Pull
request 1 supports:

- status;
- priority;
- assignee, including unassigned;
- estimate, including clear;
- clear selection.

Pull request 2 adds sprint assignment without changing the selection contract.

Each command opens a small labelled menu or dialog, shows the affected count,
and requires one explicit confirmation for destructive or broad changes. The
bulk operation is all-or-nothing in one database transaction. The server:

1. authenticates and authorizes before inspecting submitted ids;
2. accepts between 1 and 500 unique ids;
3. locks selected live items in stable id order;
4. verifies that every item belongs to the submitted backlog;
5. validates the target value against that backlog;
6. applies field-specific invariants such as `closedAt` for status changes;
7. writes an activity row for every actual change;
8. returns changed and unchanged counts.

If any item is missing, deleted, foreign, or invalid, none is changed. The UI
keeps the selection and reports the reason. Concurrent single-item changes are
serialized by row locks; the bulk command applies to the current server values.

## Pull Request 2 Data Model

### Sprints

A sprint belongs to exactly one backlog and contains:

- id and backlog id;
- unique case-insensitive name within the backlog;
- optional goal;
- state: `planned`, `active`, or `completed`;
- nullable planned start and end timestamps;
- actual start timestamp set when started;
- actual completion timestamp set when completed;
- integer display order for planned sprint sections;
- commitment points snapshot at start;
- completed points snapshot at completion;
- created and updated timestamps.

A partial unique database constraint permits at most one `active` sprint per
backlog. Planned sprints may be reordered. Completed sprints are read-only in
this increment.

### Sprint Memberships

Sprint assignment uses a history table rather than a single `items.sprintId`.
Each membership records:

- sprint and item ids;
- when and by whom the item was added;
- when and by whom the membership ended;
- the item's committed estimate snapshot when the sprint started, nullable for
  work added after start;
- the item's completion estimate snapshot when the sprint completed, when
  applicable.

A partial unique constraint permits only one open membership per item. Moving
an item between backlog and sprints closes the previous membership and creates
the next one in one transaction. Historical sprint membership therefore
survives carry-over and supports later velocity, scope-change, and audit views.

### Sprint Activity

Sprint lifecycle events cannot use the existing item activity table, whose item
id is mandatory. A dedicated sprint activity table records sprint id, actor id,
action, optional old/new values, and timestamp. Item assignment and carry-over
continue to create ordinary item activity entries with the stable sprint name,
so both the sprint history and each affected item's history remain readable if
the sprint is later unavailable.

## Jira-like Backlog with Sprints

After pull request 2, the Backlog view displays sections in this order:

1. active sprint, when one exists;
2. planned sprints in configured order;
3. unplanned Backlog.

Every section shows item count, total points, and unestimated count. Active
sprints also show commitment, current scope, and added-scope delta. Planned
sprints show the latest velocity comparison when history exists.

Dragging or using bulk edit moves work between sections and reorders it using
the same global rank. The destination and insertion line are always explicit.
Moving work into an active sprint after start is allowed but marked as a scope
change. Moving work out is also recorded.

### Create and Edit a Planned Sprint

An administrator creates a sprint with:

- required unique name, default suggestion `Sprint <next number>`;
- optional goal;
- optional planned dates, with end strictly after start.

Planned sprint dates can be adjusted until start. An empty planned sprint can
be deleted after confirmation. A populated planned sprint must first have its
open memberships moved to another sprint or back to the Backlog; silent
reassignment is not allowed. Because the sprint never started, deletion may
cascade its closed planning-only membership records after stable item activity
has been written. Active and completed sprints cannot be deleted.

### Start a Sprint

Only an administrator can start a sprint. Starting requires:

- no other active sprint in the backlog;
- at least one live standard item;
- start and end timestamps, with end after start;
- confirmation showing item count, total points, and unestimated count.

The goal is recommended but not mandatory, matching Jira. The transaction
locks the backlog and sprint, rechecks the single-active invariant, changes the
state to active, records actual dates, snapshots every open membership's
estimate and the total commitment, then writes sprint activity.

After success, the application navigates to Board. The Board displays only
standard items with an open membership in the active sprint. If no sprint is
active, the Board shows a deliberate empty state with actions to open Backlog
or start a planned sprint; it never silently falls back to all items.

### Complete a Sprint

Only an administrator can complete the active sprint. Completion determines
done work by the persisted status category `done`. If incomplete items remain,
the administrator chooses exactly one Jira-like destination:

- Backlog;
- an existing planned sprint;
- a newly named planned sprint created in the same transaction.

The confirmation shows completed and incomplete counts, points, and unestimated
work. The transaction:

1. locks the backlog, sprint, memberships, and involved items;
2. rechecks that the sprint is active;
3. snapshots completed points using estimates at completion;
4. closes every active-sprint membership;
5. creates destination memberships for incomplete work when needed;
6. marks the sprint completed and records actual completion time;
7. records item and sprint activity.

Statuses are not changed automatically. Completed work disappears from the
active Board because the sprint is closed, while completed sprint history
retains its membership. The next planned sprint never starts automatically.

## Capacity and Velocity

Jiroo does not introduce an arbitrary manual capacity field in this version.
For Jira-like core Scrum behavior, capacity is presented through evidence:

- planned points and unestimated count for every sprint;
- commitment points frozen at start;
- completed points frozen at completion;
- average completed points over the latest three completed sprints;
- a non-blocking warning when a planned sprint exceeds that recent velocity;
- `Pas encore de vélocité` until at least one sprint is completed.

The warning never prevents planning or start. Estimate changes after sprint
start affect current scope but not the commitment snapshot. Work added after
start is visible as scope change and does not rewrite commitment.

## Permissions

Existing roles map to Scrum capabilities as follows:

| Capability | Admin | Contributor | Viewer |
|---|---:|---:|---:|
| View backlog, sprints, estimates and history | yes | yes | yes |
| Rank work and edit one estimate | yes | yes | no |
| Select and bulk-edit work | yes | yes | no |
| Assign work to planned or active sprint | yes | yes | no |
| Create, edit, reorder or delete planned sprint | yes | no | no |
| Start or complete sprint | yes | no | no |

Server Actions enforce these rules independently from hidden UI controls. Actor
ids always come from the authenticated session.

## Error Handling and Feedback

Known failures return specific French messages, including:

- foreign, deleted, structural, or missing item;
- rank destination no longer valid;
- invalid or forbidden estimate;
- more than 500 selected items;
- bulk target not valid for the backlog;
- duplicate sprint name;
- invalid dates;
- occupied planned sprint deletion;
- another sprint became active concurrently;
- sprint changed or completed concurrently;
- invalid carry-over destination.

Pending controls are disabled only for the affected mutation. Ranking and bulk
UI use optimistic feedback only where an exact rollback snapshot exists. Sprint
start and completion wait for server confirmation because they change the
execution context. Success messages state exact changed/unchanged counts.

## Next.js and Data-flow Constraints

- Backlog rendering remains server-owned and URL-driven.
- Client components own transient selection, drag, menus, and optimistic state.
- Server Actions authenticate first, validate with Zod, call transactional
  services, and revalidate `/b/:key`.
- Client payloads never contain authoritative ranks, commitment totals,
  velocity, completion totals, or actor ids.
- Database constraints protect the single active sprint, single open membership,
  valid estimates, and backlog-local uniqueness under concurrency.

The implementation plan must use the Next.js 16.2.7 documentation shipped in
`node_modules/next/dist/docs/` for Server Actions, cache revalidation, forms,
and async route/search parameters before changing those surfaces.

## Testing Strategy

Every behavior is implemented red-green-refactor.

### Pull request 1

- validation tests for estimates and bulk payloads;
- service integration tests for ranking, all-or-nothing bulk updates,
  `closedAt`, activity, deleted/foreign items, and concurrent rank collisions;
- Server Action authorization and French error mapping tests;
- component tests for manual ordering, disabled ranking under sort/group,
  checkbox/range/all selection, shortcut guards, toolbar actions, rollback,
  estimate null versus zero, and viewer restrictions;
- Playwright acceptance for reorder + reload, keyboard reorder, estimate edit,
  range selection, each bulk field, injected failure rollback, viewer role,
  console, HTTP, network, and timing.

### Pull request 2

- migration and schema constraint tests;
- integration tests for membership history, one active sprint, commitment,
  scope change, completion, carry-over destinations, and velocity calculation;
- Server Action tests for admin versus contributor capabilities and concurrent
  start/complete;
- component tests for sprint sections, totals, dialogs, active Board filtering,
  no-active-sprint state, capacity warning, and history;
- Playwright acceptance for create → plan → start → execute → complete → carry
  over → reload, plus contributor/viewer matrices and injected failures;
- clean browser evidence written to `/audit/console`, `/audit/network`, and
  `/audit/screenshots` with `BUG-JIR-015` updated only after proof.

Both pull requests require focused tests, the full Vitest suite, TypeScript,
ESLint, `git diff --check`, production build, and browser acceptance before
commit, push, or pull-request creation.

## Migration and Compatibility

Pull request 1 adds only nullable estimate data; every existing item remains
valid and its rank is preserved.

Pull request 2 creates sprint tables without assigning existing work. Existing
items therefore appear in Backlog. The Board intentionally shows the
no-active-sprint empty state until an administrator plans and starts a sprint.
Liste, Arbre, search, detail, trash, saved views, item keys, statuses, labels,
links, and existing activity remain available.

No migration invents dates, goals, commitment, or sprint history for existing
work.

## Audit and Documentation

Each pull request enriches, never replaces, `/audit/README.md`, `bugs.md`,
`ux.md`, `benchmark.md`, and `roadmap.md`. Browser failures receive unique ids
and explicit screenshots. At each increment end, the report states what was
tested, what remains, and the next three priorities.

`BUG-JIR-015` remains open after pull request 1 because sprint planning is still
incomplete. It may be marked corrected only after pull request 2 passes the
full browser lifecycle. Any missing report, history, release/version, or
repository/PR integration remains separately visible and is not silently
credited.

## Out of Scope

- parallel sprints;
- Kanban versus Scrum backlog mode selection;
- time-based estimation and time tracking;
- releases, versions, release notes, and deployment status;
- repository connection and automatic pull-request linking;
- sprint deletion with silent item reassignment;
- subtask estimates in sprint totals;
- burndown, burnup, forecast dates, and Advanced-Roadmaps-style team capacity;
- cross-backlog sprints and portfolio planning;
- automation rules that start, complete, or move sprint work.

These are explicit future increments, not implied parts of the two approved
pull requests.

## Acceptance Gate

The initiative is complete only when a real administrator can rank and bulk
triage work, estimate it, create and plan a sprint, start it, execute its items
on the Board, complete it, carry incomplete work to a deliberate destination,
and recover the same result after reload; contributors and viewers must see
exactly their authorized controls; commitment and completed totals must remain
historically stable; and the clean Playwright acceptance run must contain no
unexpected JavaScript, HTTP, or network error.
