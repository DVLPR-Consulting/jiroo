# Jiroo — Configurable Columns and DnD Stabilization Design

**Date:** 2026-08-05
**Status:** Approved in conversation
**Scope:** BUG-JIR-010 through BUG-JIR-013, including the previously agreed mobile status menu

## Goal

Make the board capable of supporting a real product workflow instead of forcing
every backlog into the same four statuses. Preserve safe desktop execution while
keeping status changes usable on mobile without requiring horizontal drag.

## Product Model

Jiroo keeps a deliberately simple one-to-one model for this increment:

- one board column equals one persisted backlog status;
- each status belongs to exactly one backlog;
- each status has a name, semantic category (`todo`, `in_progress`, `done`),
  color, and stable integer order;
- workflow configuration is backlog-local and admin-only;
- contributors and admins may move items; viewers remain read-only.

This is less expressive than Jira workflow schemes and transition rules, but it
provides the minimum complete capability required to adapt a board to a product
process. Transition rules, validators, WIP limits, and shared schemes remain
explicit follow-up audit items.

## Discoverability

The Board view exposes a labelled `Colonnes` action in its main toolbar for
administrators. The action opens a `Gérer les colonnes` dialog showing every
status in board order and an immediately visible `Ajouter une colonne` action.
Configuration is therefore available from the surface where its result is seen,
without requiring knowledge of a hidden administration route.

The administration copy is updated to mention workflow configuration, but the
primary workflow editor remains board-contextual so the backlog is unambiguous.

## Column Management

### Create

An administrator enters:

- a trimmed, non-empty name, unique case-insensitively inside the backlog;
- one of the three semantic categories;
- a preset color.

The new status is appended transactionally after the current maximum order and
appears after refresh in Board, List, Tree, filters, create forms, and item
property editors because those surfaces already consume persisted status rows.

### Edit

Name, category, and color are editable. When a populated status changes into or
out of `done`, item `closedAt` values are updated transactionally so reporting
semantics stay consistent. The affected items receive an activity entry for the
category change.

### Reorder

Every row provides labelled move-up and move-down controls. A single server
action validates that the submitted ids are the complete exact status set for
the backlog, then rewrites contiguous orders in one transaction. This avoids
partial or cross-backlog reorder payloads.

### Delete

- the final status can never be deleted;
- the final `todo` or final `done` status cannot be deleted, because new-item and
  completion semantics depend on those categories;
- an empty status may be deleted after confirmation;
- a populated status requires a different destination status;
- reassignment, `closedAt` correction, item activity creation, deletion, and
  order compaction occur in one transaction.

No item is silently deleted or orphaned.

## DnD Stabilization

The existing board interaction is retained with four corrections:

1. `onDragCancel` restores the pre-drag snapshot and clears visual drag state.
2. Pointer collision prefers `pointerWithin`; keyboard collision falls back to
   `closestCorners`, reducing accidental adjacent-column selection.
3. Horizontal auto-scroll starts only in a narrow edge zone and accelerates
   more slowly than the library default.
4. Screen-reader instructions and live announcements are French and identify
   item keys and visible column names, never internal UUIDs.

## Mobile Status Menu

The previously agreed final responsive change is still delivered: each writable
card exposes an inline status menu below the desktop breakpoint. It reuses the
existing `InlineStatus` mutation path, pending state, rollback, and French error
feedback. Horizontal drag remains available as a secondary interaction, but is
not required to change a status on mobile.

## Validation and Errors

Known domain failures return explicit French messages from Server Actions:

- duplicate name;
- status/backlog mismatch;
- incomplete reorder payload;
- protected final status/category;
- occupied status without a valid replacement;
- unknown status.

Dialogs stay open on failure, preserve input, associate the error with the
active form, and disable only while their mutation is pending.

## Testing

Implementation follows red-green-refactor for each behavior:

- validation unit tests;
- transactional service integration tests for create, reorder, safe delete,
  reassignment, and `closedAt` correction;
- Server Action authorization and safe error mapping tests;
- component tests for discoverability, creation, reorder controls, deletion
  destination, viewer/contributor restrictions, mobile menu, cancel restore,
  and French semantic announcements;
- full Vitest, ESLint, TypeScript, and production build;
- Playwright desktop acceptance for the complete column lifecycle;
- Playwright mobile check for the status menu;
- console, HTTP, network, timing, and screenshot evidence written to `/audit`.

## Out of Scope

- Jira-style transition graphs, conditions, validators, post-functions, and
  reusable workflow schemes;
- WIP limits and column constraints;
- status mapping where several statuses share one visual column;
- per-board column configuration independent from the backlog;
- bulk workflow migration across backlogs;
- the broader responsive audit, which remains scheduled after core functional
  coverage.

## Acceptance Gate

The increment is complete only when an administrator can create, rename,
reorder, and safely remove a column in the browser; every affected product
surface reflects the persisted order; tickets survive migration; a viewer has
no workflow mutation entry point; DnD regressions are browser-verified; and no
JavaScript or HTTP error remains in the clean acceptance run.
