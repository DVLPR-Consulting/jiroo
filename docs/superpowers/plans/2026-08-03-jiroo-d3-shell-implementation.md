# Jiroo D3 Shell and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the authenticated shell with the handoff through route-aware breadcrumbs, useful counters, active navigation, and a persistent collapsible sidebar.

**Architecture:** Server services aggregate small count datasets without loading item lists. A pure route-context helper translates pathname/query state into labels and links, while a narrow client shell owns only the sidebar preference and reads navigation state through Next.js hooks. Existing backlog, saved-view, search, notification, theme, and density components remain the sources of behavior.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Drizzle/Postgres, Radix/shadcn, Vitest and Testing Library.

## Global Constraints

- Read the local Next.js docs for `usePathname`, `useSearchParams`, layouts, and client/server boundaries before editing: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`, `use-search-params.md`, and `01-app/01-getting-started/05-server-and-client-components.md`.
- Sidebar open width is exactly `248px`; collapsed width is `64px`.
- Persist collapse under localStorage key `jiroo-sidebar-collapsed` with string values `true | false`.
- Navigation state comes from the URL; do not create a second route store.
- Counts must be aggregate queries, scoped to non-deleted items unless explicitly the trash count.
- Preserve French UI copy and visible keyboard focus.
- Follow TDD and commit each task independently.

---

## File Structure

- `lib/items/shell.ts`: pure route-to-shell context and count formatting.
- `lib/items/shell.test.ts`: pathname/query derivation tests.
- `lib/services/shell.ts`: aggregate counts by backlog, current user, and trash.
- `components/shell/sidebar-state.tsx`: collapse context and persistence.
- `components/shell/app-shell.tsx`: variable-width shell grid.
- `components/shell/sidebar.tsx`: handoff-aligned navigation and collapse rendering.
- `components/shell/topbar.tsx`: route-aware breadcrumb plus existing tools.
- `components/shell/shell-breadcrumb.tsx`: client pathname/query adapter.
- `components/shell/user-card.tsx`: profile/preferences/sign-out menu.
- `components/shell/user-profile-dialog.tsx`: read-only identity panel.
- `components/shell/user-preferences-dialog.tsx`: theme and density preferences.
- `components/theme/no-flash-script.tsx`: pre-hydration sidebar attribute.
- `app/(app)/layout.tsx`: load shell data, remove 2FA banner, compose shell.

### Task 1: Pure shell route context

**Files:**
- Create: `lib/items/shell.ts`
- Create: `lib/items/shell.test.ts`

**Interfaces:**
- Produces: `deriveShellContext(input): ShellContext`.
- `ShellContext` is `{ activeBacklogKey?: string; section: string; mode?: "Board" | "Liste" | "Arbre"; viewTitle?: string; allItemsHref: string; activeNav: "all" | "mine" | "trash" | "admin" | null }`.

- [ ] **Step 1: Write failing route tests**

```ts
expect(deriveShellContext({
  pathname: "/b/CASS",
  search: new URLSearchParams("view=list&v=view-1"),
  backlogs: [{ key: "CASS", name: "Pôle civil" }],
  views: [{ id: "view-1", name: "Mes urgences", backlogKey: "CASS" }],
})).toMatchObject({
  section: "Pôle civil",
  mode: "Liste",
  viewTitle: "Mes urgences",
  allItemsHref: "/b/CASS",
  activeNav: null,
});
```

Add cases for default board/Tous les items, `/mine`, `/trash`, `/admin`, an archived/stale backlog key, and no available backlog (`allItemsHref: "/"`).

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- lib/items/shell.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic derivation**

Use exact pathname segment matching, uppercase backlog keys, `view=board|list|tree`, and `v` lookup by id. A backlog page without `v` uses `Tous les items`. `/mine`, `/trash`, and `/admin` use section labels `Mes items`, `Corbeille`, and `Administration` without a mode.

- [ ] **Step 4: Run and confirm GREEN**

Run: `pnpm test -- lib/items/shell.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/items/shell.ts lib/items/shell.test.ts
git commit -m "feat(shell): derive route-aware navigation context"
```

### Task 2: Aggregate shell counters

**Files:**
- Create: `lib/services/shell.ts`
- Create: `lib/services/shell.test.ts`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Produces: `getShellCounts(userId): Promise<{ allByBacklog: Record<string, number>; mine: number; trash: number }>`.

- [ ] **Step 1: Extract a testable row reducer and write failing tests**

Export `toCountMap(rows: Array<{ backlogKey: string; count: number | string }>)` and test numeric coercion plus repeated-row addition:

```ts
expect(toCountMap([
  { backlogKey: "CASS", count: "2" },
  { backlogKey: "CASS", count: 3 },
])).toEqual({ CASS: 5 });
```

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- lib/services/shell.test.ts`

- [ ] **Step 3: Implement aggregate queries**

Create `lib/services/shell.test.ts` and `lib/services/shell.ts`. Use three parallel `count(*)` queries:

- live item count grouped by `backlogs.key`;
- live items where `assigneeId === userId` across backlogs;
- items where `deletedAt IS NOT NULL`.

Do not load titles, descriptions, paths, comments, or activities.

- [ ] **Step 4: Wire the layout data load**

Add `getShellCounts(session.user.id)` to the existing `Promise.all`. Pass the result to the sidebar. Query trash count for every authenticated user but render it only for admins, keeping the service free of presentation role rules.

- [ ] **Step 5: Run checks and commit**

Run: `pnpm test -- lib/services/shell.test.ts && pnpm typecheck && pnpm lint`

```bash
git add lib/services/shell.ts lib/services/shell.test.ts app/'(app)'/layout.tsx
git commit -m "feat(shell): add aggregate navigation counters"
```

### Task 3: Persistent sidebar state and shell frame

**Files:**
- Create: `components/shell/sidebar-state.tsx`
- Create: `components/shell/sidebar-state.test.tsx`
- Create: `components/shell/app-shell.tsx`
- Modify: `components/theme/no-flash-script.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Produces: `SidebarStateProvider`, `useSidebarState(): { collapsed: boolean; toggle(): void }`.
- Produces: `<AppShell sidebar topbar children />`.

- [ ] **Step 1: Write failing persistence tests**

Render a probe inside `SidebarStateProvider`, seed `localStorage` with `true`, assert the probe reads collapsed, click toggle, and assert storage becomes `false` and `document.documentElement.dataset.sidebar` becomes `open`.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/shell/sidebar-state.test.tsx`

- [ ] **Step 3: Implement state and anti-flash support**

The provider initializes from `document.documentElement.dataset.sidebar === "collapsed"`, toggles the root attribute, and writes localStorage. Extend `NoFlashScript` to read `jiroo-sidebar-collapsed` before hydration and set `data-sidebar="collapsed|open"` without changing its theme/density behavior.

- [ ] **Step 4: Implement the variable-width grid**

`AppShell` wraps content in the provider and renders a CSS grid using:

```tsx
style={{ gridTemplateColumns: collapsed ? "64px minmax(0,1fr)" : "248px minmax(0,1fr)" }}
```

Keep `h-screen`, overflow boundaries, topbar, main, and toaster behavior from the current layout.

- [ ] **Step 5: Replace the fixed grid in the server layout**

Pass the existing server-rendered sidebar and topbar nodes into `AppShell`. Remove the 2FA enrollment banner completely.

- [ ] **Step 6: Run checks and commit**

Run: `pnpm test -- components/shell/sidebar-state.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add components/shell/sidebar-state.tsx components/shell/sidebar-state.test.tsx components/shell/app-shell.tsx components/theme/no-flash-script.tsx app/'(app)'/layout.tsx
git commit -m "feat(shell): persist collapsible sidebar"
```

### Task 4: Sidebar navigation fidelity

**Files:**
- Modify: `components/shell/sidebar.tsx`
- Create: `components/shell/sidebar.test.tsx`
- Modify: `components/shell/backlog-selector.tsx`
- Modify: `components/shell/nav-link.tsx`
- Modify: `components/shell/sidebar-views.tsx`

**Interfaces:**
- Consumes: `useSidebarState`, `deriveShellContext`, shell counts, backlogs, and saved views.
- Produces: route-aware open/collapsed sidebar.

- [ ] **Step 1: Write failing navigation component tests**

Mock `next/navigation` for `/b/CASS?view=board`. Assert the sidebar shows `Tous les items` linking to `/b/CASS`, the CASS count, the mine count, and the trash count for admins. Render collapsed mode and assert text labels are visually hidden while controls retain `aria-label` or `title`.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/shell/sidebar.test.tsx`

- [ ] **Step 3: Align open sidebar**

Mark `Sidebar` as a Client Component so it can consume `useSidebarState`. Remove Backlogs and Navigation headings. Keep the two-tone Jiroo logo, add the collapse control beside it, style the backlog selector as a bordered card with a 24px key badge, render count spans with tabular numerals, and use `NavLink` active styling. Personal/shared view headings remain the only uppercase groups.

- [ ] **Step 4: Implement collapsed presentation**

Keep logo mark, backlog key, nav icons, trash/admin icons, avatar, and expand control. Hide descriptive text with `sr-only` where the accessible name is otherwise lost. Tooltips may use native `title` to avoid introducing another stateful system.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- components/shell/sidebar.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add components/shell/sidebar.tsx components/shell/sidebar.test.tsx components/shell/backlog-selector.tsx components/shell/nav-link.tsx components/shell/sidebar-views.tsx
git commit -m "feat(shell): align sidebar navigation"
```

### Task 5: Dynamic topbar breadcrumb

**Files:**
- Create: `components/shell/shell-breadcrumb.tsx`
- Create: `components/shell/shell-breadcrumb.test.tsx`
- Modify: `components/shell/topbar.tsx`

**Interfaces:**
- Consumes: backlogs and saved views plus `usePathname()` and `useSearchParams()`.
- Produces: `<ShellBreadcrumb backlogs views />`.

- [ ] **Step 1: Write failing breadcrumb tests**

Mock the Next hooks and assert `/b/CASS?view=tree` renders `Pôle civil · Arbre / Tous les items`; `?v=v1` substitutes the saved view name; `/admin` renders `Pôle civil / Administration` when CASS is the first available backlog.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/shell/shell-breadcrumb.test.tsx`

- [ ] **Step 3: Implement the client adapter**

Pass `new URLSearchParams(useSearchParams().toString())` to the pure helper. Render breadcrumb segments with separators hidden from screen readers and a single accessible text equivalent.

- [ ] **Step 4: Replace the repeated Jiroo title**

Topbar renders the breadcrumb at left and retains Search, NotificationBell, and ThemeToggle at right. Preserve exact 52px height.

- [ ] **Step 5: Run and commit**

Run: `pnpm test -- components/shell/shell-breadcrumb.test.tsx lib/items/shell.test.ts && pnpm typecheck && pnpm lint`

```bash
git add components/shell/shell-breadcrumb.tsx components/shell/shell-breadcrumb.test.tsx components/shell/topbar.tsx
git commit -m "feat(shell): add route-aware breadcrumb"
```

### Task 6: User profile and preferences menu

**Files:**
- Create: `components/shell/user-profile-dialog.tsx`
- Create: `components/shell/user-preferences-dialog.tsx`
- Modify: `components/shell/user-card.tsx`
- Create: `components/shell/user-card.test.tsx`

**Interfaces:**
- Consumes: current user, `ThemeToggle`, and `DensityToggle`.
- Produces: menu items Profil, Préférences, Déconnexion.

- [ ] **Step 1: Write a failing user-card test**

Open the menu, assert the three items exist, choose Profil and verify name/e-mail/role, then choose Préférences and verify both theme and density controls are present.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/shell/user-card.test.tsx`

- [ ] **Step 3: Implement focused dialogs**

Profile is read-only and uses no mutation. Preferences embeds existing controls with descriptive labels, so persistence continues through their providers. Use controlled dialog state in `UserCard`; menu selection opens the matching dialog after Radix closes the menu.

- [ ] **Step 4: Preserve collapsed behavior and sign-out**

In collapsed mode show only the avatar trigger but retain the user's name as its accessible label. Keep the current sign-out call and redirect to `/login`.

- [ ] **Step 5: Run and commit**

Run: `pnpm test -- components/shell/user-card.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add components/shell/user-profile-dialog.tsx components/shell/user-preferences-dialog.tsx components/shell/user-card.tsx components/shell/user-card.test.tsx
git commit -m "feat(shell): add profile and preferences menu"
```

### Task 7: D3 visual QA and verification

**Files:**
- Modify if required: D3 files only.

**Interfaces:**
- Produces: verified shell matching the board/list/tree/admin/trash captures.

- [ ] **Step 1: Verify routes and states in the browser**

Inspect `/b/CASS` in board/list/tree modes, a personal and shared saved view, `/mine`, `/trash`, and `/admin`. Verify active nav, counts, breadcrumb, collapse persistence across reload, and no 2FA banner.

- [ ] **Step 2: Verify responsive and preference behavior**

Check open/collapsed sidebar, long backlog/user/view names, light/dark themes, comfy/compact density, keyboard focus, and menus using only the keyboard.

- [ ] **Step 3: Run full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

- [ ] **Step 4: Commit QA corrections only if needed**

```bash
git add app/'(app)'/layout.tsx components/shell components/theme lib/items/shell.ts lib/services/shell.ts
git commit -m "fix(shell): address D3 acceptance findings"
```

Do not create an empty commit.
