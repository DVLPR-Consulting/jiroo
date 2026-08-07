# Task 7 report — Pages Releases, progression et cycle accessible

## Outcome

- Added native Versions navigation plus list and detail routes for accessible, non-archived backlogs.
- Added fail-closed capability projection and minimal client DTOs; emails, raw event values, and correlation IDs remain server-only.
- Added release creation/editing, lifecycle dialogs, state precedence, dates, drivers, overdue labels, and exact item-filter progress links.
- Added separate paginated current scope, immutable publication snapshots, and safe event history.
- Added accessible historical-snapshot selection. One bounded publication-selection query validates a requested publication against its backlog/release and falls back to the latest publication.
- Added named dialogs, live alerts, pending state, focus return, stale refresh, input retention on ordinary rejection, and reset after successful or stale-refresh flows.

## TDD evidence

- Navigation/list route RED: missing native Versions link and release UI modules; GREEN: 3 files, 10 tests.
- Forms/progress/list RED: missing form/progress modules and card content; GREEN: 4 files, 15 tests.
- Status-category read RED: missing `listStatusIdsByCategory`; GREEN: one query, exact category groups.
- Event projection RED: publication ID existed only in raw JSON; GREEN: explicit typed `publicationId` projection.
- Detail/lifecycle RED: three missing modules; GREEN: 3 files, 15 tests.
- Review remediation RED: broken item href, absent snapshot control, lost pagination state, populated successful create form, and stale local edit state; GREEN: 3 files, 17 tests.
- Historical selection integration covers two publications and verifies older validated selection plus forged-ID fallback to the latest publication.

## Authorization, privacy, and query bounds

Both routes await Next.js 16 promise-based route inputs. They resolve the backlog through the accessible-backlog service and map missing, archived, or fail-closed capability results to `notFound()`. Management controls are gated by `ProductCapabilities.releases`; move is absent without `assignItems`; the user directory is queried and serialized only after `browse_users` succeeds.

The detail route performs one paginated scope read, one paginated event read, one status-category read, one bounded publication-selection read, and at most one paginated snapshot read. No service is called from an item, event, or publication loop. Client event rows contain only ID, publication ID, actor label, action, and ISO timestamp.

## Review remediation

Independent review initially found four Important issues. All were fixed with focused tests:

- current-scope item links now use `/b/[key]?item=[itemKey]`;
- each pager retains the valid state of the other independently paginated sections;
- publication events expose accessible snapshot links, including validated historical publications outside the current event page;
- successful create and edit flows reset local state, while revision-keyed edit dialogs reopen with refreshed server props after stale recovery.

Targeted re-review found no remaining Critical, Important, or new Minor findings and approved the task.

## Verification

- Release UI suite: 8 files, 36 tests passed.
- Database-backed release/status suite: 2 files, 26 tests passed.
- Full suite: 134 files passed, 19 skipped; 1,142 tests passed, 172 skipped; 0 failed.
- TypeScript `tsc --noEmit`: passed.
- ESLint full repository: passed with 0 warnings.
- `git diff --check`: passed.

The brief's pnpm wrappers could not run in this linked worktree because pnpm reports `packages field missing or empty` for the existing `pnpm-workspace.yaml`. The underlying Vitest, TypeScript, and ESLint binaries were run directly under Node 24. The full Vitest run used `--no-experimental-webstorage` so jsdom, rather than Node's pathless experimental storage, supplies `localStorage`.

## Commit and concerns

- Commit: `feat(releases): add release planning pages` (this report is included in that atomic commit).
- Independent review: approved after remediation.
- Ledger concern: release and browsable-user collections remain unpaginated. They are fixed-count queries and correctly permission-gated, but payload cost grows with the backlog/installation; pagination is deferred beyond Task 7 scope.

## Fix round 1 — création avec pilote explicite

The shared driver picker previously offered `Aucun pilote` during creation even
though the create action replaces an omitted driver with the actor. Creation
now has no nullable option, starts on the actor, and always submits the explicit
actor or selected driver. Editing retains `Aucun pilote` because the update
schema and service intentionally support `driverId: null`.

- RED: the creation picker incorrectly exposed `Aucun pilote` (the two later
  failures in that run were queued-mock cascades after the early assertion).
- GREEN: form suite 9 tests passed, including exact actor, selected-driver, and
  nullable-edit payloads.
- Task 7 UI suite: 8 files, 39 tests passed.
- TypeScript, full ESLint, and `git diff --check`: passed.
- No server change was required.
