# Jiroo Audit P0/P1 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the seven audited creation/detail bugs, make the authenticated shell and detail sheet usable at 390 px, and replace pessimistic detail-property feedback with safe optimistic updates.

**Architecture:** Keep the current App Router, Server Actions, URL authority, RBAC, and database schema. Add one shared validation-error mapper, one focused optimistic field hook, responsive sidebar state, and a Radix Dialog-based detail sheet; update only consumers implicated by the audited reproductions.

**Tech Stack:** Next.js 16.2.7 App Router, React 19 Client Components, TypeScript, Tailwind CSS, Radix UI, Zod, Vitest, Testing Library, Playwright.

## Global Constraints

- Read the installed Next.js guides under `node_modules/next/dist/docs/` before production changes; the relevant Client Components, Forms, Vitest, and Accessibility guides were reviewed on 2026-08-04.
- Preserve Server Action authorization before validation or mutation.
- Preserve URLs, database schema, activity logging, role semantics, desktop sidebar preference, and saved-view behavior.
- Use `ITEM_TITLE_MAX = 200` and `ITEM_DESCRIPTION_MAX = 20_000` as the single constraint authority.
- Mobile breakpoint is 768 px; desktop sidebar remains exactly 248 px expanded and 64 px collapsed.
- Mobile detail is full-width and single-column; desktop detail remains 620 px and two-column.
- No BUG-JIR-004 change and no P2/P3 product additions.
- Every production change requires a focused test observed failing for the audited reason before implementation.
- Browser acceptance uses Playwright at 1200 × 943 and 390 × 844 with console and network inspection.

---

### Task 1: Preserve structured validation errors across Server Actions

**Files:**
- Create: `lib/validation/action-error.ts`
- Create: `lib/validation/action-error.test.ts`
- Modify: `lib/validation/item.ts`
- Modify: `app/actions/items.ts`
- Modify: `app/actions/items.test.ts`

**Interfaces:**
- Produces: `ITEM_TITLE_MAX`, `ITEM_DESCRIPTION_MAX`, `ItemFieldErrors`, and `mapZodActionError(error): { error: string; fieldErrors?: ItemFieldErrors } | null`.
- Consumed by: create/title/description components in Tasks 2 and 3.

- [ ] **Step 1: Write the failing mapper tests**

```ts
import { describe, expect, it } from "vitest";
import { updateItemSchema } from "@/lib/validation/item";
import { mapZodActionError } from "@/lib/validation/action-error";

describe("mapZodActionError", () => {
  it("returns the description issue as a field error and summary", () => {
    const parsed = updateItemSchema.safeParse({
      id: "22222222-2222-4222-9222-222222222222",
      description: "A".repeat(20_001),
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected validation failure");

    expect(mapZodActionError(parsed.error)).toEqual({
      error: "Description trop longue (20 000 max).",
      fieldErrors: { description: ["Description trop longue (20 000 max)."] },
    });
  });

  it("returns null for an unknown exception", () => {
    expect(mapZodActionError(new Error("database details"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the mapper test and verify RED**

Run: `pnpm test -- lib/validation/action-error.test.ts`

Expected: FAIL because `@/lib/validation/action-error` and exported limit constants do not exist.

- [ ] **Step 3: Export limits and implement the mapper**

```ts
// lib/validation/item.ts
export const ITEM_TITLE_MAX = 200;
export const ITEM_DESCRIPTION_MAX = 20_000;

const title = z.string().trim()
  .min(1, "Le titre est requis.")
  .max(ITEM_TITLE_MAX, "Titre trop long (200 max).");
const description = z.string().trim()
  .max(ITEM_DESCRIPTION_MAX, "Description trop longue (20 000 max).")
  .nullable()
  .optional();
```

```ts
// lib/validation/action-error.ts
import { ZodError } from "zod";

export type ItemFieldErrors = Partial<Record<"title" | "description", string[]>>;

export function mapZodActionError(error: unknown) {
  if (!(error instanceof ZodError)) return null;
  const flattened = error.flatten().fieldErrors;
  const fieldErrors: ItemFieldErrors = {};
  if (flattened.title?.length) fieldErrors.title = flattened.title;
  if (flattened.description?.length) fieldErrors.description = flattened.description;
  const summary = fieldErrors.title?.[0] ?? fieldErrors.description?.[0] ?? error.issues[0]?.message;
  return { error: summary ?? "Données invalides.", fieldErrors };
}
```

- [ ] **Step 4: Run the mapper test and verify GREEN**

Run: `pnpm test -- lib/validation/action-error.test.ts`

Expected: PASS with both tests green.

- [ ] **Step 5: Write failing Server Action tests**

Extend the hoisted mocks with `createItem` and `updateItem`, import
`createItemAction` and `updateItemAction`, then add:

```ts
it("preserves create title validation as a field error", async () => {
  const parsed = createItemSchema.safeParse({
    backlogId: "11111111-1111-4111-8111-111111111111",
    type: "composant",
    parentId: null,
    title: "A".repeat(201),
  });
  if (parsed.success) throw new Error("Expected validation failure");
  mocks.createItem.mockRejectedValueOnce(parsed.error);

  await expect(createItemAction({
    backlogKey: "DEMO",
    backlogId: "11111111-1111-4111-8111-111111111111",
    type: "composant",
    parentId: null,
    title: "A".repeat(201),
  })).resolves.toEqual({
    ok: false,
    error: "Titre trop long (200 max).",
    fieldErrors: { title: ["Titre trop long (200 max)."] },
  });
});
```

- [ ] **Step 6: Run the action test and verify RED**

Run: `pnpm test -- app/actions/items.test.ts -t "preserves create title validation"`

Expected: FAIL because the action returns `Création impossible.` without `fieldErrors`.

- [ ] **Step 7: Use the mapper before domain fallbacks**

In both `createItemAction` and `updateItemAction`, return
`mapZodActionError(e)` when non-null, then retain the existing safe domain
mapping for all other exceptions.

- [ ] **Step 8: Run focused and existing action tests**

Run: `pnpm test -- lib/validation/action-error.test.ts app/actions/items.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 9: Commit Task 1**

```bash
git add lib/validation/item.ts lib/validation/action-error.ts lib/validation/action-error.test.ts app/actions/items.ts app/actions/items.test.ts
git commit -m "fix(items): preserve structured validation errors"
```

### Task 2: Fix creation shortcut and title validation UX

**Files:**
- Modify: `components/items/new-item-dialog.tsx`
- Modify: `components/items/new-item-dialog.test.tsx`

**Interfaces:**
- Consumes: `ITEM_TITLE_MAX` and create-action `fieldErrors` from Task 1.
- Produces: consumed `C` shortcut, title limit/counter, field-linked error, and focus recovery.

- [ ] **Step 1: Write the failing shortcut regression**

```ts
it("consumes C before opening a dialog with an empty title", () => {
  render(<NewItemButton {...dialogProps()} enableShortcut />);

  const notCancelled = fireEvent.keyDown(window, { key: "c" });

  expect(notCancelled).toBe(false);
  expect(screen.getByRole("textbox", { name: "Titre" })).toHaveValue("");
});
```

- [ ] **Step 2: Run the shortcut regression and verify RED**

Run: `pnpm test -- components/items/new-item-dialog.test.tsx -t "consumes C"`

Expected: FAIL because the keydown event is not cancelled.

- [ ] **Step 3: Consume the shortcut before opening**

Add `event.preventDefault()` immediately before `setOpen(true)` in the guarded
global shortcut handler.

- [ ] **Step 4: Run the shortcut regression and verify GREEN**

Run: `pnpm test -- components/items/new-item-dialog.test.tsx -t "consumes C"`

Expected: PASS.

- [ ] **Step 5: Write failing title-limit and action-error tests**

```ts
it("announces the title limit and renders the server field error", async () => {
  const user = userEvent.setup();
  mocks.createItemAction.mockResolvedValueOnce({
    ok: false,
    error: "Titre trop long (200 max).",
    fieldErrors: { title: ["Titre trop long (200 max)."] },
  });
  render(<NewItemButton {...dialogProps()} />);
  await user.click(screen.getByRole("button", { name: "Nouvel item" }));

  const title = screen.getByRole("textbox", { name: "Titre" });
  expect(title).toHaveAttribute("maxlength", "200");
  expect(screen.getByText("0 / 200")).toBeVisible();

  await user.type(title, "Titre valide");
  await user.click(screen.getByRole("button", { name: /Créer$/ }));

  expect(await screen.findByText("Titre trop long (200 max).")).toBeVisible();
  expect(title).toHaveAttribute("aria-invalid", "true");
  expect(title).toHaveFocus();
});
```

- [ ] **Step 6: Run the title-limit test and verify RED**

Run: `pnpm test -- components/items/new-item-dialog.test.tsx -t "announces the title limit"`

Expected: FAIL because the input has no limit/counter/field error relationship.

- [ ] **Step 7: Implement the minimal title UX**

Import `ITEM_TITLE_MAX`, keep a `titleRef`, render a stable counter, set
`maxLength`, `aria-invalid`, and `aria-describedby`, and prefer
`result.fieldErrors?.title?.[0]` for the field message. Focus the title on
failure without clearing the form. Keep the existing generic error region for
non-field failures.

- [ ] **Step 8: Run all creation dialog tests**

Run: `pnpm test -- components/items/new-item-dialog.test.tsx`

Expected: PASS, including existing dialog reset, hierarchy, and permission tests.

- [ ] **Step 9: Commit Task 2**

```bash
git add components/items/new-item-dialog.tsx components/items/new-item-dialog.test.tsx
git commit -m "fix(items): validate creation title and consume shortcut"
```

### Task 3: Make title and description editing accessible and bounded

**Files:**
- Create: `components/items/detail/editable-title.test.tsx`
- Create: `components/items/detail/description-editor.test.tsx`
- Modify: `components/items/detail/editable-title.tsx`
- Modify: `components/items/detail/description-editor.tsx`

**Interfaces:**
- Consumes: Task 1 constants and update-action field errors.
- Produces: keyboard-reachable rename control and bounded description editor.

- [ ] **Step 1: Write the failing title accessibility test**

```ts
it("exposes rename as a keyboard button while preserving a heading", async () => {
  const user = userEvent.setup();
  render(<EditableTitle itemId="item-1" itemKey="DEMO-1" backlogKey="DEMO" title="Titre initial" />);

  const rename = screen.getByRole("button", { name: "Renommer DEMO-1" });
  expect(screen.getByRole("heading", { level: 2, name: "Titre initial" })).toBeVisible();
  rename.focus();
  await user.keyboard("{Enter}");

  expect(screen.getByRole("textbox", { name: "Titre de l’item" })).toHaveFocus();
});
```

Pass `itemKey="DEMO-1"` as a new required prop and update the panel caller.

- [ ] **Step 2: Run the title test and verify RED**

Run: `pnpm test -- components/items/detail/editable-title.test.tsx`

Expected: FAIL because no semantic rename button or item-key prop exists.

- [ ] **Step 3: Implement semantic title editing**

Render a wrapper containing an `h2` and a focusable edit button named
`Renommer ${itemKey}`. Keep the read-only branch as a plain heading. Add
`maxLength={ITEM_TITLE_MAX}`, counter, `aria-invalid`, field-error association,
pending label, Enter save, and Escape cancel. On invalid server response, keep
edit mode active and focus the input instead of hiding it before the result.

- [ ] **Step 4: Run the title test and verify GREEN**

Run: `pnpm test -- components/items/detail/editable-title.test.tsx`

Expected: PASS.

- [ ] **Step 5: Write the failing description-boundary test**

```ts
it("limits description input and associates a precise server error", async () => {
  const user = userEvent.setup();
  mocks.updateItemAction.mockResolvedValueOnce({
    ok: false,
    error: "Description trop longue (20 000 max).",
    fieldErrors: { description: ["Description trop longue (20 000 max)."] },
  });
  render(<DescriptionEditor itemId="item-1" backlogKey="DEMO" description="Texte" />);
  await user.click(screen.getByRole("button", { name: "Éditer" }));
  const editor = screen.getByRole("textbox", { name: "Description (Markdown supporté)…" });

  expect(editor).toHaveAttribute("maxlength", "20000");
  expect(screen.getByText("5 / 20 000")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText("Description trop longue (20 000 max).")).toBeVisible();
  expect(editor).toHaveAttribute("aria-invalid", "true");
});
```

- [ ] **Step 6: Run the description test and verify RED**

Run: `pnpm test -- components/items/detail/description-editor.test.tsx`

Expected: FAIL because the textarea has no limit/counter/error relationship.

- [ ] **Step 7: Implement bounded description editing**

Use `ITEM_DESCRIPTION_MAX`, a locale-formatted counter, stable error id,
`maxLength`, `aria-invalid`, `aria-describedby`, and the action's description
field error. Change the save label to `Enregistrement…` while pending and keep
the textarea content intact on failure.

- [ ] **Step 8: Run both editor suites and panel callers**

Run: `pnpm test -- components/items/detail/editable-title.test.tsx components/items/detail/description-editor.test.tsx components/items/item-detail-panel.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add components/items/detail/editable-title.tsx components/items/detail/editable-title.test.tsx components/items/detail/description-editor.tsx components/items/detail/description-editor.test.tsx components/items/item-detail-panel.tsx components/items/item-detail-panel.test.tsx
git commit -m "fix(items): make core text editing accessible"
```

### Task 4: Replace the custom detail overlay with an accessible responsive sheet

**Files:**
- Modify: `components/ui/dialog.tsx`
- Modify: `components/items/item-detail-panel.tsx`
- Modify: `components/items/item-detail-panel.test.tsx`

**Interfaces:**
- Consumes: existing `Dialog`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, and URL authority.
- Produces: URL-driven accessible detail sheet with desktop/mobile layouts.

- [ ] **Step 1: Write failing dismissal and semantics tests**

```ts
it("names the detail as a dialog and closes through Escape", async () => {
  const user = userEvent.setup();
  renderPanel();

  const dialog = screen.getByRole("dialog", { name: detail.title });
  expect(dialog).toBeVisible();
  await user.keyboard("{Escape}");

  expect(mocks.push).toHaveBeenCalled();
});

it("uses a single-column mobile-first grid and a desktop side column", () => {
  renderPanel();
  expect(screen.getByRole("dialog", { name: detail.title })).toHaveClass("w-screen");
  expect(screen.getByTestId("item-detail-grid")).toHaveClass("grid-cols-1", "md:grid-cols-[1fr_220px]");
});
```

- [ ] **Step 2: Run the panel tests and verify RED**

Run: `pnpm test -- components/items/item-detail-panel.test.tsx -t "names the detail|single-column"`

Expected: FAIL because the current surface is an unnamed `aside` with a fixed grid.

- [ ] **Step 3: Add a reusable side-position option to DialogContent**

Extend `DialogContent` with a focused
`variant?: "center" | "sheet-right" | "sheet-left"` prop. For `sheet-right`,
use fixed right positioning, full height, no center transform,
`w-screen md:w-[620px] md:max-w-[92vw]`, and right-side slide/fade state
classes. For `sheet-left`, use fixed left positioning, full height,
`w-[248px] max-w-[85vw]`, and left-side slide/fade state classes. Keep the
default center dialog behavior byte-for-byte compatible for other consumers.

- [ ] **Step 4: Compose ItemDetailPanel with Radix Dialog**

Render `Dialog open onOpenChange`, and when Radix requests close call the
existing `close()` URL mutation. Use `DialogContent variant="sheet-right"`,
`showCloseButton={false}`, a screen-reader `DialogTitle` containing
`${detail.key} — ${detail.title}`, the visible `EditableTitle` immediately
after it, and the existing French close button inside `DialogClose`. Replace the fixed grid with
`grid grid-cols-1 md:grid-cols-[1fr_220px]`; add `border-t md:border-l md:border-t-0`
to the properties column. Add `motion-reduce:animate-none` to sheet animations.

- [ ] **Step 5: Run panel tests and verify GREEN**

Run: `pnpm test -- components/items/item-detail-panel.test.tsx components/ui/toaster.test.tsx`

Expected: PASS with viewer read-only tests unchanged.

- [ ] **Step 6: Commit Task 4**

```bash
git add components/ui/dialog.tsx components/items/item-detail-panel.tsx components/items/item-detail-panel.test.tsx
git commit -m "fix(items): use accessible responsive detail sheet"
```

### Task 5: Keep relation and development removal actions keyboard-accessible

**Files:**
- Create: `components/items/detail/links-section.test.tsx`
- Create: `components/items/detail/dev-refs-section.test.tsx`
- Modify: `components/items/detail/links-section.tsx`
- Modify: `components/items/detail/dev-refs-section.tsx`

**Interfaces:**
- Produces: focusable removal controls that reveal on pointer hover and keyboard focus.

- [ ] **Step 1: Write failing focus-order tests**

```ts
it("keeps relation removal in keyboard order without hover", async () => {
  const user = userEvent.setup();
  render(<LinksSection {...propsWithOneLink} />);
  const link = screen.getByRole("link", { name: /CASS-58/ });
  link.focus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Supprimer le lien vers CASS-58" })).toHaveFocus();
});
```

Mirror the assertion for `Supprimer le lien PR #1 · openai/openai-node` in the
development-reference test using a complete ref fixture.

- [ ] **Step 2: Run both tests and verify RED**

Run: `pnpm test -- components/items/detail/links-section.test.tsx components/items/detail/dev-refs-section.test.tsx`

Expected: FAIL because `display:none` removes both buttons from tab order.

- [ ] **Step 3: Replace hover-only display rules**

Keep each button `inline-flex` and use
`opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto`.
The element remains focusable even when visually subdued; preserve disabled,
hover, and accessible-name behavior.

- [ ] **Step 4: Run both tests and verify GREEN**

Run: `pnpm test -- components/items/detail/links-section.test.tsx components/items/detail/dev-refs-section.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add components/items/detail/links-section.tsx components/items/detail/links-section.test.tsx components/items/detail/dev-refs-section.tsx components/items/detail/dev-refs-section.test.tsx
git commit -m "fix(items): expose link removal to keyboard users"
```

### Task 6: Add responsive mobile drawer state to the authenticated shell

**Files:**
- Create: `components/shell/use-media-query.ts`
- Create: `components/shell/use-media-query.test.tsx`
- Modify: `components/shell/sidebar-state.tsx`
- Modify: `components/shell/sidebar-trigger.tsx`
- Modify: `components/shell/app-shell.tsx`
- Modify: `components/shell/sidebar.tsx`
- Modify: `components/shell/sidebar-state.test.tsx`
- Modify: `components/shell/view-bar.tsx`
- Create: `components/shell/view-bar.test.tsx`

**Interfaces:**
- Produces: sidebar context `{ collapsed, mobile, mobileOpen, toggle, closeMobile }` and a shell whose only mobile grid column is content.
- Preserves: desktop `{ collapsed, toggle }` behavior and local-storage key.

- [ ] **Step 1: Write the failing media-query hook test**

Provide a controllable `window.matchMedia` fake with `matches`,
`addEventListener`, and `removeEventListener`, then assert that
`useMediaQuery("(max-width: 767px)")` initially returns the literal fake value
and rerenders after its change listener fires.

- [ ] **Step 2: Run the hook test and verify RED**

Run: `pnpm test -- components/shell/use-media-query.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement `useMediaQuery` with `useSyncExternalStore`**

Subscribe through `MediaQueryList.addEventListener("change", listener)`, return
`media.matches` from the client snapshot, and return `false` from the server
snapshot so hydration begins with the desktop-safe server structure.

- [ ] **Step 4: Run the hook test and verify GREEN**

Run: `pnpm test -- components/shell/use-media-query.test.tsx`

Expected: PASS.

- [ ] **Step 5: Write failing mobile shell tests**

```ts
it("uses one content column and opens the sidebar as a modal drawer on mobile", async () => {
  installMatchMedia(true);
  const user = userEvent.setup();
  const { container } = render(
    <AppShell sidebar={<aside>Navigation mobile</aside>} topbar={<SidebarTrigger />}>
      Contenu
    </AppShell>,
  );

  expect(container.firstElementChild).toHaveStyle({ gridTemplateColumns: "minmax(0,1fr)" });
  expect(screen.queryByText("Navigation mobile")).not.toBeVisible();
  await user.click(screen.getByRole("button", { name: "Ouvrir la navigation" }));
  expect(screen.getByRole("dialog", { name: "Navigation principale" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Navigation principale" })).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run the mobile shell test and verify RED**

Run: `pnpm test -- components/shell/sidebar-state.test.tsx -t "modal drawer on mobile"`

Expected: FAIL because the shell still reserves 248 px and has no drawer state.

- [ ] **Step 7: Implement responsive state and drawer composition**

Use the media-query hook inside `SidebarStateProvider`. On desktop, `toggle`
keeps the current collapse persistence. On mobile, `toggle` changes only
`mobileOpen`; `closeMobile` sets it false. `AppShellFrame` uses one content
column on mobile, renders the sidebar inside a labelled Radix Dialog sheet on
the left, and renders the existing direct sidebar column only on desktop.
`Sidebar` receives `collapsed=false` on mobile. `SidebarTrigger` exposes
`Ouvrir la navigation`/`Fermer la navigation` on mobile and the existing
French collapse labels on desktop.

On the mobile drawer content, add a capture handler that calls `closeMobile()`
only for an ordinary primary-button activation of an anchor with no modifier
keys. Add a test that clicking `Tous les items` closes the drawer while
Ctrl/Meta-click leaves it open for native new-tab behavior.

- [ ] **Step 8: Make the view toolbar wrap without hiding creation**

Add a test that renders literal `Grouper`, `Vues`, and `Nouvel item` slots and
asserts `Nouvel item` remains in the primary cluster. Change `ViewBar` from
fixed `h-[46px]` to `min-h-[46px] flex-wrap py-2`, give secondary slots safe
wrapping, and keep the final primary cluster `ml-auto shrink-0`.

- [ ] **Step 9: Run responsive shell/view tests**

Run: `pnpm test -- components/shell/use-media-query.test.tsx components/shell/sidebar-state.test.tsx components/shell/sidebar.test.tsx components/shell/topbar.test.tsx components/shell/view-bar.test.tsx`

Expected: PASS; desktop 248/64 px assertions remain green.

- [ ] **Step 10: Commit Task 6**

```bash
git add components/shell/use-media-query.ts components/shell/use-media-query.test.tsx components/shell/sidebar-state.tsx components/shell/sidebar-trigger.tsx components/shell/app-shell.tsx components/shell/sidebar.tsx components/shell/sidebar-state.test.tsx components/shell/view-bar.tsx components/shell/view-bar.test.tsx
git commit -m "fix(shell): add responsive mobile navigation drawer"
```

### Task 7: Replace pessimistic detail fields with safe optimistic updates

**Files:**
- Create: `components/items/detail/use-optimistic-field-update.ts`
- Create: `components/items/detail/use-optimistic-field-update.test.tsx`
- Modify: `components/items/detail/field-editors.tsx`
- Modify: `components/items/detail/field-editors.test.tsx`

**Interfaces:**
- Produces: `useOptimisticFieldUpdate<T>({ value, itemId, backlogKey, toPatch })` returning `{ value, pending, error, update }`.
- Consumed by: status, priority, nature, assignee, reporter, due date, and label editors.

- [ ] **Step 1: Write the failing optimistic lifecycle tests**

Use a small `ReporterField` harness and a deferred action:

```ts
it("shows the selected reporter immediately and confirms after the action", async () => {
  const user = userEvent.setup();
  const request = deferred<{ ok: true; item: object }>();
  mocks.updateItemAction.mockReturnValueOnce(request.promise);
  render(<ReporterField itemId="item-1" backlogKey="DEMO" reporterId="u1" users={users} />);

  const select = screen.getByRole("combobox", { name: "Rapporteur" });
  await user.selectOptions(select, "u2");

  expect(select).toHaveValue("u2");
  expect(select).toHaveAttribute("aria-busy", "true");
  request.resolve({ ok: true, item: { reporterId: "u2" } });
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
});

it("rolls back the optimistic reporter on failure", async () => {
  const user = userEvent.setup();
  mocks.updateItemAction.mockResolvedValueOnce({ ok: false, error: "Mise à jour impossible." });
  render(<ReporterField itemId="item-1" backlogKey="DEMO" reporterId="u1" users={users} />);
  const select = screen.getByRole("combobox", { name: "Rapporteur" });
  await user.selectOptions(select, "u2");
  expect(await screen.findByText("Mise à jour impossible.")).toBeVisible();
  expect(select).toHaveValue("u1");
});
```

- [ ] **Step 2: Run field-editor tests and verify RED**

Run: `pnpm test -- components/items/detail/field-editors.test.tsx`

Expected: FAIL because the current test and implementation keep `u1` while pending.

- [ ] **Step 3: Implement the focused optimistic hook**

The hook stores `confirmed`, `optimistic`, and a monotonically increasing local
revision. `update(next)` sets optimistic immediately, disables only that field,
and calls `updateItemAction`. On success it confirms `next` and refreshes; on
failure/throw it restores `confirmed` and sets a safe error. A prop-sync effect
updates both values only when no request is pending for a newer revision.

- [ ] **Step 4: Run hook and reporter tests and verify GREEN**

Run: `pnpm test -- components/items/detail/use-optimistic-field-update.test.tsx components/items/detail/field-editors.test.tsx`

Expected: PASS for immediate value, busy state, confirmation, rollback, and stale-prop protection.

- [ ] **Step 5: Apply the hook to every detail property**

Replace `useFieldUpdate` in status, priority, nature, assignee, reporter, and
due-date editors. Use the optimistic value for icons and select/input values.
For labels, pass the full string-array value so checkbox state updates
immediately and rolls back as one field. Preserve independent hooks so distinct
properties can save concurrently.

- [ ] **Step 6: Add one table-driven regression per value kind**

Cover string id, number priority, nullable assignee/date, and string-array
labels using literal before/after values. Assert the rendered control, not only
mock call counts.

- [ ] **Step 7: Run all detail editor tests**

Run: `pnpm test -- components/items/detail/use-optimistic-field-update.test.tsx components/items/detail/field-editors.test.tsx components/items/item-detail-panel.test.tsx`

Expected: PASS with no act warnings.

- [ ] **Step 8: Commit Task 7**

```bash
git add components/items/detail/use-optimistic-field-update.ts components/items/detail/use-optimistic-field-update.test.tsx components/items/detail/field-editors.tsx components/items/detail/field-editors.test.tsx
git commit -m "fix(items): add safe optimistic detail updates"
```

### Task 8: Full automated and Playwright acceptance, then audit history

**Files:**
- Modify after evidence: `audit/README.md`
- Modify after evidence: `audit/bugs.md`
- Modify after evidence: `audit/ux.md`
- Modify after evidence: `audit/roadmap.md`
- Create: `audit/screenshots/FIXED-BUG-JIR-001-create-shortcut-empty-title.png`
- Create: `audit/screenshots/FIXED-BUG-JIR-006-detail-panel-mobile.png`
- Create: `audit/screenshots/FIXED-BUG-JIR-007-keyboard-remove-action.png`
- Create: `audit/console/2026-08-04-remediation-session-console.log`
- Create: `audit/network/2026-08-04-remediation-session-requests.log`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: fresh automated/browser evidence and updated audit status/history.

- [ ] **Step 1: Run focused remediation suites together**

Run:

```bash
pnpm test -- \
  lib/validation/action-error.test.ts \
  app/actions/items.test.ts \
  components/items/new-item-dialog.test.tsx \
  components/items/detail/editable-title.test.tsx \
  components/items/detail/description-editor.test.tsx \
  components/items/detail/links-section.test.tsx \
  components/items/detail/dev-refs-section.test.tsx \
  components/items/item-detail-panel.test.tsx \
  components/shell/use-media-query.test.tsx \
  components/shell/sidebar-state.test.tsx \
  components/shell/view-bar.test.tsx \
  components/items/detail/use-optimistic-field-update.test.tsx \
  components/items/detail/field-editors.test.tsx
```

Expected: all focused tests pass with zero unhandled errors or warnings.

- [ ] **Step 2: Run repository verification**

Run in this order:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: every command exits 0. Existing unrelated failures must be reported
and investigated rather than hidden.

- [ ] **Step 3: Reproduce BUG-JIR-001/002 in Playwright desktop**

At 1200 × 943, press `C`; verify the dialog opens with an empty title, the key
event does not insert text, title exposes 200 max/counter, and no request can be
sent above the visible limit. Capture the corrected shortcut state.

- [ ] **Step 4: Reproduce BUG-JIR-005/008/009 in Playwright desktop**

Open `CASS-57`; verify rename is reached by Tab and activated with Enter,
description exposes 20,000 max/counter, Escape first cancels nested edit then
closes the sheet, `item` leaves the URL, and focus returns to the item trigger.

- [ ] **Step 5: Reproduce BUG-JIR-007 in Playwright keyboard-only**

Create temporary relation/reference fixtures, tab from each link to its remove
button without hover, activate through keyboard, capture proof, then restore
the item data.

- [ ] **Step 6: Reproduce BUG-JIR-003/006 at 390 × 844**

Verify the sidebar is closed by default, trigger opens a labelled drawer,
`Nouvel item` is visible, the page does not globally overflow, and the detail
sheet is full-width/single-column with readable content. Capture the corrected
detail state.

- [ ] **Step 7: Verify optimistic feedback and permissions**

With admin, change distinct fields rapidly and verify each new value appears
immediately without reverting. Simulate or observe an action failure and verify
rollback/error. With the existing Audit Lecteur account, verify all mutation
controls remain absent.

- [ ] **Step 8: Save console/network evidence**

Export the Playwright console and request lists to the declared audit paths.
Document every 4xx/5xx request with request/response bodies; expected auth test
failures remain diagnostics, not product bugs.

- [ ] **Step 9: Update the audit only from verified evidence**

Mark each fixed bug `corrigé et revérifié le 2026-08-04` only if its original
browser reproduction passes. Preserve every previous screenshot and diagnostic.
Append a remediation history entry, refreshed score rationale, remaining risks,
and the next three audit priorities.

- [ ] **Step 10: Run artifact verification**

Run a Node link check over all `audit/*.md`, `git diff --check`, PNG `file`
validation, and confirm every indexed bug id remains unique.

- [ ] **Step 11: Commit verified remediation evidence**

```bash
git add audit docs/superpowers/plans/2026-08-04-jiroo-audit-p0-p1-remediation-implementation.md
git commit -m "docs(audit): record verified P0 P1 remediation"
```

## Execution Order and Checkpoints

1. Tasks 1–3: validation and text-entry checkpoint.
2. Tasks 4–6: accessibility and responsive checkpoint.
3. Task 7: optimistic mutation checkpoint.
4. Task 8: full verification and audit evidence checkpoint.

Do not advance past a checkpoint with a failing focused test, a TypeScript
error, or an unexplained browser/network failure.
