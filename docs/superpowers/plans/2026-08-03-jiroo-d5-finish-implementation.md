# Jiroo D5 States and Finishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Jiroo with robust loading/empty/error states, actionable Undo toasts, secure recent-item search, detail polish, keyboard creation, and a criterion-by-criterion acceptance audit.

**Architecture:** Route conventions provide server loading and error boundaries, while reusable state components preserve layout dimensions. The client-only toast store owns executable Undo callbacks that call existing inverse Server Actions. Recent history stores bounded item keys locally and resolves authorized rows on the server. Reporter changes extend the existing transactional item update path and activity log.

**Tech Stack:** Next.js 16.2 App Router and Suspense, React 19, TypeScript, Drizzle/Postgres, Radix/shadcn, browser localStorage/Clipboard APIs, Vitest and Testing Library.

## Global Constraints

- Read local Next.js docs before code: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`, `error.md`, `01-app/02-guides/streaming.md`, and `01-app/01-getting-started/10-error-handling.md`.
- Loading placeholders must preserve board/list/detail geometry and avoid layout jumps.
- Undo is offered for create and soft-delete only; purge is never undoable.
- Restore is allowed through the end of 30 days after `deletedAt`; later attempts fail server-side.
- Recent history stores at most 8 item keys under `jiroo-recent-items`; no title, description, user, or status data is stored.
- Server resolution filters deleted/archived data and requires an authenticated session.
- `C` never fires with modifiers, inside editable controls/contenteditable, or while another dialog is open.
- Every item-field mutation remains transactional and audited.
- Follow TDD and commit each task independently.

---

## File Structure

- `components/ui/empty-state.tsx`: reusable illustrated empty state.
- `components/ui/skeleton.tsx`: token-based primitive.
- `components/items/view-skeletons.tsx`: board/list/detail skeleton compositions.
- `app/(app)/loading.tsx`: authenticated-area fallback.
- `app/(app)/error.tsx`: client retry boundary.
- `app/(app)/b/[key]/loading.tsx`: backlog-view fallback.
- `components/items/backlog-view-content.tsx`: async backlog data and view renderer.
- `components/items/item-detail-content.tsx`: async detail data loader wrapped in Suspense.
- `lib/toast.ts`, `lib/toast.test.ts`, `components/ui/toaster.tsx`: action-capable toast store/UI.
- `lib/items/trash.ts`, `lib/items/trash.test.ts`: 30-day deadline core.
- `lib/services/items.ts`, `app/actions/trash.ts`: restore enforcement and error mapping.
- `lib/items/recent.ts`, `lib/items/recent.test.ts`: bounded recent-key storage core.
- `lib/services/search.ts`, `app/actions/search.ts`: authorized recent resolution.
- `components/items/recent-item-tracker.tsx`: records opened detail keys.
- `components/shell/search-modal.tsx`: blank-query recent rows and avatars.
- `lib/validation/item.ts`, `lib/validation/item.test.ts`: reporter update input.
- `components/items/detail/field-editors.tsx`: reporter editor.
- `components/items/item-detail-panel.tsx`: breadcrumb, copy link, reporter, Undo delete.
- `components/items/new-item-dialog.tsx`: `C` shortcut and Undo create.
- `app/(auth)/login/page.tsx`: first-login and password-help links.
- `docs/acceptance/2026-08-03-jiroo-feature-audit.md`: final evidence table.

### Task 1: Loading, error, and empty-state primitives

**Files:**
- Create: `components/ui/skeleton.tsx`
- Create: `components/ui/empty-state.tsx`
- Create: `components/items/view-skeletons.tsx`
- Create: `components/items/view-skeletons.test.tsx`
- Create: `app/(app)/loading.tsx`
- Create: `app/(app)/error.tsx`
- Create: `app/(app)/b/[key]/loading.tsx`

**Interfaces:**
- Produces: `<Skeleton className />`, `<EmptyState icon title description action />`.
- Produces: `BoardSkeleton`, `ListSkeleton`, `DetailPanelSkeleton`.

- [ ] **Step 1: Write failing skeleton structure tests**

Render each view skeleton and assert stable accessible names (`Chargement du board`, etc.), four board columns, eight list rows, and a 620px detail panel aside. Assert decorative bars are `aria-hidden`.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/items/view-skeletons.test.tsx`

- [ ] **Step 3: Implement token-based primitives and compositions**

Use `animate-pulse`, `var(--surface-2)`, `var(--border)`, `var(--card-pad)`, and `var(--row-h)`. Board skeleton columns are 296px wide and preserve horizontal scrolling. The error boundary must be a client component accepting `{ error, unstable_retry }`, logging the error in an effect, and offering `Réessayer` through `unstable_retry()` as required by the local Next.js 16 documentation.

- [ ] **Step 4: Add route fallbacks**

The app fallback preserves the shell content area. The backlog fallback uses `BoardSkeleton` because board is the default route mode; mode-specific Suspense is added in Task 2. Do not duplicate the sidebar/topbar in loading files because the parent layout remains mounted.

- [ ] **Step 5: Run and commit**

Run: `pnpm test -- components/items/view-skeletons.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add components/ui/skeleton.tsx components/ui/empty-state.tsx components/items/view-skeletons.tsx components/items/view-skeletons.test.tsx app/'(app)'/loading.tsx app/'(app)'/error.tsx app/'(app)'/b/'[key]'/loading.tsx
git commit -m "feat(states): add loading and error boundaries"
```

### Task 2: View and detail Suspense boundaries

**Files:**
- Create: `components/items/backlog-view-content.tsx`
- Create: `components/items/item-detail-content.tsx`
- Modify: `app/(app)/b/[key]/page.tsx`
- Modify: `components/items/item-board.tsx`
- Modify: `components/items/item-list.tsx`
- Modify: `components/items/item-tree.tsx`
- Modify: `components/items/trash-list.tsx`
- Create: `components/items/trash-list.test.tsx`
- Modify: `components/shell/sidebar-views.tsx`
- Create: `components/shell/sidebar-views.test.tsx`
- Modify: `app/(app)/trash/page.tsx`

**Interfaces:**
- Produces: async `<BacklogViewContent paramsPromise searchParamsPromise />` containing the current page's database reads and view composition.
- Produces: async `<ItemDetailContent itemKey backlog users statuses labels items currentUserId />`.
- Consumes: `EmptyState` in every empty collection.

- [ ] **Step 1: Write failing empty-state tests**

For board/list/tree with zero rows, assert a title, explanatory copy, and New Item action. With active filters and zero matches, assert `Aucun résultat` and an `Effacer les filtres` link that preserves only `view`. Assert empty saved views and trash have their dedicated copy/action.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/items/item-board.test.tsx components/items/item-list.test.tsx components/items/item-tree.test.tsx components/items/trash-list.test.tsx components/shell/sidebar-views.test.tsx`

- [ ] **Step 3: Implement consistent empty states**

Pass `filtersActive` and `clearFiltersHref` from the page. Use `EmptyState` with small Lucide icons; do not introduce bitmap assets. The no-item action opens New Item; the no-result action is a plain shareable link.

- [ ] **Step 4: Extract the async backlog-view loader**

Move the backlog lookup, item/status/user/label reads, filter enrichment, view composition, and detail props currently in `page.tsx` into async `BacklogViewContent`. Keep `page.tsx` responsible only for awaiting `searchParams` long enough to select the requested view's skeleton, then render the async component inside Suspense and pass the original `params`/`searchParams` promises through. All database work remains below the boundary, following the local streaming guide.

- [ ] **Step 5: Extract the async detail loader**

Move `getItemByKey`, activities, label ids, comments, links, and refs into `ItemDetailContent`. Validate backlog ownership before rendering. In the page wrap it with:

```tsx
<Suspense fallback={<DetailPanelSkeleton />}>
  <ItemDetailContent {...props} />
</Suspense>
```

Keep the already-loaded users/statuses/labels/items as props to avoid duplicate queries.

- [ ] **Step 6: Add mode-specific content fallbacks**

Wrap `BacklogViewContent` with `BoardSkeleton` or `ListSkeleton`; tree reuses the row geometry with accessible label `Chargement de l’arbre`. Because all database access is in the async child, each boundary has real suspendable work.

- [ ] **Step 7: Run and commit**

Run: `pnpm test -- components/items/item-board.test.tsx components/items/item-list.test.tsx components/items/item-tree.test.tsx components/items/trash-list.test.tsx components/shell/sidebar-views.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add components/items/backlog-view-content.tsx components/items/item-detail-content.tsx components/items components/shell/sidebar-views.tsx app/'(app)'/b/'[key]'/page.tsx app/'(app)'/trash/page.tsx
git commit -m "feat(states): add view and detail empty states"
```

### Task 3: Action-capable toast store and Undo flows

**Files:**
- Modify: `lib/toast.ts`
- Modify: `lib/toast.test.ts`
- Modify: `components/ui/toaster.tsx`
- Create: `components/ui/toaster.test.tsx`
- Modify: `components/items/new-item-dialog.tsx`
- Modify: `components/items/item-detail-panel.tsx`
- Modify: `app/actions/items.ts`

**Interfaces:**
- Extends `Toast` with `action?: { label: string; run: () => void | Promise<void> }`.
- Extends `toast.success/error(message, options?)` where `options.action` has the same shape.

- [ ] **Step 1: Write failing store tests**

```ts
const run = vi.fn();
toast.success("Item créé.", { action: { label: "Annuler", run } });
expect(getSnapshot()[0]?.action).toEqual({ label: "Annuler", run });
```

Also confirm calls without options preserve the existing exact object shape and reset clears action callbacks.

- [ ] **Step 2: Write failing toaster interaction tests**

Click Annuler, assert `run` is awaited, the button is disabled while pending, and the toast dismisses on success. Reject the callback and assert the original toast remains plus a new `Annulation impossible.` error toast.

- [ ] **Step 3: Run and confirm RED**

Run: `pnpm test -- lib/toast.test.ts components/ui/toaster.test.tsx`

- [ ] **Step 4: Implement action behavior**

Keep auto-dismiss at four seconds. Use per-card pending state. Dismiss after successful action; on failure keep the original and push a safe error. The action button must be keyboard reachable and visually distinct from close.

- [ ] **Step 5: Wire creation Undo**

After `createItemAction` succeeds, call:

```ts
toast.success("Item créé.", {
  action: {
    label: "Annuler",
    run: async () => {
      const result = await softDeleteItemAction({ id: item.id, backlogKey });
      if (!result.ok) throw new Error(result.error);
      router.refresh();
    },
  },
});
```

Make `softDeleteItemAction` consistently return `{ ok:false,error }` rather than throwing expected service errors.

- [ ] **Step 6: Wire deletion Undo**

After detail deletion, navigate back, show `Item supprimé.` with an action calling `restoreItemAction`, and refresh after success. Do not offer Undo for purge.

- [ ] **Step 7: Run and commit**

Run: `pnpm test -- lib/toast.test.ts components/ui/toaster.test.tsx components/items/new-item-dialog.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add lib/toast.ts lib/toast.test.ts components/ui/toaster.tsx components/ui/toaster.test.tsx components/items/new-item-dialog.tsx components/items/item-detail-panel.tsx app/actions/items.ts
git commit -m "feat(toasts): add undo actions for item mutations"
```

### Task 4: Enforce the 30-day restore window

**Files:**
- Create: `lib/items/trash.ts`
- Create: `lib/items/trash.test.ts`
- Modify: `lib/services/items.ts`
- Modify: `app/actions/trash.ts`
- Modify: `app/actions/items.ts`
- Modify: `components/items/trash-list.tsx`
- Modify: `components/items/trash-list.test.tsx`

**Interfaces:**
- Produces: `restoreDeadline(deletedAt: Date): Date` and `canRestore(deletedAt: Date, now: Date): boolean`.
- Extends `TrashList` rows with deadline display and disabled expired restore.

- [ ] **Step 1: Write boundary tests**

```ts
const deleted = new Date("2026-01-01T00:00:00Z");
expect(canRestore(deleted, new Date("2026-01-31T00:00:00Z"))).toBe(true);
expect(canRestore(deleted, new Date("2026-01-31T00:00:00.001Z"))).toBe(false);
```

Use `30 * 24 * 60 * 60 * 1000`, not calendar-month arithmetic.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- lib/items/trash.test.ts`

- [ ] **Step 3: Implement and enforce in the locked restore transaction**

After locking the target, compare its `deletedAt` with a single `now` captured inside the transaction. Throw `Délai de restauration dépassé.` before touching the subtree. Preserve the parent-deleted guard.

- [ ] **Step 4: Map and render expiry**

Map the service error verbatim in both trash and item restore actions. Display `Restaurable jusqu’au {date}` for active rows and `Délai expiré` for expired rows. Disable only Restore; Purge stays available.

- [ ] **Step 5: Run and commit**

Run: `pnpm test -- lib/items/trash.test.ts components/items/trash-list.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add lib/items/trash.ts lib/items/trash.test.ts lib/services/items.ts app/actions/trash.ts app/actions/items.ts components/items/trash-list.tsx components/items/trash-list.test.tsx
git commit -m "feat(trash): enforce 30-day restore window"
```

### Task 5: Secure recent-item search

**Files:**
- Create: `lib/items/recent.ts`
- Create: `lib/items/recent.test.ts`
- Modify: `lib/services/search.ts`
- Modify: `app/actions/search.ts`
- Create: `components/items/recent-item-tracker.tsx`
- Modify: `components/shell/search-modal.tsx`
- Create: `components/shell/search-modal.test.tsx`
- Modify: `components/items/item-detail-content.tsx`

**Interfaces:**
- Produces: `readRecentKeys(raw: string | null): string[]` and `recordRecentKey(keys, key, limit = 8): string[]`.
- Produces: `recentItems(keys: string[]): Promise<SearchResult[]>` and `recentItemsAction(keys)`.
- Extends `SearchResult` with `assigneeName: string | null`.

- [ ] **Step 1: Write failing pure recent-list tests**

Test invalid JSON → `[]`, non-string entries removed, duplicates removed preserving newest-first order, a reopened key moves to index 0, and the list is capped at 8.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- lib/items/recent.test.ts`

- [ ] **Step 3: Implement bounded key storage**

Accept only keys matching `/^[A-Z]{2,6}-\d+$/`. `RecentItemTracker` records the mounted detail key in an effect and writes only `JSON.stringify(keys)` to `jiroo-recent-items`.

- [ ] **Step 4: Resolve authorized recent rows server-side**

Validate at most 8 keys in the action. Query live items joined to non-archived backlogs, statuses, and optionally assignee user. Reorder returned rows to the caller's key order in memory. Do not reveal which missing keys were deleted, archived, or nonexistent.

- [ ] **Step 5: Update search rows and blank state**

When opening the modal or clearing its query, load recent keys then call `recentItemsAction`. Render `Récents` and the rows instead of instructional blank copy. Use `InitialsAvatar` when `assigneeName` exists. Both search and recent rows retain keyboard navigation. Record the selected key before navigation.

- [ ] **Step 6: Run and commit**

Run: `pnpm test -- lib/items/recent.test.ts components/shell/search-modal.test.tsx lib/items/search.test.ts && pnpm typecheck && pnpm lint`

```bash
git add lib/items/recent.ts lib/items/recent.test.ts lib/services/search.ts app/actions/search.ts components/items/recent-item-tracker.tsx components/items/item-detail-content.tsx components/shell/search-modal.tsx components/shell/search-modal.test.tsx
git commit -m "feat(search): add secure recent items"
```

### Task 6: Reporter editing and detail header polish

**Files:**
- Modify: `lib/validation/item.ts`
- Modify: `lib/validation/item.test.ts`
- Modify: `lib/services/items.ts`
- Modify: `app/actions/items.ts`
- Modify: `components/items/detail/field-editors.tsx`
- Create: `components/items/detail/field-editors.test.tsx`
- Modify: `components/items/item-detail-panel.tsx`
- Create: `components/items/item-detail-panel.test.tsx`
- Modify: `components/items/item-detail-content.tsx`

**Interfaces:**
- Extends item update input/action with `reporterId?: string`.
- Produces: `<ReporterField itemId backlogKey reporterId users />`.
- Item detail receives `parent?: { key: string; title: string }`.

- [ ] **Step 1: Write failing validation tests**

Assert reporter id accepts a non-empty better-auth text id, rejects an empty string, and remains untouched when omitted.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- lib/validation/item.test.ts`

- [ ] **Step 3: Extend the transactional update**

When reporter changes, verify the target user exists, set `reporterId`, and append activity `{ action:"update", field:"reporter", oldValue, newValue }`. No-op updates leave `updatedAt` and activities unchanged.

- [ ] **Step 4: Add reporter editor tests and implementation**

Mirror the assignee editor but omit the null option because reporter is required. Assert the exact action payload and error behavior.

- [ ] **Step 5: Add breadcrumb and copy-link tests**

Render a parent/current item, assert `PARENT-1 / CASS-2`, click Copier le lien, assert `navigator.clipboard.writeText(window.location.href)`, and assert success/error toasts. Without a parent, render only the current key.

- [ ] **Step 6: Implement the detail header**

Resolve the parent from already-loaded candidates. Place breadcrumb at left, then Copier le lien, actions menu, and close. Mount `ReporterField` in metadata. Preserve panel width, tabs, URL close behavior, and delete Undo from Task 3.

- [ ] **Step 7: Run and commit**

Run: `pnpm test -- lib/validation/item.test.ts components/items/detail/field-editors.test.tsx components/items/item-detail-panel.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add lib/validation/item.ts lib/validation/item.test.ts lib/services/items.ts app/actions/items.ts components/items/detail/field-editors.tsx components/items/detail/field-editors.test.tsx components/items/item-detail-panel.tsx components/items/item-detail-panel.test.tsx components/items/item-detail-content.tsx
git commit -m "feat(detail): edit reporter and polish item header"
```

### Task 7: Global create shortcut and login help links

**Files:**
- Modify: `components/items/new-item-dialog.tsx`
- Modify: `components/items/new-item-dialog.test.tsx`
- Modify: `app/(app)/b/[key]/page.tsx`
- Modify: `app/(auth)/login/page.tsx`
- Create: `components/auth/login-help.tsx`
- Create: `components/auth/login-help.test.tsx`

**Interfaces:**
- Extends `NewItemButton` with `enableShortcut?: boolean`, false by default.
- Produces: `<LoginHelp />` with password and first-connection guidance.

- [ ] **Step 1: Write failing keyboard tests**

With `enableShortcut`, dispatch `c` on `window` and assert the dialog opens. Repeat from input, textarea, select, contenteditable, an open `[role=dialog]`, with Ctrl/Meta/Alt, and with `defaultPrevented`; assert it stays closed. Assert only the global button has `enableShortcut`, not D4 column buttons.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test -- components/items/new-item-dialog.test.tsx`

- [ ] **Step 3: Implement guarded shortcut handling**

Use one effect attached to `window`, `e.key.toLowerCase() === "c"`, the exact guards above, and cleanup on unmount. Add `title="Nouvel item (C)"` to the global trigger.

- [ ] **Step 4: Write login-help tests**

Assert two keyboard-accessible buttons/links: `Mot de passe oublié ?` reveals `Contactez un administrateur pour réinitialiser votre accès.`; `Première connexion ?` reveals `Connectez-vous avec le mot de passe transmis, puis activez la 2FA dans Préférences.`. No e-mail reset form or fake successful action is rendered.

- [ ] **Step 5: Implement and place below the login form**

Use disclosure buttons with `aria-expanded` and small neutral copy. Preserve generic authentication errors and the existing reserved-access message.

- [ ] **Step 6: Run and commit**

Run: `pnpm test -- components/items/new-item-dialog.test.tsx components/auth/login-help.test.tsx && pnpm typecheck && pnpm lint`

```bash
git add components/items/new-item-dialog.tsx components/items/new-item-dialog.test.tsx app/'(app)'/b/'[key]'/page.tsx components/auth/login-help.tsx components/auth/login-help.test.tsx app/'(auth)'/login/page.tsx
git commit -m "feat(shortcuts): add create key and login guidance"
```

### Task 8: Final acceptance audit and release verification

**Files:**
- Create: `docs/acceptance/2026-08-03-jiroo-feature-audit.md`
- Modify if required: only files implicated by a failing criterion.

**Interfaces:**
- Produces: one evidence row for every acceptance bullet in `PROMPT-FEATURES.md`.

- [ ] **Step 1: Build the evidence table**

Use columns `Feature`, `Critère`, `Statut`, `Preuve`. Allowed statuses are `Satisfait` and `Hors périmètre explicite`; do not mark an applicable criterion complete without a test, browser observation, service invariant, or file reference.

- [ ] **Step 2: Run complete automated verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Record exact test counts and build route output in the audit.

- [ ] **Step 3: Run browser acceptance**

Verify screens 01–16 as applicable, light/dark, comfy/compact, admin/contributor/viewer roles, keyboard-only navigation, create/edit/delete/Undo/restore/purge, board/list/tree DnD, filters/saved views, comments/mentions/notifications, search/recent items, and error/loading/empty states.

- [ ] **Step 4: Fix any applicable partial or absent criterion under TDD**

For each finding, add a failing targeted test, confirm RED, implement the smallest correction, confirm GREEN, then rerun the relevant browser path. Add the concrete test command and evidence to the audit row.

- [ ] **Step 5: Run the final suite again**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: all commands pass after the last code change.

- [ ] **Step 6: Commit the verified audit**

Commit every code correction from Step 4 with its targeted test before returning to the audit. The final audit commit stages only the evidence document:

```bash
git add docs/acceptance/2026-08-03-jiroo-feature-audit.md
git commit -m "docs: record Jiroo feature acceptance"
```

Do not stage generated `.next` content, environment files, or unrelated user changes.
