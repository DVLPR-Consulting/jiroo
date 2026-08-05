# Jiroo Sprints and Capacity Design

**Status:** Approved on 2026-08-05

## Context

Jiroo now has a dedicated Backlog, persistent manual ranking, nullable story
points, multi-selection, and transactional bulk editing. Browser discovery on
2026-08-05 found no sprint entry point, sprint persistence, capacity display,
or active-sprint board behavior. The nominal discovery session had no console,
network, or HTTP error.

This increment closes the next blocking product gap: turning an ordered backlog
into an executable sprint while preserving enough history for trustworthy
reports later.

## Jira baseline

The design follows the current Jira Cloud behavior documented by Atlassian:

- Scrum work is planned in the Backlog, which may contain multiple future
  sprints. Without parallel sprints, only one can be active.
- Starting a sprint confirms its name, goal, start date, and end date, then
  opens the active sprint board.
- Adding or removing work after start is a scope change that reports must be
  able to distinguish from the initial commitment.
- Completing a sprint treats work outside the completed workflow category as
  incomplete and moves all incomplete work to one chosen destination: the
  Backlog, an existing future sprint, or a new future sprint.
- Jira blocks sprint completion while included sub-tasks remain incomplete.

Official references:

- https://support.atlassian.com/jira-software-cloud/docs/use-your-scrum-backlog/
- https://support.atlassian.com/jira-software-cloud/docs/plan-a-sprint/
- https://support.atlassian.com/jira-software-cloud/docs/complete-a-sprint/
- https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-sprint-report/

Jiroo deliberately adds a visible point-capacity target. It is advisory rather
than a hard limit: teams may start an over-capacity or partially unestimated
sprint after seeing an explicit warning.

## Goals

1. Create and edit ordered future sprints from the Backlog.
2. Assign tasks to a sprint individually, by drag and drop, and in bulk.
3. Show total points, capacity, unestimated count, and over-capacity state.
4. Start exactly one sprint per backlog and redirect to its execution board.
5. Restrict the Board to the active sprint's tasks.
6. Complete the active sprint transactionally and move all incomplete work to
   one explicit destination.
7. Preserve membership and estimate snapshots needed for later sprint reports.
8. Keep permissions, error messages, activity, reload behavior, and failure
   rollback consistent with the existing application.

## Non-goals

- Parallel active sprints.
- Releases or versions.
- Velocity, burndown, burnup, or sprint report screens.
- Per-person or time-based capacity.
- Automatic capacity prediction.
- Sprint-specific workflows or status mappings.
- Reopening a completed sprint.
- Deleting a completed sprint.
- A responsive/mobile redesign; desktop remains the primary audit target.

## Domain model

### Sprint

A sprint belongs to one backlog and has:

- `id` and `backlogId`;
- `name`, required and trimmed;
- `goal`, nullable;
- `state`: `planned`, `active`, or `completed`;
- `rank`, for deterministic ordering of future sprints;
- `capacityPoints`, nullable, from `0` through `999.99` with at most two
  decimal places;
- `plannedStartAt` and `plannedEndAt`, nullable while planning;
- `startedAt` and `completedAt`, written by lifecycle transitions;
- `createdBy`, `createdAt`, and `updatedAt`.

The database enforces at most one `active` sprint per backlog with a partial
unique index. State/date checks reject impossible combinations:

- `planned`: no actual start or completion date;
- `active`: actual start exists and completion does not;
- `completed`: both actual dates exist and completion is not before start;
- planned end, when present, must be after planned start.

Completed sprints are immutable except for name and goal, matching Jira's
limited completed-sprint editing behavior.

### Sprint membership

Sprint membership is historical and must not be represented by a single
`sprintId` on `items`, because carrying work forward would erase its previous
sprint participation.

Each membership stores:

- `id`, `sprintId`, and `itemId`;
- `joinedAt` and `joinedBy`;
- `estimateAtJoin`;
- `estimateAtStart`, set for all current members when the sprint starts and
  left null for work added after start;
- `leftAt`, nullable while the membership is current;
- `outcome`, nullable while current, then one of `completed`, `removed`,
  `carried_to_backlog`, or `carried_to_sprint`;
- `destinationSprintId`, set only for `carried_to_sprint`.

A partial unique index permits at most one current membership (`leftAt IS
NULL`) per item. Only live `tache` items from the same backlog may be members.
Structural items and subtasks never receive direct sprint membership.

The item's global backlog `rank` remains authoritative inside every sprint and
the unscheduled Backlog. Assigning a sprint does not create a second unrelated
ordering system.

## Backlog experience

The Backlog renders, in order:

1. the active sprint, when present;
2. future sprints ordered by sprint rank;
3. the unscheduled Backlog.

Each sprint header shows:

- name and state;
- goal and dates when present;
- task count;
- estimated points versus capacity;
- unestimated task count;
- an explicit over-capacity warning;
- permitted lifecycle actions.

The unscheduled section shows the same point and unestimated aggregates without
a capacity denominator.

`Créer un sprint` creates a planned sprint with a generated editable name. A
writer can then edit its name, goal, dates, and capacity. Empty states explain
how to add work rather than presenting a blank container.

### Planning interactions

A writer may:

- drag a task between the unscheduled Backlog and any planned or active sprint;
- drag a task between planned sprints;
- move selected tasks using a new `Sprint` command in the bulk toolbar;
- choose `Backlog` in that command to remove current sprint assignment.

Moving work into or out of an active sprint is allowed but visibly described as
a scope change. The service records it in the historical membership and item
activity. All drag and bulk mutations are optimistic only when an exact local
snapshot can be restored; any server or network failure restores the previous
section, rank, selection, and aggregates.

Readers see sprint sections, totals, warnings, goal, and dates but receive no
create, edit, lifecycle, drag, or bulk sprint controls.

## Starting a sprint

Only a `planned` sprint can start. The start dialog requires:

- a non-empty name;
- actual start date/time, defaulting to now;
- actual end date/time after the start;
- an optional goal;
- optional capacity points.

Before confirmation it summarizes:

- committed task count;
- committed estimated points;
- unestimated count;
- capacity and over-capacity amount, when configured.

No warning is silently blocking. Empty, over-capacity, zero-capacity, and
partially unestimated sprints may start after explicit confirmation.

The start transaction:

1. locks the backlog and target sprint;
2. rejects a second active sprint;
3. validates all current memberships;
4. sets `estimateAtStart` from each task's current estimate;
5. changes the sprint to `active` and writes actual dates;
6. records item activities for the committed scope;
7. returns success only after the complete transaction commits.

After success, the UI navigates to the Board. On failure the sprint remains
planned and the dialog retains the user's input with a French error.

## Active sprint Board

The Board displays only live tasks with a current membership in the active
sprint. Existing workflow columns, filters, grouping, ranking, transitions,
permissions, and item detail continue to work within that scope.

The Board header identifies the active sprint and exposes its goal, dates,
progress, total points, remaining points, and unestimated count. Progress uses
the existing status category: any task in a `done` status is complete.

When no sprint is active, the Board shows a purposeful empty state explaining
that execution starts from the Backlog, with a direct Backlog link. It must not
fall back to showing every backlog task.

## Completing a sprint

Only the active sprint can be completed. The close dialog shows:

- completed and incomplete task counts;
- completed and incomplete point totals;
- unestimated incomplete count;
- the sprint goal;
- one required destination for all incomplete tasks.

Available destinations are:

- `Backlog`;
- any planned sprint in the same backlog;
- `Nouveau sprint`, with a required unique name.

The destination is global, matching Jira. Per-item exceptions are outside V1.

Before completion, the service checks all descendants of sprint tasks. If any
subtask is not in a `done` status, completion is blocked and the error lists
business item keys, never UUIDs.

The completion transaction:

1. locks the backlog, active sprint, memberships, and affected tasks;
2. validates or creates the destination sprint;
3. closes completed memberships with outcome `completed`;
4. closes incomplete memberships with `carried_to_backlog` or
   `carried_to_sprint`;
5. creates current memberships in the destination sprint when applicable;
6. marks the active sprint `completed` with `completedAt`;
7. records readable item activity for every carried item;
8. commits all changes or none.

Task workflow statuses are not changed by sprint completion. Completed tasks
retain historical sprint membership but no current assignment. Incomplete
tasks keep their current workflow status in their chosen destination.

After success, the Board shows the no-active-sprint state and the Backlog shows
the completed sprint outside the active planning sections. A later report will
consume the preserved membership history.

## Validation and concurrency

- All commands validate UUIDs, backlog ownership, sprint state, item type,
  deletion state, dates, capacity, and destination state on the server.
- Client payloads never contain actor IDs, calculated totals, outcomes, or
  authoritative state transitions.
- Every Server Action authenticates and authorizes before calling a service.
- Lifecycle services use transactions and row locks.
- The database is the final guard against parallel active sprints and duplicate
  current item membership.
- Bulk sprint assignment accepts 1 through 500 unique task IDs and is
  all-or-nothing.
- Repeated start, complete, or assignment requests return stable domain errors
  and never duplicate memberships or activity.

## Permissions

The current application has only global `admin`, `contributor`, and `viewer`
roles. For this V1:

- admins and contributors may create, edit, plan, start, and complete sprints;
- viewers are strictly read-only.

A separate Jira-like `Manage sprints` permission is recorded as future RBAC
debt rather than being simulated inconsistently in this increment.

## Accessibility and feedback

- All controls have French accessible names and visible labels or tooltips.
- Sprint state, capacity warnings, scope-change warnings, mutation results, and
  errors are not communicated by color alone.
- Drag and drop has a keyboard-equivalent sprint menu and French live-region
  announcements using item and sprint names.
- Dialog focus is trapped, returns to its trigger, and reaches the first error.
- Pending lifecycle actions cannot be submitted twice.
- Success is confirmed only after the server response; failures preserve user
  input and restore exact UI state.

## Test strategy

### Unit tests

- Sprint and membership validation, including dates and decimal capacity.
- State transition guards.
- Aggregate calculations for count, points, unestimated, remaining, and
  over-capacity.
- Backlog sectioning and active-board filtering.
- Dialog and menu accessibility, pending behavior, and French errors.

### Database integration tests

- Create/edit/reorder planned sprints.
- Reject a second active sprint under concurrent attempts.
- Assign, remove, and bulk-transfer tasks transactionally.
- Snapshot estimates at start and distinguish work added afterward.
- Complete to Backlog, existing sprint, and new sprint.
- Preserve historical memberships and workflow statuses.
- Block incomplete subtasks.
- Roll back every row and activity on invalid or conflicting input.

### Playwright acceptance

One deterministic desktop Chromium matrix must:

1. create and edit a planned sprint;
2. assign tasks by drag and bulk command;
3. prove point totals, unestimated count, and over-capacity warning;
4. start the sprint and prove that the Board contains only its tasks;
5. change active scope and prove the warning/history behavior;
6. transition at least one task to `done`;
7. block completion with an incomplete subtask;
8. resolve the blocker and complete with each destination variant across
   isolated scenarios;
9. reload after every lifecycle transition and prove persistence;
10. prove viewer read-only behavior;
11. inject a rank, assignment, start, and completion failure and prove exact
    rollback;
12. capture console errors, network failures, HTTP errors, timings, and named
    screenshots under `/audit`.

Nominal scenarios require zero JavaScript errors, zero failed requests, and
zero HTTP responses greater than or equal to 400. Injected failures must be
explicitly labeled as expected evidence.

## Acceptance criteria

The increment is complete only when a user can prepare, start, execute, and
complete a sprint end to end in Chromium; the same state is observed after
reload; a viewer cannot mutate it; concurrent or injected failures cannot
produce parallel active sprints, partial carry-over, lost membership history,
or a Board showing unscheduled work.
