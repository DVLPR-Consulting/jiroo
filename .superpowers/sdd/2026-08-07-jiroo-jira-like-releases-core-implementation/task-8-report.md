# Task 8 report — Fix versions dans les vues item

## Outcome

- Added a controlled Fix version picker with active and published candidates, keyboard support, pending/read-only states, and compact two-chip overflow.
- Current archived values remain labelled, removable, and unavailable for re-addition. The `+N` overflow is an accessible expansion control so archived values remain removable even beyond the first two selections.
- Item creation submits `fixVersionIds`; the detail panel uses the release assignment capability and optimistic rollback for both safe Server Action failures and rejected promises while keeping its menu open.
- Bulk selection supports add, replace, and remove modes. Empty mutations are disabled, while `Effacer toutes les versions` explicitly submits an empty replacement.
- Backlog and List render two compact Fix version chips plus `+N` in the requested column positions. Board cards remain compact and continue to honor the upstream release filter.
- Release candidates, current values, and exact release capabilities are threaded once from `BacklogViewContent`; no schema, service, action, validation, or package change was required.

## TDD evidence

- Picker RED: missing module, then five failing behavior cases; GREEN: published/archived behavior, keyboard, pending/read-only, and overflow.
- Creation RED: missing version control/payload; GREEN: exact published-version payload and disabled pending control.
- Detail RED: missing exact capability gate and rollback UI; GREEN: safe/rejected rollback with the menu retained.
- Bulk RED: missing exact capability gate and add/replace/remove/clear commands; GREEN: exact patches, disabled empty operations, and retained selection/feedback.
- Backlog/List RED: missing columns; GREEN: exact column order and two chips plus remainder.
- Release-only bulk selection RED: no selection affordance without ordinary bulk rights; GREEN: `bulkAssignItems` independently enables selection.
- Review remediation RED: an archived third selection was trapped behind static `+N`; GREEN: accessible overflow expansion and exact archived-removal payload in both picker and detail tests.

## Authorization and data boundaries

- Creation remains reachable only through `ProductCapabilities.items.create`.
- Detail mutation is gated only by `ProductCapabilities.releases.assignItems`.
- Bulk version mutation and its selection affordance are gated only by `ProductCapabilities.releases.bulkAssignItems`.
- Archived releases are serialized to the detail picker only when already assigned. Create and bulk candidates contain non-archived releases; published releases remain eligible.

## Review

Independent review found one Important issue: a selected archived release in third position had no removal path because it was hidden under static `+N` and excluded from candidates. The overflow is now an accessible expansion button that exposes every hidden removal control. Targeted re-review marked the finding `ADDRESSED`; no Critical or Minor findings remained.

## Verification

- Task 8 item/integration suite: 8 files, 123 tests passed.
- Requested action/validation regressions: 3 files, 98 tests passed.
- Full suite under Node 24: 135 files passed, 19 skipped; 1,163 tests passed, 172 skipped; 0 failed.
- TypeScript `tsc --noEmit`: passed.
- ESLint full repository: passed with 0 warnings.
- `git diff --check`: passed.

The first ordinary full run exposed Node 24's pathless experimental web storage instead of jsdom storage, causing 33 unrelated Shell/Theme tests to fail before assertions on `localStorage.clear`. Those seven suites passed 33/33 in isolation, and the canonical full run passed with `NODE_OPTIONS=--no-experimental-webstorage`.

## Commit and concerns

- Commit: `feat(releases): plan fix versions from item views` (this report is included in the atomic commit).
- Independent review: approved after one focused remediation.
- Concerns: no known functional concern. The Node 24 web-storage flag remains required for the canonical full Vitest command in this environment.
