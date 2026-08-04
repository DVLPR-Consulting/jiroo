# Jiroo Sidebar Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a conventional SaaS sidebar that switches reliably between a 248 px navigation panel and a 64 px icon rail, using a Jira-like directional toggle without duplicate branding or controls.

**Architecture:** `SidebarStateProvider` remains the persistence boundary and the single hydrated state source. `AppShellFrame` consumes that state directly for its explicit grid width, while `Sidebar` uses mutually exclusive React branches for open and collapsed content. The expanded header pairs the wordmark with `ChevronLeft`; the compact rail omits branding and starts with a centered `ChevronRight`. Global `data-sidebar` presentation selectors are removed so the root attribute seeds hydration but no longer competes with React after hydration.

**Tech Stack:** Next.js 16.2.7 App Router, React 19.2.4, TypeScript 5, Tailwind CSS 4, Lucide React, Vitest 4, React Testing Library.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-04-jiroo-sidebar-collapse-design.md` exactly.
- Read the local Next.js guides before editing: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `11-css.md`, and `01-app/02-guides/testing/vitest.md`.
- Keep the expanded width exactly `248px` and the collapsed width exactly `64px`.
- Use one 32 px ghost toggle: `ChevronLeft` at the expanded header's top-right and `ChevronRight` centered at the top of the compact rail.
- Do not render a wordmark or monogram in the compact rail.
- Persist the preference under `jiroo-sidebar-collapsed` with string values `true | false`.
- Preserve the root `data-sidebar="open|collapsed"` attribute as the pre-hydration seed and compatibility signal, but do not use it as a post-hydration presentation authority.
- Preserve all routes, counts, backlog selection, saved views, role visibility, user actions, French copy, keyboard focus, and active-navigation behavior.
- Do not add a sidebar dependency or redesign mobile navigation.
- Follow strict red-green-refactor TDD and commit each implementation task independently.

---

## File Structure

- `components/shell/sidebar-state.tsx`: unchanged public context and persistence contract.
- `components/shell/sidebar-state.test.tsx`: verifies persistence and the actual shell width transition through the context.
- `components/shell/app-shell.tsx`: consumes `collapsed` and owns the explicit 248/64 px grid columns.
- `components/shell/sidebar.tsx`: renders the expanded wordmark and `ChevronLeft`, or the compact `ChevronRight` without branding, plus the matching panel or rail contents.
- `components/shell/sidebar.test.tsx`: protects brand, control, accessibility, and collapsed-content behavior.
- `app/globals.css`: retains theme/density tokens but removes sidebar width and conditional-presentation selectors.

### Task 1: Make React state own the shell width

**Files:**
- Modify: `components/shell/sidebar-state.test.tsx:17-67`
- Modify: `components/shell/app-shell.tsx:3-30`
- Modify: `app/globals.css:91-99`

**Interfaces:**
- Consumes: `useSidebarState(): { collapsed: boolean; toggle(): void }` from `components/shell/sidebar-state.tsx`.
- Produces: `AppShell` whose first grid column is exactly `248px` when open and `64px` when collapsed.

- [ ] **Step 1: Replace the CSS-variable assertion with a failing interaction test**

Keep the existing `Probe` component and replace the test named `lets the pre-hydration root attribute control the shell width` with:

```tsx
it("changes the actual shell column when the shared state toggles", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <AppShell
      sidebar={<Probe />}
      topbar={<header>Topbar</header>}
    >
      Contenu
    </AppShell>,
  );
  const shell = container.firstElementChild;

  expect(shell).toHaveStyle({
    gridTemplateColumns: "248px minmax(0,1fr)",
  });

  await user.click(screen.getByRole("button", { name: "open" }));

  expect(screen.getByRole("button", { name: "collapsed" })).toBeVisible();
  expect(shell).toHaveStyle({
    gridTemplateColumns: "64px minmax(0,1fr)",
  });
});
```

This catches the current regression because the shell exposes only
`var(--sidebar-width, 248px)` and does not change its inline grid columns when
the real context toggles.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test -- components/shell/sidebar-state.test.tsx
```

Expected: FAIL because the actual inline value is
`var(--sidebar-width, 248px) minmax(0,1fr)` instead of the expected explicit
width.

- [ ] **Step 3: Make `AppShellFrame` consume the shared state**

Change the import and frame body in `components/shell/app-shell.tsx` to:

```tsx
import {
  SidebarStateProvider,
  useSidebarState,
} from "@/components/shell/sidebar-state";

function AppShellFrame({
  sidebar,
  topbar,
  children,
}: {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
}) {
  const { collapsed } = useSidebarState();

  return (
    <div
      className="grid h-screen overflow-hidden transition-[grid-template-columns] duration-150"
      style={{
        gridTemplateColumns: `${collapsed ? "64px" : "248px"} minmax(0,1fr)`,
      }}
    >
      {sidebar}
      <div className="flex min-w-0 flex-col">
        {topbar}
        <main className="min-h-0 flex-1 overflow-auto bg-background">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
```

Leave the existing provider nesting around `RouteViewUrlStateProvider`
unchanged.

- [ ] **Step 4: Remove the competing global width authority**

Delete these declarations from `app/globals.css`:

```css
--sidebar-width: 248px;

:root[data-sidebar="open"] { --sidebar-width: 248px; }
:root[data-sidebar="collapsed"] { --sidebar-width: 64px; }
```

Do not remove the density tokens or the remaining sidebar selectors yet; Task
2 removes those after the sidebar markup no longer relies on them.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
pnpm test -- components/shell/sidebar-state.test.tsx
```

Expected: all tests in the file PASS, including persistence and both explicit
grid widths.

- [ ] **Step 6: Run task-level static checks**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit 0 without errors.

- [ ] **Step 7: Commit the shell-width change**

```bash
git add components/shell/sidebar-state.test.tsx components/shell/app-shell.tsx app/globals.css
git commit -m "fix(shell): make sidebar state control shell width"
```

### Task 2: Render one coherent sidebar state at a time

**Files:**
- Modify: `components/shell/sidebar.test.tsx:62-104`
- Modify: `components/shell/sidebar.tsx:61-210`
- Modify: `app/globals.css:96-123` after Task 1

**Interfaces:**
- Consumes: `collapsed` and `toggle` from `useSidebarState()`.
- Produces: one expanded `Jiroo` header with `PanelLeftClose`, or one collapsed `J` header with `PanelLeftOpen`; never both.
- Preserves: `BacklogSelector`, `NavLink`, `SidebarViews`, `UserCard`, all navigation URLs, counts, and role checks.

- [ ] **Step 1: Add a failing expanded-header regression test**

Add this test after `renders route-aware navigation and aggregate counts` in
`components/shell/sidebar.test.tsx`:

```tsx
it("renders one expanded brand and one collapse icon", () => {
  renderSidebar();

  const brand = screen.getByLabelText("Jiroo");
  const toggle = screen.getByRole("button", {
    name: "Replier la barre latérale",
  });

  expect(brand).toHaveTextContent(/^Jiroo$/);
  expect(toggle.querySelectorAll("svg")).toHaveLength(1);
  expect(screen.getByText("Vues perso")).toBeInTheDocument();
});
```

This catches the duplicate `J` plus `Jiroo` markup and the two pre-rendered
Lucide icons.

- [ ] **Step 2: Strengthen the existing collapsed-state regression test**

Replace `keeps essential controls accessible when collapsed` with:

```tsx
it("renders a compact accessible rail without open-only content", () => {
  document.documentElement.dataset.sidebar = "collapsed";
  renderSidebar();

  const brand = screen.getByLabelText("Jiroo");
  const toggle = screen.getByRole("button", {
    name: "Déplier la barre latérale",
  });

  expect(brand).toHaveTextContent(/^J$/);
  expect(toggle.querySelectorAll("svg")).toHaveLength(1);
  expect(screen.getByText("CASS")).toBeVisible();
  expect(screen.queryByText("Vues perso")).not.toBeInTheDocument();
  expect(screen.queryByText("Vues partagées")).not.toBeInTheDocument();
  expect(screen.getByText("Tous les items")).toHaveClass("sr-only");
  expect(screen.getByRole("link", { name: /Tous les items 42/ })).toHaveAttribute(
    "title",
    "Tous les items",
  );
  expect(toggle).toHaveAttribute("title", "Déplier la barre latérale");
});
```

The expected values are literal user-visible contracts. The test exercises the
real sidebar and real state provider rather than asserting on mocks.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
pnpm test -- components/shell/sidebar.test.tsx
```

Expected: the new tests FAIL because each header currently renders both brand
variants and both SVG icons, and the collapsed DOM still contains the saved-view
groups.

- [ ] **Step 4: Render mutually exclusive brand and icon branches**

Replace the sidebar header in `components/shell/sidebar.tsx` with:

```tsx
<div
  className={cn(
    "flex items-center justify-between",
    collapsed ? "" : "px-2 py-1",
  )}
>
  <div
    aria-label="Jiroo"
    title={collapsed ? "Jiroo" : undefined}
    className="t-h2 overflow-hidden font-semibold"
  >
    {collapsed ? (
      <span aria-hidden="true">J</span>
    ) : (
      <span aria-hidden="true">
        Jir<span className="text-[var(--primary)]">oo</span>
      </span>
    )}
  </div>
  <button
    type="button"
    onClick={toggle}
    aria-label={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
    title={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
    className="inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
  >
    {collapsed ? (
      <PanelLeftOpen className="size-4" />
    ) : (
      <PanelLeftClose className="size-4" />
    )}
  </button>
</div>
```

The unconditional `justify-between` places the expanded toggle at the far edge
instead of directly beside the wordmark.

- [ ] **Step 5: Render saved-view groups only in the expanded state**

Replace the existing `data-sidebar-open-only` wrapper with:

```tsx
{!collapsed && (
  <div className="min-h-0 flex-1 overflow-y-auto">
    <SidebarViews
      views={views}
      userId={userId}
      backlogs={backlogs}
    />
  </div>
)}
```

Keep `sr-only` classes on collapsed navigation labels and counts so links retain
their textual content for assistive technology. Remove `data-sidebar-shell`,
`data-sidebar-brand`, and `data-sidebar-label` attributes from this component;
they no longer have a presentation role.

- [ ] **Step 6: Remove the remaining global sidebar presentation selectors**

Delete the complete block beginning with:

```css
/* No-flash shell presentation: data-sidebar is set synchronously in <head>. */
```

and ending after the selector that hides
`[data-sidebar-collapsed-only]`. Keep `[data-density="compact"]` and every rule
after it unchanged.

Do not remove the root attribute updates from `SidebarStateProvider` or
`NoFlashScript`; they still restore and expose the persisted preference.

- [ ] **Step 7: Run focused sidebar tests and verify GREEN**

Run:

```bash
pnpm test -- components/shell/sidebar.test.tsx components/shell/sidebar-state.test.tsx components/shell/sidebar-views.test.tsx
```

Expected: all focused tests PASS. The URL-authority tests must remain green,
proving the rendering correction did not change navigation semantics.

- [ ] **Step 8: Run adjacent component regressions**

Run:

```bash
pnpm test -- components/shell/backlog-selector.test.tsx components/shell/user-card.test.tsx components/theme/no-flash-script.test.tsx
```

Expected: backlog selection, user actions, and persisted pre-hydration state all
PASS unchanged.

- [ ] **Step 9: Run task-level static checks**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit 0 without errors.

- [ ] **Step 10: Commit the coherent sidebar rendering**

```bash
git add components/shell/sidebar.test.tsx components/shell/sidebar.tsx app/globals.css
git commit -m "fix(shell): render coherent sidebar states"
```

### Task 3: Use a standard directional toggle

**Files:**
- Modify: `components/shell/sidebar.test.tsx:89-124`
- Modify: `components/shell/sidebar.tsx:3-101`

**Interfaces:**
- Consumes: `collapsed` and `toggle` from `useSidebarState()`.
- Produces: expanded `Jiroo` plus `ChevronLeft`, or a brand-free compact header containing one centered `ChevronRight`.
- Preserves: French accessible labels, native title tooltips, 248/64 px widths, persistence, navigation contents, and routing.

- [ ] **Step 1: Change the expanded-state test to require `ChevronLeft`**

In `components/shell/sidebar.test.tsx`, replace the expanded test with:

```tsx
it("renders the wordmark with one standard collapse chevron", () => {
  renderSidebar();

  const brand = screen.getByLabelText("Jiroo");
  const toggle = screen.getByRole("button", {
    name: "Replier la barre latérale",
  });

  expect(brand).toHaveTextContent(/^Jiroo$/);
  expect(toggle.querySelectorAll("svg")).toHaveLength(1);
  expect(toggle.querySelector(".lucide-chevron-left")).toBeInTheDocument();
  expect(toggle).toHaveClass("size-8");
  expect(screen.getByText("Vues perso")).toBeInTheDocument();
});
```

The class assertion targets Lucide's public rendered icon name and catches a
wrong directional glyph without mocking the icon library.

- [ ] **Step 2: Change the compact-state test to reject branding and require a centered `ChevronRight`**

Replace the brand/icon assertions at the start of the compact rail test with:

```tsx
const toggle = screen.getByRole("button", {
  name: "Déplier la barre latérale",
});

expect(screen.queryByLabelText("Jiroo")).not.toBeInTheDocument();
expect(toggle.querySelectorAll("svg")).toHaveLength(1);
expect(toggle.querySelector(".lucide-chevron-right")).toBeInTheDocument();
expect(toggle).toHaveClass("size-8");
expect(toggle.parentElement).toHaveClass("justify-center");
```

Keep the existing assertions for `CASS`, hidden views, `sr-only` navigation
labels, title tooltips, and accessible link names.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
pnpm test -- components/shell/sidebar.test.tsx
```

Expected: FAIL because the current component renders `PanelLeftClose`,
`PanelLeftOpen`, a 28 px button, and the `J` monogram in compact mode.

- [ ] **Step 4: Replace the panel glyph imports with directional chevrons**

Change the Lucide import in `components/shell/sidebar.tsx` to:

```tsx
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Settings,
  Trash2,
  User,
} from "lucide-react";
```

- [ ] **Step 5: Render the expanded brand or compact toggle layout**

Replace the sidebar header with:

```tsx
<div
  className={cn(
    "flex items-center",
    collapsed ? "justify-center" : "justify-between px-2 py-1",
  )}
>
  {!collapsed && (
    <div aria-label="Jiroo" className="t-h2 overflow-hidden font-semibold">
      <span aria-hidden="true">
        Jir<span className="text-[var(--primary)]">oo</span>
      </span>
    </div>
  )}
  <button
    type="button"
    onClick={toggle}
    aria-label={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
    title={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
    className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
  >
    {collapsed ? (
      <ChevronRight className="size-4" />
    ) : (
      <ChevronLeft className="size-4" />
    )}
  </button>
</div>
```

Do not move the backlog selector or any navigation items.

- [ ] **Step 6: Run focused and adjacent tests and verify GREEN**

Run:

```bash
pnpm test -- components/shell/sidebar.test.tsx components/shell/sidebar-state.test.tsx components/shell/sidebar-views.test.tsx components/shell/backlog-selector.test.tsx components/shell/user-card.test.tsx
```

Expected: all tests PASS, including width, persistence, saved-view navigation,
backlog selection, and user actions.

- [ ] **Step 7: Run task-level static checks**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit 0 without errors.

- [ ] **Step 8: Commit the standard toggle**

```bash
git add components/shell/sidebar.test.tsx components/shell/sidebar.tsx
git commit -m "fix(shell): use directional sidebar toggle"
```

### Task 4: Full regression and visual acceptance

**Files:**
- Verify: `components/shell/app-shell.tsx`
- Verify: `components/shell/sidebar-state.tsx`
- Verify: `components/shell/sidebar.tsx`
- Verify: `components/shell/backlog-selector.tsx`
- Verify: `components/shell/nav-link.tsx`
- Verify: `components/shell/sidebar-views.tsx`
- Verify: `components/shell/user-card.tsx`
- Verify: `app/globals.css`

**Interfaces:**
- Consumes: the Task 1, Task 2, and Task 3 commits.
- Produces: verified 248 px expanded navigation and 64 px collapsed icon rail, persisted across reloads.

- [ ] **Step 1: Run the complete automated verification gate**

Run each command independently and inspect its exit code:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: the full Vitest suite reports zero failures, and typecheck, lint, and
the Next.js production build each exit 0.

- [ ] **Step 2: Inspect the expanded state in the running application**

Open `http://localhost:3000/b/CASS` using the seeded local administrator account
from `.env`. With the preference open, verify all of the following at one
desktop viewport:

- the sidebar's computed width is 248 px;
- the header reads `Jiroo` once;
- exactly one `ChevronLeft` icon is visible at the header's far edge;
- the backlog badge/name, navigation labels/counts, saved-view groups, bottom
  actions, and complete user card are visible;
- keyboard focus reaches the collapse control and its accessible name is
  `Replier la barre latérale`.

- [ ] **Step 3: Inspect the collapsed rail**

Activate `Replier la barre latérale` and verify:

- the main content expands as the sidebar's computed width becomes 64 px;
- the top of the rail shows no branding and exactly one centered
  `ChevronRight` icon;
- `CASS`, the primary navigation icons, trash, administration, and the avatar
  are centered in the rail;
- saved-view groups, names, counts, and user details are not visually present;
- hovering the icon controls exposes their French title text;
- keyboard focus reaches the expand control and its accessible name is
  `Déplier la barre latérale`.

- [ ] **Step 4: Verify persistence and absence of duplication**

Reload `/b/CASS` while collapsed. Confirm the first hydrated interactive state
remains the 64 px rail and that neither branding nor duplicate icons appear.
Expand, reload again, and confirm the 248 px state is restored.

- [ ] **Step 5: Inspect the final diff and branch state**

Run:

```bash
git diff 9b395a4..HEAD --check
git diff 9b395a4..HEAD --stat
git status --short --branch
```

Expected: no whitespace errors, the feature history since the original plan
contains only the planned shell/test/CSS files plus the reviewed spec/plan
refinements, and the worktree is clean.
