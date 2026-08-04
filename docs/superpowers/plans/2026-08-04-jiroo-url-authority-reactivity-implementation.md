# Jiroo URL Authority Reactivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give backlog-page, persistent-sidebar, and same-backlog Topbar item writers one exact, reactive URL authority that preserves unrelated repeated parameters and permanently recognizes delayed internal echoes for the same-path lifetime.

**Architecture:** Lift a route-adapted `ViewUrlStateProvider` into `AppShell`, retaining its ref-owned external store and hydration snapshot. Replace deletable pending keys with an exact pathname-qualified generation/tombstone ledger. Apply sidebar saved views and verified same-backlog Topbar item selections through provider mutations, while different-backlog and non-backlog Topbar selections remain direct route changes.

**Tech Stack:** Next.js 16.2.7 App Router, React 19 `useSyncExternalStore`, TypeScript, Vitest, Testing Library.

## Global Constraints

- Keep `060cc7fc7721b95385d5fae0689f4d392939b6ee` unchanged.
- Amend only the latest `fix(views): unify page URL navigation authority` commit.
- Preserve filter/group/sort `replace`, tab/item/saved-view `push`, `{ scroll: false }`, q's 300 ms debounce, and real modifier/new-tab hrefs.
- Preserve unrelated repeated tuples in order and remove `item` when selecting a saved view or “Tous les items”.
- Retain exact internal-origin tombstones for the whole same-path provider lifetime; reset only at pathname boundary or unmount.
- Do not change DnD, data loading, actions, database queries, saved-view persistence, or different-backlog/global navigation.
- Topbar same-backlog item navigation must require both an exact `/b/[key]` pathname and the matching installed route parameter; compare backlog keys case-insensitively.
- The stable Topbar item callback must evaluate the latest committed pathname, scalar route parameter, provider, and router when invoked after any async wait.

---

### Task 1: Prove and replace the pending-key lifecycle

**Files:**
- Modify: `components/shell/view-url-state.tsx`
- Modify: `components/shell/filter-bar.test.tsx`

**Interfaces:**
- Produces internal `NavigationLedger` state: `{ pathname: string; nextGeneration: number; origins: Map<string, number> }`.
- Location identity: `` `${pathname}?${normalizedQuery}` `` where normalization stably sorts keys and retains repeated-value order.
- Retains every exact identity until pathname changes or the provider unmounts.

- [ ] **Step 1: Add the settled-origin RED regression**

Start from a settled neutral location. Drive internal navigation to `A`, rerender server `A`, drive internal navigation to `B`, rerender server `B`, then rerender server `A` twice. Assert a provider-derived related-item href remains at literal `B` after both stale renders.

- [ ] **Step 2: Add the authority-advance RED regression**

Drive pending internal `B`, dispatch popstate/history to `C`, rerender server `B` twice, and assert href remains literal `C`. Then change history to `B`, dispatch a real `popstate`, and assert the href immediately becomes literal `B` despite its tombstone.

- [ ] **Step 3: Run RED**

Run: `pnpm exec vitest run components/shell/filter-bar.test.tsx`

Expected: both regressions fail because settled keys are deleted and popstate clears the current pending set.

- [ ] **Step 4: Implement exact generations and tombstones**

Replace `pendingKeys` with a ref-owned exact ledger. On every changed internal push/replace, increment `nextGeneration` and set the pathname-qualified normalized identity in `origins`. Never delete an origin on server settlement, external reconciliation, or popstate. In the layout reconciler:

```ts
const internalOrigin = ledger.origins.has(serverLocationKey);
if (internalOrigin && serverLocationKey !== latestLocationKey) return;
if (internalOrigin) {
  lastServerLocation.current = serverLocationKey;
  return;
}
// unknown external authority: reconcile, advance external revision, publish
```

The popstate handler remains directly authoritative and does not consult or clear tombstones. When `pathname !== ledger.pathname`, replace the ledger with a fresh map for the new pathname before reconciling the new route authority.

- [ ] **Step 5: Run GREEN and mutation-check repeats**

Run: `pnpm exec vitest run components/shell/filter-bar.test.tsx`

Expected: all FilterBar tests pass. Temporarily deleting a tombstone on settlement or clearing it on popstate must fail one of the new repeated-stale-render assertions.

### Task 2: Lift one route-adapted provider into AppShell

**Files:**
- Modify: `components/shell/view-url-state.tsx`
- Modify: `components/shell/app-shell.tsx`
- Modify: `components/shell/sidebar-state.test.tsx`
- Modify: `app/(app)/b/[key]/page.tsx`

**Interfaces:**
- Retains `ViewUrlStateProvider({ initialEntries, children })` for focused fixtures.
- Produces `RouteViewUrlStateProvider({ children })`, which reads `useSearchParams().toString()` and passes `Array.from(new URLSearchParams(query).entries())` into the core provider.

- [ ] **Step 1: Add the AppShell provider RED test**

Render `AppShell` with a sidebar probe and child probe that both call `useViewUrlState`; assert both produce hrefs from the same initial repeated query. Expected RED: both throw because AppShell has no URL provider.

- [ ] **Step 2: Implement the route adapter and lift it**

Wrap `AppShellFrame` with `RouteViewUrlStateProvider` inside `SidebarStateProvider`. Remove the page-local provider and its `initialEntries` construction, leaving the page's explicit first-value selectors unchanged.

- [ ] **Step 3: Run focused shell and existing URL tests**

Run:

```text
pnpm exec vitest run components/shell/sidebar-state.test.tsx components/shell/filter-bar.test.tsx components/shell/group-control.test.tsx components/shell/view-actions.test.tsx
```

Expected: all files pass with no nested provider and repeated values intact.

### Task 3: Define saved-view URL replacement semantics

**Files:**
- Modify: `lib/items/views.ts`
- Modify: `lib/items/views.test.ts`

**Interfaces:**
- Produces `clearActiveBacklogViewParams(params: URLSearchParams): void`.
- Produces `applySavedViewParams(params, view): void` for `{ id, state, displayMode }`.
- Known removals: `q`, `type`, `status`, `prio`, `assignee`, `label`, `kind`, `under`, `group`, `sort`, `view`, `v`, `item`.

- [ ] **Step 1: Add pure RED tests**

Initialize literal params containing every known key, `item=DEMO-1`, and `tag=a&tag=b`. Apply a saved view and assert all old known values are replaced, `item` is absent, new `view`/`v`/filters/group/sort are exact, and `getAll("tag")` remains `["a", "b"]`. Separately assert clearing “Tous les items” removes every known key and item while preserving both tags.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run lib/items/views.test.ts`

Expected: fail because both mutation helpers are missing.

- [ ] **Step 3: Implement the mutation helpers**

Delete the literal known-key list, call `writeViewState` for a saved view, then set `view` and `v`. Keep `buildViewUrl` deterministic by constructing params and delegating to `applySavedViewParams`.

- [ ] **Step 4: Run GREEN**

Run: `pnpm exec vitest run lib/items/views.test.ts`

Expected: all view tests pass.

### Task 4: Route sidebar same-page navigation through the authority

**Files:**
- Modify: `components/shell/nav-link.tsx`
- Modify: `components/shell/sidebar-views.tsx`
- Create: `components/shell/sidebar-views.test.tsx`
- Modify: `components/shell/sidebar.tsx`
- Modify: `components/shell/backlog-selector.tsx`
- Modify: `components/shell/sidebar.test.tsx`
- Modify: `components/shell/view-url-state.tsx`

**Interfaces:**
- Extend provider navigation options with `authoritative?: boolean`; this flag advances `externalRevision` synchronously but is not forwarded to Next's router options.
- Extend `NavLink` with `onNavigate?: ComponentProps<typeof Link>["onNavigate"]`.
- Saved-view ordinary navigation calls provider `push(mutate, { authoritative: true })`.

- [ ] **Step 1: Add q-to-saved-view RED coverage**

Render real `FilterBar` and `SidebarViews` under one provider with `view=board&item=DEMO-1&tag=a&tag=b`. Arm q, click a saved view normally, advance 300 ms, and assert one push whose literal href contains the saved state and both tags, excludes item and obsolete q/view-state values, and is not followed by a q replace.

- [ ] **Step 2: Add saved-view modifier RED coverage**

Assert the saved-view anchor's native href already contains the full saved state plus `tag=a&tag=b` and excludes item. Fire Meta-click and assert no provider push.

- [ ] **Step 3: Add active-backlog sidebar RED coverage**

For “Tous les items”, assert ordinary navigation uses authoritative provider push, preserves both tags, removes known state/item, and cannot be overwritten by armed q. For backlog selector, assert selecting the already-active backlog uses the same reset; selecting another backlog still calls direct router push.

- [ ] **Step 4: Run RED**

Run:

```text
pnpm exec vitest run components/shell/sidebar-views.test.tsx components/shell/sidebar.test.tsx components/shell/filter-bar.test.tsx
```

Expected: saved-view/sidebar links start from empty/direct URLs, lose repeats, and do not invalidate q.

- [ ] **Step 5: Implement provider-backed sidebar navigation**

Use `viewUrl.href(applyMutation)` for native href and `onNavigate` with `preventDefault()` plus authoritative `viewUrl.push` for ordinary navigation. In `navigate`, destructure `authoritative` from router options, advance `externalRevision` before publishing, and pass only `{ scroll }` to Next. Keep different-backlog/global routes direct.

- [ ] **Step 6: Run GREEN and mutation checks**

Run the Step 4 command. Expected: all tests pass. Removing authoritative revision advancement must make the q race fail; starting from empty params must make repeated-tag assertions fail; invoking onNavigate for Meta-click must fail the modifier test.

### Task 5: Route Topbar item selections through the authority

**Files:**
- Create: `components/shell/use-backlog-item-navigation.ts`
- Create: `components/shell/search-modal.test.tsx`
- Create: `components/shell/notification-bell.test.tsx`
- Modify: `components/shell/search-modal.tsx`
- Modify: `components/shell/notification-bell.tsx`

**Interfaces:**
- Produces `useBacklogItemNavigation(): (backlogKey: string, itemKey: string) => void`.
- A same-page route is valid only when `usePathname()` matches exactly `/b/<segment>`, `decodeURIComponent(segment)` equals scalar `useParams().key` case-insensitively, and the target backlog key equals both.
- Same-page selection calls `viewUrl.push(params => params.set("item", itemKey))`; every other selection calls a direct router push to `/b/${backlogKey}?item=${itemKey}`.

- [ ] **Step 1: Add SearchModal RED component tests**

Under a real `ViewUrlStateProvider`, return a search result for the active backlog. Start with `view=board&v=saved&group=component&type=tache&tag=a&tag=b`, arm FilterBar's 300 ms q debounce, select the result, advance the timer, and assert provider navigation preserves every tuple and composes `item` with q. Separately navigate provider item `A`, item `B`, then select `A` through SearchModal and assert the final provider push reopens the tombstoned location. Parameterize another backlog and `/mine` to assert their selections use the direct minimal URL. Assert selection closes and clears the search dialog.

- [ ] **Step 2: Run SearchModal RED**

Run: `pnpm exec vitest run components/shell/search-modal.test.tsx`

Expected: same-backlog assertions fail because SearchModal always performs a direct router push and discards current authority params.

- [ ] **Step 3: Add NotificationBell RED component tests**

Repeat the same authority, armed-q, tombstoned-item, other-backlog, and `/mine` matrix through real notification-row selection. Assert `markReadAction({ id })` still resolves before item navigation, and notification rows without backlog/item still refresh without item navigation.

- [ ] **Step 4: Run NotificationBell RED**

Run: `pnpm exec vitest run components/shell/notification-bell.test.tsx`

Expected: same-backlog assertions fail because NotificationBell always performs a direct router push and discards current authority params.

- [ ] **Step 5: Implement the narrow shared hook**

Read the installed Next.js `usePathname`, `useParams`, and `useRouter` guides. In `useBacklogItemNavigation`, verify the exact pathname and scalar route param together, normalize backlog keys with `toUpperCase()`, then choose provider push or direct router push. Replace only the two direct item pushes in SearchModal and NotificationBell. Keep SearchModal's `handleClose()` and NotificationBell's awaited `markReadAction` and refresh-only branch unchanged.

- [ ] **Step 6: Run GREEN and audit Topbar**

Run:

```text
pnpm exec vitest run components/shell/search-modal.test.tsx components/shell/notification-bell.test.tsx components/shell/view-url-state.test.tsx components/shell/filter-bar.test.tsx
```

Expected: all tests pass. Audit `Topbar` and `ShellBreadcrumb`; the breadcrumb remains a read-only consumer and no item-navigation bypass remains.

### Task 6: Make async notification navigation route-fresh

**Files:**
- Modify: `components/shell/notification-bell.test.tsx`
- Modify: `components/shell/use-backlog-item-navigation.ts`

**Interfaces:**
- `useBacklogItemNavigation()` still returns one item-only callback and retains the exact route predicate.
- The callback reads a hook-owned `{ pathname, routeParam, router, viewUrl }` ref replaced in `useLayoutEffect` after each relevant commit.
- The callback identity is stable; neither SearchModal nor NotificationBell receives a new API.

- [ ] **Step 1: Add deferred-action RED regressions**

Hold `markReadAction` unresolved after notification selection begins. Rerender committed route evidence from `/b/DEMO` to `/mine`, resolve mark-read, and assert exactly `/b/demo?item=DEMO-1` rather than a provider-composed DEMO URL. Repeat with committed `/b/OTHER` plus route param `OTHER` and the same expected direct target. Add a control that rerenders with `/b/DEMO` plus scalar param `DEMO` before resolution and asserts the complete provider-composed URL with `view`, `v`, group, filter, and both repeated tags.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run components/shell/notification-bell.test.tsx`

Expected: the `/mine` and `/b/OTHER` cases fail with the obsolete provider-composed DEMO URL; the same-route control passes.

- [ ] **Step 3: Implement latest committed invocation state**

Create a ref initialized from the current pathname, scalar/array route param, router, and `viewUrl`. Replace its value in `useLayoutEffect` whenever one of those dependencies changes. Return `useCallback(..., [])`; inside it, read the ref, derive the active backlog with the existing centralized predicate, then call the snapshot's `viewUrl.push` or `router.push`. Do not move mark-read into the hook or change SearchModal.

- [ ] **Step 4: Run GREEN and mutation-check freshness**

Run: `pnpm exec vitest run components/shell/notification-bell.test.tsx components/shell/search-modal.test.tsx components/shell/view-url-state.test.tsx components/shell/filter-bar.test.tsx`

Expected: all pass. Restoring render-captured route evidence must fail both changed-route regressions, while forcing all post-await calls direct must fail the same-route control.

### Task 7: Verify, review, amend, and hand off

**Files:**
- Modify: `.superpowers/sdd/2026-08-03-jiroo-d4-views-implementation/final-review-fix-report.md` (ignored report only).
- Amend: latest `fix(views): unify page URL navigation authority` commit only.

- [ ] **Step 1: Run focused and D4 matrices**

Run all changed URL/sidebar files, then:

```text
pnpm exec vitest run lib/items/filter.test.ts lib/items/views.test.ts lib/items/view-url-params.test.ts components/shell/filter-bar.test.tsx components/shell/group-control.test.tsx components/shell/view-actions.test.tsx components/shell/sidebar-views.test.tsx components/shell/sidebar.test.tsx components/shell/search-modal.test.tsx components/shell/notification-bell.test.tsx components/items/inline-item-field.test.tsx components/items/item-list.test.tsx components/items/new-item-dialog.test.tsx components/items/item-board.test.tsx components/items/item-tree.test.tsx
```

- [ ] **Step 2: Run repository gates and audits**

Run: `pnpm test`, `pnpm typecheck`, `pnpm lint`, network-enabled `pnpm build`, `git diff --check`. Audit direct same-backlog sidebar/router navigation, obsolete URL props, and DnD/data/action diffs.

- [ ] **Step 3: Obtain blocker-focused read-only review**

Review exact tombstone lifetime, repeated stale echoes after settlement/pop/external advances, real pop acceptance, pathname reset, AppShell provider isolation/hydration, saved-view known-key replacement, item removal, repeated unrelated params, q cancellation, modified hrefs, same-backlog sidebar navigation, and both Topbar item entry points. Verify the exact pathname-plus-route-param predicate, case-insensitive backlog comparison, provider-backed same-backlog composition/reopening, direct other-backlog and `/mine` navigation, search close, notification mark-read, and the read-only breadcrumb audit. Fix every Critical or Important finding via a new RED/GREEN cycle.

- [ ] **Step 4: Amend and update report**

Amend only the latest cohesive commit, preserving subject `fix(views): unify page URL navigation authority`. Update the ignored report with revised design, RED/GREEN evidence, gates, review verdict, and final SHA. Confirm `060cc7f` unchanged and `git status --porcelain` blank.
