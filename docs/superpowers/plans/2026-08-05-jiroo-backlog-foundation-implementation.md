# Jiroo Backlog Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver pull request 1 of the approved Jira-like planning design: a dedicated manually ranked Backlog, nullable story points, multi-selection, and transactional bulk triage, without changing the current Board execution scope.

**Architecture:** Extend the persisted item and saved-view schemas, keep server rendering and URL state authoritative, and add focused client components for ranking and selection. Single-item and bulk mutations remain authenticated Server Actions backed by transactional Drizzle services; clients submit ids and target values, never ranks or actor ids.

**Tech Stack:** Next.js 16.2.7 App Router, React 19.2.4, TypeScript 5, Drizzle ORM 0.45/PostgreSQL, Zod 4, dnd-kit, Vitest/Testing Library, Playwright browser acceptance.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`, `01-app/02-guides/forms.md`, `01-app/03-api-reference/04-functions/revalidatePath.md`, and `01-app/03-api-reference/03-file-conventions/page.md` before changing application code.
- Use test-driven development: every production behavior must first have a focused test that fails for the expected missing behavior.
- Only live `Tâche` items appear as primary Backlog rows and accept story-point estimates.
- `estimatePoints` is nullable; zero is distinct from null; accepted values are `0` through `999.99` with no more than two decimal places.
- Reuse the existing globally unique fractional item `rank`; client payloads contain neighbor ids, never an authoritative rank.
- Bulk mutations accept 1–500 unique item ids and are transactionally all-or-nothing.
- Pull request 1 exposes bulk status, priority, assignee, and estimate only; sprint assignment is added by pull request 2.
- Board, Liste, Arbre, item keys, hierarchy, filters, saved views, activity, permissions, and trash must remain backward-compatible.
- No viewer receives ranking, selection, estimate-edit, or bulk-mutation controls.
- All Server Actions authenticate and authorize before service calls; actor ids come only from the authenticated session.
- All user-visible errors and accessible announcements are French and contain business labels, never internal UUIDs.
- Every browser scenario records console, network, HTTP failures, timings, and explicit screenshots under `/audit`.

---

## File Structure

### New files

- `lib/validation/bulk-item.ts` — validates the discriminated bulk mutation contract.
- `lib/validation/bulk-item.test.ts` — covers ids, limits, uniqueness, and every patch variant.
- `lib/services/item-bulk.ts` — owns the all-or-nothing bulk transaction.
- `lib/services/item-bulk.integration.test.ts` — database invariants and rollback proof.
- `lib/items/selection.ts` — pure selection/range/reconciliation helpers.
- `lib/items/selection.test.ts` — deterministic selection behavior.
- `components/items/item-backlog.tsx` — Backlog sections, rows, totals, and ranking interaction.
- `components/items/item-backlog.test.tsx` — static, writable, viewer, rank, rollback, sort/group behavior.
- `components/items/bulk-item-toolbar.tsx` — count, field menus, confirmation, pending, and errors.
- `components/items/bulk-item-toolbar.test.tsx` — every bulk field and failure behavior.
- `drizzle/0008_jira_backlog_foundation.sql` — generated schema migration.
- `drizzle/meta/0008_snapshot.json` — generated Drizzle snapshot.

### Modified files

- `lib/db/schema/enums.ts` — add `backlog` display mode.
- `lib/db/schema/domain.ts` — add nullable numeric estimate and database check.
- `drizzle/meta/_journal.json` — register migration 0008.
- `lib/validation/item.ts` / `.test.ts` — single-item estimate and backlog-rank payloads.
- `lib/services/items.ts` / `.integration.test.ts` — estimate mutation and validated backlog ranking.
- `app/actions/items.ts` / `.test.ts` — estimate, rank, and bulk Server Actions.
- `components/items/inline-item-field.tsx` / `.test.tsx` — compact estimate editor.
- `components/items/detail/field-editors.tsx` / `.test.tsx` — detail estimate editor.
- `components/items/item-detail-panel.tsx` / `.test.tsx` — Points property for standard work.
- `lib/items/views.ts` / `.test.ts` — Backlog saved-view mode.
- `components/shell/view-bar.tsx` / `.test.tsx` — Backlog tab.
- `components/shell/group-control.tsx` / `.test.tsx` — accept the new display mode without changing Board rules.
- `components/items/backlog-view-content.tsx` — assemble filtered Backlog rows and render the new surface.
- `components/items/item-list.tsx` / `.test.tsx` — Points column, checkboxes, and shared bulk toolbar.
- `audit/README.md`, `audit/bugs.md`, `audit/ux.md`, `audit/benchmark.md`, `audit/roadmap.md` — incremental browser-backed report.

---

### Task 1: Persist story points and the Backlog display mode

**Files:**
- Modify: `lib/db/schema/enums.ts`
- Modify: `lib/db/schema/domain.ts`
- Modify: `lib/validation/item.ts`
- Modify: `lib/validation/item.test.ts`
- Create: `drizzle/0008_jira_backlog_foundation.sql`
- Create: `drizzle/meta/0008_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `estimatePointsSchema: ZodType<number | null>`
- Produces: `items.estimatePoints: number | null`
- Produces: persisted display mode literal `backlog`
- Consumes: existing `updateItemSchema` and Drizzle schema generation.

- [ ] **Step 1: Add failing estimate validation tests**

Add focused cases to `lib/validation/item.test.ts`:

```ts
it("accepts null, zero, integer and decimal story points", () => {
  for (const estimatePoints of [null, 0, 1, 5, 13, 2.5, 999.99]) {
    expect(updateItemSchema.parse({ id: BID, estimatePoints }).estimatePoints).toBe(
      estimatePoints,
    );
  }
});

it("rejects negative, over-precision and oversized story points", () => {
  for (const estimatePoints of [-1, 1.001, 1000, Number.NaN]) {
    expect(updateItemSchema.safeParse({ id: BID, estimatePoints }).success).toBe(false);
  }
});

it("leaves story points untouched when omitted", () => {
  expect(updateItemSchema.parse({ id: BID })).not.toHaveProperty("estimatePoints");
});
```

- [ ] **Step 2: Run the validation test and verify RED**

Run:

```bash
pnpm exec vitest run lib/validation/item.test.ts
```

Expected: the new acceptance test fails because `updateItemSchema` strips the unknown `estimatePoints` field.

- [ ] **Step 3: Implement the estimate schema**

Add to `lib/validation/item.ts`:

```ts
export const estimatePointsSchema = z
  .number({ error: "Estimation invalide." })
  .finite("Estimation invalide.")
  .min(0, "L’estimation doit être positive.")
  .max(999.99, "L’estimation ne peut pas dépasser 999,99 points.")
  .refine((value) => Number.isInteger(value * 100), {
    message: "L’estimation accepte au maximum deux décimales.",
  })
  .nullable();
```

Add `estimatePoints: estimatePointsSchema.optional()` to `updateItemSchema`.

- [ ] **Step 4: Add the database columns and enum value**

In `lib/db/schema/enums.ts`:

```ts
export const displayModeEnum = pgEnum("display_mode", [
  "backlog",
  "board",
  "list",
  "tree",
]);
```

In `lib/db/schema/domain.ts`, import `numeric`, add the column, and add the check:

```ts
estimatePoints: numeric("estimate_points", {
  precision: 5,
  scale: 2,
  mode: "number",
}),
```

```ts
check(
  "items_estimate_points_range",
  sql`${t.estimatePoints} is null or (${t.estimatePoints} >= 0 and ${t.estimatePoints} <= 999.99)`,
),
```

- [ ] **Step 5: Generate and inspect the deterministic migration**

Run:

```bash
pnpm exec drizzle-kit generate --config drizzle.config.ts --name jira_backlog_foundation
```

Expected generated files: `drizzle/0008_jira_backlog_foundation.sql`, `drizzle/meta/0008_snapshot.json`, and an appended `drizzle/meta/_journal.json` entry. Inspect the SQL and require both:

```sql
ALTER TYPE "public"."display_mode" ADD VALUE 'backlog' BEFORE 'board';
ALTER TABLE "items" ADD COLUMN "estimate_points" numeric(5, 2);
```

The generated constraint must match `items_estimate_points_range`.

- [ ] **Step 6: Verify GREEN and migrate the development database**

Run:

```bash
pnpm exec vitest run lib/validation/item.test.ts
pnpm db:migrate
```

Expected: validation passes and migration 0008 applies once without changing existing ranks or rows.

- [ ] **Step 7: Commit the schema foundation**

```bash
git add lib/db/schema/enums.ts lib/db/schema/domain.ts lib/validation/item.ts lib/validation/item.test.ts drizzle/0008_jira_backlog_foundation.sql drizzle/meta/0008_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(items): add nullable story point estimates"
```

---

### Task 2: Support single-item estimate updates everywhere an item is edited

**Files:**
- Modify: `lib/services/items.ts`
- Modify: `lib/services/items.integration.test.ts`
- Modify: `app/actions/items.ts`
- Modify: `app/actions/items.test.ts`
- Modify: `components/items/inline-item-field.tsx`
- Modify: `components/items/inline-item-field.test.tsx`
- Modify: `components/items/detail/field-editors.tsx`
- Modify: `components/items/detail/field-editors.test.tsx`
- Modify: `components/items/item-detail-panel.tsx`
- Modify: `components/items/item-detail-panel.test.tsx`
- Modify: `components/items/item-list.tsx`
- Modify: `components/items/item-list.test.tsx`
- Modify: `components/items/backlog-view-content.tsx`

**Interfaces:**
- Consumes: `UpdateItemInput.estimatePoints?: number | null` from Task 1.
- Produces: `InlineEstimate` and `EstimateField`.
- Produces: item activity with `field="estimate_points"` and stable numeric strings.

- [ ] **Step 1: Write failing service tests for estimate semantics**

Add a `Tâche` fixture to `lib/services/items.integration.test.ts`, then add:

```ts
it("updates and clears a task estimate with readable activity", async () => {
  const fixture = await createTaskFixture();
  try {
    await updateItem({ id: fixture.item.id, estimatePoints: 5 }, fixture.actorId);
    await updateItem({ id: fixture.item.id, estimatePoints: null }, fixture.actorId);

    const [stored] = await db.select().from(items).where(eq(items.id, fixture.item.id));
    expect(stored?.estimatePoints).toBeNull();
    const audit = await db
      .select({ field: activities.field, oldValue: activities.oldValue, newValue: activities.newValue })
      .from(activities)
      .where(eq(activities.itemId, fixture.item.id));
    expect(audit).toEqual([
      { field: "estimate_points", oldValue: null, newValue: "5" },
      { field: "estimate_points", oldValue: "5", newValue: null },
    ]);
  } finally {
    await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
  }
});

it("rejects estimates on structural and subtask items", async () => {
  const fixture = await createUpdateFixture();
  try {
    await expect(
      updateItem({ id: fixture.item.id, estimatePoints: 3 }, fixture.actorId),
    ).rejects.toThrow("Seules les tâches peuvent être estimées.");
  } finally {
    await db.delete(backlogs).where(eq(backlogs.id, fixture.backlogId));
  }
});
```

- [ ] **Step 2: Verify the service RED state**

Run:

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/items.integration.test.ts
```

Expected: estimate assertions fail because `updateItem` does not create an estimate patch or activity.

- [ ] **Step 3: Implement estimate persistence in `updateItem`**

Before building the patch, reject a submitted estimate for any type other than `tache`. Add this field-diff block:

```ts
if (data.estimatePoints !== undefined) {
  if (cur.type !== "tache") throw new Error("Seules les tâches peuvent être estimées.");
  const nextEstimate = data.estimatePoints ?? null;
  if (nextEstimate !== cur.estimatePoints) {
    patch.estimatePoints = nextEstimate;
    acts.push(
      activityRow(
        cur.id,
        actorId,
        "update",
        "estimate_points",
        cur.estimatePoints === null ? null : String(cur.estimatePoints),
        nextEstimate === null ? null : String(nextEstimate),
      ),
    );
  }
}
```

Add `estimatePoints?: number | null` to `UpdateItemActionInput`. Map the domain rejection to `Seules les tâches peuvent être estimées.` and preserve Zod field errors.

- [ ] **Step 4: Add failing compact and detail editor tests**

In `components/items/inline-item-field.test.tsx`:

```tsx
it("distinguishes an unestimated task from zero and sends a decimal estimate", async () => {
  const user = userEvent.setup();
  mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
  render(<InlineEstimate itemId="item-4" backlogKey="DEMO" estimatePoints={null} />);

  await user.click(screen.getByRole("button", { name: "Estimation : Non estimé" }));
  await user.clear(screen.getByRole("spinbutton", { name: "Points" }));
  await user.type(screen.getByRole("spinbutton", { name: "Points" }), "2.5");
  await user.click(screen.getByRole("button", { name: "Enregistrer l’estimation" }));

  expect(mocks.updateItemAction).toHaveBeenCalledWith({
    id: "item-4",
    backlogKey: "DEMO",
    estimatePoints: 2.5,
  });
});
```

In `components/items/detail/field-editors.test.tsx`, render `EstimateField` at zero, clear it, and require `{ estimatePoints: null }`.

- [ ] **Step 5: Verify editor tests fail for missing exports**

Run:

```bash
pnpm exec vitest run components/items/inline-item-field.test.tsx components/items/detail/field-editors.test.tsx
```

Expected: RED because `InlineEstimate` and `EstimateField` do not exist.

- [ ] **Step 6: Implement the estimate editors**

Export `InlineEstimate` from `components/items/inline-item-field.tsx`. Reuse `useInlineUpdate`; show `—`/`Non estimé` for null, `0 pt` for zero, quick actions `1, 2, 3, 5, 8, 13`, a numeric input with `min=0`, `max=999.99`, `step=0.01`, and explicit Save/Clear actions. Pending and error behavior must match the existing inline fields.

Export `EstimateField` from `components/items/detail/field-editors.tsx` using `useOptimisticFieldUpdate`:

```tsx
export function EstimateField(props: {
  itemId: string;
  backlogKey: string;
  estimatePoints: number | null;
}) {
  const field = useOptimisticFieldUpdate({
    value: props.estimatePoints,
    itemId: props.itemId,
    backlogKey: props.backlogKey,
    toPatch: (next) => ({ estimatePoints: next }),
  });
  // Render a labelled number input plus Clear; null renders an empty value, zero renders "0".
}
```

In `item-detail-panel.tsx`, render a `Points` field only when `detail.type === "tache"`; viewers receive text only. In `item-list.tsx`, add `estimatePoints` to `ListItem`, add a `Points` column, render `InlineEstimate` only for `tache`, and update all `colSpan` values. Map `estimatePoints` in `backlog-view-content.tsx`.

- [ ] **Step 7: Verify estimate behavior GREEN**

Run:

```bash
pnpm exec vitest run lib/validation/item.test.ts app/actions/items.test.ts components/items/inline-item-field.test.tsx components/items/detail/field-editors.test.tsx components/items/item-detail-panel.test.tsx components/items/item-list.test.tsx
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/items.integration.test.ts
```

Expected: estimate validation, persistence, activity, permissions, null/zero, and UI tests pass.

- [ ] **Step 8: Commit single-item estimates**

```bash
git add lib/services/items.ts lib/services/items.integration.test.ts app/actions/items.ts app/actions/items.test.ts components/items/inline-item-field.tsx components/items/inline-item-field.test.tsx components/items/detail/field-editors.tsx components/items/detail/field-editors.test.tsx components/items/item-detail-panel.tsx components/items/item-detail-panel.test.tsx components/items/item-list.tsx components/items/item-list.test.tsx components/items/backlog-view-content.tsx
git commit -m "feat(items): edit story points across item views"
```

---

### Task 3: Implement all-or-nothing bulk mutations

**Files:**
- Create: `lib/validation/bulk-item.ts`
- Create: `lib/validation/bulk-item.test.ts`
- Create: `lib/services/item-bulk.ts`
- Create: `lib/services/item-bulk.integration.test.ts`
- Modify: `app/actions/items.ts`
- Modify: `app/actions/items.test.ts`

**Interfaces:**
- Produces:

```ts
export type BulkItemPatch =
  | { field: "statusId"; value: string }
  | { field: "priority"; value: number }
  | { field: "assigneeId"; value: string | null }
  | { field: "estimatePoints"; value: number | null };

export type BulkUpdateItemsInput = {
  backlogId: string;
  itemIds: string[];
  patch: BulkItemPatch;
};

export async function bulkUpdateItems(
  input: unknown,
  actorId: string,
): Promise<{ changedCount: number; unchangedCount: number }>;
```

- Produces `bulkUpdateItemsAction({ backlogKey, backlogId, itemIds, patch })`.

- [ ] **Step 1: Write failing Zod contract tests**

Create `lib/validation/bulk-item.test.ts` with cases for all four patches and these failures: empty ids, 501 ids, duplicate ids, invalid UUID, invalid priority, invalid status UUID, negative/over-precision estimate, and missing field/value.

```ts
it("accepts each supported patch", () => {
  for (const patch of [
    { field: "statusId", value: STATUS_ID },
    { field: "priority", value: 4 },
    { field: "assigneeId", value: null },
    { field: "estimatePoints", value: 5 },
    { field: "estimatePoints", value: null },
  ]) {
    expect(bulkUpdateItemsSchema.safeParse({ backlogId: BACKLOG_ID, itemIds: [ITEM_ID], patch }).success).toBe(true);
  }
});
```

- [ ] **Step 2: Verify validation RED**

Run:

```bash
pnpm exec vitest run lib/validation/bulk-item.test.ts
```

Expected: module-not-found failure because the bulk contract has not been created.

- [ ] **Step 3: Implement the discriminated schema**

Create `lib/validation/bulk-item.ts`:

```ts
import { z } from "zod";
import { estimatePointsSchema } from "@/lib/validation/item";

const itemIds = z
  .array(z.uuid("Item invalide."))
  .min(1, "Sélectionnez au moins un item.")
  .max(500, "Une action groupée est limitée à 500 items.")
  .refine((ids) => new Set(ids).size === ids.length, "La sélection contient des doublons.");

export const bulkItemPatchSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("statusId"), value: z.uuid("Statut invalide.") }),
  z.object({ field: z.literal("priority"), value: z.number().int().min(0).max(4) }),
  z.object({ field: z.literal("assigneeId"), value: z.string().min(1).nullable() }),
  z.object({ field: z.literal("estimatePoints"), value: estimatePointsSchema }),
]);

export const bulkUpdateItemsSchema = z.object({
  backlogId: z.uuid("Backlog invalide."),
  itemIds,
  patch: bulkItemPatchSchema,
});

export type BulkItemPatch = z.infer<typeof bulkItemPatchSchema>;
export type BulkUpdateItemsInput = z.infer<typeof bulkUpdateItemsSchema>;
```

- [ ] **Step 4: Write failing integration tests for transaction semantics**

Create `lib/services/item-bulk.integration.test.ts`. Build one backlog with two tasks, another backlog with one task, todo/done statuses, and two users. Cover:

```ts
it("updates two priorities and writes one activity per changed item", async () => {
  const result = await bulkUpdateItems(
    { backlogId, itemIds: [taskA.id, taskB.id], patch: { field: "priority", value: 4 } },
    actorId,
  );
  expect(result).toEqual({ changedCount: 2, unchangedCount: 0 });
  expect(await priorities(taskA.id, taskB.id)).toEqual([4, 4]);
  expect(await activityFields(taskA.id, taskB.id)).toEqual(["priority", "priority"]);
});

it("rolls back every item when one selected id belongs to another backlog", async () => {
  await expect(
    bulkUpdateItems(
      { backlogId, itemIds: [taskA.id, foreignTask.id], patch: { field: "priority", value: 4 } },
      actorId,
    ),
  ).rejects.toThrow("Tous les items doivent appartenir au backlog.");
  expect(await priorities(taskA.id, foreignTask.id)).toEqual([0, 0]);
});
```

Also prove: deleted/missing id rollback, no-op count, status updates `closedAt`, foreign status rejection, missing assignee rejection, estimate rejection when any selected item is not `tache`, null estimate, and stable activity values.

- [ ] **Step 5: Verify service RED**

Run:

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/item-bulk.integration.test.ts
```

Expected: module-not-found failure for `bulkUpdateItems`.

- [ ] **Step 6: Implement the transaction**

Create `lib/services/item-bulk.ts`. The function must:

1. parse with `bulkUpdateItemsSchema`;
2. lock the submitted backlog row `FOR UPDATE`;
3. select every live submitted item ordered by id `FOR UPDATE`;
4. require an exact count match and one backlog id;
5. validate the patch target once;
6. compute per-item patch/activity and skip no-ops;
7. update each changed row and insert its activity inside the same transaction;
8. return changed and unchanged counts.

Use these exact field rules:

```ts
switch (data.patch.field) {
  case "priority":
    // Set integer priority and activity field "priority".
    break;
  case "assigneeId":
    // Validate user once; set null or id; activity field "assignee".
    break;
  case "estimatePoints":
    // Reject the whole transaction unless every row is type "tache";
    // use field "estimate_points" and preserve null versus "0".
    break;
  case "statusId":
    // Validate the destination status belongs to the backlog;
    // load current status categories; update closedAt on category boundary;
    // activity action "status_change", field "status".
    break;
}
```

No update statement runs for a no-op row. Every changed row receives one `updatedAt` value captured once for the operation.

- [ ] **Step 7: Add the authenticated Server Action and tests**

Extend `app/actions/items.test.ts` mocks with `bulkUpdateItems`. Add tests proving contributor success, viewer rejection before the mock is called, exact service input, one `revalidatePath("/b/DEMO")`, Zod error mapping, and safe domain errors.

Add to `app/actions/items.ts`:

```ts
export async function bulkUpdateItemsAction(input: {
  backlogKey: string;
  backlogId: string;
  itemIds: string[];
  patch: BulkItemPatch;
}) {
  const actorId = await requireWriter();
  const { backlogKey, ...serviceInput } = input;
  try {
    const result = await bulkUpdateItems(serviceInput, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, ...result };
  } catch (error) {
    const validationError = mapZodActionError(error);
    if (validationError) return { ok: false as const, ...validationError };
    return { ok: false as const, error: mapBulkError(error) };
  }
}
```

`mapBulkError` must preserve the specific French domain messages defined by the spec and collapse unknown errors to `Modification groupée impossible.`

- [ ] **Step 8: Verify bulk GREEN**

Run:

```bash
pnpm exec vitest run lib/validation/bulk-item.test.ts app/actions/items.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/item-bulk.integration.test.ts
```

Expected: contract, authorization, rollback, status, assignee, estimate, no-op, and activity cases pass.

- [ ] **Step 9: Commit the bulk domain**

```bash
git add lib/validation/bulk-item.ts lib/validation/bulk-item.test.ts lib/services/item-bulk.ts lib/services/item-bulk.integration.test.ts app/actions/items.ts app/actions/items.test.ts
git commit -m "feat(items): add transactional bulk triage"
```

---

### Task 4: Add the saved and shareable Backlog display mode

**Files:**
- Modify: `lib/items/views.ts`
- Modify: `lib/items/views.test.ts`
- Modify: `components/shell/view-bar.tsx`
- Modify: `components/shell/view-bar.test.tsx`
- Modify: `components/shell/group-control.tsx`
- Modify: `components/shell/group-control.test.tsx`
- Create: `components/items/item-backlog.tsx`
- Create: `components/items/item-backlog.test.tsx`
- Modify: `components/items/backlog-view-content.tsx`

**Interfaces:**
- Produces: `DisplayMode = "backlog" | "board" | "list" | "tree"`.
- Produces:

```ts
export type BacklogItem = {
  id: string;
  key: string;
  title: string;
  type: "tache";
  kind: ItemKind;
  statusId: string;
  priority: number;
  estimatePoints: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
  rank: string;
  blocked: boolean;
};
```

- [ ] **Step 1: Write failing saved-view tests**

In `lib/items/views.test.ts`, add tests that `viewStateToColumns` stores `backlog`, `columnsToViewState` restores it, `createViewInput` and `updateViewStateInput` accept it, and unknown modes still fall back to `board`.

In `components/shell/view-bar.test.tsx`, require a `Backlog` link whose click preserves unrelated URL state and writes `view=backlog`.

- [ ] **Step 2: Verify display-mode RED**

Run:

```bash
pnpm exec vitest run lib/items/views.test.ts components/shell/view-bar.test.tsx
```

Expected: tests fail because `backlog` is not in `DisplayMode`, the Zod enum, or the tabs.

- [ ] **Step 3: Extend display-mode plumbing**

Update every display-mode literal in `lib/items/views.ts` to:

```ts
export type DisplayMode = "backlog" | "board" | "list" | "tree";
const DISPLAY_MODES = ["backlog", "board", "list", "tree"] as const;
const displayModeSchema = z.enum(DISPLAY_MODES);
```

Add `['backlog', 'Backlog']` as the first `ViewBar` tab. Update `GroupControl` types so Backlog can display the existing group selector; do not change the Board exclusion of status grouping.

- [ ] **Step 4: Write failing static Backlog component tests**

Create `components/items/item-backlog.test.tsx` with three tasks and require:

- a `Backlog` heading;
- `3 items`, `8 points`, `1 non estimé`;
- rows ordered by supplied rank;
- status, priority, estimate, and assignee labels;
- no completed/structural rows in the supplied contract;
- viewer rows without edit or drag controls;
- empty backlog versus empty filtered-result states.

```tsx
expect(screen.getByRole("heading", { name: "Backlog" })).toBeVisible();
expect(screen.getByText("8 points")).toBeVisible();
expect(screen.getByText("1 non estimé")).toBeVisible();
expect(screen.getAllByRole("row").slice(1).map((row) => row.getAttribute("aria-label"))).toEqual([
  "DEMO-1 — Authentification",
  "DEMO-2 — Session",
  "DEMO-3 — Déconnexion",
]);
```

- [ ] **Step 5: Verify static component RED**

Run:

```bash
pnpm exec vitest run components/items/item-backlog.test.tsx
```

Expected: module-not-found failure for `ItemBacklog`.

- [ ] **Step 6: Implement and render the static Backlog**

Create `ItemBacklog` as a semantic table/list with the approved compact row fields and totals. It receives already filtered and ordered standard items; it does not query data.

In `backlog-view-content.tsx`:

```ts
const VIEWS = ["backlog", "board", "list", "tree"] as const;

const backlogRows = filterRows
  .filter((item) => {
    const category = statusRows.find((status) => status.id === item.statusId)?.category;
    return item.type === "tache" && category !== "done" && isMatch(item.id);
  });
const backlogSorted = viewState.sort
  ? sortItems(backlogRows, viewState.sort)
  : [...backlogRows].sort((a, b) => a.rank.localeCompare(b.rank));
const backlogGroups = viewState.group
  ? groupItems(backlogSorted, viewState.group)
  : [["", backlogSorted] as [string, typeof backlogSorted]];
```

Render `ItemBacklog` only for `view === "backlog"`, map labels/users/statuses, and pass empty-state props. Keep Board inputs unchanged.

- [ ] **Step 7: Verify display mode GREEN**

Run:

```bash
pnpm exec vitest run lib/items/views.test.ts components/shell/view-bar.test.tsx components/shell/group-control.test.tsx components/items/item-backlog.test.tsx
pnpm typecheck
```

Expected: Backlog can be selected, saved, restored, rendered, and typechecked.

- [ ] **Step 8: Commit the Backlog surface**

```bash
git add lib/items/views.ts lib/items/views.test.ts components/shell/view-bar.tsx components/shell/view-bar.test.tsx components/shell/group-control.tsx components/shell/group-control.test.tsx components/items/item-backlog.tsx components/items/item-backlog.test.tsx components/items/backlog-view-content.tsx
git commit -m "feat(backlog): add dedicated planning view"
```

---

### Task 5: Enable safe mouse and keyboard backlog ranking

**Files:**
- Modify: `lib/validation/item.ts`
- Modify: `lib/validation/item.test.ts`
- Modify: `lib/services/items.ts`
- Modify: `lib/services/items.integration.test.ts`
- Modify: `app/actions/items.ts`
- Modify: `app/actions/items.test.ts`
- Modify: `components/items/item-backlog.tsx`
- Modify: `components/items/item-backlog.test.tsx`

**Interfaces:**
- Produces:

```ts
export type RankBacklogItemInput = {
  id: string;
  backlogId: string;
  beforeId: string | null;
  afterId: string | null;
};

export async function rankBacklogItem(input: unknown, actorId: string): Promise<ItemRow | null>;
```

- Produces `rankBacklogItemAction({ backlogKey, backlogId, id, beforeId, afterId })`.

- [ ] **Step 1: Add failing rank validation and service tests**

Add schema tests for valid null bounds, equal-neighbor rejection, and self-neighbor rejection. Add integration cases proving:

- a task moves between two task neighbors and persists after a fresh `listItems` read;
- a component or subtask cannot be ranked through the Backlog API;
- a foreign, deleted, or structural neighbor rejects without changing rank;
- inverted/concurrent neighbor changes use the existing retry and server-derived gap;
- activity action is `move`, field is `rank`.

```ts
await rankBacklogItem(
  { backlogId, id: taskC.id, beforeId: taskA.id, afterId: taskB.id },
  actorId,
);
expect((await listItems(backlogId)).filter((item) => item.type === "tache").map((item) => item.id)).toEqual([
  taskA.id,
  taskC.id,
  taskB.id,
]);
```

- [ ] **Step 2: Verify rank RED**

Run:

```bash
pnpm exec vitest run lib/validation/item.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/items.integration.test.ts
```

Expected: failures because the Backlog-specific schema/service do not exist.

- [ ] **Step 3: Implement the server-authoritative rank mutation**

Add `rankBacklogItemSchema` to `lib/validation/item.ts`. Implement `rankBacklogItem` in `lib/services/items.ts` using `withRetry` and one transaction:

1. lock the submitted backlog;
2. lock the live moved row and require `type === "tache"` and matching backlog;
3. load each submitted neighbor and require live `tache`, same backlog, and not the moved id;
4. call existing `rankAtDrop` with validated ids;
5. update only when rank changes;
6. write the existing rank activity.

The action authenticates with `requireWriter`, maps known failures, revalidates `/b/:key`, and returns only the updated row needed for optimistic reconciliation.

- [ ] **Step 4: Add failing ranking interaction tests**

Extend `item-backlog.test.tsx` to prove:

- writable rows have labelled `Déplacer DEMO-1` handles;
- keyboard Space → ArrowDown → Space calls the action with task neighbors;
- Escape restores the original order and sends no request;
- a deferred action blocks a second drop;
- rejection restores the original order, keeps focus, and announces `Classement impossible.`;
- any explicit sort or group hides/disables handles and shows `Effacez le tri ou le groupement pour modifier l’ordre manuel.`;
- viewer has zero handles.

- [ ] **Step 5: Verify interaction RED**

Run:

```bash
pnpm exec vitest run components/items/item-backlog.test.tsx app/actions/items.test.ts
```

Expected: no handles and no rank action call.

- [ ] **Step 6: Implement dnd-kit ranking**

Use `DndContext`, pointer and keyboard sensors, `SortableContext`, and `verticalListSortingStrategy`. Keep an immutable pre-drag snapshot, derive `beforeId` and `afterId` from the optimistic visible order, and announce keys/titles/positions in French. Pass the action as a prop for component tests:

```ts
rankItemAction: (input: {
  backlogKey: string;
  backlogId: string;
  id: string;
  beforeId: string | null;
  afterId: string | null;
}) => Promise<{ ok: true; item: BacklogItem } | { ok: false; error: string }>;
```

When `manualOrder` is false, do not initialize sortable behavior. On success,
refresh server data; on failure or cancel, restore the snapshot exactly.

- [ ] **Step 7: Verify ranking GREEN**

Run:

```bash
pnpm exec vitest run lib/validation/item.test.ts app/actions/items.test.ts components/items/item-backlog.test.tsx
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/items.integration.test.ts
```

Expected: service and interaction matrices pass.

- [ ] **Step 8: Commit manual ranking**

```bash
git add lib/validation/item.ts lib/validation/item.test.ts lib/services/items.ts lib/services/items.integration.test.ts app/actions/items.ts app/actions/items.test.ts components/items/item-backlog.tsx components/items/item-backlog.test.tsx
git commit -m "feat(backlog): rank work with mouse and keyboard"
```

---

### Task 6: Add selection and the shared bulk toolbar

**Files:**
- Create: `lib/items/selection.ts`
- Create: `lib/items/selection.test.ts`
- Create: `components/items/bulk-item-toolbar.tsx`
- Create: `components/items/bulk-item-toolbar.test.tsx`
- Modify: `components/items/item-backlog.tsx`
- Modify: `components/items/item-backlog.test.tsx`
- Modify: `components/items/item-list.tsx`
- Modify: `components/items/item-list.test.tsx`
- Modify: `components/items/backlog-view-content.tsx`

**Interfaces:**
- Produces:

```ts
export type SelectionState = {
  selectedIds: ReadonlySet<string>;
  anchorId: string | null;
};

export function toggleItemSelection(
  state: SelectionState,
  visibleIds: string[],
  id: string,
  extendRange: boolean,
): SelectionState;

export function selectAllVisible(visibleIds: string[]): SelectionState;
export function reconcileSelection(state: SelectionState, visibleIds: string[]): SelectionState;
```

- Consumes: `bulkUpdateItemsAction` from Task 3.

- [ ] **Step 1: Write failing pure selection tests**

Create `lib/items/selection.test.ts` and prove toggle, deselect, forward/reverse Shift range, replacement of an old range from the stable anchor, select all, clear, and reconciliation after filters remove rows.

```ts
it("selects the visible range from the last anchor", () => {
  const anchored = toggleItemSelection(emptySelection(), ids, "b", false);
  const ranged = toggleItemSelection(anchored, ids, "d", true);
  expect([...ranged.selectedIds]).toEqual(["b", "c", "d"]);
  expect(ranged.anchorId).toBe("b");
});
```

- [ ] **Step 2: Verify selection RED**

Run:

```bash
pnpm exec vitest run lib/items/selection.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement immutable selection helpers**

Implement the exact interfaces above. Never mutate an incoming Set. A missing
range anchor degrades to a normal toggle. `reconcileSelection` removes hidden
ids and clears the anchor if it is no longer visible.

- [ ] **Step 4: Write failing toolbar tests**

Create `components/items/bulk-item-toolbar.test.tsx`. Mock the action and prove:

- `2 items sélectionnés` is announced;
- status, priority, assignee, and estimate send the exact discriminated patch;
- clear estimate sends null while zero sends 0;
- estimate is disabled with an explanation when any selected type is not `tache`;
- pending disables every action;
- success announces `2 items modifiés` and reports unchanged count;
- failure preserves selection and shows the French error;
- clear selection calls its callback without a mutation.

```tsx
expect(mocks.bulkUpdateItemsAction).toHaveBeenCalledWith({
  backlogKey: "DEMO",
  backlogId: BACKLOG_ID,
  itemIds: [ITEM_A, ITEM_B],
  patch: { field: "priority", value: 3 },
});
```

- [ ] **Step 5: Verify toolbar RED**

Run:

```bash
pnpm exec vitest run components/items/bulk-item-toolbar.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 6: Implement the toolbar**

Create a sticky `BulkItemToolbar` with Radix dropdowns, an accessible count,
pending status, inline alert, and explicit clear control. Props:

```ts
type BulkItemToolbarProps = {
  backlogId: string;
  backlogKey: string;
  selectedItems: Array<{ id: string; type: ItemType }>;
  statuses: StatusOption[];
  users: UserOption[];
  onClearSelection: () => void;
  onMutationSuccess: (result: { changedCount: number; unchangedCount: number }) => void;
};
```

Call `bulkUpdateItemsAction` inside `startTransition`. Sort ids before sending for
deterministic tests and logs. Keep the selection on failure.

- [ ] **Step 7: Add failing Backlog and Liste selection interaction tests**

Extend both component suites to prove hover/focus checkboxes, individual click,
Shift range, header select-all, header indeterminate state, guarded
`Cmd/Ctrl+A`, Escape clear, selection reset on unmount/view change, viewer
absence, inline editor click isolation, and filtered-result reconciliation.

For Liste, verify checkboxes do not open item detail and add the new `Points`
column to the semantic header assertion.

- [ ] **Step 8: Verify integration RED**

Run:

```bash
pnpm exec vitest run components/items/item-backlog.test.tsx components/items/item-list.test.tsx
```

Expected: selection controls and toolbar are missing.

- [ ] **Step 9: Integrate selection and bulk actions**

Use one local selection state per view component and the pure helpers. Render a
header checkbox and one row checkbox only when `canWrite`. Stop propagation on
checkbox pointer/click events. Pass selected item types to the toolbar.

In `backlog-view-content.tsx`, pass `backlogId`, statuses, users, and
`bulkUpdateItemsAction` dependencies to Backlog and Liste. Reconcile selection
after the server-provided visible id list changes. Do not share selection across
display modes.

- [ ] **Step 10: Verify selection and bulk GREEN**

Run:

```bash
pnpm exec vitest run lib/items/selection.test.ts components/items/bulk-item-toolbar.test.tsx components/items/item-backlog.test.tsx components/items/item-list.test.tsx
pnpm typecheck
```

Expected: complete selection matrix and every toolbar command pass.

- [ ] **Step 11: Commit bulk interaction**

```bash
git add lib/items/selection.ts lib/items/selection.test.ts components/items/bulk-item-toolbar.tsx components/items/bulk-item-toolbar.test.tsx components/items/item-backlog.tsx components/items/item-backlog.test.tsx components/items/item-list.tsx components/items/item-list.test.tsx components/items/backlog-view-content.tsx
git commit -m "feat(backlog): select and bulk edit work"
```

---

### Task 7: Browser acceptance, regression, and audit evidence

**Files:**
- Modify: `audit/README.md`
- Modify: `audit/bugs.md`
- Modify: `audit/ux.md`
- Modify: `audit/benchmark.md`
- Modify: `audit/roadmap.md`
- Create: `audit/console/2026-08-05-session-06-backlog-foundation-console.log`
- Create: `audit/network/2026-08-05-session-06-backlog-foundation-requests.log`
- Create: `audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-backlog-ranked.png`
- Create: `audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-bulk-edit.png`
- Create: `audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-story-points.png`

**Interfaces:**
- Consumes: all PR1 behavior.
- Produces: browser-backed partial remediation evidence; `BUG-JIR-015` stays open until PR2.

- [ ] **Step 1: Run focused and complete automated verification**

Run:

```bash
pnpm exec vitest run lib/validation/item.test.ts lib/validation/bulk-item.test.ts lib/items/selection.test.ts app/actions/items.test.ts components/items/inline-item-field.test.tsx components/items/detail/field-editors.test.tsx components/items/item-detail-panel.test.tsx components/items/item-list.test.tsx components/items/item-backlog.test.tsx components/items/bulk-item-toolbar.test.tsx lib/items/views.test.ts components/shell/view-bar.test.tsx components/shell/group-control.test.tsx
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/items.integration.test.ts lib/services/item-bulk.integration.test.ts
pnpm test
pnpm typecheck
pnpm lint
git diff --check
pnpm build
```

Expected: every command exits zero. If the environment blocks DB or the default
Turbopack build, record the exact environmental error and rerun the previously
approved local alternative; never relabel an environmental skip as a pass.

- [ ] **Step 2: Execute the nominal Playwright lifecycle in Chromium**

Using only Playwright against `http://localhost:3000`:

1. open `CASS` as administrator and select Backlog;
2. confirm only live `Tâche` rows appear and totals match visible data;
3. drag `CASS-58` between two tasks, reload, and confirm the same order;
4. move it back with the keyboard, reload, and confirm restoration;
5. set its estimate to `5`, then `0`, then clear it, verifying null/zero copy;
6. select two adjacent rows with Shift;
7. bulk-change priority, status, assignee, and estimate, checking exact counts;
8. restore every changed audit value;
9. apply a sort and confirm ranking is disabled with the explanation;
10. reload the URL and confirm Backlog display mode persists.

Capture timings for rank, estimate, and bulk POST responses and inspect response
bodies for safe result shapes.

- [ ] **Step 3: Break rollback and permission paths with Playwright**

Intercept one rank POST and one bulk POST separately, force a network failure,
and prove exact visual rollback plus retained selection. Then use the real Audit
Workflow Lecteur account and prove:

- Backlog is readable;
- 0 drag handles;
- 0 checkboxes;
- no estimate editor;
- no bulk toolbar;
- no mutation request;
- 0 unexpected console errors or HTTP failures.

- [ ] **Step 4: Save clean browser evidence**

Save the complete final console and non-static network logs to the exact files
listed above. Take the three explicit screenshots only after the clean nominal
state is restored. A screenshot containing credentials, TOTP secrets, or tokens
must never enter Git.

- [ ] **Step 5: Update the incremental audit**

Record:

- PR1 tested scope and exact browser data;
- rank, selection, bulk, estimates, permission, performance, console, and
  network verdicts;
- any newly discovered bug with a unique id and full reproduction template;
- `BUG-JIR-015` as **partially corrected**, explicitly still open because
  sprints, active Board filtering, commitment, velocity, and completion are PR2;
- remaining audit scope and the next three priorities;
- the future repository/PR integration note unchanged.

- [ ] **Step 6: Commit acceptance evidence**

```bash
git add audit/README.md audit/bugs.md audit/ux.md audit/benchmark.md audit/roadmap.md audit/console/2026-08-05-session-06-backlog-foundation-console.log audit/network/2026-08-05-session-06-backlog-foundation-requests.log audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-backlog-ranked.png audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-bulk-edit.png audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-story-points.png
git commit -m "docs(audit): verify backlog planning foundation"
```

- [ ] **Step 7: Run the final pre-PR gate**

Run fresh after the audit commit:

```bash
pnpm test
pnpm typecheck
pnpm lint
git diff --check
pnpm build
git status --short
```

Expected: all verification commands exit zero and the feature branch is clean.
Only then use `superpowers:requesting-code-review`, address findings with
`superpowers:receiving-code-review`, and use
`superpowers:finishing-a-development-branch` to create pull request 1.

---

## Plan Self-Review Result

- Spec coverage: every pull request 1 requirement maps to Tasks 1–7; sprint
  assignment and lifecycle are deliberately reserved for pull request 2.
- Type consistency: `estimatePoints`, `BulkItemPatch`, `BacklogItem`,
  `RankBacklogItemInput`, and action payload names are identical across tasks.
- Security: every new mutation has explicit authentication, authorization,
  backlog ownership, foreign/deleted-row, and concurrency checks.
- Browser proof: rank, estimates, each bulk field, rollback, viewer, reload,
  console, network, timing, and screenshots are all required before PR creation.
