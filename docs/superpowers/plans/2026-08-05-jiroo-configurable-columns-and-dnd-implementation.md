# Jiroo — Configurable Columns and DnD Implementation Plan

**Goal:** Deliver backlog-local configurable board columns and close the four
audited board defects without weakening data safety or permissions.

**Architecture:** Reuse the existing `statuses` table as the workflow source of
truth. Add validation, transactional status services, admin-gated Server
Actions, and one board-contextual manager dialog. Keep all existing status
consumers intact so configuration propagates naturally.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle/PostgreSQL,
Radix UI, dnd-kit, Vitest/Testing Library, Playwright.

## Task 1 — Record the observed workflow gap

- [ ] Add BUG-JIR-013 with browser-only reproduction and evidence.
- [ ] Add the workflow/columns increment to README, UX, roadmap, and benchmark.
- [ ] Preserve all previous audit history and artifacts.

## Task 2 — Stabilize drag and mobile status mutation

**Files:** `components/items/item-board.tsx`, focused tests, optionally a pure
`lib/items/board-dnd.ts` helper.

- [ ] Write failing regressions for cancelled drag restoration, French semantic
  announcements, semantic collision targeting, and the mobile status control.
- [ ] Run the focused tests and observe RED.
- [ ] Add `onDragCancel`, pointer-first collision, conservative auto-scroll, and
  French accessibility configuration.
- [ ] Reuse `InlineStatus` on writable cards below the desktop breakpoint.
- [ ] Run focused tests and observe GREEN.

## Task 3 — Implement the status domain transactionally

**Files:** `lib/validation/status.ts`, `lib/services/statuses.ts`, tests.

- [ ] Write failing validation tests for trimmed names, categories, colors, ids,
  and complete reorder payloads.
- [ ] Write failing integration tests for create, duplicate rejection, edit,
  reorder, protected deletion, occupied deletion with replacement, activity,
  and `closedAt` semantics.
- [ ] Implement only enough service behavior to make each test pass.
- [ ] Keep cross-backlog ids and incomplete reorder payloads atomic failures.

## Task 4 — Expose admin-only Server Actions

**Files:** `app/actions/statuses.ts`, `app/actions/statuses.test.ts`.

- [ ] Write failing authorization and error-contract tests.
- [ ] Require `admin` before validation or mutation.
- [ ] Revalidate the backlog, admin, list, tree, filters, and detail consumers.
- [ ] Return stable French domain errors without database details.

## Task 5 — Build the column manager UI

**Files:** `components/statuses/status-manager-dialog.tsx` and test,
`components/shell/view-bar.tsx`, `components/items/backlog-view-content.tsx`.

- [ ] Write failing tests proving that admins see `Colonnes`, contributors and
  viewers do not, and `Ajouter une colonne` is visible after opening.
- [ ] Write failing form tests for create/edit, move controls, safe deletion,
  replacement selection, pending state, and error preservation.
- [ ] Implement the dialog and toolbar slot with semantic labels and focus
  restoration.
- [ ] Verify the new status appears in all existing status consumers.

## Task 6 — Browser acceptance and audit closure

- [ ] Run focused tests, full tests, ESLint, TypeScript, and Next build.
- [ ] Playwright: create, rename, recolor, recategorize, reorder, move items,
  delete empty, delete occupied with replacement, reload, and verify other
  views.
- [ ] Playwright: contributor/viewer permission checks.
- [ ] Playwright: desktop DnD and keyboard cancellation regressions.
- [ ] Playwright: mobile inline status menu smoke test.
- [ ] Save clean console/network logs and explicit screenshots in `/audit`.
- [ ] Mark only browser-proven behaviors corrected and stop for user validation.
