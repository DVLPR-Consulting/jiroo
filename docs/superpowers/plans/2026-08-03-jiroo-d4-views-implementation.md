# Jiroo D4 Views and Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Jira-like view controls with facet chips, hierarchy filtering, component grouping, a sortable editable list, per-column creation, and full tree metadata.

**Architecture:** Extend the existing URL-encoded `ViewState` rather than introducing client-only filter state. Enrich item rows once with lineage and status-order metadata, then reuse the same pure filter/group/sort core across list, board, tree, and saved views. All quick edits call the existing audited `updateItemAction`; board/tree drag services are unchanged.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Radix/shadcn, Drizzle-loaded item data, dnd-kit board, Vitest and Testing Library.

## Global Constraints

- URL parameters remain authoritative and shareable.
- Filter semantics are AND across facets and OR within a facet.
- The hierarchy query parameter is `under=<item-id>[,<item-id>]` and matches descendants, not the selected ancestor itself.
- Saved views defensively default missing `underIds` to `[]`.
- Group options are Status, Priority, Assignee, Component, or None; board omits Status and tree omits grouping.
- List sort options are key, title, status, priority, and due date; sorting is stable.
- Inline updates are pessimistic and use `updateItemAction` so audit behavior remains centralized.
- Do not alter board/tree drag protocols in this lot.
- Follow TDD and commit each task independently.

---

## File Structure

- `lib/items/filter.ts`: hierarchy metadata, URL state, component grouping, and stable sort.
- `lib/items/filter.test.ts`: pure filter/group/sort coverage.
- `lib/items/views.ts`: saved-view defensive decoding for new state.
- `lib/items/views.test.ts`: saved-view round trips and legacy defaults.
- `components/shell/filter-menu.tsx`: dotted facet chip trigger.
- `components/shell/filter-bar.tsx`: facets including `Sous` hierarchy selector.
- `components/shell/group-control.tsx`: URL-writing `Grouper : …` control.
- `components/shell/view-bar.tsx`: location for group control.
- `components/items/inline-item-field.tsx`: compact status/priority/assignee editors.
- `components/items/item-list.tsx`: sticky table, sortable headers, collapsible groups.
- `components/items/item-board.tsx`: per-column create and priority quick edit.
- `components/items/new-item-dialog.tsx`: controlled trigger and initial status.
- `components/items/item-tree.tsx`: labels/status/priority/assignee metadata.
- `app/(app)/b/[key]/page.tsx`: single enrichment and all view wiring.

### Task 1: Hierarchy-aware view-state core

**Files:**
- Modify: `lib/items/filter.ts`
- Modify: `lib/items/filter.test.ts`
- Modify: `lib/items/views.ts`
- Modify: `lib/items/views.test.ts`

**Interfaces:**
- Extends `Filters` with `underIds: string[]`.
- Extends `GroupKey` with `component` while retaining `parent` only for decoding legacy saved URLs.
- Extends `SortField` with `title | status`.
- Extends `FilterItem` with `ancestorIds: string[]`, `componentId: string | null`, and `statusOrder: number`.
- Produces: `enrichHierarchy(items): FilterItem[]` from rows containing `id`, `type`, `path` and existing fields.

- [ ] **Step 1: Write failing URL and matching tests**

```ts
const state = parseViewState(new URLSearchParams("under=epic-1,component-1&group=component&sort=title:asc"));
expect(state.filters.underIds).toEqual(["epic-1", "component-1"]);
expect(state.group).toBe("component");
expect(state.sort).toEqual({ field: "title", dir: "asc" });

expect(matchItem(item({ ancestorIds: ["component-1", "epic-1"] }), filters({ underIds: ["epic-1"] })))
  .toBe(true);
expect(matchItem(item({ id: "epic-1", ancestorIds: ["component-1"] }), filters({ underIds: ["epic-1"] })))
  .toBe(false);
```

Update every existing empty-filter fixture to contain `underIds: []`.

- [ ] **Step 2: Write failing hierarchy/group/sort tests**

Create a component → epic → task chain using self-inclusive paths. Assert enrichment gives the task `ancestorIds: [componentId, epicId]` and `componentId`. Assert `groupItems(rows, "component")` groups the chain under the component and roots without a component under `none`. Assert title sorting is accent-insensitive and status sorting uses `statusOrder`; equal values retain input order.

- [ ] **Step 3: Run and confirm RED**

Run: `pnpm test -- lib/items/filter.test.ts lib/items/views.test.ts`

- [ ] **Step 4: Implement URL, hierarchy, matching, grouping, and sorting**

Build a `Map<path,id>` and find ancestors by successively removing the last ltree label. Derive the component as the first ancestor whose type is `composant`, or self for a component row. Decorate before sorting with original indices and use that index as the final comparator, making stability explicit.

- [ ] **Step 5: Extend saved-view defensive decoding**

Read `rawFilters.underIds` as a string array or `[]`, include it in `isViewDirty`, and rely on `viewStateToColumns` to persist it. Retain legacy `parent` decoding but never emit it from the new UI.

- [ ] **Step 6: Run and commit**

Run: `pnpm test -- lib/items/filter.test.ts lib/items/views.test.ts && pnpm typecheck && pnpm lint`

```bash
git add lib/items/filter.ts lib/items/filter.test.ts lib/items/views.ts lib/items/views.test.ts
git commit -m "feat(views): add hierarchy filters and component grouping"
```

### Task 2: Facet-chip filter bar

**Files:**
- Modify: `components/shell/filter-menu.tsx`
- Modify: `components/shell/filter-bar.tsx`
- Create: `components/shell/filter-bar.test.tsx`

**Interfaces:**
- Consumes: `FilterMenu` selected values and `FilterBar` hierarchy options `{ id, key, title, type }[]`.
- Produces: dotted inactive chips, solid active chips, and `underIds` URL updates.

- [ ] **Step 1: Write failing chip tests**

Render with empty filters and assert triggers read `+ Type`, `+ Statut`, `+ Priorité`, `+ Label`, `+ Assigné`, `+ Nature`, and `+ Sous`. Render selected values and assert the trigger has `data-active="true"`, includes the selected label/count, and exposes a clear control.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/shell/filter-bar.test.tsx`

- [ ] **Step 3: Restyle `FilterMenu` without changing popover semantics**

Add props `activeLabel?: string` and `onClear?: () => void`. The trigger uses a dashed border when empty and a solid surface plus grenat value when active. Clearing calls `stopPropagation()` so it does not open the popover. Keep Radix keyboard behavior and multi-select checkboxes.

- [ ] **Step 4: Add the hierarchy facet and remove group/sort selects**

Filter eligible ancestors to `composant | epic`, label options as `KEY — title`, and write `underIds`. Keep the debounced text field and result count. Remove grouping and sorting controls from `FilterBar`; those move to dedicated view/list controls.

- [ ] **Step 5: Run and commit**

Run: `pnpm test -- components/shell/filter-bar.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add components/shell/filter-menu.tsx components/shell/filter-bar.tsx components/shell/filter-bar.test.tsx
git commit -m "feat(filters): use Jira-style facet chips"
```

### Task 3: Group control in the view bar

**Files:**
- Create: `components/shell/group-control.tsx`
- Create: `components/shell/group-control.test.tsx`
- Modify: `components/shell/view-bar.tsx`
- Modify: `app/(app)/b/[key]/page.tsx`

**Interfaces:**
- Produces: `<GroupControl view state currentParams />`.

- [ ] **Step 1: Write failing URL tests**

Mock the router and select Component. Assert the replacement URL preserves `item`, `v`, filters, and `view`, sets `group=component`, and uses `{ scroll: false }`. Assert board has no Status option and tree renders no group control.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/shell/group-control.test.tsx`

- [ ] **Step 3: Implement the control**

Render a labelled native select or Radix menu reading `Grouper : {label}`. Clone `currentParams`, set/delete `group`, and call `router.replace`. Options are derived from the current view exactly as constrained above.

- [ ] **Step 4: Place it between tabs and saved-view actions**

Add a `groupControlSlot` to `ViewBar` rather than coupling ViewBar to URL parsing. Pass `GroupControl` from the backlog page. Saved-view actions and density/new-item controls keep their current ordering.

- [ ] **Step 5: Run and commit**

Run: `pnpm test -- components/shell/group-control.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add components/shell/group-control.tsx components/shell/group-control.test.tsx components/shell/view-bar.tsx app/'(app)'/b/'[key]'/page.tsx
git commit -m "feat(views): move grouping into view bar"
```

### Task 4: Sortable editable list table

**Files:**
- Create: `components/items/inline-item-field.tsx`
- Create: `components/items/inline-item-field.test.tsx`
- Modify: `components/items/item-list.tsx`
- Create: `components/items/item-list.test.tsx`
- Modify: `app/(app)/b/[key]/page.tsx`

**Interfaces:**
- Produces: `InlineStatus`, `InlinePriority`, `InlineAssignee`, each consuming `itemId`, `backlogKey`, current value, and options.
- `ItemList` additionally consumes users, status rows, current sort, and current params.

- [ ] **Step 1: Write failing inline-editor tests**

Mock `updateItemAction`. Change a status and assert `{ id, backlogKey, statusId }`, pending disabled state, refresh on success, and French inline error without refresh on failure. Repeat one assertion each for priority and assignee/null.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/items/inline-item-field.test.tsx`

- [ ] **Step 3: Implement compact editors**

Use Radix dropdown triggers displaying the canonical `StatusDot`, `PrioIcon`, or `InitialsAvatar`. Stop click propagation on triggers/content. Use the same `updateItemAction` and refresh behavior as detail fields, but render a compact error tooltip/text tied with `aria-describedby`.

- [ ] **Step 4: Write failing list behavior tests**

Assert sticky headers for Clé, Titre, Statut, Prio, Labels, Échéance, Assigné; clicking Titre writes `sort=title:asc`, clicking again writes `sort=title:desc`; group headings are buttons with `aria-expanded` and hide/show their rows for the current component session.

- [ ] **Step 5: Rebuild `ItemList` as a semantic table**

Use a sticky `<thead>`, fixed/meta-friendly columns, clickable rows, and separate interactive cells. Keep labels and blocked markers. Store collapsed group keys in component state only. Sort buttons preserve unrelated params and write the next sort through `router.replace(..., { scroll:false })`.

- [ ] **Step 6: Pass complete row metadata from the page**

Include due date, assignee id/name, labels, status order, and hierarchy enrichment. Compute group labels for component ids. Pass users/status rows once; do not refetch from client components.

- [ ] **Step 7: Run and commit**

Run: `pnpm test -- components/items/inline-item-field.test.tsx components/items/item-list.test.tsx lib/items/filter.test.ts && pnpm typecheck && pnpm lint`

```bash
git add components/items/inline-item-field.tsx components/items/inline-item-field.test.tsx components/items/item-list.tsx components/items/item-list.test.tsx app/'(app)'/b/'[key]'/page.tsx
git commit -m "feat(list): add sortable inline-edit table"
```

### Task 5: Board per-column creation and priority editing

**Files:**
- Modify: `components/items/new-item-dialog.tsx`
- Create: `components/items/new-item-dialog.test.tsx`
- Modify: `components/items/item-board.tsx`
- Create: `components/items/item-board.test.tsx`
- Modify: `app/(app)/b/[key]/page.tsx`

**Interfaces:**
- Extends `NewItemButton` with `initialStatusId?: string`, `trigger?: React.ReactNode`, and `onCreated?: (item: { id: string; key: string }) => void`.
- `ItemBoard` consumes `createDialogProps` and users/statuses required for quick edits.

- [ ] **Step 1: Write failing create-dialog tests**

Render with `initialStatusId="doing-id"` and a custom plus trigger. Open it, assert the status select starts at that id, submit, and assert `createItemAction` receives it. Close/reopen and assert the supplied initial status is restored.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/items/new-item-dialog.test.tsx`

- [ ] **Step 3: Make the dialog reusable**

Keep the existing top-level button behavior as defaults. Initialize/reset `statusId` from `initialStatusId`; render `trigger` through `DialogTrigger asChild`; call `onCreated(result.item)` after success.

- [ ] **Step 4: Add column plus buttons**

Render an icon button in each column header labelled `Créer dans {status.name}`. Open a column-local `NewItemButton` configured with that status. Keep the existing global New Item button.

- [ ] **Step 5: Make card priority interactive**

Replace the passive `PrioIcon` wrapper with `InlinePriority`. Stop pointer/click propagation so editing neither opens the panel nor starts a drag. Add a component test that changes priority and asserts the card-open callback was not called.

- [ ] **Step 6: Run and commit**

Run: `pnpm test -- components/items/new-item-dialog.test.tsx components/items/item-board.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add components/items/new-item-dialog.tsx components/items/new-item-dialog.test.tsx components/items/item-board.tsx components/items/item-board.test.tsx app/'(app)'/b/'[key]'/page.tsx
git commit -m "feat(board): add column creation and priority editing"
```

### Task 6: Complete tree row metadata

**Files:**
- Modify: `components/items/item-tree.tsx`
- Create: `components/items/item-tree.test.tsx`
- Modify: `app/(app)/b/[key]/page.tsx`

**Interfaces:**
- Extends `TreeItem` with `labels`, `assigneeId`, and existing assignee name.
- Consumes canonical `LabelPill`, `PrioIcon`, `StatusDot`, and `InitialsAvatar`.

- [ ] **Step 1: Write a failing metadata rendering test**

Render one task with two labels, urgent priority, review status, and an assignee. Assert both labels, priority accessible label, canonical status label, and avatar name exist. Assert clicking metadata still opens the row only once and does not alter DnD attributes.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/items/item-tree.test.tsx`

- [ ] **Step 3: Add right-aligned metadata**

Render labels followed by priority, status, and avatar in the same order as screen 07. Truncate labels as space narrows while keeping status/priority/avatar fixed. Use the existing deterministic avatar hue helper.

- [ ] **Step 4: Wire labels from the existing page map**

Use `labelsByItem`; do not add a query. Pass `assigneeId` and name already resolved by the page.

- [ ] **Step 5: Run and commit**

Run: `pnpm test -- components/items/item-tree.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add components/items/item-tree.tsx components/items/item-tree.test.tsx app/'(app)'/b/'[key]'/page.tsx
git commit -m "feat(tree): show complete item metadata"
```

### Task 7: D4 integration and visual QA

**Files:**
- Modify if required: D4 files only.

**Interfaces:**
- Produces: verified board/list/tree/filter behavior and saved-state compatibility.

- [ ] **Step 1: Run targeted integration checks**

Exercise every facet alone and in combination, hierarchy filtering for both component and epic, saving/reloading a view containing `underIds`, component grouping, every list sort direction, inline edits, per-column creation, and tree metadata.

- [ ] **Step 2: Verify visual fidelity**

Compare board, list, and tree with screens 04, 05, 06, and 07 in both densities. Check horizontal overflow, sticky headers/groups, long titles, empty groups, keyboard menus, drag handles, and filter chips.

- [ ] **Step 3: Run full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

- [ ] **Step 4: Commit QA corrections only if needed**

```bash
git add app/'(app)'/b/'[key]'/page.tsx components/items components/shell lib/items/filter.ts lib/items/views.ts
git commit -m "fix(views): address D4 acceptance findings"
```

Do not create an empty commit.
