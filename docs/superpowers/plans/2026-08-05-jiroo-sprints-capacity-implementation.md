# Jiroo Sprints and Capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver PR2 of the Jira-like planning workflow: future sprints, visible capacity, historical membership, one active-sprint Board, and transactional completion with global carry-over.

**Architecture:** Add `sprints` and historical `sprint_items` tables, keep all lifecycle rules in transactional Drizzle services, and expose authenticated Server Actions with small serialized results. Server-rendered planning data remains authoritative; focused client components add Jira-inspired compact sections, contextual dialogs, cross-section planning, and exact optimistic rollback.

**Tech Stack:** Next.js 16.2.7 App Router, React 19.2.4, TypeScript 5, Drizzle ORM 0.45/PostgreSQL, Zod 4, fractional-indexing, dnd-kit, Vitest/Testing Library, Playwright Chromium.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-05-jiroo-sprints-capacity-design.md` exactly.
- Read the local Next.js 16.2.7 guides `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`, `01-app/02-guides/forms.md`, `01-app/03-api-reference/04-functions/revalidatePath.md`, and `01-app/03-api-reference/03-file-conventions/page.md` before application changes.
- Use TDD for every production behavior: add one focused failing test, run it and confirm the expected failure, then write the minimum implementation.
- Verify Jira-parity decisions against current official Atlassian documentation; record intentional Jiroo differences in `audit/benchmark.md`.
- Only live `tache` items may have current sprint membership. Structural items and subtasks never receive membership rows.
- Allow multiple planned sprints but at most one active sprint per backlog; parallel sprints are not part of V1.
- Preserve historical sprint memberships when work is removed, completed, or carried forward.
- Keep item `rank` as the single cross-section work ordering authority.
- Capacity is nullable and advisory; accepted numeric values are `0` through `999.99` with at most two decimals.
- Bulk sprint assignment accepts 1–500 unique item IDs and is transactionally all-or-nothing.
- Admins and contributors may manage sprints; viewers are read-only.
- Every Server Action authenticates and authorizes before the service call; actor IDs, totals, lifecycle state, and outcomes never come from client payloads.
- All user-visible errors and accessible announcements are French and use business keys/names, never UUIDs.
- The Board shows only the active sprint. With no active sprint, it shows a Backlog CTA and never all unscheduled tasks.
- Every Playwright scenario observes console, page errors, failed requests, HTTP errors, timings, and named screenshots under `/audit`.

---

## File Structure

### New files

- `lib/validation/sprint.ts` — all planning and lifecycle input schemas.
- `lib/validation/sprint.test.ts` — dates, capacity, destination, and item-list validation.
- `lib/items/sprint-planning.ts` — pure sectioning and aggregate calculations.
- `lib/items/sprint-planning.test.ts` — deterministic planning and capacity semantics.
- `lib/services/sprint-membership.ts` — transaction-scoped membership primitive shared without circular service imports.
- `lib/services/sprints.ts` — sprint queries, planning mutations, and sprint/item ranking.
- `lib/services/sprints.integration.test.ts` — planning transactions, history, ownership, and rollback.
- `lib/services/sprint-lifecycle.ts` — start and complete transactions.
- `lib/services/sprint-lifecycle.integration.test.ts` — active-sprint uniqueness, snapshots, carry-over, and subtask guards.
- `app/actions/sprints.ts` — authenticated sprint Server Actions and safe error mapping.
- `app/actions/sprints.test.ts` — auth-first behavior, service contracts, revalidation, and safe errors.
- `components/sprints/sprint-section-header.tsx` — collapsible Jira-inspired section summary and actions.
- `components/sprints/sprint-section-header.test.tsx` — summaries, accessibility, reader controls, and collapse.
- `components/sprints/sprint-form-dialog.tsx` — create/edit name, goal, dates, and capacity.
- `components/sprints/sprint-form-dialog.test.tsx` — validation, pending, server errors, and retained input.
- `components/sprints/sprint-lifecycle-dialogs.tsx` — start and completion confirmation flows.
- `components/sprints/sprint-lifecycle-dialogs.test.tsx` — warnings, destinations, blockers, and navigation.
- `e2e/sprint-lifecycle.spec.ts` — complete browser acceptance and audit evidence.
- `drizzle/0009_jira_sprints.sql` — generated sprint schema migration.
- `drizzle/meta/0009_snapshot.json` — generated Drizzle snapshot.

### Modified files

- `lib/db/schema/enums.ts` — sprint state and membership outcome enums.
- `lib/db/schema/domain.ts` — sprint and sprint membership tables and constraints.
- `drizzle/meta/_journal.json` — migration 0009 entry.
- `lib/validation/item.ts` / `.test.ts` — optional contextual `sprintId` during task creation.
- `lib/services/items.ts` / `.integration.test.ts` — create a task and its sprint membership atomically.
- `app/actions/items.ts` / `.test.ts` — forward authenticated contextual sprint creation.
- `lib/validation/bulk-item.ts` / `.test.ts` — add `sprintId` to the bulk field contract.
- `lib/services/item-bulk.ts` / `.integration.test.ts` — delegate sprint field changes to the membership primitive in the same transaction.
- `components/items/bulk-item-toolbar.tsx` / `.test.tsx` — Sprint dropdown including Backlog.
- `components/items/item-backlog.tsx` / `.test.tsx` — compact sprint sections, cross-section drag, selection reconciliation, and contextual creation.
- `components/items/new-item-dialog.tsx` / `.test.tsx` — optional contextual sprint assignment.
- `components/items/item-board.tsx` / `.test.tsx` — active sprint header and no-active empty state.
- `components/items/backlog-view-content.tsx` — load sprint planning snapshot, section Backlog rows, and filter Board cards.
- `e2e/global.setup.ts` — deterministic sprint-safe audit fixtures when required.
- `audit/README.md`, `audit/bugs.md`, `audit/ux.md`, `audit/benchmark.md`, `audit/roadmap.md` — incremental browser-backed audit update.

---

### Task 1: Persist and validate sprint history

**Files:**
- Modify: `lib/db/schema/enums.ts`
- Modify: `lib/db/schema/domain.ts`
- Create: `lib/validation/sprint.ts`
- Create: `lib/validation/sprint.test.ts`
- Create: `drizzle/0009_jira_sprints.sql`
- Create: `drizzle/meta/0009_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `sprints`, `sprintItems`, `sprintStateEnum`, `sprintOutcomeEnum`.
- Produces: `createSprintSchema`, `updateSprintSchema`, `reorderSprintSchema`, `assignSprintItemsSchema`, `moveSprintItemSchema`, `startSprintSchema`, and `completeSprintSchema`.
- Consumes: existing `backlogs`, `items`, `user`, and fractional string ranks.

- [ ] **Step 1: Write failing validation tests**

Create `lib/validation/sprint.test.ts` with these behavior cases:

```ts
import { describe, expect, it } from "vitest";
import {
  assignSprintItemsSchema,
  completeSprintSchema,
  startSprintSchema,
  updateSprintSchema,
} from "@/lib/validation/sprint";

const backlogId = "11111111-1111-4111-8111-111111111111";
const sprintId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";

describe("sprint validation", () => {
  it("accepts nullable, zero, and decimal capacity", () => {
    for (const capacityPoints of [null, 0, 13, 21.5, 999.99]) {
      expect(updateSprintSchema.parse({ id: sprintId, backlogId, capacityPoints }))
        .toMatchObject({ capacityPoints });
    }
  });

  it("rejects invalid capacity and inverted actual dates", () => {
    for (const capacityPoints of [-1, 1.001, 1000]) {
      expect(updateSprintSchema.safeParse({ id: sprintId, backlogId, capacityPoints }).success)
        .toBe(false);
    }
    expect(startSprintSchema.safeParse({
      id: sprintId,
      backlogId,
      name: "Sprint 1",
      startAt: "2026-08-12T09:00:00.000Z",
      endAt: "2026-08-12T08:00:00.000Z",
      goal: null,
      capacityPoints: 20,
    }).success).toBe(false);
  });

  it("requires unique task ids and one explicit completion destination", () => {
    expect(assignSprintItemsSchema.safeParse({
      backlogId,
      sprintId,
      itemIds: [itemId, itemId],
    }).success).toBe(false);
    expect(completeSprintSchema.parse({
      id: sprintId,
      backlogId,
      destination: { type: "backlog" },
    }).destination).toEqual({ type: "backlog" });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec vitest run lib/validation/sprint.test.ts
```

Expected: FAIL because `@/lib/validation/sprint` does not exist.

- [ ] **Step 3: Implement the validation contracts**

Create `lib/validation/sprint.ts` around these exact public types:

```ts
import { z } from "zod";

const id = z.uuid("Identifiant invalide.");
const itemIds = z.array(id).min(1).max(500).refine(
  (values) => new Set(values).size === values.length,
  "La sélection contient des doublons.",
);

export const capacityPointsSchema = z.number().finite().min(0).max(999.99)
  .refine((value) => Number.isInteger(value * 100), {
    message: "La capacité accepte au maximum deux décimales.",
  }).nullable();

export const createSprintSchema = z.object({ backlogId: id });
export const updateSprintSchema = z.object({
  id,
  backlogId: id,
  name: z.string().trim().min(1).max(120).optional(),
  goal: z.string().trim().max(2000).nullable().optional(),
  plannedStartAt: z.string().datetime({ offset: true }).nullable().optional(),
  plannedEndAt: z.string().datetime({ offset: true }).nullable().optional(),
  capacityPoints: capacityPointsSchema.optional(),
}).superRefine(validatePlannedDateOrder);

export const assignSprintItemsSchema = z.object({
  backlogId: id,
  itemIds,
  sprintId: id.nullable(),
});

export const moveSprintItemSchema = z.object({
  backlogId: id,
  itemId: id,
  sprintId: id.nullable(),
  beforeId: id.nullable(),
  afterId: id.nullable(),
});
```

Define `reorderSprintSchema` with `beforeId` and `afterId`, `startSprintSchema`
with ISO actual dates, and a discriminated completion destination supporting
`backlog`, `existing_sprint`, and `new_sprint`. The date refinements must attach
the French end-date error to `plannedEndAt` or `endAt`.

- [ ] **Step 4: Add sprint enums and tables**

Add to `lib/db/schema/enums.ts`:

```ts
export const sprintStateEnum = pgEnum("sprint_state", [
  "planned",
  "active",
  "completed",
]);
export const sprintOutcomeEnum = pgEnum("sprint_outcome", [
  "completed",
  "removed",
  "carried_to_backlog",
  "carried_to_sprint",
]);
```

Add `sprints` and `sprintItems` to `lib/db/schema/domain.ts`. Required indexes
and checks are:

```ts
uniqueIndex("sprints_backlog_rank_idx").on(t.backlogId, t.rank),
uniqueIndex("sprints_backlog_name_idx").on(t.backlogId, sql`lower(${t.name})`),
uniqueIndex("sprints_one_active_per_backlog_idx")
  .on(t.backlogId)
  .where(sql`${t.state} = 'active'`),
uniqueIndex("sprint_items_one_current_item_idx")
  .on(t.itemId)
  .where(sql`${t.leftAt} is null`),
```

Use `numeric(5, 2, { mode: "number" })` semantics consistent with item
estimates, timestamps with time zone, `onDelete: "cascade"` for backlog/sprint,
and `onDelete: "restrict"` for `destinationSprintId`. Add database checks for
capacity, date order, lifecycle dates, outcome/leftAt consistency, and
destination presence only for `carried_to_sprint`.

- [ ] **Step 5: Generate and inspect migration 0009**

Run:

```bash
pnpm exec drizzle-kit generate --config drizzle.config.ts --name jira_sprints
```

Inspect the generated SQL and require both partial unique indexes, both enums,
both tables, all foreign keys, and every check from Step 4. Rename only the
generated migration tag to `0009_jira_sprints` if Drizzle chooses a random
suffix; never hand-edit the snapshot.

- [ ] **Step 6: Verify GREEN and apply the migration**

Run:

```bash
pnpm exec vitest run lib/validation/sprint.test.ts
pnpm db:migrate
```

Expected: validation passes and migration 0009 applies once.

- [ ] **Step 7: Commit the schema foundation**

```bash
git add lib/db/schema/enums.ts lib/db/schema/domain.ts lib/validation/sprint.ts lib/validation/sprint.test.ts drizzle/0009_jira_sprints.sql drizzle/meta/0009_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(sprints): persist lifecycle and membership history"
```

---

### Task 2: Calculate sprint sections and capacity deterministically

**Files:**
- Create: `lib/items/sprint-planning.ts`
- Create: `lib/items/sprint-planning.test.ts`

**Interfaces:**
- Produces: `SprintMetrics`, `SprintPlanningSection`, `calculateSprintMetrics`, and `buildSprintSections`.
- Consumes: tasks with status category, current membership, rank, and estimate.

- [ ] **Step 1: Write failing aggregate and section tests**

```ts
it("calculates points, remaining work, unestimated work, and over-capacity", () => {
  expect(calculateSprintMetrics([
    task("one", { estimatePoints: 8, done: false }),
    task("two", { estimatePoints: 5, done: true }),
    task("three", { estimatePoints: null, done: false }),
  ], 10)).toEqual({
    itemCount: 3,
    estimatedPoints: 13,
    completedPoints: 5,
    remainingPoints: 8,
    unestimatedCount: 1,
    capacityPoints: 10,
    overCapacityPoints: 3,
  });
});

it("orders active, planned, then unscheduled work without duplicating an item", () => {
  const sections = buildSprintSections({ sprints, items, memberships });
  expect(sections.map((section) => section.kind)).toEqual([
    "active",
    "planned",
    "planned",
    "backlog",
  ]);
  expect(sections.flatMap((section) => section.items.map((item) => item.id)))
    .toEqual(["active-item", "future-a", "future-b", "unscheduled"]);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/items/sprint-planning.test.ts
```

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the pure planning API**

Use these exported shapes:

```ts
export type SprintMetrics = {
  itemCount: number;
  estimatedPoints: number;
  completedPoints: number;
  remainingPoints: number;
  unestimatedCount: number;
  capacityPoints: number | null;
  overCapacityPoints: number;
};

export type SprintSummary = {
  id: string;
  name: string;
  goal: string | null;
  state: "planned" | "active" | "completed";
  rank: string;
  capacityPoints: number | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type SprintPlanningSection<T> = {
  id: string;
  kind: "active" | "planned" | "backlog";
  sprint: SprintSummary | null;
  metrics: SprintMetrics;
  items: T[];
};
```

`calculateSprintMetrics` sums only non-null task estimates and uses exact
decimal addition rounded to two decimals. `buildSprintSections` ignores
completed sprint memberships, orders sprint sections by state then binary rank,
sorts every section by item rank, excludes done unscheduled tasks, and throws if
one item appears in two current memberships.

- [ ] **Step 4: Verify GREEN**

```bash
pnpm exec vitest run lib/items/sprint-planning.test.ts
```

Expected: PASS with no warnings.

- [ ] **Step 5: Commit the planning helpers**

```bash
git add lib/items/sprint-planning.ts lib/items/sprint-planning.test.ts
git commit -m "feat(sprints): calculate planning sections and capacity"
```

---

### Task 3: Implement transactional sprint planning services

**Files:**
- Create: `lib/services/sprint-membership.ts`
- Create: `lib/services/sprints.ts`
- Create: `lib/services/sprints.integration.test.ts`
- Modify: `lib/validation/item.ts`
- Modify: `lib/validation/item.test.ts`
- Modify: `lib/services/items.ts`
- Modify: `lib/services/items.integration.test.ts`

**Interfaces:**
- Produces: `listSprintsForBacklog(backlogId)`.
- Produces: `createSprint`, `updateSprint`, `reorderSprint`, `assignItemsToSprint`, and `moveItemToSprint`.
- Produces: `assignItemsToSprintInTx(tx, input, actorId)` from the dependency-neutral membership module for reuse by sprint planning, bulk editing, lifecycle, and contextual creation.
- Extends: `CreateItemInput.sprintId?: string | null`.

- [ ] **Step 1: Write failing database tests for planned sprint management**

Add guarded tests under `JIROO_RUN_DB_TESTS=1` that prove:

```ts
it("creates uniquely named ranked sprints and edits planning fields", async () => {
  const first = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
  const second = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
  expect([first.name, second.name]).toEqual(["Sprint 1", "Sprint 2"]);
  expect(first.rank < second.rank).toBe(true);

  const edited = await updateSprint({
    id: first.id,
    backlogId: f.backlog.id,
    name: "Objectif paiement",
    goal: "Livrer le paiement invité",
    plannedStartAt: "2026-08-10T09:00:00.000Z",
    plannedEndAt: "2026-08-24T09:00:00.000Z",
    capacityPoints: 20,
  }, f.actor.id);
  expect(edited).toMatchObject({ name: "Objectif paiement", capacityPoints: 20 });
});
```

Add separate tests for binary sprint reorder, duplicate normalized name,
foreign backlog, completed-sprint edit restrictions, 500-item bulk assignment,
task-only enforcement, deleted item rejection, transfer history, no-op
assignment, and full rollback when one selected item is invalid.

- [ ] **Step 2: Run and verify RED**

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprints.integration.test.ts
```

Expected: FAIL because the service module is missing.

- [ ] **Step 3: Implement query and planning mutations**

Create `lib/services/sprints.ts` with these signatures:

```ts
type SprintRow = typeof sprints.$inferSelect;
type SprintItemRow = typeof sprintItems.$inferSelect;
type ItemRow = typeof items.$inferSelect;

export async function listSprintsForBacklog(backlogId: string): Promise<{
  sprints: SprintRow[];
  memberships: SprintItemRow[];
}>;

export async function createSprint(input: unknown, actorId: string): Promise<SprintRow>;
export async function updateSprint(input: unknown, actorId: string): Promise<SprintRow>;
export async function reorderSprint(input: unknown, actorId: string): Promise<SprintRow>;
export async function assignItemsToSprint(input: unknown, actorId: string): Promise<{
  changedCount: number;
  unchangedCount: number;
}>;
export async function moveItemToSprint(input: unknown, actorId: string): Promise<ItemRow>;
```

Create `lib/services/sprint-membership.ts` without importing
`lib/services/items.ts` or `lib/services/sprints.ts`. Export:

```ts
export type SprintTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function assignItemsToSprintInTx(
  tx: SprintTx,
  input: { backlogId: string; itemIds: string[]; sprintId: string | null },
  actorId: string,
): Promise<{ changedCount: number; unchangedCount: number }>;
```

Lock the backlog first, then sprint rows by ascending ID, then item rows by
ascending ID. The primitive closes the previous current membership with outcome
`removed`, creates the destination membership with `estimateAtJoin`, and
inserts readable `activities.field="sprint"` using sprint names rather than
IDs. A null destination closes membership and writes a null new value.

`moveItemToSprint` performs membership change and `rankAtDrop` in the same
transaction. `reorderSprint` uses `rankFirst`, `rankBetween`, and `rankLast`
against sprint neighbors from the same backlog.

- [ ] **Step 4: Write failing contextual-creation tests**

Extend `lib/validation/item.test.ts` and `lib/services/items.integration.test.ts`:

```ts
it("creates a task in a planned or active sprint atomically", async () => {
  const created = await createItem({
    backlogId: f.backlog.id,
    title: "Contextual task",
    type: "tache",
    parentId: null,
    sprintId: f.sprint.id,
  }, f.actor.id);
  const current = await currentSprintMembership(created.id);
  expect(current?.sprintId).toBe(f.sprint.id);
});
```

Also assert that structural item creation with `sprintId`, a completed sprint,
or a sprint from another backlog rolls back the item and membership together.

- [ ] **Step 5: Verify contextual tests RED**

```bash
pnpm exec vitest run lib/validation/item.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/items.integration.test.ts
```

Expected: FAIL because `sprintId` is stripped and no membership is created.

- [ ] **Step 6: Add contextual sprint creation**

Add `sprintId: z.uuid().nullable().optional()` to `createItemSchema`. Inside the
existing `createItem` transaction, after inserting a task, call
`assignItemsToSprintInTx` with the inserted ID. Never open a nested transaction.
Return the same serialized item shape as before.

- [ ] **Step 7: Verify all service tests GREEN**

```bash
pnpm exec vitest run lib/validation/item.test.ts lib/services/sprints.integration.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprints.integration.test.ts lib/services/items.integration.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit planning services**

```bash
git add lib/services/sprint-membership.ts lib/services/sprints.ts lib/services/sprints.integration.test.ts lib/validation/item.ts lib/validation/item.test.ts lib/services/items.ts lib/services/items.integration.test.ts
git commit -m "feat(sprints): plan work with historical membership"
```

---

### Task 4: Start and complete sprints safely

**Files:**
- Create: `lib/services/sprint-lifecycle.ts`
- Create: `lib/services/sprint-lifecycle.integration.test.ts`

**Interfaces:**
- Produces: `startSprint(input, actorId)`.
- Produces: `completeSprint(input, actorId)`.
- Produces: `IncompleteSprintSubtasksError` with `itemKeys: string[]`.
- Consumes: sprint validation, membership tables, status categories, and assignment transaction primitive.

- [ ] **Step 1: Write failing start tests**

Prove that start snapshots every pre-start estimate, allows empty/unestimated/
over-capacity work, rejects a non-planned sprint, and prevents two active
sprints under `Promise.allSettled`:

```ts
const attempts = await Promise.allSettled([
  startSprint(startInput(first.id), f.actor.id),
  startSprint(startInput(second.id), f.actor.id),
]);
expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
expect(await activeSprintCount(f.backlog.id)).toBe(1);
```

- [ ] **Step 2: Run start tests and verify RED**

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprint-lifecycle.integration.test.ts
```

Expected: FAIL because lifecycle services are missing.

- [ ] **Step 3: Implement `startSprint`**

Use this return contract:

```ts
export type StartSprintResult = {
  sprintId: string;
  committedItemCount: number;
  committedPoints: number;
  unestimatedCount: number;
};
```

In one transaction, lock backlog, target sprint, existing active sprint query,
memberships, and items. Write `estimateAtStart`, insert one
`sprint_commitment` activity per committed item, then set state/actual dates.
Let the partial active index remain the final concurrent guard and map its
unique violation to `Un sprint est déjà actif pour ce backlog.`.

- [ ] **Step 4: Write failing completion tests**

Add independent tests for destination Backlog, existing planned sprint, and new
planned sprint. Each test must assert membership outcome, destination, workflow
status unchanged, completed sprint timestamps, readable activities, and exact
state after reload query. Add:

```ts
it("blocks completion and returns subtask business keys", async () => {
  await expect(completeSprint({
    id: f.active.id,
    backlogId: f.backlog.id,
    destination: { type: "backlog" },
  }, f.actor.id)).rejects.toMatchObject({
    name: "IncompleteSprintSubtasksError",
    itemKeys: [f.openSubtask.key],
  });
});
```

Also inject a foreign destination and force a duplicate new-sprint name to
prove all memberships and sprint state roll back.

- [ ] **Step 5: Verify completion tests RED**

Run the same lifecycle integration command and confirm failures are caused by
missing completion behavior.

- [ ] **Step 6: Implement `completeSprint`**

Use this exact destination union:

```ts
type CompletionDestination =
  | { type: "backlog" }
  | { type: "existing_sprint"; sprintId: string }
  | { type: "new_sprint"; name: string };
```

Determine completion from `statuses.category === "done"`. Query descendants of
all sprint tasks and throw `IncompleteSprintSubtasksError` before any update.
Close completed memberships with `completed`; close incomplete memberships with
`carried_to_backlog` or `carried_to_sprint`; create new current memberships for
the chosen sprint; preserve item statuses; then mark the sprint completed.

- [ ] **Step 7: Verify lifecycle GREEN**

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprint-lifecycle.integration.test.ts
```

Expected: all start, concurrency, subtask, carry-over, and rollback tests pass.

- [ ] **Step 8: Commit lifecycle services**

```bash
git add lib/services/sprint-lifecycle.ts lib/services/sprint-lifecycle.integration.test.ts
git commit -m "feat(sprints): start and complete work transactionally"
```

---

### Task 5: Expose authenticated Server Actions and bulk sprint editing

**Files:**
- Create: `app/actions/sprints.ts`
- Create: `app/actions/sprints.test.ts`
- Modify: `app/actions/items.ts`
- Modify: `app/actions/items.test.ts`
- Modify: `lib/validation/bulk-item.ts`
- Modify: `lib/validation/bulk-item.test.ts`
- Modify: `lib/services/item-bulk.ts`
- Modify: `lib/services/item-bulk.integration.test.ts`

**Interfaces:**
- Produces: create, update, reorder, assign, move, start, and complete sprint actions.
- Extends: `BulkItemPatch` with `{ field: "sprintId"; value: string | null }`.
- Extends: `CreateItemActionInput.sprintId?: string | null`.

- [ ] **Step 1: Write failing action tests**

Mock auth, services, and `revalidatePath`, then prove every action authenticates
before service invocation, passes only validated domain input plus session actor,
and revalidates `/b/DEMO`. Required safe error examples:

```ts
await expect(startSprintAction(startPayload)).resolves.toEqual({
  ok: false,
  error: "Un sprint est déjà actif pour ce backlog.",
});
await expect(completeSprintAction(closePayload)).resolves.toEqual({
  ok: false,
  error: "Terminez les sous-tâches avant de clôturer le sprint.",
  itemKeys: ["DEMO-42"],
});
```

Unknown database errors must return a generic lifecycle-specific French error.

- [ ] **Step 2: Verify actions RED**

```bash
pnpm exec vitest run app/actions/sprints.test.ts
```

Expected: FAIL because actions do not exist.

- [ ] **Step 3: Implement sprint actions**

Create top-level `"use server"` actions. Each action must call the existing
session and `canWriteItems` pattern before its service. Return small results:

```ts
export async function startSprintAction(input: StartSprintActionInput) {
  const actorId = await requireWriter();
  const { backlogKey, ...serviceInput } = input;
  try {
    const result = await startSprint(serviceInput, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, ...result };
  } catch (error) {
    return { ok: false as const, error: mapStartError(error) };
  }
}
```

Do not return raw membership rows or stack traces.

- [ ] **Step 4: Write failing bulk and contextual action tests**

Add tests asserting:

```ts
expect(bulkItemPatchSchema.parse({ field: "sprintId", value: null }))
  .toEqual({ field: "sprintId", value: null });
expect(mocks.createItem).toHaveBeenCalledWith(
  expect.objectContaining({ sprintId }),
  "writer-1",
);
```

Add DB tests showing sprint bulk assignment uses the same historical primitive
and rolls back all items if one is invalid.

- [ ] **Step 5: Verify bulk/context RED**

```bash
pnpm exec vitest run lib/validation/bulk-item.test.ts app/actions/items.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/item-bulk.integration.test.ts
```

- [ ] **Step 6: Add the bulk sprint variant and contextual action field**

Extend the discriminated union, delegate the sprint patch from
`bulkUpdateItems` to `assignItemsToSprintInTx`, and forward `sprintId` from
`createItemAction`. Preserve existing non-sprint bulk behavior and counts.

- [ ] **Step 7: Verify GREEN**

```bash
pnpm exec vitest run app/actions/sprints.test.ts app/actions/items.test.ts lib/validation/bulk-item.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/item-bulk.integration.test.ts
```

- [ ] **Step 8: Commit action contracts**

```bash
git add app/actions/sprints.ts app/actions/sprints.test.ts app/actions/items.ts app/actions/items.test.ts lib/validation/bulk-item.ts lib/validation/bulk-item.test.ts lib/services/item-bulk.ts lib/services/item-bulk.integration.test.ts
git commit -m "feat(sprints): expose lifecycle and bulk planning actions"
```

---

### Task 6: Build sprint forms and lifecycle dialogs

**Files:**
- Create: `components/sprints/sprint-form-dialog.tsx`
- Create: `components/sprints/sprint-form-dialog.test.tsx`
- Create: `components/sprints/sprint-lifecycle-dialogs.tsx`
- Create: `components/sprints/sprint-lifecycle-dialogs.test.tsx`
- Modify: `components/items/new-item-dialog.tsx`
- Modify: `components/items/new-item-dialog.test.tsx`

**Interfaces:**
- Produces: `CreateSprintButton`, `EditSprintDialog`, `StartSprintDialog`, and `CompleteSprintDialog`.
- Extends: `NewItemButtonProps` with `sprintId?: string | null` and `contextLabel?: string`.

- [ ] **Step 1: Write failing create/edit dialog tests**

Test discoverable `Créer un sprint`, retained values after server error, French
field errors, disabled duplicate submit, successful refresh, and completed
sprint edit limited to name/goal. Use real Testing Library interactions and mock
only imported actions/navigation.

- [ ] **Step 2: Verify form dialogs RED**

```bash
pnpm exec vitest run components/sprints/sprint-form-dialog.test.tsx
```

- [ ] **Step 3: Implement create/edit dialogs**

Use controlled fields and `useTransition`. Never close on an error. The edit
dialog submits ISO strings created from `datetime-local` values and displays a
single `role="alert"` summary plus field-level `aria-describedby` links.

- [ ] **Step 4: Write failing lifecycle dialog tests**

Start tests must show item count, points, unestimated count, over-capacity
warning, allow explicit confirmation, and navigate to `?view=board` only after
success. Completion tests must conditionally show planned sprint/new sprint
fields, preserve the selected destination on error, and render incomplete
subtask keys returned by the action.

- [ ] **Step 5: Verify lifecycle dialogs RED**

```bash
pnpm exec vitest run components/sprints/sprint-lifecycle-dialogs.test.tsx
```

- [ ] **Step 6: Implement lifecycle dialogs**

Use these public props:

```ts
type StartSprintDialogProps = {
  backlogId: string;
  backlogKey: string;
  sprint: SprintSummary;
  metrics: SprintMetrics;
};

type CompleteSprintDialogProps = StartSprintDialogProps & {
  plannedSprints: Array<{ id: string; name: string }>;
  completedMetrics: SprintMetrics;
  incompleteMetrics: SprintMetrics;
};
```

Start success calls `router.push(`/b/${backlogKey}?view=board`)`. Completion
success calls `router.refresh()` and closes. Pending buttons are disabled and
labelled with visible progress copy.

- [ ] **Step 7: Write contextual creation RED/GREEN**

Add a test that renders `NewItemButton` with `sprintId`, creates a task, and
asserts the action payload includes it. Implement the optional prop without
changing existing call sites.

- [ ] **Step 8: Verify all dialog tests GREEN**

```bash
pnpm exec vitest run components/sprints/sprint-form-dialog.test.tsx components/sprints/sprint-lifecycle-dialogs.test.tsx components/items/new-item-dialog.test.tsx
```

- [ ] **Step 9: Commit sprint dialogs**

```bash
git add components/sprints/sprint-form-dialog.tsx components/sprints/sprint-form-dialog.test.tsx components/sprints/sprint-lifecycle-dialogs.tsx components/sprints/sprint-lifecycle-dialogs.test.tsx components/items/new-item-dialog.tsx components/items/new-item-dialog.test.tsx
git commit -m "feat(sprints): add planning and lifecycle dialogs"
```

---

### Task 7: Render Jira-inspired sprint sections and planning interactions

**Files:**
- Create: `components/sprints/sprint-section-header.tsx`
- Create: `components/sprints/sprint-section-header.test.tsx`
- Modify: `components/items/item-backlog.tsx`
- Modify: `components/items/item-backlog.test.tsx`
- Modify: `components/items/bulk-item-toolbar.tsx`
- Modify: `components/items/bulk-item-toolbar.test.tsx`
- Modify: `components/items/backlog-view-content.tsx`

**Interfaces:**
- Consumes: `SprintPlanningSection`, dialogs, actions, and server planning snapshot.
- Produces: compact collapsible sections with exact rollback and one cross-section selection model.

- [ ] **Step 1: Write failing section-header tests**

Assert visible name/state/goal/dates, `13 / 10 pt`, `1 non estimé`, explicit
`Dépassement de 3 pt`, retained aggregates while collapsed, admin/contributor
actions, and zero mutation controls for a viewer.

- [ ] **Step 2: Verify header RED and implement GREEN**

```bash
pnpm exec vitest run components/sprints/sprint-section-header.test.tsx
```

Implement `SprintSectionHeader` as a semantic heading with an expanded button,
not as a fake table row. Add labelled move-up/down controls for planned sprint
ranking and slots for edit/start/complete/contextual create actions. Rerun the
test to PASS.

- [ ] **Step 3: Write failing Backlog section tests**

Extend `item-backlog.test.tsx` to prove:

- active, planned, and Backlog sections render in that order;
- Jira-inspired column order is selection, rank, key/type, title, status,
  priority, points, assignee;
- Sprint is not repeated as a row column;
- collapsing a section removes hidden selections and updates the toolbar;
- readers have no create, drag, checkbox, inline editor, or lifecycle actions;
- sorted/grouped views disable rank drag but keep the bulk Sprint command;
- cross-section success updates section/aggregates, and failure restores the
  exact item order, selection, and totals.

- [ ] **Step 4: Verify Backlog RED**

```bash
pnpm exec vitest run components/items/item-backlog.test.tsx
```

Expected: FAIL because `ItemBacklog` accepts flat groups and has no sprint
section contract.

- [ ] **Step 5: Refactor `ItemBacklog` around sections**

Replace flat `groups` with:

```ts
type ItemBacklogProps = {
  sections: Array<SprintPlanningSection<BacklogItem> & {
    groups: Array<{ key: string; label: string; items: BacklogItem[] }>;
  }>;
  sprints: Array<{ id: string; name: string; state: "planned" | "active" }>;
  backlogId: string;
  backlogKey: string;
  canWrite: boolean;
  manualOrder: boolean;
};
```

Keep one selection state across sections. Visible IDs exclude collapsed rows,
so reconciliation prevents hidden bulk mutations. Keep one `DndContext`; each
section is a droppable destination. A same-section drop uses existing rank
action, while a cross-section drop calls `moveSprintItemAction` with destination
sprint and server-authoritative neighbor IDs. Snapshot sections before any
optimistic update and restore the whole snapshot on error.

- [ ] **Step 6: Write failing bulk Sprint tests**

Assert the toolbar lists `Backlog`, active sprint, and planned sprints; sends a
sorted ID list with `{ field: "sprintId", value }`; retains selection on error;
and reports changed/unchanged counts.

- [ ] **Step 7: Add the bulk Sprint command and verify GREEN**

Add `sprints` to `BulkItemToolbarProps` and render `Modifier le sprint`. Use the
existing `bulkUpdateItemsAction`, which now supports `sprintId`. Run:

```bash
pnpm exec vitest run components/items/bulk-item-toolbar.test.tsx components/items/item-backlog.test.tsx components/sprints/sprint-section-header.test.tsx
```

- [ ] **Step 8: Assemble server-rendered planning sections**

In `BacklogViewContent`, load `listSprintsForBacklog(backlog.id)` in the main
`Promise.all`, call `buildSprintSections`, preserve URL filtering/grouping inside
each section, and pass contextual `sprintId` to each section create button.
Completed sprints are not rendered as planning sections.

- [ ] **Step 9: Run focused and regression tests**

```bash
pnpm exec vitest run components/items/item-backlog.test.tsx components/items/bulk-item-toolbar.test.tsx components/sprints/sprint-section-header.test.tsx components/shell/filter-bar.test.tsx lib/items/sprint-planning.test.ts
```

- [ ] **Step 10: Commit the sprint Backlog**

```bash
git add components/sprints/sprint-section-header.tsx components/sprints/sprint-section-header.test.tsx components/items/item-backlog.tsx components/items/item-backlog.test.tsx components/items/bulk-item-toolbar.tsx components/items/bulk-item-toolbar.test.tsx components/items/backlog-view-content.tsx
git commit -m "feat(backlog): plan work in compact sprint sections"
```

---

### Task 8: Scope the Board to the active sprint

**Files:**
- Modify: `components/items/item-board.tsx`
- Modify: `components/items/item-board.test.tsx`
- Modify: `components/items/backlog-view-content.tsx`
- Modify: `components/items/new-item-dialog.tsx`

**Interfaces:**
- Consumes: active sprint summary, current membership set, and active metrics.
- Produces: active sprint header, scoped cards, no-active CTA, and contextual Board creation.

- [ ] **Step 1: Write failing Board tests**

Add tests proving:

```ts
expect(screen.getByRole("heading", { name: "Sprint paiement" })).toBeVisible();
expect(screen.getByText("Objectif : livrer le paiement invité")).toBeVisible();
expect(screen.getByText("8 pt restants")).toBeVisible();
expect(screen.queryByText("Unscheduled task")).not.toBeInTheDocument();
```

In a separate no-active test, require `Aucun sprint actif`, a `Voir le Backlog`
link preserving supported URL state, zero board cards, and no misleading empty
workflow-column message.

- [ ] **Step 2: Verify Board RED**

```bash
pnpm exec vitest run components/items/item-board.test.tsx
```

- [ ] **Step 3: Filter Board cards server-side**

Build a set of item IDs whose current membership belongs to the active sprint
and filter `boardCards` with it before rendering. Pass `activeSprint` and
`activeSprintMetrics` to `ItemBoard`. Do not send all unscheduled cards to the
client and hide them with CSS.

- [ ] **Step 4: Render the active header and no-active state**

When active, render sprint name, goal, dates, completed/remaining points, and
unestimated count above existing columns. When absent, return a dedicated
`EmptyState` before the board DnD tree. Keep readers able to see sprint metadata.

- [ ] **Step 5: Make Board task creation contextual**

Pass the active sprint ID to the ViewBar `NewItemButton` only for Board view.
The resulting action creates item and membership in one transaction from Task
3. Backlog/List/Tree creation remains unscheduled unless invoked inside a sprint
section.

- [ ] **Step 6: Verify Board GREEN and run DnD regressions**

```bash
pnpm exec vitest run components/items/item-board.test.tsx components/items/new-item-dialog.test.tsx lib/items/board-dnd.test.ts
```

- [ ] **Step 7: Commit active-sprint execution**

```bash
git add components/items/item-board.tsx components/items/item-board.test.tsx components/items/backlog-view-content.tsx components/items/new-item-dialog.tsx
git commit -m "feat(board): execute only the active sprint"
```

---

### Task 9: Prove the complete lifecycle in Playwright and update the audit

**Files:**
- Create: `e2e/sprint-lifecycle.spec.ts`
- Modify: `e2e/global.setup.ts`
- Modify: `audit/README.md`
- Modify: `audit/bugs.md`
- Modify: `audit/ux.md`
- Modify: `audit/benchmark.md`
- Modify: `audit/roadmap.md`
- Create: named files under `audit/screenshots/`, `audit/console/`, and `audit/network/`.

**Interfaces:**
- Consumes: completed PR2 behavior through Chromium only.
- Produces: reproducible audit evidence and exact cleanup/restoration.

- [ ] **Step 1: Add deterministic audit fixtures and observation helper**

Create sprint/item fixtures through services in Playwright setup or each test,
never by bypassing domain invariants. Reuse the contributor and viewer storage
states. Every scenario records:

```ts
page.on("console", recordConsole);
page.on("pageerror", recordPageError);
page.on("requestfailed", recordRequestFailure);
page.on("response", recordHttpStatus);
```

Use `try/finally` to restore workflow statuses, ranks, memberships, sprint rows,
and estimates through services or fixture-owned cascade deletion.

- [ ] **Step 2: Write the planned-sprint browser scenario**

Create/edit a sprint, assign one task by drag and two by Shift selection plus
bulk Sprint, verify section order, compact column order, totals, unestimated and
over-capacity warnings, collapse/reopen behavior, screenshot, then reload and
assert exact persistence.

- [ ] **Step 3: Write start and active-Board scenarios**

Start the sprint from its dialog, inspect warning/summary copy, wait for the
business POST, prove URL `view=board`, assert only current sprint tasks appear,
create a task on the Board and prove it remains after reload, then add/remove
scope and capture the visible warning plus clean nominal logs.

- [ ] **Step 4: Write completion scenarios**

Use isolated fixture sprints to prove:

- incomplete subtask blocks close with its business key;
- Backlog destination closes memberships correctly;
- existing planned sprint receives all incompletes;
- new sprint is created once and receives all incompletes;
- workflow statuses remain unchanged;
- completed sprint history remains queryable after reload.

- [ ] **Step 5: Write viewer and failure scenarios**

The viewer must see sections, capacity, goal, and active Board but have zero
create/edit/start/complete/drag/checkbox/bulk controls. Inject one failure for
cross-section rank, bulk assignment, start, and completion; assert exact UI and
database rollback, retained form/selection where appropriate, French feedback,
and explicitly label expected `net::ERR_FAILED` evidence.

- [ ] **Step 6: Run the complete Chromium matrix**

```bash
pnpm exec playwright test --project=chromium --reporter=list
```

Expected: all PR1 and PR2 scenarios pass; nominal scenarios have zero console
errors, failed requests, or HTTP errors; expected failures are isolated.

- [ ] **Step 7: Update the audit increment**

Append a dated session to every audit document. Update `BUG-JIR-015` from
partial to reflect the sprint portion delivered while keeping releases open.
Document tested behavior, remaining gaps, exact timings, evidence links,
functional score changes, Jira comparison, visible technical/UX debt, and the
next three priorities: releases, sprint reporting, then repository/PR links.

- [ ] **Step 8: Run final verification**

```bash
pnpm test
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprints.integration.test.ts lib/services/sprint-lifecycle.integration.test.ts lib/services/items.integration.test.ts lib/services/item-bulk.integration.test.ts
pnpm typecheck
pnpm lint
pnpm build
git diff --check
git status --short --branch
```

Expected: complete suite, DB integrations, typecheck, lint, production build,
and diff checks pass with only intended PR2 files present.

- [ ] **Step 9: Request review and finish the branch**

Use `superpowers:requesting-code-review`, address verified findings with TDD,
then use `superpowers:verification-before-completion` and
`superpowers:finishing-a-development-branch`. Commit audit evidence separately:

```bash
git add e2e audit
git commit -m "test(sprints): verify lifecycle in Chromium"
git push --set-upstream origin feat/jira-sprints
```

Create a PR against `main` with the exact verification results. Merge only when
GitHub reports it mergeable and all configured checks are green; then fetch,
switch to `main`, and fast-forward it.
