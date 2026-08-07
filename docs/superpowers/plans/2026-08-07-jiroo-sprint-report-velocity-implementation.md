# Jiroo Sprint Report and Velocity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un journal événementiel de sprint append-only, un rapport fiable pour les sprints actifs et terminés, et une vélocité explicable sur les douze derniers sprints terminés.

**Architecture:** Les mutations de sprint et d'item écrivent des événements sémantiques dans leur transaction métier grâce à un helper partagé et batché. La clôture matérialise un en-tête et une ligne par item dans un snapshot immuable ; les lectures terminées et la vélocité utilisent uniquement ces snapshots, tandis que le rapport actif projette les appartenances ouvertes et le journal du sprint. Une route App Router serveur résout d'abord le backlog canonique, normalise l'état URL non sensible, puis transmet des DTO sérialisables à des composants de rapport sans dépendance de calcul métier.

**Tech Stack:** Next.js 16.2.7 App Router, React 19.2.4, TypeScript 5, Drizzle ORM 0.45.2, PostgreSQL 17, Zod 4.4.3, Vitest 4.1.8, Testing Library 16.3.2, Playwright 1.62.1, pnpm 10.19.0, Node 24.13.0.

## Global Constraints

- Lire `AGENTS.md` et les guides locaux Next.js 16.2.7 avant toute modification Next ; pour cet incrément, relire au minimum `page.md`, `error.md`, `not-found.md`, `use-search-params.md`, `revalidatePath.md`, `use-server.md` et `server-and-client-components.md` sous `node_modules/next/dist/docs/01-app/`.
- Utiliser `params: Promise<...>` et `searchParams: Promise<...>` puis les attendre dans la page serveur.
- Le fichier `error.tsx` est un Client Component et utilise la prop Next.js 16.2.7 `unstable_retry`; il n'affiche jamais `error.message`, un digest, une requête ou un identifiant interne.
- Les Server Actions restent dans des fichiers top-level `"use server"`, authentifient depuis la session et ne reçoivent jamais l'acteur depuis le client.
- Toute mutation de reporting écrit dans la même transaction que la mutation métier ; un échec de l'événement ou du snapshot annule l'ensemble.
- Les événements, en-têtes et lignes de snapshot sont append-only ; les mises à jour et suppressions applicatives sont rejetées par PostgreSQL.
- Le nettoyage privilégié des tests d'intégration passe uniquement par le helper sous `test-utils/`, gardé par `NODE_ENV === "test"` et `JIROO_RUN_DB_TESTS === "1"`; le reset E2E conserve en plus ses gardes existantes d'opt-in et d'identité PostgreSQL avant `TRUNCATE`.
- Chaque corrélation est non vide, limitée à 128 caractères et créée une seule fois par requête ; un bulk partage la même corrélation pour toutes ses lignes.
- L'ordre du journal est toujours `occurredAt ASC, sequence ASC`; aucune UI ni aucun test n'utilise l'UUID comme départage.
- Les verrous suivent partout l'ordre backlog → sprints par UUID → appartenances par item/UUID → items par UUID → statuts/destinations ; les nouvelles lectures verrouillées ne réintroduisent pas un ordre concurrent différent.
- Seules les tâches de premier niveau (`type === "tache"`) contribuent aux rapports ; les sous-tâches n'ajoutent jamais de points.
- Une estimation `null` vaut zéro dans les sommes mais incrémente toujours le compteur non estimé.
- `committedPoints` vient exclusivement de `estimateAtStart`; les changements ultérieurs ne le réécrivent jamais.
- Un sprint terminé lit exclusivement `sprint_report_snapshots` et `sprint_report_items` pour ses totaux et lignes ; l'état courant des items ne corrige jamais l'histoire.
- Un sprint avec engagement positif et zéro point terminé est inclus dans la moyenne ; seul le couple engagement=0 et terminé=0 est exclu pour absence de données de points.
- Les lectures vérifient toujours `backlogId` dans SQL, renvoient `null` pour une ressource absente/étrangère et ne révèlent aucune existence inter-backlog.
- `browse_backlog` suffit pour lire les rapports ; aucune capacité de modification n'est ajoutée.
- Les listes d'items et d'événements utilisent des pages de 50, plafonnées à 100 ; la vélocité accepte uniquement 7 ou 12 et ne lit jamais plus de 12 en-têtes.
- Les libellés UI sont en français ; aucun sens ne dépend seulement d'une couleur, d'un hover SVG ou d'un pointeur.
- Aucun nouveau package n'est ajouté ; le graphique utilise React, SVG/CSS natif et un tableau HTML synchronisé.
- Ne pas ajouter Burndown, Burnup, forecast, Releases PR2, champ numérique configurable ni rapport synthétique pour les anciens sprints.
- Ne jamais supprimer ou écraser les artefacts historiques sous `audit/`; chaque exécution persistée utilise les helpers run-scoped existants.
- Chaque tâche suit RED → GREEN → refactor minimal → vérification ciblée → commit atomique.

## File Responsibility Map

### Domaine PostgreSQL

- `lib/db/schema/enums.ts` — types d'événement et raisons de retrait.
- `lib/db/schema/domain.ts` — journal, en-têtes et lignes de snapshots avec ownership composite.
- `drizzle/0012_jira_sprint_reports.sql` et `drizzle/meta/0012_snapshot.json` — migration générée, renommée, checks et triggers append-only inspectés.
- `lib/db/schema/sprint-reports.integration.test.ts` — formes SQL, isolation, triggers et ordre monotone.
- `test-utils/sprint-history-cleanup.ts` — unique nettoyage privilégié des fixtures historiques.

### Écriture transactionnelle

- `lib/services/sprint-events.ts` — commandes discriminées, lookup batché des appartenances actives et insertion d'événements.
- `lib/services/sprint-membership.ts` — événements d'ajout/retrait et raisons `manual|moved|deleted`.
- `lib/services/sprint-lifecycle.ts` — bornes démarrage/clôture et création atomique du snapshot.
- `lib/services/items.ts`, `lib/services/item-bulk.ts` — estimation, done/reopen, suppression et parité single/bulk/DnD.
- `app/actions/items.ts`, `app/actions/sprints.ts` — une corrélation par action et revalidation du rapport actif.

### Calculs et lectures

- `lib/reports/sprint-calculations.ts` — fonctions pures de points, scope, déduplication des participations et vélocité.
- `lib/reports/sprint-calculations.test.ts` — règles numériques et séquences add/remove/re-add.
- `lib/services/sprint-reports.ts` — DTO, projection active, snapshot terminé, sélecteurs, pagination et vélocité.
- `lib/services/sprint-reports.integration.test.ts` — immutabilité, isolation, concurrence et bornes de requêtes.

### Route et interface

- `lib/reports/report-url.ts` — normalisation déterministe des paramètres non sensibles.
- `lib/reports/report-url.test.ts` — paramètres `report`, `limit`, `itemPage`, `eventPage`.
- `app/(app)/b/[key]/reports/page.tsx` et test — autorisation canonique et orchestration serveur.
- `app/(app)/b/[key]/reports/error.tsx` et test — erreur sûre avec retry.
- `app/(app)/b/[key]/reports/loading.tsx` — squelette du segment.
- `components/reports/report-navigation.tsx` — choix rapport/sprint/limite par liens et formulaire GET.
- `components/reports/sprint-report.tsx` — identité, métriques, sections d'items et états actif/figé/legacy.
- `components/reports/sprint-event-journal.tsx` — chronologie accessible et pagination indépendante.
- `components/reports/velocity-report.tsx` — barres, ligne moyenne, valeurs exactes, tableau et exclusions.
- `components/reports/*.test.tsx` — états, libellés, liens et parité graphique/tableau.
- `components/shell/view-bar.tsx`, `lib/items/shell.ts` et tests — entrée `Rapports` et breadcrumb canonique.

### Acceptation et audit

- `e2e/sprint-reports.spec.ts` — trois sprints, mutations par toutes les voies, permissions, deuxième contexte et preuves.
- `audit/README.md`, `audit/roadmap.md`, `audit/bugs.md`, `audit/ux.md`, `audit/benchmark.md` — résultat, écarts, métriques et trois priorités suivantes.

## Execution Preflight

Avant Task 1, utiliser `superpowers:using-git-worktrees`. Depuis le checkout principal propre sur `main`, créer un worktree isolé pour `feat/sprint-reports-velocity`, vérifier `node --version` = `v24.13.0` et `pnpm --version` = `10.19.0`, puis exécuter :

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Vérifier PostgreSQL avec `docker compose ps` et appliquer les migrations existantes avec `pnpm db:migrate`. Ne jamais implémenter dans le checkout principal. Initialiser le ledger Subagent-Driven à partir de ce plan si l'option recommandée est choisie.

---

### Task 1: Modèle PostgreSQL append-only et nettoyage de test isolé

**Files:**
- Modify: `lib/db/schema/enums.ts`
- Modify: `lib/db/schema/domain.ts`
- Create: `lib/db/schema/sprint-reports.integration.test.ts`
- Create: `test-utils/sprint-history-cleanup.ts`
- Create: `drizzle/0012_jira_sprint_reports.sql`
- Create: `drizzle/meta/0012_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces enums: `sprint_event_type`, `sprint_removal_reason`.
- Produces sequence/table exports: `sprintEventSequence`, `sprintEvents`, `sprintReportSnapshots`, `sprintReportItems`.
- Produces `withSprintHistoryCleanup(client, callback)` for DB tests only.
- Later tasks rely on composite uniqueness `(backlog_id,id)` for `sprints`, `(sprint_id,id)` for `sprint_items`, and `(backlog_id,sprint_id,id)` for report headers.

- [ ] **Step 1: Write RED database contract tests**

Create raw PostgreSQL tests gated exactly like the other integration suites:

```ts
const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("sprint reporting schema", () => {
  it("rejects an estimate event without stable item identity", async () => {
    await expectStatementRejected(client, `insert into sprint_events
      (backlog_id, sprint_id, event_type, actor_id, request_correlation_id,
       occurred_at, previous_estimate, next_estimate)
      values ($1, $2, 'estimate_changed', $3, 'schema-red', now(), 3, 5)`,
      [backlogId, sprintId, actorId]);
  });

  it("orders equal timestamps by a global increasing sequence", async () => {
    const rows = await client.query<{ sequence: string }>(`select sequence
      from sprint_events where sprint_id = $1
      order by occurred_at, sequence`, [sprintId]);
    expect(rows.rows.map((row) => BigInt(row.sequence)))
      .toEqual([...rows.rows.map((row) => BigInt(row.sequence))].sort((a, b) => a < b ? -1 : 1));
  });
});
```

Also assert: every cross-backlog sprint/item/snapshot reference is rejected; correlation length 0 and 129 are rejected; item rows are unique by `(snapshot_id,item_key)`; ordinary `UPDATE` and `DELETE` fail on all three history tables; the privileged helper can clean its own fixture.

- [ ] **Step 2: Run schema tests RED**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/db/schema/sprint-reports.integration.test.ts`

Expected: FAIL because `sprint_events` and snapshot tables do not exist.

- [ ] **Step 3: Add enums and globally monotonic storage**

Add:

```ts
export const sprintEventTypeEnum = pgEnum("sprint_event_type", [
  "sprint_started", "item_added", "item_removed", "estimate_changed",
  "item_completed", "item_reopened", "sprint_completed",
]);
export const sprintRemovalReasonEnum = pgEnum("sprint_removal_reason", [
  "manual", "moved", "deleted",
]);
```

Define `sprintEventSequence = pgSequence("sprint_event_sequence")` and a `bigint("sequence", { mode: "bigint" })` column defaulted with `nextval('sprint_event_sequence')`; DTO conversion later serializes it as a decimal string. Add unique `(backlogId,id)` on `sprints` and `(sprintId,id)` on `sprintItems` before declaring composite foreign keys.

- [ ] **Step 4: Define the event table and exact shape checks**

Define these columns: `id`, required `backlogId`, required `sprintId`, nullable `sourceMembershipId`, nullable `itemId`, nullable `itemKey`, nullable `itemTitle`, required `actorId`, required `requestCorrelationId`, required `occurredAt`, required sequence, nullable `previousEstimate`, `nextEstimate`, `previousDone`, `nextDone`, `relatedSprintId`, `relatedSprintName`, and `removalReason`.

The generated migration must encode these rules:

```sql
CHECK (char_length(btrim(request_correlation_id)) between 1 and 128),
CHECK ((related_sprint_id is null) or (related_sprint_name is not null)),
CHECK (
  (event_type in ('sprint_started','sprint_completed')
    and item_key is null and item_title is null
    and previous_estimate is null and next_estimate is null
    and previous_done is null and next_done is null and removal_reason is null)
  or (event_type = 'item_added'
    and item_key is not null and item_title is not null
    and previous_estimate is null
    and previous_done is null and next_done is null and removal_reason is null)
  or (event_type = 'item_removed'
    and item_key is not null and item_title is not null
    and next_estimate is null
    and previous_done is null and next_done is null and removal_reason is not null)
  or (event_type = 'estimate_changed'
    and item_key is not null and item_title is not null
    and previous_estimate is distinct from next_estimate
    and previous_done is null and next_done is null and removal_reason is null)
  or (event_type = 'item_completed'
    and item_key is not null and item_title is not null
    and previous_done = false and next_done = true
    and previous_estimate is null and next_estimate is null and removal_reason is null)
  or (event_type = 'item_reopened'
    and item_key is not null and item_title is not null
    and previous_done = true and next_done = false
    and previous_estimate is null and next_estimate is null and removal_reason is null)
)
```

Use composite FKs `(backlog_id,sprint_id) → sprints(backlog_id,id)`, `(sprint_id,source_membership_id) → sprint_items(sprint_id,id) ON DELETE SET NULL (source_membership_id)`, `(backlog_id,item_id) → items(backlog_id,id) ON DELETE SET NULL (item_id)` and `(backlog_id,related_sprint_id) → sprints(backlog_id,id) ON DELETE SET NULL (related_sprint_id)`. Add a unique index on `sequence`, plus indexes `(sprint_id,occurred_at,sequence)` and `(backlog_id,sprint_id)`.

- [ ] **Step 5: Define immutable completed-report tables**

`sprint_report_snapshots` stores the exact fields from the approved spec plus the bounded `requestCorrelationId` required for diagnosis. Use `numeric(12,2)` for point totals, non-negative integer checks for counts, `completed_item_count <= final_item_count`, the same 1–128 correlation check, a unique restrictive sprint FK, and:

```ts
finalDestinationSummary: jsonb("final_destination_summary")
  .$type<{ backlog: number; sprints: Array<{ id: string | null; name: string; count: number }> }>()
  .notNull(),
```

`sprint_report_items` includes `snapshotId`, `backlogId`, `sprintId`, nullable `sourceItemId`, stable key/title/type/kind, first/final timestamps, the three participation booleans, three nullable estimates, required final status category/outcome, and nullable stable destination ID/name. Enforce the outcome/destination pairing and uniqueness `(snapshot_id,item_key)`. Make its composite FK `(backlog_id,sprint_id,snapshot_id)` deferrable initially deferred so completion may insert all item rows before sealing them with the header.

- [ ] **Step 6: Add append-only triggers**

Generate functions that reject application `UPDATE OR DELETE` with SQLSTATE `55000`. Permit only nested FK nullification of `sprint_events.item_id`, `source_membership_id`, `related_sprint_id` and `sprint_report_items.source_item_id`, `destination_sprint_id` when `pg_trigger_depth() > 1`; every other column remains byte-for-byte immutable. Header deletion/update is always rejected.

Add a `BEFORE INSERT` trigger on `sprint_report_items` that rejects the row if its `snapshot_id` header already exists. Completion therefore pre-generates the snapshot UUID, inserts every row while the deferred FK is pending, then inserts the header last; no application transaction can append a late item afterward. Add a schema test proving this late insert is rejected.

Create the test-only helper:

```ts
export async function withSprintHistoryCleanup<T>(
  client: PoolClient,
  callback: () => Promise<T>,
): Promise<T> {
  if (process.env.NODE_ENV !== "test" || process.env.JIROO_RUN_DB_TESTS !== "1") {
    throw new Error("Sprint history cleanup is test-only.");
  }
  await client.query("set local session_replication_role = 'replica'");
  try { return await callback(); }
  finally { await client.query("set local session_replication_role = 'origin'"); }
}
```

Call it only inside an already-open test transaction.

- [ ] **Step 7: Generate and inspect migration 0012**

Run: `pnpm db:generate`

Rename the generated SQL/tag to `0012_jira_sprint_reports`, then inspect every FK and trigger: `sed -n '1,620p' drizzle/0012_jira_sprint_reports.sql`

Reject the migration if event/snapshot rows cascade from items, if snapshots cascade from sprints, if sequence is not global, or if an ordinary delete bypasses a trigger.

- [ ] **Step 8: Apply and verify Task 1**

Run:

```bash
pnpm db:migrate
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/db/schema/sprint-reports.integration.test.ts
pnpm typecheck
```

- [ ] **Step 9: Commit Task 1**

```bash
git add lib/db/schema test-utils/sprint-history-cleanup.ts drizzle
git commit -m "feat(reports): add immutable sprint history model"
```

---

### Task 2: Événements de démarrage, ajout, retrait et suppression

**Files:**
- Create: `lib/services/sprint-events.ts`
- Create: `lib/services/sprint-events.integration.test.ts`
- Modify: `lib/services/sprint-lifecycle.ts`
- Modify: `lib/services/sprint-membership.ts`
- Modify: `lib/services/sprints.ts`
- Modify: `lib/services/items.ts`
- Modify: `app/actions/sprints.ts`
- Modify: `app/actions/items.ts`
- Modify: `app/actions/sprints.test.ts`
- Modify: `app/actions/items.test.ts`

**Interfaces:**
- Produces discriminated `SprintEventCommand` and `appendSprintEventsInTx(tx, commands)`.
- Produces `removeDeletedItemsFromActiveSprintsInTx(tx, input)` for subtree deletion.
- Changes `startSprint`, `assignItemsToSprint`, `moveItemToSprint`, and `softDeleteItem` to accept one optional correlation ID defaulted with `randomUUID()`.

- [ ] **Step 1: Write RED integration tests for lifecycle and scope**

Cover this exact matrix:

```ts
it.each([
  ["planned → active", "item_added"],
  ["active → backlog", "item_removed"],
  ["active → planned", "item_removed"],
  ["planned → planned", null],
])("records only active-sprint scope for %s", async (_case, eventType) => {
  // Execute assignItemsToSprint with an explicit correlation and assert 0/1 event.
});
```

Also assert: start creates one `sprint_started` after commitment snapshots; `estimateAtStart` preserves `null`; add records the join estimate; remove records the pre-exit estimate and correct reason; move stores the related sprint ID/name; bulk membership inserts events in one statement with one correlation; no-op assignment emits neither activity nor event; soft-delete closes the active membership with `deleted`; restore leaves the item in the backlog until explicit re-add; a forced event insert failure rolls back membership and item deletion.

- [ ] **Step 2: Run event tests RED**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprint-events.integration.test.ts lib/services/sprint-lifecycle.integration.test.ts lib/services/sprints.integration.test.ts`

Expected: FAIL because the event helper is absent.

- [ ] **Step 3: Implement the discriminated command boundary**

Use this public shape so invalid column combinations cannot be authored by callers:

```ts
export type SprintEventCommand =
  | { type: "sprint_started" | "sprint_completed"; backlogId: string; sprintId: string;
      actorId: string; correlationId: string; occurredAt: Date }
  | { type: "item_added"; backlogId: string; sprintId: string; membershipId: string;
      item: { id: string; key: string; title: string }; nextEstimate: number | null;
      relatedSprint: { id: string; name: string } | null; actorId: string;
      correlationId: string; occurredAt: Date }
  | { type: "item_removed"; backlogId: string; sprintId: string; membershipId: string;
      item: { id: string; key: string; title: string }; previousEstimate: number | null;
      reason: "manual" | "moved" | "deleted";
      relatedSprint: { id: string; name: string } | null; actorId: string;
      correlationId: string; occurredAt: Date }
  | { type: "estimate_changed"; backlogId: string; sprintId: string; membershipId: string;
      item: { id: string; key: string; title: string }; previousEstimate: number | null;
      nextEstimate: number | null; actorId: string; correlationId: string; occurredAt: Date }
  | { type: "item_completed" | "item_reopened"; backlogId: string; sprintId: string;
      membershipId: string; item: { id: string; key: string; title: string };
      actorId: string; correlationId: string; occurredAt: Date };
```

`appendSprintEventsInTx` trims/validates correlation length, maps commands to rows, returns early on an empty array, then performs exactly one `tx.insert(sprintEvents).values(rows)` call.

- [ ] **Step 4: Record the authoritative start boundary**

Update `startSprint` to accept `requestCorrelationId = randomUUID()`. Keep the existing deterministic locks, batch-update `estimateAtStart` where possible, append one `sprint_started` event at `startedAt`, then update sprint state. Pass the same correlation to commitment activities. A failure at any later statement must leave sprint planned, estimates unset and no event/activity.

- [ ] **Step 5: Record add/remove across every membership path**

In `assignItemsToSprintInTx`, retain the existing backlog/sprint/item lock order and calculate commands while iterating. Use:

- `manual` when destination is backlog;
- `moved` when destination is another sprint;
- `item_added` only when the destination is active;
- `item_removed` only when the source is active;
- no event if every affected sprint is planned.

Insert all membership rows first, append the collected reporting events once, then insert activities once. Pass correlation from `bulkUpdateItems`, `assignItemsToSprint`, `moveItemToSprint` and item creation rather than silently dropping it.

- [ ] **Step 6: Make soft deletion close active membership atomically**

Probe the target backlog without locking, lock the backlog, then lock active sprint/memberships and subtree items in the global order. `removeDeletedItemsFromActiveSprintsInTx` updates every affected open membership to `{ leftAt: now, outcome: "removed" }` and appends `item_removed` with reason `deleted` before setting `deletedAt`. Subtasks without sprint membership produce no sprint event. `restoreItem` remains unchanged and never recreates membership.

- [ ] **Step 7: Generate correlations in actions and revalidate reports**

In both action files create one `const requestCorrelationId = randomUUID()` after authorization and pass it through. Extend revalidation:

```ts
function revalidateBacklog(backlogKey: string) {
  revalidatePath(`/b/${backlogKey}`);
  revalidatePath(`/b/${backlogKey}/reports`);
}
```

Action tests assert that one correlation is forwarded and that resource/permission failures still happen before the service call.

- [ ] **Step 8: Verify Task 2**

Run:

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprint-events.integration.test.ts lib/services/sprint-lifecycle.integration.test.ts lib/services/sprints.integration.test.ts lib/services/items.integration.test.ts
pnpm exec vitest run app/actions/sprints.test.ts app/actions/items.test.ts
pnpm typecheck
```

- [ ] **Step 9: Commit Task 2**

```bash
git add lib/services/sprint-events.ts lib/services/sprint-events.integration.test.ts lib/services/sprint-lifecycle.ts lib/services/sprint-membership.ts lib/services/sprints.ts lib/services/items.ts app/actions/sprints.ts app/actions/items.ts app/actions/sprints.test.ts app/actions/items.test.ts
git commit -m "feat(reports): record sprint scope lifecycle"
```

---

### Task 3: Événements d'estimation, complétion et réouverture sur toutes les voies

**Files:**
- Modify: `lib/services/sprint-events.ts`
- Modify: `lib/services/sprint-events.integration.test.ts`
- Modify: `lib/services/items.ts`
- Modify: `lib/services/items.integration.test.ts`
- Modify: `lib/services/item-bulk.ts`
- Modify: `lib/services/item-bulk.integration.test.ts`
- Modify: `app/actions/items.ts`
- Modify: `app/actions/items.test.ts`

**Interfaces:**
- Produces `recordActiveItemMutationsInTx(tx, input)`.
- Changes `moveItem(input, actorId, requestCorrelationId?)` to carry a correlation just like `updateItem` and `bulkUpdateItems`.
- Guarantees at most two report events per changed item: one estimate event and one done-boundary event.

- [ ] **Step 1: Write RED parity tests**

For an open active-sprint membership, exercise single edit, bulk edit and board drag with explicit correlations. Assert:

```ts
expect(events.map((event) => event.eventType)).toEqual([
  "estimate_changed", "item_completed", "item_reopened", "item_completed",
]);
expect(events.map((event) => event.requestCorrelationId))
  .toContain("the-request-correlation");
```

Cover `null → 5`, `5 → null`, upward/downward values, same-value no-op, non-done→non-done transition, done→done transition, bulk with mixed current statuses, a combined single update changing estimate and category, and a forced event failure rolling back `items`, `closedAt`, activities and all batch rows.

- [ ] **Step 2: Run mutation tests RED**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/items.integration.test.ts lib/services/item-bulk.integration.test.ts lib/services/sprint-events.integration.test.ts`

Expected: FAIL because estimate/status reporting is absent.

- [ ] **Step 3: Implement one batch-aware mutation helper**

Add:

```ts
export type ActiveItemMutation = {
  item: { id: string; key: string; title: string };
  estimate?: { previous: number | null; next: number | null };
  done?: { previous: boolean; next: boolean };
};

export async function recordActiveItemMutationsInTx(
  tx: SprintTx,
  input: { backlogId: string; actorId: string; correlationId: string;
    occurredAt: Date; mutations: readonly ActiveItemMutation[] },
): Promise<number>;
```

The helper queries all open memberships joined to `sprints.state = 'active'` with one `IN` query, ordered by item ID, builds estimate events only for `previous !== next`, builds done events only when the boolean changes, and calls `appendSprintEventsInTx` once.

- [ ] **Step 4: Wire single update and drag**

Treat `estimatePoints` as a backlog-locking mutation in `updateItem`. Change the status helper to return `{ previousCategory, nextCategory, patch, activity }`, so reporting derives `done` from categories without an extra lookup. After determining the real patch and before returning, call `recordActiveItemMutationsInTx` in the same transaction.

Add `requestCorrelationId = randomUUID()` to `moveItem`; use it for both rank/status activities and reporting. Rank-only drags emit no sprint event. A status change within `todo|in_progress` emits the existing activity but no reporting event.

- [ ] **Step 5: Wire bulk without per-row report queries**

Build `ActiveItemMutation[]` during the current bulk loop, preserving the shared `now` and correlation. Execute item updates and activities as existing code does, then call the helper once. Pass correlation into sprint bulk membership and every activity row. Assert the query counter does not grow with 500 selected items beyond the fixed number of selection, updates/batches and one membership/report lookup.

- [ ] **Step 6: Verify action boundaries**

Update `moveItemAction` to create and forward a UUID and revalidate `/reports`. Existing update/bulk actions already create one correlation; tests must assert the exact same value reaches the service and no caller-provided actor/correlation is accepted.

- [ ] **Step 7: Verify Task 3**

Run:

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/items.integration.test.ts lib/services/item-bulk.integration.test.ts lib/services/sprint-events.integration.test.ts
pnpm exec vitest run app/actions/items.test.ts
pnpm typecheck
pnpm lint
```

- [ ] **Step 8: Commit Task 3**

```bash
git add lib/services/sprint-events.ts lib/services/sprint-events.integration.test.ts lib/services/items.ts lib/services/items.integration.test.ts lib/services/item-bulk.ts lib/services/item-bulk.integration.test.ts app/actions/items.ts app/actions/items.test.ts
git commit -m "feat(reports): record sprint progress changes"
```

---

### Task 4: Calculs purs et snapshot atomique de clôture

**Files:**
- Create: `lib/reports/sprint-calculations.ts`
- Create: `lib/reports/sprint-calculations.test.ts`
- Modify: `lib/services/sprint-lifecycle.ts`
- Modify: `lib/services/sprint-lifecycle.integration.test.ts`
- Modify: `app/actions/sprints.ts`
- Modify: `app/actions/sprints.test.ts`

**Interfaces:**
- Produces `calculateSprintScopeMetrics`, `buildCompletedParticipantRows`, `calculateVelocity`.
- Produces types `SprintScopeMetrics`, `CompletedParticipantInput`, `CompletedParticipantRow`, `VelocityInput`, `VelocityCalculation`.
- `completeSprint(input, actorId, requestCorrelationId?)` writes one header, one row per stable item key and one `sprint_completed` event before closing the sprint.
- Later read services use the same pure functions for the active projection and velocity; they do not duplicate formulas.

- [ ] **Step 1: Write RED unit tests for every formula**

Create table-driven tests with exact expected numbers:

```ts
it("keeps commitment stable while exposing gross and net scope", () => {
  expect(calculateSprintScopeMetrics({
    initial: [{ estimateAtStart: 5 }, { estimateAtStart: null }],
    current: [
      { estimate: 8, done: true },
      { estimate: 3, done: false },
      { estimate: null, done: false },
    ],
    events: [
      { type: "estimate_changed", previousEstimate: 5, nextEstimate: 8 },
      { type: "item_added", nextEstimate: 3 },
      { type: "item_added", nextEstimate: null },
      { type: "item_removed", previousEstimate: 3 },
    ],
  })).toMatchObject({
    initialItemCount: 2,
    committedPoints: 5,
    initialUnestimatedCount: 1,
    currentItemCount: 3,
    currentScopePoints: 11,
    currentUnestimatedCount: 1,
    completedItemCount: 1,
    completedPoints: 8,
    grossAddedPoints: 3,
    grossRemovedPoints: 3,
    netEstimateDelta: 3,
    scopeEventCount: 4,
  });
});
```

Add cases for repeated add/remove/re-add of one key, add-null/remove-null, negative estimate delta, complete/reopen not changing scope, a removed-done item not counting as completed, and decimal sums normalized to two decimals.

- [ ] **Step 2: Write RED completion integration tests**

Build a sprint containing: one initial completed task, one initial unestimated task carried to backlog, one post-start task completed, one task added/removed/re-added then carried to a planned sprint. Assert a single snapshot header, one row per item key, correct first/final timestamps and all summary numbers.

Also cover:

- destination summary `{ backlog, sprints }` for backlog, existing sprint and newly created sprint;
- snapshot stability after title/kind/estimate/status/membership changes, soft-delete and privileged hard fixture cleanup;
- abort with `Le contenu historique du sprint est incohérent.` if a participant cannot supply the required stable source for a snapshot;
- two concurrent completion attempts produce exactly one snapshot and one successful completion;
- injected failure on the final `UPDATE sprints` rolls back snapshot header/items, event, closed memberships and destination memberships.

- [ ] **Step 3: Run calculation and completion tests RED**

Run:

```bash
pnpm exec vitest run lib/reports/sprint-calculations.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprint-lifecycle.integration.test.ts
```

Expected: unit module absent and no completed snapshot rows.

- [ ] **Step 4: Implement deterministic pure calculations**

Use a decimal normalizer at every public result boundary:

```ts
const points = (value: number | null | undefined) => value ?? 0;
const roundPoints = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
```

`calculateSprintScopeMetrics` must derive commitment only from `initial`, completed points only from currently participating done work, gross additions/removals from their event-side estimate, and net estimate delta from `next - previous`. `item_completed` and `item_reopened` never affect total scope.

`buildCompletedParticipantRows` groups by `itemKey`, sorts intervals by `joinedAt`, and emits exactly one row with:

```ts
type CompletedParticipantRow = {
  itemKey: string;
  firstJoinedAt: Date;
  finalLeftAt: Date;
  initialCommitment: boolean;
  addedAfterStart: boolean;
  removedAfterStart: boolean;
  estimateAtStart: number | null;
  estimateAtFinalParticipation: number | null;
  estimateAtCompletion: number | null;
  finalOutcome: "completed" | "removed" | "carried_to_backlog" | "carried_to_sprint";
};
```

For a final open interval, `finalLeftAt` is the completion time and final estimate is the locked current estimate. For a previously removed final interval, use its `item_removed.previousEstimate`. Only outcome `completed` receives `estimateAtCompletion`.

An interval is in the initial commitment only when it spans `startedAt` and has no matching post-start `item_added` event; this preserves an initially unestimated membership whose `estimateAtStart` is legitimately null. `addedAfterStart` and `removedAfterStart` come from the existence of their respective events, not timestamp guesses.

- [ ] **Step 5: Lock the complete report source before calculation**

In `completeSprint`, after backlog and active sprint:

1. lock all sprint memberships, including closed intervals, ordered by `itemId,id`;
2. lock every still-existing participant item and its status, ordered by item ID, without filtering `deletedAt`;
3. lock/read all sprint events ordered by `occurredAt,sequence`;
4. resolve and lock the destination sprint(s) in UUID order;
5. reject a participant lacking key/title/type/kind/final status input before any snapshot insert.

Preserve the incomplete-subtask guard and its existing error/result shape.

- [ ] **Step 6: Insert immutable snapshot before membership moves**

Use one `now` for `completedAt`, snapshot `createdAt`, final leave times and the completion event. Pre-generate the snapshot UUID, insert item rows in batches of 1,000 ordered by stable key while their FK is deferred, then insert the header totals, destination summary and the same request correlation to seal the snapshot. Append `sprint_completed`, close current memberships, insert carry-over memberships, write existing activities and finally mark the sprint completed.

The source values for each snapshot line are fixed as follows:

- stable key/title/type/kind and final status category: locked item row at closure;
- first/final participation and start estimate: grouped membership/event history;
- current final estimate: locked item estimate for an open final interval;
- removed final estimate: matching `item_removed.previousEstimate`;
- destination name: copied from the locked or newly inserted planned sprint.

Header definitions are also fixed: `finalItemCount` is the number of open memberships immediately before closure, `finalUnestimatedCount` is the null-estimate subset of that scope, and `completedItemCount`/`completedPoints` are the done subset and its current estimates. Previously removed participants remain in item rows but never inflate those final-scope totals.

- [ ] **Step 7: Pass and verify one completion correlation**

`completeSprintAction` creates one UUID after authorization, passes it to the service, and revalidates backlog plus reports. Add `Le contenu historique du sprint est incohérent.` only to the known safe completion error set; database/trigger details retain the generic `Clôture du sprint impossible.` response.

- [ ] **Step 8: Verify Task 4**

Run:

```bash
pnpm exec vitest run lib/reports/sprint-calculations.test.ts app/actions/sprints.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprint-lifecycle.integration.test.ts
pnpm typecheck
pnpm lint
```

- [ ] **Step 9: Commit Task 4**

```bash
git add lib/reports/sprint-calculations.ts lib/reports/sprint-calculations.test.ts lib/services/sprint-lifecycle.ts lib/services/sprint-lifecycle.integration.test.ts app/actions/sprints.ts app/actions/sprints.test.ts
git commit -m "feat(reports): snapshot completed sprints"
```

---

### Task 5: Read models de rapport actif, historique et vélocité

**Files:**
- Create: `lib/services/sprint-reports.ts`
- Create: `lib/services/sprint-reports.integration.test.ts`
- Modify: `lib/reports/sprint-calculations.ts`
- Modify: `lib/reports/sprint-calculations.test.ts`

**Interfaces:**
- Produces `listReportableSprints(backlogId)`.
- Produces `getSprintReport(backlogId, sprintId, { itemPage, eventPage, pageSize })`.
- Produces `getVelocityReport(backlogId, limit)`.
- Produces discriminated DTOs `ActiveSprintReport`, `CompletedSprintReport`, `LegacySprintReport`, `SprintReport`, `VelocityReport`.

- [ ] **Step 1: Write RED service tests for reads and isolation**

Assert the exact public union:

```ts
type SprintReport =
  | { kind: "active"; statusLabel: "Données en cours"; /* identity, metrics, pages */ }
  | { kind: "completed"; statusLabel: "Historique figé"; snapshotAt: Date; /* snapshot */ }
  | { kind: "legacy_unavailable"; statusLabel: "Historique détaillé indisponible";
      sprint: ReportableSprint };
```

Tests cover active, completed, legacy completed, empty active sprint, all-unestimated active sprint, explicit planned sprint returning `null`, missing/foreign sprint returning `null`, deleted item rendered from frozen event/snapshot identity, and equal-timestamp journal ordering by sequence.

For velocity, create at least these immutable headers in completion order:

| Sprint | Commitment | Completed | Included | Reason |
|---|---:|---:|---|---|
| A | 10 | 0 | yes | point data exists |
| B | 0 | 0 | no | `no_point_data` |
| C | 8 | 5 | yes | point data exists |
| Legacy | — | — | no | `history_unavailable` |

Expected average for A+B+C+Legacy is `2.5`, population `2`, because `(0 + 5) / 2` includes A and excludes B/Legacy.

- [ ] **Step 2: Run read tests RED**

Run:

```bash
pnpm exec vitest run lib/reports/sprint-calculations.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprint-reports.integration.test.ts
```

Expected: service module absent.

- [ ] **Step 3: Implement explicit DTOs and bounded commands**

Define:

```ts
const reportPageCommand = z.object({
  itemPage: z.number().int().min(1),
  eventPage: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
});
const velocityLimit = z.union([z.literal(7), z.literal(12)]);

export type VelocityBar = {
  sprintId: string;
  sprintName: string;
  completedAt: Date;
  committedPoints: number | null;
  completedPoints: number | null;
  includedInAverage: boolean;
  excludedReason: "no_point_data" | "history_unavailable" | null;
};
```

Every DTO contains both inputs and computed values: item count, point sum, unestimated count, gross additions/removals, net estimate delta, and the inclusion flags used by the UI.

- [ ] **Step 4: Implement selector semantics**

`listReportableSprints` returns `{ sprints, plannedCount }`. `sprints` contains active first, then completed by `completedAt DESC,id DESC`; each row includes `hasSnapshot`. It never returns planned sprints as selectable options. `plannedCount` supports the distinct “only planned sprints” empty state.

- [ ] **Step 5: Implement active projection without N+1**

Resolve the sprint with `(backlogId,sprintId,state='active')`. Read:

- commitment/current/item-count aggregates as grouped SQL, without materializing the complete membership list in application memory;
- current open items/statuses in one join;
- aggregate event totals in one grouped query;
- the requested event page plus count in two parallel queries ordered `occurredAt,sequence`, with one left join to `user` for the actor display name;
- one logical participant page plus count using a SQL CTE that unions membership item keys and event item keys, groups by key, then applies `LIMIT/OFFSET` before joining current identities.

The CTE's logical participant key is always the stable item key, never nullable `itemId`, so a delete and a re-add interval cannot duplicate a row. Current members classify as completed/incomplete by status category; non-current participants classify as removed. Links are present only when current/source item ID still exists and belongs to the canonical backlog.

Compare open-membership, joined-item and joined-status counts before returning. Any mismatch throws `InconsistentSprintReportError`; the route lets it reach its safe segment error boundary and never returns partial totals.

- [ ] **Step 6: Implement completed and legacy reads**

Resolve the sprint by backlog first. If completed without a snapshot, return `legacy_unavailable` and do not derive totals from items or memberships. Otherwise read exactly one immutable header, a paged item query/count, and a paged event query/count. Primary metrics are copied from the header; events are explanatory only.

Map item sections by final outcome/status:

- `completed`: outcome `completed`;
- `incomplete`: active non-done rows only;
- `removed`: outcome `removed`;
- `carried`: outcomes `carried_to_backlog|carried_to_sprint`.

Return section totals independently of the current page so headings remain accurate.

- [ ] **Step 7: Implement velocity from at most twelve headers**

Select the most recent `limit` completed sprints with a left join to immutable headers. Preserve chronological display order after selecting newest-first. Map legacy and zero/zero exclusions, then call:

```ts
export function calculateVelocity(rows: readonly VelocityInput[]): VelocityCalculation {
  const included = rows.filter((row) => row.hasSnapshot
    && row.committedPoints !== null && row.completedPoints !== null
    && (row.committedPoints !== 0 || row.completedPoints !== 0));
  return {
    population: included.length,
    averageCompletedPoints: included.length === 0
      ? null
      : roundPoints(included.reduce((sum, row) => sum + (row.completedPoints ?? 0), 0)
          / included.length),
  };
}
```

Return `state: "empty"` and label `Pas encore de vélocité` when population is zero; never return a forecast.

- [ ] **Step 8: Prove query bounds and concurrent consistency**

Instrument the DB query callback in the integration test. Compare a 5-item and 1,000-item active sprint: query count must remain fixed, while item/event pages remain at 50. For completed reports, prove primary totals still read correctly after all source items are mutated or purged. Run an active read concurrently with estimate/membership changes and assert it returns either the full before-transaction state or full after-transaction state, never a mixed impossible total.

- [ ] **Step 9: Verify Task 5**

Run:

```bash
pnpm exec vitest run lib/reports/sprint-calculations.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/sprint-reports.integration.test.ts
pnpm typecheck
pnpm lint
```

- [ ] **Step 10: Commit Task 5**

```bash
git add lib/reports/sprint-calculations.ts lib/reports/sprint-calculations.test.ts lib/services/sprint-reports.ts lib/services/sprint-reports.integration.test.ts
git commit -m "feat(reports): add sprint and velocity read models"
```

---

### Task 6: Composants accessibles de rapport et graphique sémantique

**Files:**
- Create: `components/reports/report-navigation.tsx`
- Create: `components/reports/report-navigation.test.tsx`
- Create: `components/reports/report-pagination.tsx`
- Create: `components/reports/sprint-report.tsx`
- Create: `components/reports/sprint-report.test.tsx`
- Create: `components/reports/sprint-event-journal.tsx`
- Create: `components/reports/sprint-event-journal.test.tsx`
- Create: `components/reports/velocity-report.tsx`
- Create: `components/reports/velocity-report.test.tsx`

**Interfaces:**
- Consumes only serializable forms of Task 5 DTOs; dates cross the page boundary as ISO strings and sequence values as strings.
- Produces `ReportNavigation`, `SprintReportView`, `SprintEventJournal`, `VelocityReportView`.
- Produces no mutation action and imports no database module.

- [ ] **Step 1: Write RED navigation and state tests**

Render each report variant and assert:

- tabs `Rapport de sprint` and `Vélocité` have correct native hrefs and `aria-current="page"`;
- sprint selector contains active/completed only and submits `report=sprint&sprint=<uuid>`;
- active badge says `Données en cours`;
- completed badge says `Historique figé` and exposes an exact snapshot `<time>`;
- legacy says `Historique détaillé indisponible` without fabricated totals;
- no sprints, only planned sprints, empty active sprint, all-unestimated and no eligible velocity each render distinct copy;
- deleted/no-longer-accessible items have frozen key/title without an anchor.

- [ ] **Step 2: Write RED chart/table parity tests**

Given three velocity bars, assert each sprint name and both exact values appear in the semantic table, every eligible row links to `?report=sprint&sprint=<uuid>`, and chart elements expose the same accessible labels:

```ts
expect(screen.getByLabelText("Sprint 3 — engagement 8 points, terminé 5 points"))
  .toBeInTheDocument();
expect(screen.getByRole("row", { name: /Sprint 3 8 5 Incluse/ }))
  .toBeInTheDocument();
```

Assert the mean label says `Moyenne des points terminés : 2,5 sur 2 sprints inclus`, zero-completion remains included, zero/zero explains `Aucune donnée de points`, and legacy explains `Historique détaillé indisponible`.

- [ ] **Step 3: Run component tests RED**

Run: `pnpm exec vitest run components/reports`

Expected: report components do not exist.

- [ ] **Step 4: Implement URL-native report controls**

Keep the controls server-renderable. Use links for report/limit choices and a GET form for sprint selection:

```tsx
<form action={`/b/${backlogKey}/reports`} method="get">
  <input type="hidden" name="report" value="sprint" />
  <label htmlFor="report-sprint">Sprint</label>
  <select id="report-sprint" name="sprint" defaultValue={selectedSprintId}>
    {sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}
  </select>
  <Button type="submit">Afficher</Button>
</form>
```

Do not use `useSearchParams`; no client bundle or Suspense boundary is needed for these controls.

- [ ] **Step 5: Render metric inputs and results together**

`SprintReportView` renders sprint identity, goal and actual dates, then a `<dl>` for commitment, completed, current/final scope and every unestimated count. The scope-change summary shows gross added, gross removed, net estimate delta and event count, including zeros. Use `Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })` consistently.

Item rows show stable key/title, kind/type, estimate, status/outcome, `Ajouté après démarrage`, `Retiré après démarrage`, and estimate evolution for initial-commitment work only when values differ:

```tsx
{item.initialCommitment && start !== final
  ? <span>{pointValue(start)} → {pointValue(final)} pts</span>
  : null}
```

Existing accessible items link to `/b/${backlogKey}?item=${encodeURIComponent(item.itemKey)}`; frozen rows remain plain text.

- [ ] **Step 6: Render all item sections and independent pages**

Use headings and counts for `Terminés`, `Non terminés`, `Retirés` and `Reportés`. Omit no category heading when its total is nonzero, even if the requested combined item page has no row from that category. `ReportPagination` preserves `report`, `sprint` and `eventPage` when changing `itemPage`; the journal preserves `itemPage` when changing `eventPage`.

- [ ] **Step 7: Render chronological journal semantics**

Map all seven event types to French sentences with actor, time and before/after values. Examples:

- `item_added`: `a ajouté CASS-42 au sprint avec 5 pts`;
- `item_removed`: `a retiré CASS-42 vers Sprint 12 avec 5 pts`;
- `estimate_changed`: `a modifié CASS-42 : Non estimé → 8 pts`;
- `item_completed` / `item_reopened`: explicit completed/reopened wording.

Render an ordered list in ascending time/sequence and `<time dateTime=...>`. Do not expose correlation IDs in the visible UI.

- [ ] **Step 8: Implement chart plus synchronized table**

Use a fixed viewBox SVG or CSS chart with one labeled group per sprint, two side-by-side bars normalized against `max(committed,completed,average,1)`, numeric text labels, and a horizontal average line only when average is non-null. Color distinguishes series but labels and table duplicate all meaning. The table contains columns Sprint, Engagement, Terminé, Moyenne, Inclusion and Raison; its sprint link is the keyboard path to detail. No tooltip or pointer handler is required.

- [ ] **Step 9: Verify Task 6**

Run:

```bash
pnpm exec vitest run components/reports
pnpm typecheck
pnpm lint
```

- [ ] **Step 10: Commit Task 6**

```bash
git add components/reports
git commit -m "feat(reports): render sprint history and velocity"
```

---

### Task 7: Route Next.js, état URL, navigation et erreur sûre

**Files:**
- Create: `lib/reports/report-url.ts`
- Create: `lib/reports/report-url.test.ts`
- Create: `app/(app)/b/[key]/reports/page.tsx`
- Create: `app/(app)/b/[key]/reports/page.test.tsx`
- Create: `app/(app)/b/[key]/reports/error.tsx`
- Create: `app/(app)/b/[key]/reports/error.test.tsx`
- Create: `app/(app)/b/[key]/reports/loading.tsx`
- Modify: `components/shell/view-bar.tsx`
- Modify: `components/shell/view-bar.test.tsx`
- Modify: `lib/items/shell.ts`
- Modify: `lib/items/shell.test.ts`
- Modify: `components/shell/shell-breadcrumb.test.tsx`

**Interfaces:**
- Produces `parseReportUrlState(query)` for safe non-resource defaults.
- Produces route `/b/[key]/reports` with `report=sprint|velocity`, resource `sprint=<uuid>`, `limit=7|12`, `itemPage` and `eventPage`.
- Uses Next.js 16.2.7 async `params/searchParams`, `notFound()` and `unstable_retry()` exactly as documented locally.

- [ ] **Step 1: Write RED URL tests**

Define expected normalization:

```ts
expect(parseReportUrlState({})).toEqual({
  report: "sprint", sprintId: null, limit: 7, itemPage: 1, eventPage: 1,
});
expect(parseReportUrlState({ report: "velocity", limit: "12" }))
  .toMatchObject({ report: "velocity", limit: 12 });
expect(parseReportUrlState({ report: "burndown", limit: "99", itemPage: "-1" }))
  .toMatchObject({ report: "sprint", limit: 7, itemPage: 1 });
```

`parseReportUrlState` preserves the first raw `sprint` string without validating it. The page performs UUID validation and conceals malformed resource identifiers with `notFound()`; it never normalizes an invalid resource to a different sprint.

- [ ] **Step 2: Write RED route authorization tests**

Mock session, backlog resolution and report reads. Assert:

- missing, archived or inaccessible backlog calls `notFound` before any report read;
- malformed sprint UUID calls `notFound` before `getSprintReport`;
- a foreign/missing/planned explicit sprint causes `notFound` after a backlog-filtered read;
- default sprint is active, otherwise newest completed;
- no reportable sprint distinguishes `plannedCount > 0` from zero;
- viewer/browse-only capability renders the same complete read data;
- velocity passes exactly 7 or 12;
- route serializes dates to ISO and big sequence to string before component props.

- [ ] **Step 3: Write RED error-boundary tests**

Render the client boundary with an error containing `postgres://secret`, headers and UUID. Assert none appear; heading `Impossible de charger les rapports` and button `Réessayer` appear; clicking calls `unstable_retry` once.

- [ ] **Step 4: Run route/navigation tests RED**

Run:

```bash
pnpm exec vitest run lib/reports/report-url.test.ts 'app/(app)/b/[key]/reports/page.test.tsx' 'app/(app)/b/[key]/reports/error.test.tsx' components/shell/view-bar.test.tsx lib/items/shell.test.ts components/shell/shell-breadcrumb.test.tsx
```

- [ ] **Step 5: Implement the server page with canonical read order**

The page order is fixed:

```ts
const [{ key }, query] = await Promise.all([params, searchParams]);
const state = parseReportUrlState(query);
if (state.sprintId && !z.uuid().safeParse(state.sprintId).success) notFound();
const session = await requireAppPageSession();
const backlog = await getBacklogByKeyForUser(key, session.user.id);
if (!backlog || backlog.archivedAt) notFound();
const capabilities = await getBacklogCapabilities(session.user.id, backlog.id);
if (!capabilities) notFound();
const selector = await listReportableSprints(backlog.id);
```

For sprint report, choose explicit ID or active/newest completed, then call `getSprintReport` with page size 50. If explicit/default ID exists but service returns null, call `notFound`. For velocity, call `getVelocityReport(backlog.id,state.limit)`. Do not fetch mutable item lists for completed reports in the route.

- [ ] **Step 6: Implement safe error and loading files**

`error.tsx` starts with `"use client"`, shows generic copy, and invokes `unstable_retry`. It neither logs the full error to the browser console nor renders it. `loading.tsx` uses existing `Skeleton` components with an accessible `Chargement des rapports…` status and no fake metric values.

- [ ] **Step 7: Add completed-feature navigation**

In `ViewBar`, place `Rapports` immediately after `Releases`, both as native links that drop backlog view query state:

```tsx
<Link href={`/b/${backlogKey}/releases`}>Releases</Link>
<Link href={`/b/${backlogKey}/reports`}>Rapports</Link>
```

Do not add Burndown. Extend `deriveShellContext` to match `^/b/([^/]+)/(releases|reports)(?:/.*)?$`, preserve the actual backlog key rather than the first backlog, and set section to `Releases` or `Rapports` for the breadcrumb.

- [ ] **Step 8: Verify production Next behavior**

Run the targeted tests, then:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

The build must not emit async params/searchParams deprecations, missing Suspense errors or Client/Server boundary violations.

- [ ] **Step 9: Commit Task 7**

```bash
git add lib/reports/report-url.ts lib/reports/report-url.test.ts 'app/(app)/b/[key]/reports' components/shell/view-bar.tsx components/shell/view-bar.test.tsx lib/items/shell.ts lib/items/shell.test.ts components/shell/shell-breadcrumb.test.tsx
git commit -m "feat(reports): expose sprint and velocity route"
```

---

### Task 8: Acceptation Playwright, preuves et audit final

**Files:**
- Create: `e2e/sprint-reports.spec.ts`
- Modify: `e2e/global.setup.ts`
- Modify: `audit/README.md`
- Modify: `audit/roadmap.md`
- Modify: `audit/bugs.md`
- Modify: `audit/ux.md`
- Modify: `audit/benchmark.md`
- Create during persisted run: `audit/screenshots/<run-id>-sprint-reports-*.png`
- Create during persisted run: `audit/console/<run-id>-sprint-reports-*.log`
- Create during persisted run: `audit/network/<run-id>-sprint-reports-*.log`

**Interfaces:**
- Consumes all delivered user paths and existing run-scoped audit helpers.
- Produces deterministic E2E fixtures for three completed sprints plus one active/empty-state backlog.
- Produces an audit verdict, defect references and the next three priorities without claiming untested parity.

- [ ] **Step 1: Write the audited Playwright harness and fixtures**

Reuse `writeAuditText`, `writeAuditScreenshot`, isolated DB reset guards, browser fault monitoring and second-context helpers from `e2e/releases.spec.ts`. Add report tables to imports/reset coverage without weakening the current database identity check.

Create three sprints with these final metrics:

| Sprint | Commitment | Completed | Scope history | Final incomplete destination |
|---|---:|---:|---|---|
| Sprint Rapport 1 | 8 | 5 | add 3, estimate 5→8, complete/reopen/complete | backlog |
| Sprint Rapport 2 | 13 | 0 | remove 5, null→3→null | planned sprint |
| Sprint Rapport 3 | 0 | 0 | unestimated only | backlog |

Use service fixtures only for prerequisites; the audited mutations themselves use the real single edit, bulk toolbar and board drag UI.

- [ ] **Step 2: Cover active report and live refresh**

Start a sprint with estimated/unestimated work, open `/b/CASS/reports`, assert default active selection and `Données en cours`. Add/remove/re-estimate/complete/reopen through all three mutation paths, reload, then assert metrics, badges, item sections and chronological journal after every authoritative refresh.

- [ ] **Step 3: Cover both completion destinations and frozen history**

Complete one sprint to backlog and one to a planned sprint through the real lifecycle dialogs. Verify item outcomes and destination names. After closure rename, re-estimate, move, change status, soft-delete and purge source fixtures through the permitted test cleanup; reload and assert frozen titles, values, totals and no link for the missing source.

- [ ] **Step 4: Cover velocity rules and accessibility**

Open 7 and 12 limits, assert exact bars/table values, mean `(5 + 0) / 2 = 2.5`, inclusion of Sprint Rapport 2, exclusion of Sprint Rapport 3 and explanation for each. Tab through report selector, sprint links and table detail links; confirm no data is available only on hover and that chart `aria-label` values match table cells.

- [ ] **Step 5: Cover all empty and exceptional states**

Exercise separate fixture backlogs for: no sprint, only planned sprints, empty active sprint, all-unestimated active sprint, no eligible velocity and a legacy completed sprint without snapshot. Inject one expected report read failure, whitelist its known HTTP/console evidence explicitly, assert the generic boundary, retry after removing the fault, and ensure no secret/SQL text appears.

- [ ] **Step 6: Cover viewer, second context and concealment**

Repeat critical completed and velocity reads in a second authenticated browser context and as the real reader account. Assert identical report numbers, no mutation affordance, and successful reload. Navigate with malformed and foreign sprint UUIDs; record expected 404 responses and verify the body does not contain the foreign sprint/backlog name.

- [ ] **Step 7: Capture responsive and performance evidence**

Capture final active, completed and velocity screenshots at desktop plus 390×844. Mobile parity is not a blocker, but there must be no horizontal page overflow that hides values or controls. Record navigation duration, response status and journal/item page sizes; flag any material regression against existing local report/release navigation baselines rather than inventing a production SLA.

- [ ] **Step 8: Run the full verification ladder**

Run in order:

```bash
pnpm exec vitest run lib/reports components/reports 'app/(app)/b/[key]/reports'
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/db/schema/sprint-reports.integration.test.ts lib/services/sprint-events.integration.test.ts lib/services/sprint-lifecycle.integration.test.ts lib/services/sprint-reports.integration.test.ts lib/services/items.integration.test.ts lib/services/item-bulk.integration.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
JIROO_E2E_RUN_ID=sprint-reports-final JIROO_E2E_PERSIST_AUDIT=1 pnpm test:e2e -- e2e/sprint-reports.spec.ts
git diff --check
```

Expected: every command exits 0; console/network artifacts contain no unexpected errors, unhandled rejections, failed requests, 4xx/5xx responses or secret fragments.

- [ ] **Step 9: Update audit documents with evidence-backed conclusions**

Append the tested scope, run ID, screenshots/log paths, durations, fixed/new bug IDs and residual risks. Benchmark Jira, Linear, ClickUp, Azure DevOps, GitHub Projects and Plane only for behavior supported by cited observations; explicitly state that Burndown and forecast remain unimplemented. End `audit/roadmap.md` with exactly three next priorities:

1. burndown and planning predictability derived from `sprint_events`;
2. Releases PR2 merge/delete-transfer/manual ordering/release notes;
3. remaining cross-browser/mobile and production-volume validation.

- [ ] **Step 10: Final review and commit**

Use `superpowers:requesting-code-review`, fix every confirmed finding, rerun the affected verification plus the full required ladder, then use `superpowers:verification-before-completion`.

```bash
git add e2e/sprint-reports.spec.ts e2e/global.setup.ts audit
git commit -m "test(reports): validate sprint history and velocity"
```

## Final Acceptance Checklist

- [ ] Every active-sprint scope, estimate and done-boundary mutation writes the correct event in the same transaction.
- [ ] Bulk paths batch report insertion and share one bounded correlation identifier.
- [ ] Equal timestamps are deterministic through the global event sequence.
- [ ] Completion atomically writes header, unique participant rows, completion event, closed/source memberships, destination memberships and completed sprint state.
- [ ] Late injected failure proves total rollback.
- [ ] Completed totals and identity do not change after source mutation or deletion.
- [ ] Legacy completed sprints are labeled unavailable and never reconstructed from mutable state.
- [ ] Active and completed reports expose commitment, completion, scope, unestimated work, sections and journal with explainable inputs.
- [ ] Velocity reads at most twelve snapshots, includes commitment-positive/zero-complete sprints and explains every exclusion.
- [ ] `browse_backlog` readers can read; malformed, foreign, missing and inaccessible sprint IDs remain concealed.
- [ ] Chart labels, exact values, semantic table and keyboard detail links carry the same meaning.
- [ ] All explicit empty/error states and both completion destinations are covered.
- [ ] Next.js 16.2.7 build, unit, integration, E2E, typecheck, lint and `git diff --check` pass.
- [ ] Audit evidence is run-scoped and the three next priorities are recorded.
