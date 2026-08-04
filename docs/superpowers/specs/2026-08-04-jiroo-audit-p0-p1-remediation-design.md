# Jiroo Audit P0/P1 Remediation Design

**Date:** 2026-08-04  
**Status:** Approved for specification review  
**Scope:** BUG-JIR-001, BUG-JIR-002, BUG-JIR-005 through BUG-JIR-009, responsive shell, and item-mutation feedback

## Goal

Make the two audited workflows—item creation and item detail editing—reliable,
responsive, keyboard-accessible, and explicit about validation. Preserve Jiroo's
current information architecture and permissions while removing the systemic
causes documented in `/audit`.

## Current Failures

- The global `C` shortcut opens the create dialog without consuming the key,
  so the focused title receives `c`.
- The UI does not share the server's 200-character title or 20,000-character
  description limits. Zod failures are reduced to generic action messages.
- The authenticated shell always reserves a 248 px or 64 px sidebar column,
  leaving critical board controls outside a 390 px viewport.
- The item panel is a custom backdrop plus `aside`; it has no Escape handling,
  dialog name, initial focus, focus trap, or focus restoration.
- The panel keeps a fixed `1fr 220px` grid inside a 92 vw surface on mobile,
  reducing the primary content column to about 98 px.
- Title editing is attached to a non-focusable heading, and relation/reference
  removal controls use `display:none` until pointer hover.
- Item property editors intentionally keep the previous prop value until a
  server refresh, producing visible rollback-like behavior for roughly one to
  three seconds.

## Chosen Approach

Use a targeted refactor around existing project primitives:

- extend the existing sidebar state and shell instead of replacing navigation;
- build the item side panel with the installed Radix Dialog primitive;
- export validation limits and preserve structured Zod errors;
- add a focused optimistic-update abstraction for item fields;
- retain the existing Server Actions, authorization checks, URLs, database
  schema, activity logging, and role model.

This avoids both a fragile collection of CSS/keyboard patches and a broad
design-system rewrite.

## Responsive Shell

Desktop behavior at 768 px and above remains unchanged:

- expanded sidebar column: 248 px;
- collapsed sidebar column: 64 px;
- persisted desktop collapse preference remains under
  `jiroo-sidebar-collapsed`.

Below 768 px:

- the shell has one `minmax(0,1fr)` content column;
- the sidebar is closed by default and rendered as a fixed 248 px drawer over a
  backdrop when opened;
- the existing topbar trigger opens/closes the drawer and exposes the action in
  French;
- Escape and backdrop click close the drawer;
- focus enters the drawer and returns to the trigger after close;
- selecting a navigation destination closes the mobile drawer through route
  reconciliation;
- the desktop collapsed preference does not shrink or expose an icon rail on
  mobile;
- the topbar keeps search, notifications, and theme within the viewport;
- the backlog view toolbar keeps the creation entry point within the viewport.
  Secondary board controls may wrap or move to an overflow area, but critical
  actions remain directly reachable.

The board itself remains an intentional horizontal scroller. The page and
shell must not horizontally overflow; only the board's dedicated scroller may.

## Accessible Item Detail Sheet

The item panel becomes a Radix Dialog-based sheet using the existing
`components/ui/dialog.tsx` primitives. It retains URL-driven open/close state:

- closing calls the existing URL authority and removes `item`;
- Escape, backdrop click, and the labelled close button use the same close
  path;
- Radix supplies modal semantics, focus containment, initial focus behavior,
  and restoration to the opening control;
- the title is the accessible dialog name through `DialogTitle` or an explicit
  `aria-labelledby` relationship;
- no description is required solely to satisfy an implementation primitive;
  redundant announcements are avoided.

Responsive layout:

- mobile: width 100 vw, height 100%, one content column, properties after the
  active tab content;
- desktop: width 620 px, maximum 92 vw, existing two-column layout;
- the header may wrap on narrow screens so copy and close actions remain
  reachable;
- animations respect `prefers-reduced-motion` through the existing animation
  utilities or an explicit motion-reduce override.

## Keyboard-Discoverable Editing

### Title

- Read-only users continue to receive a plain heading.
- Writers receive a semantic button styled as the level-two title, plus a
  visible edit affordance on hover and focus.
- The accessible name is `Renommer <item key>`.
- Enter or Space enters edit mode; the input receives focus.
- Enter saves, Escape cancels without saving, and blur keeps the current save
  behavior only when the value is valid.
- The title input exposes its character limit, count, error relationship, and
  busy state.

### Relation and development-reference removal

- Removal buttons remain in the accessibility tree and tab order at all times.
- They may be visually subdued with opacity, but become fully visible on row
  hover and `focus-within`.
- Existing contextual French accessible names remain.
- Enter and Space execute the same removal action as pointer activation.

### Sheet dismissal

- Escape cancels an active title edit before it dismisses the whole sheet.
- Once no nested editor consumes Escape, a subsequent Escape closes the sheet.
- Closing restores focus to the item control that opened it when that control
  still exists.

## Shared Validation and Action Errors

`lib/validation/item.ts` exports:

```ts
export const ITEM_TITLE_MAX = 200;
export const ITEM_DESCRIPTION_MAX = 20_000;
```

The create title, editable title, and description textarea use these constants
for `maxLength`, counters, and client messages. Required/title validation stays
server-authoritative even though known constraints are also enforced in the
browser.

Server Actions preserve validation detail in a stable result shape:

```ts
type FieldErrors = Partial<Record<"title" | "description", string[]>>;

type ActionFailure = {
  ok: false;
  error: string;
  fieldErrors?: FieldErrors;
};
```

A shared mapper recognizes `ZodError`, returns flattened field errors, and uses
the first actionable field message as the summary. Existing domain mappings
for hierarchy, status, labels, uniqueness, and permissions remain intact.
Unknown exceptions still return safe generic text and never expose stack or
database details.

Client errors are rendered next to the relevant control with stable ids,
`aria-invalid`, and `aria-describedby`. On create submission, the first invalid
field receives focus. A forged oversized request is rejected with the same
precise field message.

## Optimistic Item Property Updates

A focused client hook owns the lifecycle for one editable value:

```ts
type OptimisticFieldState<T> = {
  value: T;
  pending: boolean;
  error: string | null;
  update(next: T, patch: UpdatePatch): void;
};
```

Behavior:

1. Selecting a new value updates the rendered control immediately and clears
   the previous error.
2. The control exposes `aria-busy=true` while its request is in flight.
3. Independent fields maintain independent optimistic state and requests.
4. On success, the returned item confirms the local value and
   `router.refresh()` synchronizes board, detail, and activity.
5. On failure or thrown transport error, the field rolls back to its last
   confirmed value and displays the safe action error.
6. Incoming server props synchronize a field only when that field has no newer
   local mutation. A stale refresh cannot overwrite a pending or newer value.
7. A field is disabled during its own request. This deliberately avoids
   ambiguous same-field response ordering while still allowing users to update
   different fields concurrently.

The hook applies to status, priority, nature, assignee, reporter, due date, and
labels in the item detail panel. Board/list inline editors are updated only if
they share the same proven pessimistic defect during regression tests; no
unrelated bulk mutation framework is introduced.

## Error and Loading Feedback

- Pending controls retain the optimistic value instead of reverting visually.
- Disabled and busy states are both conveyed; opacity is not the only signal.
- Field errors use `role=alert` only when newly introduced, avoiding repeated
  announcements during ordinary refreshes.
- Description and title save buttons communicate the pending state through
  `Enregistrement…` or an equivalent accessible name.
- Success remains visible through the changed value; toasts supplement but do
  not replace state feedback.
- Failed create/update actions keep user input intact.

## Testing Strategy

Implementation follows a separate red-green-refactor cycle for each behavior.
Every regression test must fail for the audited reason before production code
changes.

Focused Vitest/Testing Library coverage:

- `C` opens the creation dialog with an empty title and consumes the event;
- create/edit inputs expose exact limits, counters, field errors, and focus;
- actions return structured Zod field errors while preserving domain errors;
- mobile shell state renders a drawer rather than a fixed grid column;
- detail sheet has dialog semantics and closes through Escape/URL authority;
- title edit is keyboard-reachable and preserves read-only semantics;
- relation/reference removal buttons remain focusable without hover;
- property values change immediately, remain optimistic while pending, confirm
  on success, and roll back on failure;
- a stale prop rerender does not clobber a newer optimistic value.

Verification after focused tests:

- complete Vitest suite;
- ESLint;
- TypeScript `--noEmit`;
- Next.js production build;
- Playwright reproductions at 1200 × 943 and 390 × 844;
- keyboard traversal, Escape, focus restoration, admin/reader roles, network,
  console, and screenshots;
- `/audit` statuses change to corrected only after browser evidence exists.

## Data and Compatibility

No database migration is required. Existing item data, URLs, role checks,
activity records, sidebar preference, and saved views remain compatible. Test
data added during browser verification is restored or explicitly documented in
the audit history.

## Out of Scope

- P2/P3 product additions such as custom fields, templates, description
  history, time-in-state, subscriptions, voting, or new relation types;
- drag-and-drop behavior, comments, notifications, and saved-view semantics;
- a new global mutation framework or replacement of every inline editor;
- changing desktop sidebar information architecture;
- fixing BUG-JIR-004, which is retained as a diagnostic non-bug.

## Acceptance Gate

The sprint is complete only when every original audited reproduction passes in
Playwright, focused and full automated checks are green, the browser console
contains no new unexpected errors, network failures are documented, and the
audit report links to fresh post-fix evidence.
