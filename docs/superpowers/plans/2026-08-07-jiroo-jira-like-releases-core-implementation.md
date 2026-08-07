# Jira-like Releases / Versions Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le noyau Releases/Versions de Jiroo avec Fix versions multivaluées, progression, publication historisée, archivage et permissions Jira-like.

**Architecture:** Le domaine Release vit dans des tables Drizzle dédiées et des services transactionnels server-only. Les Server Actions appliquent les primitives d’autorisation existantes avant d’appeler ces services ; les routes App Router ne sérialisent que des DTO minimaux. Les items consomment une projection Fix versions partagée par création, détail, filtres et bulk, tandis que chaque publication écrit un snapshot immuable avant tout déplacement d’items incomplets.

**Tech Stack:** Next.js 16.2.7 App Router, React 19.2.4, TypeScript, Drizzle ORM 0.45, PostgreSQL, Zod 4, Vitest 4, Testing Library, Playwright 1.62, pnpm 10.19, Node 24.13.0.

## Global Constraints

- Lire `AGENTS.md` et les guides locaux Next.js 16.2.7 avant toute modification Next.
- Utiliser `params: Promise<...>` puis `await params` dans les routes dynamiques.
- Les Server Actions restent dans un fichier top-level `"use server"`, authentifient depuis la session et n’acceptent jamais un acteur du client.
- Appeler `revalidatePath()` uniquement côté serveur avec les chemins littéraux du backlog et de Releases.
- Aucun nouveau package pour la PR 1.
- Toutes les mutations sont validées, autorisées côté serveur, transactionnelles et journalisées.
- `manage_releases` n’accorde jamais implicitement `edit_items`.
- Plusieurs Fix versions par item sont obligatoires ; aucun champ mono-valué transitoire.
- La publication exige une date effective et une décision explicite pour les incomplets.
- Chaque publication écrit un snapshot immuable avant tout déplacement.
- Une version publiée non archivée reste assignable ; une version archivée reste visible mais non ajoutable.
- La complétion PR 1 utilise `status.category === "done"`, règle affichée explicitement.
- Toute lecture d’agrégats est batchée ; aucun N+1 par version ou item.
- Copier les libellés historiques utiles avant toute future suppression de cible.
- Réutiliser les conventions UX existantes ; textes UI en français.
- Chaque tâche suit RED → GREEN → refactor minimal → tests → commit atomique → deux revues indépendantes.
- Ne jamais supprimer ou écraser les artefacts historiques sous `/audit`.
- Les tests destructifs utilisent uniquement `jiroo_e2e`, l’opt-in opérateur et l’identité PostgreSQL attendue.
- Exclusions PR 1 : merge, suppression/transfert, ordre, notes, related work, approbations, données Git et rapports prédictifs.

## File Responsibility Map

### Domaine et validation

- `lib/db/schema/enums.ts` — dispositions de publication.
- `lib/db/schema/domain.ts` — Releases, Fix versions, snapshots et événements.
- `drizzle/0011_jira_releases_core.sql` — migration générée et inspectée.
- `lib/validation/release.ts` — commandes Release/Fix versions.
- `lib/validation/item.ts`, `lib/validation/bulk-item.ts` — intégration items.

### Services et autorisation

- `lib/services/releases.ts` — métadonnées, progression et cycle.
- `lib/services/item-fix-versions.ts` — affectations réutilisables.
- `lib/services/items.ts`, `lib/services/item-bulk.ts` — création/édition/bulk atomiques.
- `app/actions/releases.ts`, `app/actions/items.ts` — frontières session/permissions.
- `lib/auth/capabilities.ts` — DTO de capacités fail-closed.

### Lecture et UI

- `lib/items/filter.ts`, `lib/items/views.ts` — filtre URL et vues sauvegardées.
- `components/shell/filter-bar.tsx`, `components/items/backlog-view-content.tsx` — projections.
- `app/(app)/b/[key]/releases/**` et `components/releases/**` — pages Releases.
- `components/items/fix-version-picker.tsx` et surfaces item — planification.

### Acceptation

- `e2e/global.setup.ts` — sixième compte éditeur.
- `e2e/releases.spec.ts` — quinze scénarios dédiés.
- `audit/**` — preuves, bugs, UX, benchmark et roadmap.

## Execution Preflight

Before Task 1, use `superpowers:using-git-worktrees`. Commit this plan, switch
the primary checkout back to clean `main`, then create an isolated worktree for
`feat/jira-releases-versions`. Verify exact Node/pnpm versions, install no new
dependencies, run `pnpm typecheck`, `pnpm lint` and the current unit suite as a
baseline. Initialize the Subagent-Driven workspace and progress ledger from
this plan. Never implement in the primary checkout.

---

### Task 1: Modèle PostgreSQL et commandes validées

**Files:**
- Modify: `lib/db/schema/enums.ts`
- Modify: `lib/db/schema/domain.ts`
- Modify: `lib/validation/item.ts`
- Modify: `lib/validation/bulk-item.ts`
- Create: `lib/validation/release.ts`
- Create: `lib/validation/release.test.ts`
- Create: `drizzle/0011_jira_releases_core.sql`
- Create: `drizzle/meta/0011_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `CreateReleaseInput`, `UpdateReleaseInput`, `PublishReleaseInput`, `ReleaseIdentityInput`, `ChangeItemFixVersionsInput`.
- Produces tables: `releases`, `itemFixVersions`, `releasePublications`, `releasePublicationItems`, `releaseEvents`.
- Later tasks consume `revision`, dispositions and composite backlog ownership.

- [ ] **Step 1: Write failing validation tests**

```ts
import { createReleaseSchema, publishReleaseSchema, changeItemFixVersionsSchema } from "@/lib/validation/release";

it("requires a destination when incomplete items move", () => {
  expect(() => publishReleaseSchema.parse({
    backlogId: crypto.randomUUID(),
    releaseId: crypto.randomUUID(),
    expectedRevision: 1,
    effectiveDate: "2026-08-07",
    incompleteDisposition: "move",
  })).toThrow();
});

it("keeps multiple unique fix versions", () => {
  const releaseIds = [crypto.randomUUID(), crypto.randomUUID()];
  expect(changeItemFixVersionsSchema.parse({
    backlogId: crypto.randomUUID(), itemId: crypto.randomUUID(),
    mode: "replace", releaseIds,
  }).releaseIds).toEqual(releaseIds);
});
```

- [ ] **Step 2: Run validation tests RED**

Run: `pnpm exec vitest run lib/validation/release.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement exact Zod commands**

```ts
const uuid = z.uuid();
const revision = z.number().int().positive();
const optionalDate = z.preprocess(
  (value) => value === "" || value == null ? null : value,
  z.iso.date().nullable(),
);

export const publishReleaseSchema = z.discriminatedUnion("incompleteDisposition", [
  z.object({ backlogId: uuid, releaseId: uuid, expectedRevision: revision,
    effectiveDate: z.iso.date(), incompleteDisposition: z.literal("keep") }),
  z.object({ backlogId: uuid, releaseId: uuid, expectedRevision: revision,
    effectiveDate: z.iso.date(), incompleteDisposition: z.literal("move"),
    destinationReleaseId: uuid }),
]);
```

Add `fixVersionIds: z.array(z.uuid()).max(100).default([])` to the create item
command. Add the same array as `.optional()` with no default to update item, so
an unrelated edit never clears versions. Reject duplicate IDs in both. Add this
bulk branch:

```ts
z.object({ field: z.literal("fixVersionIds"),
  mode: z.enum(["add", "replace", "remove"]),
  value: z.array(z.uuid()).max(100) })
```

- [ ] **Step 4: Run validation tests GREEN**

Run: `pnpm exec vitest run lib/validation/release.test.ts lib/validation/item.test.ts lib/validation/bulk-item.test.ts`

- [ ] **Step 5: Add Drizzle schema and constraints**

```ts
export const releaseIncompleteDispositionEnum = pgEnum(
  "release_incomplete_disposition", ["keep", "move"],
);
export const releaseItemDispositionEnum = pgEnum(
  "release_item_disposition", ["retained", "moved"],
);
```

Add partial unique indexes for one active publication, case-insensitive names,
positive revisions, consistent publish fields, ordered dates, composite
same-backlog FKs and nullable `activities.requestCorrelationId`. Snapshot item
and release event targets use `ON DELETE SET NULL`, never cascade.

- [ ] **Step 6: Generate and inspect migration**

Run: `pnpm db:generate`

Inspect: `sed -n '1,360p' drizzle/0011_jira_releases_core.sql`

Expected: migration 0011 only; reject any cascade on snapshots/events.

- [ ] **Step 7: Apply migration locally**

Run: `pnpm db:migrate`

Expected: migration applied once. Development data may be reset because the product is pre-production.

- [ ] **Step 8: Verify Task 1**

Run: `pnpm typecheck && pnpm exec vitest run lib/validation/release.test.ts lib/validation/item.test.ts lib/validation/bulk-item.test.ts`

- [ ] **Step 9: Commit Task 1**

```bash
git add lib/db/schema lib/validation drizzle
git commit -m "feat(releases): add version domain model"
```

---

### Task 2: Métadonnées, révisions et read model Release

**Files:**
- Create: `lib/services/releases.ts`
- Create: `lib/services/releases.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and commands.
- Produces: `createRelease`, `updateRelease`, `listReleaseSummaries`, `getReleaseDetail`, `listReleaseScopeItems`, `listPublicationSnapshotItems`, `listReleaseEvents`.
- Produces DTOs `ReleaseSummary`, `ReleaseDetail`, `ReleaseProgress`.

- [ ] **Step 1: Write RED PostgreSQL tests**

```ts
it("creates a release and rejects a stale revision", async () => {
  const created = await createRelease({
    backlogId, name: "2026.09", description: null, driverId: actorId,
    startDate: "2026-08-01", targetDate: "2026-09-15",
  }, actorId, "release-create-test");
  expect(created.revision).toBe(1);
  await updateRelease({ backlogId, releaseId: created.id,
    expectedRevision: 1, name: "2026.09 GA" }, actorId, "update-1");
  await expect(updateRelease({ backlogId, releaseId: created.id,
    expectedRevision: 1, description: "stale" }, actorId, "update-2"))
    .rejects.toThrow("a changé");
});
```

Also test duplicate names case-insensitively, cross-backlog ID, missing driver,
date order, archived visibility and empty progress.

- [ ] **Step 2: Run service test RED**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/releases.integration.test.ts`

- [ ] **Step 3: Implement DTOs and lock helpers**

```ts
export type ReleaseSummary = {
  id: string; name: string; description: string | null;
  driver: { id: string; name: string } | null;
  startDate: string | null; targetDate: string | null;
  effectiveReleaseDate: string | null;
  released: boolean; archived: boolean; overdue: boolean; revision: number;
  progress: { total: number; todo: number; inProgress: number; done: number;
    totalPoints: number; donePoints: number; unestimated: number };
};
```

Implement `lockBacklog`, `lockRelease`, date conversion and
`appendReleaseEvent(tx, event)`. Events copy release/actor labels and correlation.

- [ ] **Step 4: Implement create/update transactions**

Lock backlog/release, enforce unique normalized name, compare revision,
increment once per mutation and return minimal DTOs. Do not implement lifecycle yet.

- [ ] **Step 5: Implement batched list/detail queries**

Use grouped SQL counts/sums joined by release ID. Bound query count independently
of release count. Include archived only when requested. Scope items, publication
snapshot items and events accept `{ page, pageSize }`, enforce `pageSize <= 100`
and return `{ rows, total }`. The query-bound fixture contains 100 releases and
1,000 Fix-version links.

- [ ] **Step 6: Run integration and query-bound tests GREEN**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/releases.integration.test.ts`

The fixture contains 100 releases and asserts a fixed query bound.

- [ ] **Step 7: Verify and commit Task 2**

Run: `pnpm typecheck && pnpm lint`

```bash
git add lib/services/releases.ts lib/services/releases.integration.test.ts
git commit -m "feat(releases): add version metadata services"
```

---

### Task 3: Fix versions multivaluées et intégration items

**Files:**
- Create: `lib/services/item-fix-versions.ts`
- Create: `lib/services/item-fix-versions.integration.test.ts`
- Modify: `lib/services/items.ts`
- Modify: `lib/services/items.integration.test.ts`
- Modify: `lib/services/item-bulk.ts`
- Modify: `lib/services/item-bulk.integration.test.ts`

**Interfaces:**
- Produces: `listItemFixVersionPairs`, `replaceItemFixVersionsInTx`, `changeItemFixVersionsInTx`, `bulkChangeItemFixVersionsInTx`.
- Guarantees: published allowed, archived addition denied, archived removal allowed, unrelated versions preserved.

- [ ] **Step 1: Write RED assignment tests**

```ts
it("persists two fix versions", async () => {
  await changeItemFixVersions({ backlogId, itemId, mode: "replace",
    releaseIds: [releaseA.id, releaseB.id] }, actorId, "replace-test");
  expect(await listItemFixVersionPairs(backlogId)).toEqual(expect.arrayContaining([
    expect.objectContaining({ itemId, releaseId: releaseA.id }),
    expect.objectContaining({ itemId, releaseId: releaseB.id }),
  ]));
});
```

Add cross-backlog rollback, duplicates, published addition, archived refusal,
archived removal, deleted item refusal and activity old/new labels.

- [ ] **Step 2: Run RED**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/item-fix-versions.integration.test.ts`

- [ ] **Step 3: Implement transaction helpers**

Lock sorted IDs, validate candidates in one query and return:

```ts
type FixVersionMutationResult = {
  changed: boolean;
  before: Array<{ id: string; name: string }>;
  after: Array<{ id: string; name: string }>;
};
```

Write one item activity with `field: "fix_versions"`, JSON string values and
correlation. No-op writes no activity.

- [ ] **Step 4: Integrate atomic create/update**

`createItem` and `updateItem` call `replaceItemFixVersionsInTx` inside their
existing transactions. Any invalid version rolls back the item write.

- [ ] **Step 5: Extend bulk service**

```ts
if (data.patch.field === "fixVersionIds") {
  return bulkChangeItemFixVersionsInTx(tx, {
    backlogId: data.backlogId, itemIds: data.itemIds,
    mode: data.patch.mode, releaseIds: data.patch.value,
  }, actorId, correlationId);
}
```

Keep the 500-item ceiling and changed/unchanged counts.

- [ ] **Step 6: Run DB suites GREEN**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/item-fix-versions.integration.test.ts lib/services/items.integration.test.ts lib/services/item-bulk.integration.test.ts`

- [ ] **Step 7: Verify and commit Task 3**

Run: `pnpm typecheck && pnpm lint`

```bash
git add lib/services lib/validation
git commit -m "feat(releases): assign multiple fix versions to items"
```

---

### Task 4: Publication, snapshots, dépublication et archivage

**Files:**
- Modify: `lib/services/releases.ts`
- Modify: `lib/services/releases.integration.test.ts`

**Interfaces:**
- Produces: `publishRelease`, `unreleaseRelease`, `archiveRelease`, `unarchiveRelease`.
- Publication returns release, publication ID and total/completed/incomplete/moved counts.

- [ ] **Step 1: Write RED lifecycle tests**

```ts
it("snapshots scope before moving incomplete items", async () => {
  const result = await publishRelease({ backlogId, releaseId,
    expectedRevision: 1, effectiveDate: "2026-08-07",
    incompleteDisposition: "move", destinationReleaseId },
    actorId, "publish-move-test");
  expect(result).toMatchObject({ totalCount: 2, completedCount: 1,
    incompleteCount: 1, movedCount: 1 });
  expect(await snapshotKeys(result.publicationId)).toEqual([doneKey, todoKey]);
});
```

Add keep, missing/invalid destination, cross-backlog, stale revision, rollback,
unrelease/re-release sequences, archive gates and simultaneous publish.

- [ ] **Step 2: Run lifecycle cases RED**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/releases.integration.test.ts -t "publish|archive|unrelease"`

- [ ] **Step 3: Implement publish transaction**

Lock order: backlog → releases sorted by ID → items sorted by ID. Load statuses
in one query, insert publication and all snapshots in one batch, then move
incompletes. Preserve unrelated Fix versions.

- [ ] **Step 4: Implement lifecycle transitions**

- unrelease closes active publication, clears current publish fields, increments revision;
- archive/unarchive preserve published state and increment revision;
- re-release appends `max(sequence)+1`, never updates a prior snapshot.

- [ ] **Step 5: Prove snapshot immutability**

Rename, change status and purge a source item after publication; assert copied
key/title/status/completed remain identical and `itemId` becomes null on purge.

- [ ] **Step 6: Run full release suite GREEN and commit**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/releases.integration.test.ts`

```bash
git add lib/services/releases.ts lib/services/releases.integration.test.ts
git commit -m "feat(releases): publish immutable version snapshots"
```

---

### Task 5: Server Actions, permissions et capacités fail-closed

**Files:**
- Create: `app/actions/releases.ts`
- Create: `app/actions/releases.test.ts`
- Modify: `app/actions/items.ts`
- Modify: `app/actions/items.test.ts`
- Modify: `lib/auth/capabilities.ts`
- Modify: `lib/auth/capabilities.test.ts`

**Interfaces:**
- Produces six Release actions and `ReleaseCapabilities`.
- `ReleaseCapabilities = { manage: boolean; assignItems: boolean; bulkAssignItems: boolean }`.

- [ ] **Step 1: Write RED capability tests**

```ts
expect(projectBacklogCapabilities({ ...permissions,
  manageReleases: true, editItems: false, bulkChangeItems: true,
}).releases).toEqual({ manage: true, assignItems: false, bulkAssignItems: false });
```

All touched legacy capability fallbacks default to false.

- [ ] **Step 2: Write RED forged-action tests**

Prove manage-only can publish `keep` but not `move`; editor can change Fix
versions but not lifecycle; reader mutates nothing; absent and inaccessible
backlogs are indistinguishable; service is not called on refusal. Selecting a
driver other than the actor requires global `browse_users`; without it the
action defaults driver to the actor and never loads/serializes the directory.

- [ ] **Step 3: Implement actions using Next 16 rules**

```ts
"use server";
const actorId = await requireSessionUserId();
const backlog = await requireBacklogPermissionById({
  actorId, backlogId: input.backlogId, permission: "manage_releases",
});
const correlationId = crypto.randomUUID();
const result = await publishRelease(serviceInput, actorId, correlationId);
revalidatePath(`/b/${backlog.key}`);
revalidatePath(`/b/${backlog.key}/releases`);
if ("releaseId" in input) {
  revalidatePath(`/b/${backlog.key}/releases/${input.releaseId}`);
}
return { ok: true as const, result };
```

No redirect is needed. If later added, call it outside try/catch.

- [ ] **Step 4: Extend item authorization**

- creation Fix versions: `create_items`;
- existing item: `edit_items`;
- bulk: global `bulk_change_items` + backlog `edit_items`;
- publish `move`: `manage_releases` + `edit_items`.

Generate one correlation ID per action.

- [ ] **Step 5: Run tests GREEN**

Run: `pnpm exec vitest run app/actions/releases.test.ts app/actions/items.test.ts lib/auth/capabilities.test.ts`

- [ ] **Step 6: Verify and commit Task 5**

Run: `pnpm typecheck && pnpm lint`

```bash
git add app/actions lib/auth/capabilities.ts lib/auth/capabilities.test.ts
git commit -m "feat(releases): enforce lifecycle permissions"
```

---

### Task 6: Projections, filtre URL et vues enregistrées

**Files:**
- Modify: `lib/items/filter.ts`
- Modify: `lib/items/filter.test.ts`
- Modify: `lib/items/views.ts`
- Modify: `lib/items/views.test.ts`
- Modify: `components/shell/filter-bar.tsx`
- Modify: `components/shell/filter-bar.test.tsx`
- Modify: `components/items/backlog-view-content.tsx`
- Modify: `components/items/backlog-view-content.test.tsx`

**Interfaces:**
- Consumes: `listItemFixVersionPairs` and Release summary/options.
- Produces: `Filters.releaseIds`, URL key `version`, `FilterItem.fixVersionIds`.
- Picker DTO: `{ id: string; name: string; released: boolean; archived: boolean }`.

- [ ] **Step 1: Write RED parse/write/match tests**

```ts
it("round-trips version filters", () => {
  const state = parseViewState(new URLSearchParams("version=v2,v1"));
  expect(state.filters.releaseIds).toEqual(["v2", "v1"]);
  const output = new URLSearchParams();
  writeViewState(output, state);
  expect(output.get("version")).toBe("v2,v1");
});

it("matches any selected fix version", () => {
  expect(matchItem({ ...item, fixVersionIds: ["v1", "v2"] },
    { ...emptyFilters, releaseIds: ["v2", "v3"] })).toBe(true);
});
```

- [ ] **Step 2: Run filter/view tests RED**

Run: `pnpm exec vitest run lib/items/filter.test.ts lib/items/views.test.ts components/shell/filter-bar.test.tsx`

- [ ] **Step 3: Implement filter and saved-view serialization**

Add `releaseIds` wherever status, labels and assignees are parsed, written,
validated, compared, cleared and decoded from legacy views. OR applies inside
Version; AND remains between filter facets.

- [ ] **Step 4: Add Version filter UI**

Pass non-archived options plus currently selected archived values to
`FilterBar`. Render `FilterMenu label="Version"`. Preserve browser Back/Forward
and saved view URLs.

- [ ] **Step 5: Batch projections in BacklogViewContent**

Load release options and item/version pairs beside existing item/status/sprint
queries. Build `fixVersionIdsByItem` and `fixVersionsByItem` maps once. Never
call a Release service inside an item loop.

- [ ] **Step 6: Run tests GREEN**

Run: `pnpm exec vitest run lib/items/filter.test.ts lib/items/views.test.ts components/shell/filter-bar.test.tsx components/items/backlog-view-content.test.tsx`

- [ ] **Step 7: Commit Task 6**

```bash
git add lib/items components/shell/filter-bar.tsx components/shell/filter-bar.test.tsx components/items/backlog-view-content.tsx components/items/backlog-view-content.test.tsx
git commit -m "feat(releases): filter items by fix version"
```

---

### Task 7: Pages Releases, progression et cycle accessible

**Files:**
- Create: `app/(app)/b/[key]/releases/page.tsx`
- Create: `app/(app)/b/[key]/releases/page.test.tsx`
- Create: `app/(app)/b/[key]/releases/[releaseId]/page.tsx`
- Create: `app/(app)/b/[key]/releases/[releaseId]/page.test.tsx`
- Create: `components/releases/release-list.tsx`
- Create: `components/releases/release-list.test.tsx`
- Create: `components/releases/release-form-dialog.tsx`
- Create: `components/releases/release-form-dialog.test.tsx`
- Create: `components/releases/release-detail.tsx`
- Create: `components/releases/release-detail.test.tsx`
- Create: `components/releases/release-progress.tsx`
- Create: `components/releases/release-progress.test.tsx`
- Create: `components/releases/release-lifecycle-dialogs.tsx`
- Create: `components/releases/release-lifecycle-dialogs.test.tsx`
- Modify: `components/shell/view-bar.tsx`
- Modify: `components/shell/view-bar.test.tsx`

**Interfaces:**
- Consumes: Release DTOs/actions and `ProductCapabilities.releases`.
- Produces routes `/b/[key]/releases` and `/b/[key]/releases/[releaseId]`.
- Detail route uses `params: Promise<{ key: string; releaseId: string }>`.
- Detail scope, publication snapshots and events consume the paginated Task 2 reads.

- [ ] **Step 1: Write RED navigation and empty-state tests**

Assert `ViewBar` links natively to `/b/CASS/releases`; empty state explains
Versions; `Créer une version` is absent when `manage` is false.

- [ ] **Step 2: Write RED page authorization tests**

Mock accessible backlog/read services. Existing inaccessible and missing
backlogs both call `notFound()`. Route payload excludes emails/raw event JSON.

- [ ] **Step 3: Implement list route**

Await params, resolve backlog, project capabilities, load summaries and render
read-only list/empty state. Do not use synchronous `params` access.

- [ ] **Step 4: Write RED form tests**

Cover required name, date order, pending, field focus, stale recovery and input
preservation after rejected request.

- [ ] **Step 5: Implement form and list**

Show state precedence `Archivée` > `Publiée` > `Non publiée`, dates, driver,
overdue, counts and points. Progress segments link to exact filtered item sets.
The driver picker is present only with `browse_users`; otherwise the actor is
shown as the fixed default and no directory payload reaches the client.

- [ ] **Step 6: Write RED lifecycle dialog tests**

```ts
expect(screen.getByRole("button", { name: "Publier" })).toBeDisabled();
await user.click(screen.getByRole("radio", { name: /déplacer/i }));
expect(screen.getByRole("combobox", { name: /version de destination/i })).toBeVisible();
```

Prove `move` absent/disabled without `assignItems`, while `keep` remains.

- [ ] **Step 7: Implement detail and lifecycle dialogs**

Separate current scope from publication snapshots. Publish requires a date and
one unselected disposition. Snapshot expansion shows copied item fields and
completion rule. Archive/unarchive/unrelease submit expected revision.

- [ ] **Step 8: Add accessibility/error feedback**

Keep one shell `main`, named dialogs, `role="alert"`, `aria-live`, focus return
and non-color progress labels.

- [ ] **Step 9: Run release UI tests GREEN**

Run: `pnpm exec vitest run components/releases components/shell/view-bar.test.tsx app/'(app)'/b/'[key]'/releases/page.test.tsx app/'(app)'/b/'[key]'/releases/'[releaseId]'/page.test.tsx`

- [ ] **Step 10: Verify and commit Task 7**

Run: `pnpm typecheck && pnpm lint`

```bash
git add app/'(app)'/b/'[key]'/releases components/releases components/shell/view-bar.tsx components/shell/view-bar.test.tsx
git commit -m "feat(releases): add release planning pages"
```

---

### Task 8: Fix versions dans création, détail, liste et bulk

**Files:**
- Create: `components/items/fix-version-picker.tsx`
- Create: `components/items/fix-version-picker.test.tsx`
- Modify: `components/items/new-item-dialog.tsx`
- Modify: `components/items/new-item-dialog.test.tsx`
- Modify: `components/items/item-detail-panel.tsx`
- Modify: `components/items/item-detail-panel.test.tsx`
- Modify: `components/items/item-detail-content.tsx`
- Modify: `components/items/bulk-item-toolbar.tsx`
- Modify: `components/items/bulk-item-toolbar.test.tsx`
- Modify: `components/items/item-backlog.tsx`
- Modify: `components/items/item-backlog.test.tsx`
- Modify: `components/items/item-list.tsx`
- Modify: `components/items/item-list.test.tsx`
- Modify: `components/items/item-board.tsx`
- Modify: `components/items/item-board.test.tsx`

**Interfaces:**
- Shared `FixVersionPickerProps` has `value`, `options`, `disabled`, `onChange`.
- Candidate shape matches Task 6; current archived values remain separate from candidates.

- [ ] **Step 1: Write RED picker tests**

```ts
it("shows current archived value, allows removal, prevents re-add", async () => {
  render(<FixVersionPicker value={[archived.id]} options={[archived]} onChange={onChange} />);
  expect(screen.getByText("Legacy — Archivée")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Retirer Legacy" }));
  expect(onChange).toHaveBeenCalledWith([]);
  expect(screen.queryByRole("menuitemcheckbox", { name: /Legacy/ })).not.toBeInTheDocument();
});
```

Also cover published candidate, keyboard, `+N`, pending and read-only.

- [ ] **Step 2: Implement shared picker**

Use existing dropdown/check primitives. Serialize only id/name/state. Follow
the corrected assignee pattern: current identities and candidates are distinct.

- [ ] **Step 3: Integrate creation and detail**

Creation submits `fixVersionIds` in the item transaction. Detail restores the
previous array and leaves the menu open on Server Action failure.

- [ ] **Step 4: Write RED bulk tests**

Cover `Ajouter aux versions`, `Remplacer les versions`, `Retirer des versions`.
Empty replace requires explicit `Effacer toutes les versions`; empty add/remove
is disabled.

- [ ] **Step 5: Integrate bulk toolbar**

Render Version only with `releaseCapabilities.bulkAssignItems`. Detail editing
uses `releaseCapabilities.assignItems`; creation uses `items.create`. Reuse
selection retention and changed/unchanged feedback.

- [ ] **Step 6: Add Backlog/List presentation**

Add Fix versions column after Points/Assigné following existing table rules.
Render two chips plus `+N`. Board cards remain compact but honor the filter.

- [ ] **Step 7: Run item UI tests GREEN**

Run: `pnpm exec vitest run components/items/fix-version-picker.test.tsx components/items/new-item-dialog.test.tsx components/items/item-detail-panel.test.tsx components/items/bulk-item-toolbar.test.tsx components/items/item-backlog.test.tsx components/items/item-list.test.tsx components/items/item-board.test.tsx`

- [ ] **Step 8: Run regression tests**

Run: `pnpm exec vitest run app/actions/items.test.ts lib/validation/item.test.ts lib/validation/bulk-item.test.ts`

- [ ] **Step 9: Commit Task 8**

```bash
git add components/items
git commit -m "feat(releases): plan fix versions from item views"
```

---

### Task 9: Matrice Playwright multi-utilisateurs Releases

**Files:**
- Modify: `e2e/global.setup.ts`
- Create: `e2e/releases.spec.ts`
- Modify: `e2e/audit-artifacts.ts` only if a new artifact category is necessary

**Interfaces:**
- Produces sixth storage state `.playwright/.auth/editor.json`.
- Consumes immutable reset/run/artifact guards unchanged.

- [ ] **Step 1: Add sixth editor fixture with tests**

```ts
editor: {
  email: "editor-releases@jiroo.local",
  name: "Éditeur Releases E2E",
  backlogPermissionsInCass: ["browse_backlog", "edit_items"],
  globalPermissions: ["bulk_change_items"],
  permissionsInLabs: [],
}
```

Keep specialist manage-only, reader read-only, outsider no-access and platform admin.

- [ ] **Step 2: Write scenarios 1–5 RED**

1. admin creates two versions and edits dates;
2. editor assigns two versions from detail;
3. editor bulk add/replace/remove;
4. filter survives reload and saved view;
5. progress equals source items and points.

- [ ] **Step 3: Write scenarios 6–10 RED**

6. specialist publishes `keep` with incompletes;
7. specialist forged `move` denied;
8. admin unpublishes/re-publishes with two snapshots;
9. admin publishes `move` preserving unrelated versions;
10. archive/unarchive updates candidates/current values.

- [ ] **Step 4: Write scenarios 11–15 RED**

11. editor assigns but sees no lifecycle controls;
12. reader/forged action leaves DB/history unchanged;
13. stale two-context edit recovers;
14. intercepted publish POST rolls back and preserves dialog;
15. second-user reload and CASS/LABS isolation.

- [ ] **Step 5: Add monitoring to every scenario**

Record console, requests, HTTP statuses, duration and screenshot on first
defect. Unexpected errors fail; injected failures are labelled `[expected]`.

- [ ] **Step 6: Run dedicated non-persistent matrix**

Run with operator-provided database URL and physical identity, without logging them:

`JIROO_ALLOW_E2E_RESET=1 JIROO_E2E_RUN_ID=20260807-releases-dev-01 pnpm test:e2e -- --project=chromium e2e/releases.spec.ts`

Expected: 15/15 PASS. Register every discovered defect as a unique BUG-JIR ID.

- [ ] **Step 7: Run implementation gates**

Run: `pnpm test`

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/releases.integration.test.ts lib/services/item-fix-versions.integration.test.ts lib/services/items.integration.test.ts lib/services/item-bulk.integration.test.ts`

Run: `pnpm typecheck && pnpm lint && pnpm build`

- [ ] **Step 8: Commit Task 9**

```bash
git add e2e
git commit -m "test(releases): cover Jira-like lifecycle in Playwright"
```

---

### Task 10: Audit final, revues indépendantes et livraison PR 1

**Files:**
- Modify: `audit/README.md`
- Modify: `audit/roadmap.md`
- Modify: `audit/bugs.md`
- Modify: `audit/ux.md`
- Modify: `audit/benchmark.md`
- Create: `audit/reviews/2026-08-07-releases-core-review.md`
- Create: run-scoped files under `audit/console`, `audit/network`, `audit/screenshots`, `audit/runs`

**Interfaces:**
- Produces immutable acceptance evidence, independent PASS and PR 1.
- Stops after merge for user validation before PR 2.

- [ ] **Step 1: Run spec-compliance review**

Every missing field, transition, permission branch or snapshot invariant is an
Important finding and blocks delivery.

- [ ] **Step 2: Run independent code/security review**

Review exact base/head package. Inspect cross-backlog isolation, forged actions,
stale writes, lock order, N+1, payload minimization, snapshot immutability and
E2E guard preservation.

- [ ] **Step 3: Fix Critical/Important findings TDD**

Reproduce each finding with one failing test, implement one correction, rerun
targeted tests, commit atomically, then re-review.

- [ ] **Step 4: Run final complete verification**

Run: `pnpm test`

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run --no-file-parallelism lib/**/*.integration.test.ts app/**/*.integration.test.ts scripts/**/*.integration.test.ts`

Expected: every discovered integration file runs; no DB integration file is
silently skipped because only a hand-written subset was supplied.

Run: `pnpm typecheck && pnpm lint && pnpm build`

Run: `git diff --check origin/main...HEAD`

- [ ] **Step 5: Run immutable full Chromium acceptance**

Use unique run ID `20260807-releases-core-delivery-01` if free, persistent audit
flag, command/scenario labels and explicit DB identity. Run the full Chromium
suite, not only Releases.

Expected: all legacy + 15 Releases tests pass; zero nominal console/network/HTTP
error; zero secret/raw PostgreSQL identity in artifacts.

- [ ] **Step 6: Update audit documents**

Record exact tests/durations, finished/incomplete/missing features, Jira
benchmark, deliberate deviations, bugs/fixes, score, PR 2 scope and next three
priorities.

- [ ] **Step 7: Commit proof only after source verification**

```bash
git add audit
git commit -m "docs(audit): record releases core acceptance"
```

Proof commit changes only `/audit`; manifest names the exact pre-proof source SHA.

- [ ] **Step 8: Push and create PR 1**

Run: `git push --set-upstream origin feat/jira-releases-versions`

Run: `gh pr create --base main --head feat/jira-releases-versions --title "feat(releases): add Jira-like versions lifecycle" --body-file /tmp/jiroo-releases-core-pr-body.md`

Body lists exact gates, run ID, reviewer verdict, Minors and PR 2 exclusions.

- [ ] **Step 9: Merge only after green checks**

Watch checks and inspect mergeable/mergeStateStatus. If no CI exists, document
it and rely on recorded local gates plus independent PASS. Merge only with
MERGEABLE/CLEAN and zero Critical/Important.

- [ ] **Step 10: Synchronize main and stop**

Fast-forward the clean primary checkout, verify merge commit, delete merged
remote branch, preserve audit evidence, then report tested/remaining/three next
priorities. Do not start PR 2 before user validation.

---

## PR 2 Handoff Boundary

After PR 1 merge and explicit validation, write a separate plan for:

1. merge atomique de versions ;
2. suppression avec transfert ou retrait ;
3. ordre manuel persistant ;
4. notes Markdown/HTML depuis l’état courant ;
5. related work ;
6. nouvelle matrice Playwright et audit.

Do not pull PR 2 capabilities into this implementation plan.
