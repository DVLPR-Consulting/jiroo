# Jiroo Burndown and Planning Predictability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un burndown de sprint Jira-like reconstruit depuis `sprint_events`, une trajectoire idéale factuelle, et un signal de planification comparant l’engagement à la vélocité récente sans prédiction opaque.

**Architecture:** Le démarrage et l’ajout dans un sprint actif figent l’état `done` manquant dans la même transaction que l’appartenance et l’événement. Un calculateur pur rejoue le baseline et les événements ordonnés, tandis qu’un nouveau read model serveur charge un seul sprint, refuse les historiques incohérents et transmet un DTO sérialisable à une UI accessible. Le Backlog consomme séparément une moyenne de vélocité bornée à sept snapshots pour afficher un avertissement non bloquant, sans modifier la capacité manuelle.

**Tech Stack:** Next.js 16.2.7 App Router, React 19.2.4, TypeScript 5, Drizzle ORM 0.45.2, PostgreSQL 17, Zod 4.4.3, Vitest 4.1.8, Testing Library 16.3.2, Playwright 1.62.1, pnpm 10.19.0, Node 24.13.0.

## Global Constraints

- La spécification autoritative est `docs/superpowers/specs/2026-08-08-jiroo-burndown-planning-predictability-design.md`.
- Lire `AGENTS.md` avant toute modification et conserver les conventions Next.js 16.2.7 locales.
- Les guides locaux obligatoires sont `05-server-and-client-components.md`, `page.md`, `10-error-handling.md`, `not-found.md` et `03-architecture/accessibility.md` sous `node_modules/next/dist/docs/`.
- La page reste un Server Component et attend `params` et `searchParams`, qui sont des `Promise` dans Next.js 16.
- Les composants de présentation ne reçoivent que des props sérialisables ; aucune connexion DB, `Date` ou `bigint` ne traverse la frontière RSC.
- `notFound()` dissimule les ressources malformées, planifiées, absentes, étrangères ou inaccessibles ; l’UI d’erreur existante capture seulement les exceptions inattendues et utilise `unstable_retry`.
- Aucun nouveau package n’est ajouté. Le graphique utilise React, SVG/CSS natif, une figure HTML et un tableau sémantique.
- Seules les tâches de premier niveau contribuent aux points ; les sous-tâches restent exclues.
- Une estimation `null` vaut zéro dans les sommes et augmente toujours le compteur non estimé.
- La courbe réelle vient exclusivement du baseline figé et du ledger append-only ordonné par `occurredAt ASC, sequence ASC`.
- La ligne idéale ne se recale jamais sur les changements de périmètre : elle part du restant initial et atteint zéro à la date cible.
- Les libellés sont factuels : `Sur la trajectoire idéale`, `Au-dessus de la trajectoire idéale`, `Données insuffisantes`, `Objectif atteint` ou `Travail restant à la clôture`.
- La vélocité récente reste séparée de la trajectoire ; elle ne modifie ni `capacityPoints` ni l’autorisation de démarrer.
- Les anciens historiques sans `doneAtStart` ou `nextDone` restent `legacy_unavailable` ; aucun backfill approximatif n’est autorisé.
- Les écritures de `doneAtStart` et `nextDone` sont atomiques avec la mutation métier ; un échec annule l’ensemble.
- Les rapports terminés ne lisent jamais l’état mutable courant d’un item.
- Les lectures sont filtrées par `backlogId`, sans N+1, et bornées à un sprint plus sept en-têtes de vélocité.
- Le calcul complet utilise tous les événements ; l’UI pagine les points exacts et reçoit une projection graphique plafonnée.
- La preuve de charge minimale est 1 000 participants et 10 000 événements, avec nombre de requêtes fixe.
- Ne jamais supprimer ni réécrire les artefacts historiques sous `audit/` ; le nouveau run final possède son propre identifiant.
- Chaque tâche suit RED → vérification de l’échec attendu → GREEN minimal → vérification ciblée → commit atomique.

## File Responsibility Map

### Historique et écriture transactionnelle

- `lib/db/schema/domain.ts` — colonnes `doneAtStart` sur memberships et snapshots.
- `drizzle/0013_jira_sprint_burndown.sql` — migration additive et contrainte `item_added.next_done` appliquée aux nouvelles lignes.
- `drizzle/meta/0013_snapshot.json` et `drizzle/meta/_journal.json` — métadonnées générées et inspectées.
- `lib/db/schema/sprint-reports.integration.test.ts` — contrat SQL et compatibilité legacy.
- `lib/services/sprint-events.ts` — commande `item_added` avec `nextDone` obligatoire.
- `lib/services/sprint-membership.ts` — capture de la catégorie `done` à l’entrée active.
- `lib/services/sprint-lifecycle.ts` — snapshot `doneAtStart` au démarrage et copie au rapport terminé.
- `lib/reports/sprint-calculations.ts` — propagation de `doneAtStart` dans les participants figés.
- `lib/services/sprint-events.integration.test.ts` et `lib/services/sprint-lifecycle.integration.test.ts` — atomicité et parité de toutes les voies.

### Calcul et read model

- Create `lib/reports/burndown-calculations.ts` — rejeu pur, guideline, projection graphique et comparaison de vélocité.
- Create `lib/reports/burndown-calculations.test.ts` — matrice numérique et incohérences.
- Create `lib/services/sprint-burndown.ts` — lecture backlog-scoped active/terminée/legacy.
- Create `lib/services/sprint-burndown.integration.test.ts` — immutabilité, isolation, concurrence et charge.
- Modify `lib/services/sprint-reports.ts` — export du reader de page d’événements et réutilisation de la vélocité.

### Route et interface

- `lib/reports/report-url.ts` et test — `report=burndown`.
- `app/(app)/b/[key]/reports/page.tsx` et test — orchestration Server Component et DTO.
- `components/reports/report-navigation.tsx` et test — troisième tab et sélecteur partagé.
- Create `components/reports/burndown-report.tsx` — résumé, figure, courbes, points et tableau exact.
- Create `components/reports/burndown-report.test.tsx` — accessibilité, parité et responsive.

### Planification, acceptation et audit

- `components/items/backlog-view-content.tsx` — chargement unique du contexte vélocité.
- `components/items/item-backlog.tsx` — propagation du contexte aux sections.
- `components/sprints/sprint-section-header.tsx` et tests — comparaison factuelle non bloquante.
- `e2e/sprint-reports.spec.ts` — mutations, courbes, permissions, mobile et preuve persistante.
- `audit/README.md`, `audit/roadmap.md`, `audit/bugs.md`, `audit/ux.md`, `audit/benchmark.md` — verdict et risques résiduels.

## Execution Preflight

Respecter la préférence explicite de travailler sans worktree. Depuis le checkout principal propre sur `main`, créer la branche locale dans ce même checkout :

```bash
git switch -c feat/burndown-planning-predictability
```

Vérifier l’environnement :

```bash
node --version
pnpm --version
git status --short --branch
```

Valeurs attendues : Node `v24.13.0`, pnpm `10.19.0`, branche feature propre.

Créer la base dédiée suivante si elle n’existe pas. Si `createdb` répond qu’elle existe déjà, vérifier son nom et son propriétaire avec la commande `psql` avant de la réutiliser ; elle ne doit correspondre ni à `jiroo` ni à `jiroo_e2e` :

```bash
PGPASSWORD=jiroo createdb -h localhost -p 5433 -U jiroo \
  jiroo_burndown_predictability
PGPASSWORD=jiroo psql -h localhost -p 5433 -U jiroo -d postgres \
  -c "select datname, pg_get_userbyid(datdba) as owner from pg_database where datname = 'jiroo_burndown_predictability';"
export DIRECT_DATABASE_URL=postgres://jiroo:jiroo@localhost:5433/jiroo_burndown_predictability
export DATABASE_URL="$DIRECT_DATABASE_URL"
export JIROO_RUN_DB_TESTS=1
pnpm db:migrate
```

Baseline avant modification :

```bash
pnpm typecheck
pnpm lint
pnpm test
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run \
  lib/db/schema/sprint-reports.integration.test.ts \
  lib/services/sprint-events.integration.test.ts \
  lib/services/sprint-lifecycle.integration.test.ts \
  lib/services/sprint-reports.integration.test.ts
```

---

### Task 1: Étendre le contrat PostgreSQL avec les faits `done` historiques

**Files:**
- Modify: `lib/db/schema/domain.ts`
- Modify: `lib/db/schema/sprint-reports.integration.test.ts`
- Create: `drizzle/0013_jira_sprint_burndown.sql`
- Create: `drizzle/meta/0013_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces `sprintItems.doneAtStart: boolean | null`.
- Produces `sprintReportItems.doneAtStart: boolean | null`.
- Changes the `sprint_events_shape` contract so every new `item_added` row requires `next_done is not null`.
- Legacy rows may retain null values; later reads detect them and return `legacy_unavailable`.

- [ ] **Step 1: Write RED raw-schema tests**

Add tests that insert a new `item_added` without `next_done` and expect PostgreSQL rejection, then insert the same row with `next_done=false` and `next_done=true` and expect success. Also prove that planned memberships accept null, active fixtures can store both booleans, and report rows preserve null for a legacy snapshot.

```ts
it("requires done state on every new active-sprint addition", async () => {
  await expectStatementRejected(
    client,
    `insert into sprint_events
      (backlog_id, sprint_id, event_type, source_membership_id, item_id,
       item_key, item_title, actor_id, request_correlation_id, occurred_at,
       next_estimate)
     values ($1,$2,'item_added',$3,$4,'CASS-1','Task',$5,'burndown-red',now(),5)`,
    [backlogId, sprintId, membershipId, itemId, actorId],
  );
});
```

- [ ] **Step 2: Run the schema test RED**

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run \
  lib/db/schema/sprint-reports.integration.test.ts
```

Expected: FAIL because `done_at_start` does not exist and `item_added.next_done` is still nullable by shape.

- [ ] **Step 3: Add the nullable Drizzle columns**

Add:

```ts
doneAtStart: boolean("done_at_start"),
```

to `sprintItems` and `sprintReportItems`. Keep the columns nullable for planned memberships and historical snapshots. Add a report-item check that only permits a non-null value for an initial commitment:

```ts
check(
  "sprint_report_items_done_at_start_consistent",
  sql`done_at_start is null or initial_commitment`,
),
```

- [ ] **Step 4: Generate migration 0013 and preserve legacy rows**

Run `pnpm db:generate` and rename the generated tag to `0013_jira_sprint_burndown`. Replace the generated constraint change with this complete condition. `NOT VALID` preserves old rows while PostgreSQL checks every new insert.

```sql
ALTER TABLE "sprint_events" DROP CONSTRAINT "sprint_events_shape";
ALTER TABLE "sprint_events" ADD CONSTRAINT "sprint_events_shape" CHECK (
  (event_type in ('sprint_started', 'sprint_completed')
    and item_key is null and item_title is null
    and previous_estimate is null and next_estimate is null
    and previous_done is null and next_done is null
    and removal_reason is null)
  or (event_type = 'item_added'
    and item_key is not null and item_title is not null
    and previous_estimate is null
    and previous_done is null and next_done is not null
    and removal_reason is null)
  or (event_type = 'item_removed'
    and item_key is not null and item_title is not null
    and next_estimate is null
    and previous_done is null and next_done is null
    and removal_reason is not null)
  or (event_type = 'estimate_changed'
    and item_key is not null and item_title is not null
    and previous_estimate is distinct from next_estimate
    and previous_done is null and next_done is null
    and removal_reason is null)
  or (event_type = 'item_completed'
    and item_key is not null and item_title is not null
    and previous_done = false and next_done = true
    and previous_estimate is null and next_estimate is null
    and removal_reason is null)
  or (event_type = 'item_reopened'
    and item_key is not null and item_title is not null
    and previous_done = true and next_done = false
    and previous_estimate is null and next_estimate is null
    and removal_reason is null)
) NOT VALID;
```

- [ ] **Step 5: Inspect and apply the migration**

```bash
sed -n '1,260p' drizzle/0013_jira_sprint_burndown.sql
pnpm db:migrate
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run \
  lib/db/schema/sprint-reports.integration.test.ts
pnpm typecheck
```

Expected: PASS. Explicitly inspect that no history table gains cascade deletion and that append-only triggers remain untouched.

- [ ] **Step 6: Commit Task 1**

```bash
git add lib/db/schema/domain.ts \
  lib/db/schema/sprint-reports.integration.test.ts \
  drizzle/0013_jira_sprint_burndown.sql \
  drizzle/meta/0013_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(reports): preserve sprint done-at-entry facts"
```

---

### Task 2: Capturer et figer `doneAtStart` et `nextDone` atomiquement

**Files:**
- Modify: `lib/services/sprint-events.ts`
- Modify: `lib/services/sprint-membership.ts`
- Modify: `lib/services/sprint-lifecycle.ts`
- Modify: `lib/reports/sprint-calculations.ts`
- Modify: `lib/services/sprint-events.integration.test.ts`
- Modify: `lib/services/sprint-lifecycle.integration.test.ts`

**Interfaces:**
- `SprintEventCommand` requires `nextDone: boolean` for `item_added`.
- `CompletedParticipantInput` and `CompletedParticipantRow` expose `doneAtStart: boolean | null`.
- Start writes `estimateAtStart` and `doneAtStart` from one locked item/status view.
- Completion copies `doneAtStart` to every initial `sprint_report_items` row.

- [ ] **Step 1: Write RED event and lifecycle tests**

Extend the start test with one todo task, one done task, and one unestimated task. Assert:

```ts
expect(startedMemberships).toEqual([
  expect.objectContaining({ estimateAtStart: 5, doneAtStart: false }),
  expect.objectContaining({ estimateAtStart: 3, doneAtStart: true }),
  expect.objectContaining({ estimateAtStart: null, doneAtStart: false }),
]);
```

Move one todo and one already-done task into an active sprint and assert `item_added.nextDone` is respectively false and true. Complete the sprint and assert initial report rows freeze both booleans. Add a late-failure case proving neither membership facts nor events survive rollback.

- [ ] **Step 2: Run the focused tests RED**

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run \
  lib/services/sprint-events.integration.test.ts \
  lib/services/sprint-lifecycle.integration.test.ts
```

Expected: FAIL on missing `doneAtStart` and `nextDone` values.

- [ ] **Step 3: Make `item_added` require a done-state fact**

```ts
| (SprintItemEventBase & {
    type: "item_added";
    nextEstimate: number | null;
    nextDone: boolean;
    relatedSprint: { id: string; name: string } | null;
  })
```

Map `nextDone` to `sprintEvents.nextDone` in `eventRow`.

- [ ] **Step 4: Capture done state during active membership assignment**

Join each selected item to its canonical backlog status while rows are locked. Reject a cross-backlog status. On membership insert, persist `doneAtStart: destination.state === "active" ? item.statusCategory === "done" : null`; planned memberships remain null. Populate the event from the same locked row:

```ts
eventCommands.push({
  type: "item_added",
  backlogId: input.backlogId,
  sprintId: destination.id,
  membershipId: membership.id,
  item: { id: item.id, key: item.key, title: item.title },
  nextEstimate: item.estimatePoints,
  nextDone: item.statusCategory === "done",
  relatedSprint: currentSprint
    ? { id: currentSprint.id, name: currentSprint.name }
    : null,
  actorId,
  correlationId,
  occurredAt: now,
});
```

Do not add a second item or status query per row.

- [ ] **Step 5: Capture start facts from one locked snapshot**

Extend the committed-item query with `statusCategory`. Build both CASE expressions and update both fields in one statement:

```ts
const estimateByItem = new Map(
  committedItems.map((item) => [item.id, item.estimatePoints]),
);
const doneByItem = new Map(
  committedItems.map((item) => [item.id, item.statusCategory === "done"]),
);
const estimateCases = sql.join(
  memberships.map((membership) =>
    sql`when ${sprintItems.itemId} = ${membership.itemId}
      then ${estimateByItem.get(membership.itemId) ?? null}::numeric(5, 2)`),
  sql.raw(" "),
);
const doneCases = sql.join(
  memberships.map((membership) =>
    sql`when ${sprintItems.itemId} = ${membership.itemId}
      then ${doneByItem.get(membership.itemId) ?? false}::boolean`),
  sql.raw(" "),
);
await tx.update(sprintItems).set({
  estimateAtStart: sql`case ${estimateCases} else null::numeric(5, 2) end`,
  doneAtStart: sql`case ${doneCases} else null::boolean end`,
}).where(inArray(sprintItems.id, membershipIds));
```

The done CASE returns true only for category `done`. Keep lock order backlog → sprint → memberships → items/statuses.

- [ ] **Step 6: Freeze the fact at completion**

Add `doneAtStart: boolean | null` to `CompletedParticipantInput` and `CompletedParticipantRow`. Return the initial interval’s fact only when `initialCommitment` is true, then insert it into `sprintReportItems`. Preserve null for added-after-start rows and legacy initial memberships.

- [ ] **Step 7: Verify transaction parity**

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run \
  lib/services/sprint-events.integration.test.ts \
  lib/services/sprint-lifecycle.integration.test.ts \
  lib/reports/sprint-calculations.test.ts
pnpm typecheck
```

- [ ] **Step 8: Commit Task 2**

```bash
git add lib/services/sprint-events.ts lib/services/sprint-membership.ts \
  lib/services/sprint-lifecycle.ts lib/reports/sprint-calculations.ts \
  lib/services/sprint-events.integration.test.ts \
  lib/services/sprint-lifecycle.integration.test.ts
git commit -m "feat(reports): capture sprint done-at-entry state"
```

---

### Task 3: Construire le calculateur pur de burndown

**Files:**
- Create: `lib/reports/burndown-calculations.ts`
- Create: `lib/reports/burndown-calculations.test.ts`

**Interfaces:**
- Produces `calculateBurndown(input): BurndownCalculation`.
- Produces `calculatePlanningComparison(commitment, velocity): PlanningComparison`.
- Produces `InconsistentBurndownError`.
- Later services serialize `bigint` sequences ; le calcul garde `Date` et `bigint` natifs.

- [ ] **Step 1: Define RED fixtures and expected exact points**

```ts
const input: BurndownInput = {
  startedAt: new Date("2026-08-10T09:00:00.000Z"),
  targetEndAt: new Date("2026-08-20T09:00:00.000Z"),
  completedAt: null,
  observedAt: new Date("2026-08-15T09:00:00.000Z"),
  initial: [
    { itemId: "item-1", itemKey: "CASS-1", itemTitle: "API", estimate: 8, done: false },
    { itemId: "item-2", itemKey: "CASS-2", itemTitle: "UI", estimate: 3, done: true },
    { itemId: "item-3", itemKey: "CASS-3", itemTitle: "Docs", estimate: null, done: false },
  ],
  events: [
    add("CASS-4", 1n, "2026-08-11T09:00:00.000Z", 5, false),
    estimate("CASS-1", 2n, "2026-08-12T09:00:00.000Z", 8, 13),
    complete("CASS-1", 3n, "2026-08-13T09:00:00.000Z"),
    reopen("CASS-1", 4n, "2026-08-14T09:00:00.000Z"),
    remove("CASS-4", 5n, "2026-08-15T09:00:00.000Z", 5),
  ],
};

expect(calculateBurndown(input).exactPoints.map((point) => point.remainingPoints))
  .toEqual([8, 13, 18, 5, 18, 13]);
```

Add RED tests for already-done add, estimate while done, null transitions, completion/reopen, remove/re-add, equal timestamps, invalid prior estimates, duplicate add, invalid dates, negative state, UTC day sampling, projection cap, guideline values, every label, and planning comparison with zero population.

Also add lifecycle-event tests: `sprint_started` at the exact actual start and `sprint_completed` at the exact immutable completion each emit a zero-delta exact point with their own cause; mismatched boundaries or duplicate lifecycle events throw `InconsistentBurndownError`.

- [ ] **Step 2: Run the pure suite RED**

```bash
pnpm exec vitest run lib/reports/burndown-calculations.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement exact discriminated inputs**

```ts
type BurndownItemIdentity = {
  itemId: string | null;
  itemKey: string;
  itemTitle: string;
};

export type BurndownEvent =
  | { type: "sprint_started" | "sprint_completed"; occurredAt: Date; sequence: bigint }
  | (BurndownItemIdentity & { type: "item_added"; occurredAt: Date; sequence: bigint; nextEstimate: number | null; nextDone: boolean })
  | (BurndownItemIdentity & { type: "item_removed"; occurredAt: Date; sequence: bigint; previousEstimate: number | null })
  | (BurndownItemIdentity & { type: "estimate_changed"; occurredAt: Date; sequence: bigint; previousEstimate: number | null; nextEstimate: number | null })
  | (BurndownItemIdentity & { type: "item_completed" | "item_reopened"; occurredAt: Date; sequence: bigint });

export type BurndownInput = {
  startedAt: Date;
  targetEndAt: Date | null;
  completedAt: Date | null;
  observedAt: Date;
  initial: readonly (BurndownItemIdentity & { estimate: number | null; done: boolean })[];
  events: readonly BurndownEvent[];
};

export class InconsistentBurndownError extends Error {
  constructor() {
    super("L’historique du burndown est incohérent.");
    this.name = "InconsistentBurndownError";
  }
}
```

- [ ] **Step 4: Implement strict replay**

Sort a copy by timestamp then sequence. Maintain `Map<string, { present; estimate; done }>`. Validate presence, done boundary and previous estimate before each mutation. Validate at most one lifecycle event of each type: `sprint_started.occurredAt` must equal `startedAt`; `sprint_completed` requires a completed report and must equal `completedAt`. Lifecycle events never mutate item state but still emit their own zero-delta exact point. Emit:

```ts
export type BurndownPoint = {
  occurredAt: Date;
  sequence: bigint | null;
  remainingPoints: number;
  unestimatedCount: number;
  deltaPoints: number;
  itemId: string | null;
  itemKey: string | null;
  itemTitle: string | null;
  cause: "start" | BurndownEvent["type"];
};
```

Round only at the public boundary. Throw instead of clamping contradictory or negative results.

- [ ] **Step 5: Implement guideline, sampling and factual labels**

```ts
const ideal = initialRemaining *
  Math.max(0, (targetEndAt.getTime() - at.getTime()) /
    (targetEndAt.getTime() - startedAt.getTime()));
```

Return `missing_target|invalid_dates|no_estimated_initial_work|just_started|legacy_history` as exact insufficient reasons. Generate UTC daily samples plus start, observation and target boundaries. Add `projectBurndownPoints(points, 600)` preserving first/last and min/max in each bucket without mutating exact points.

- [ ] **Step 6: Implement velocity comparison**

```ts
export function calculatePlanningComparison(
  commitmentPoints: number,
  velocity: { averageCompletedPoints: number | null; population: number },
): PlanningComparison {
  if (velocity.population === 0 || velocity.averageCompletedPoints === null) {
    return { state: "unavailable", commitmentPoints, averageCompletedPoints: null, population: 0, difference: null };
  }
  return {
    state: "ready",
    commitmentPoints: round(commitmentPoints),
    averageCompletedPoints: round(velocity.averageCompletedPoints),
    population: velocity.population,
    difference: round(commitmentPoints - velocity.averageCompletedPoints),
  };
}
```

- [ ] **Step 7: Verify and commit Task 3**

```bash
pnpm exec vitest run lib/reports/burndown-calculations.test.ts
pnpm typecheck
git add lib/reports/burndown-calculations.ts \
  lib/reports/burndown-calculations.test.ts
git commit -m "feat(reports): calculate explainable sprint burndown"
```

---

### Task 4: Ajouter le read model backlog-scoped et immuable

**Files:**
- Create: `lib/services/sprint-burndown.ts`
- Create: `lib/services/sprint-burndown.integration.test.ts`
- Modify: `lib/services/sprint-reports.ts`

**Interfaces:**
- Produces `getBurndownReport(backlogId, sprintId, options): Promise<BurndownReport | null>`.
- Produces `getRecentVelocityContext(backlogId): Promise<{ population; averageCompletedPoints }>`.
- Reuses exported `readSprintEventPage(backlogId, sprintId, page, pageSize)`.
- `BurndownReport` is discriminated by `kind: active|completed|legacy_unavailable`.

- [ ] **Step 1: Write RED service contracts**

Create active, completed, legacy, foreign and missing fixtures. Assert:

```ts
const report = await getBurndownReport(backlog.id, activeSprint.id, {
  eventPage: 1,
  pageSize: 50,
  now: new Date("2026-08-15T09:00:00.000Z"),
});

expect(report).toMatchObject({
  kind: "active",
  trajectory: { label: "Sur la trajectoire idéale" },
  planningComparison: { state: "ready" },
  eventPoints: { page: 1, pageSize: 50 },
});
```

Assert active and completed projections have identical summary/final-point values at the completion boundary. Assert the completed result stays stable after rename, re-estimate, status change, move, soft delete and privileged purge. Assert a legacy initial null or legacy `item_added.nextDone` returns only identity/reason. Assert malformed or contradictory prior values throw `InconsistentBurndownError`, while a foreign sprint returns null.

- [ ] **Step 2: Run the new suite RED**

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run \
  lib/services/sprint-burndown.integration.test.ts
```

Expected: FAIL because `getBurndownReport` does not exist.

- [ ] **Step 3: Export the shared event-page reader**

Rename private `readEventPage` to:

```ts
export async function readSprintEventPage(
  backlogId: string,
  sprintId: string,
  pageInput: number,
  pageSizeInput: number,
): Promise<Page<SprintReportEvent>>
```

Preserve the existing implementation contract exactly: clamp `pageInput` to at least 1, clamp `pageSizeInput` to 1–100, filter both count and row queries by `backlogId` and `sprintId`, order rows by `occurredAt DESC, sequence DESC`, and retain the current stable `itemKey`, `itemTitle`, related-sprint and deletion fallbacks. Rename the existing caller to use the exported symbol, then rerun `lib/services/sprint-reports.integration.test.ts` before adding the burndown caller.

- [ ] **Step 4: Implement active and completed source reads**

Create `lib/services/sprint-burndown.ts` with `import "server-only"`.

For active reports, load canonical sprint, memberships and all ordered events; identify initial memberships as those without an `item_added` membership event and require `doneAtStart`. For completed reports, load only immutable snapshot/report items plus ledger, build the baseline from `initialCommitment=true` and require `doneAtStart`. Pass both lifecycle and item events to the calculator so the exact series contains one point per journal event. Never join mutable item values into completed calculations.

If `item_added.nextDone` or an initial `doneAtStart` is null, return `legacy_unavailable` with reason `legacy_history`.

- [ ] **Step 5: Calculate and paginate exact points**

Return:

```ts
type DetailedBurndownReport = {
  sprint: BurndownSprintIdentity;
  summary: {
    initialRemainingPoints: number;
    remainingPoints: number;
    completedPoints: number;
    unestimatedCount: number;
  };
  trajectory: BurndownCalculation["trajectory"];
  planningComparison: PlanningComparison;
  guideline: BurndownCalculation["guideline"];
  displayPoints: BurndownCalculation["displayPoints"];
  eventPoints: Page<BurndownPoint>;
  events: Page<SprintReportEvent>;
};
```

`calculateBurndown` keeps the full `exactPoints`, including the baseline `cause="start"`, for the chart and summary. Build `eventPoints` from the post-event point having the same sequence as each row returned by `readSprintEventPage`; therefore its `total`, order and page boundaries exactly match `events`. Show the initial baseline separately above the table. Define `completedPoints` as the sum of estimates for present items currently in `done`; for a completed sprint, cross-check this value against the immutable snapshot metric and fail closed on disagreement.

Implement `getRecentVelocityContext` by calling the existing velocity reader with `sprintCount=7` and returning only `{ population, averageCompletedPoints }`. Do not expose bars, excluded reasons or sprint identities to the Backlog.

- [ ] **Step 6: Prove fixed queries and volume**

Reuse query instrumentation from `sprint-reports.integration.test.ts`. Assert identical query count for 5 and 1 000 participants. Insert 10 000 ordered events in batches, assert every event contributes and record duration without inventing a pass/fail SLA. Add two concurrent mutations sharing one timestamp and prove the committed global sequences produce the same replay on two consecutive reads.

- [ ] **Step 7: Verify and commit Task 4**

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run \
  lib/services/sprint-reports.integration.test.ts \
  lib/services/sprint-burndown.integration.test.ts
pnpm typecheck
git add lib/services/sprint-reports.ts \
  lib/services/sprint-burndown.ts \
  lib/services/sprint-burndown.integration.test.ts
git commit -m "feat(reports): add sprint burndown read model"
```

---

### Task 5: Étendre l’état URL, la route serveur et la navigation

**Files:**
- Modify: `lib/reports/report-url.ts`
- Modify: `lib/reports/report-url.test.ts`
- Modify: `app/(app)/b/[key]/reports/page.tsx`
- Modify: `app/(app)/b/[key]/reports/page.test.tsx`
- Modify: `components/reports/report-navigation.tsx`
- Modify: `components/reports/report-navigation.test.tsx`

**Interfaces:**
- `ReportUrlState.report` becomes `sprint|velocity|burndown`.
- The route serializes `BurndownReport` dates and bigint sequences.
- `ReportNavigation` shares sprint selection between sprint report and burndown.

- [ ] **Step 1: Write RED parser, navigation and route tests**

```ts
expect(parseReportUrlState({
  report: "burndown",
  sprint: sprintId,
  eventPage: "3",
})).toMatchObject({
  report: "burndown",
  sprintId,
  eventPage: 3,
});
```

Render navigation and assert the `Burndown` link is URL-native, owns `aria-current` when selected, and the GET sprint selector remains visible. Cover separately: no sprint (`Aucun sprint actif ou terminé.`), planned-only (the existing planned-count message), active default selection, and newest-completed default selection. Mock `getBurndownReport` in the page test and assert dates become ISO strings and sequences become decimal strings. Add a `browse_backlog`-only caller that can read, while malformed, foreign and explicitly selected planned sprint IDs remain concealed.

- [ ] **Step 2: Run route tests RED**

```bash
pnpm exec vitest run \
  lib/reports/report-url.test.ts \
  components/reports/report-navigation.test.tsx \
  app/'(app)'/b/'[key]'/reports/page.test.tsx
```

- [ ] **Step 3: Extend the parser without widening defaults**

```ts
const rawReport = first(query.report);
const report =
  rawReport === "velocity" || rawReport === "burndown"
    ? rawReport
    : "sprint";
```

Unknown values still normalize to `sprint`. Resource UUID validation remains before session or DB reads.

- [ ] **Step 4: Extend navigation**

Add a `Burndown` Link whose href is `path + "?report=burndown"` and whose `aria-current` is `page` only for the selected report. Show the sprint selector when `report !== "velocity"` and preserve the chosen report in its hidden input.

- [ ] **Step 5: Serialize and render the read model in the Server Component**

Add `serializeBurndownReport`. Serialize every `Date` with `toISOString()` and each non-null sequence with `toString()`. Keep active, completed and legacy status literals discriminated. Make the route branches mutually exclusive in this order: velocity, burndown with a selected sprint, sprint report with a selected sprint; never let `report="burndown"` fall through to `getSprintReport`.

```tsx
if (state.report === "burndown" && selectedSprintId) {
  const report = await getBurndownReport(backlog.id, selectedSprintId, {
    eventPage: state.eventPage,
    pageSize: 50,
  });
  if (!report) notFound();
  content = (
    <BurndownReportView
      backlogKey={backlog.key}
      report={serializeBurndownReport(report)}
    />
  );
}
```

Do not turn the page into a Client Component.

- [ ] **Step 6: Verify and commit Task 5**

```bash
pnpm exec vitest run \
  lib/reports/report-url.test.ts \
  components/reports/report-navigation.test.tsx \
  app/'(app)'/b/'[key]'/reports/page.test.tsx
pnpm typecheck
git add lib/reports/report-url.ts lib/reports/report-url.test.ts \
  app/'(app)'/b/'[key]'/reports/page.tsx \
  app/'(app)'/b/'[key]'/reports/page.test.tsx \
  components/reports/report-navigation.tsx \
  components/reports/report-navigation.test.tsx
git commit -m "feat(reports): expose burndown route"
```

---

### Task 6: Rendre le burndown accessible, exact et responsive

**Files:**
- Create: `components/reports/burndown-report.tsx`
- Create: `components/reports/burndown-report.test.tsx`

**Interfaces:**
- Produces `SerializableBurndownReport` discriminated by `kind`.
- `BurndownReportView` consumes only serialized props.
- The labelled figure, role-bearing SVG groups and exact HTML table carry equivalent semantics without a flattening `role="img"` root.

- [ ] **Step 1: Write RED component tests**

Build an active DTO with start, add, estimate, complete, reopen and remove points. Assert:

```ts
expect(screen.getByRole("heading", { name: "Sprint R4" })).toBeVisible();
expect(screen.getByText("Au-dessus de la trajectoire idéale")).toBeVisible();
expect(screen.getByText(
  "Engagement 13 pts · moyenne récente 10 pts · écart +3 pts",
)).toBeVisible();
expect(screen.getByRole("table", {
  name: "Valeurs exactes du burndown",
})).toHaveTextContent("CASS-4");
expect(screen.getByRole("list", {
  name: "Points et lignes du burndown",
})).toBeVisible();
expect(screen.getAllByRole("listitem", {
  name: /points restants/,
})).not.toHaveLength(0);
```

Use separate renders for completed results, insufficient reasons and legacy state:

```ts
render(<BurndownReportView backlogKey="CASS" report={completedAtZero} />);
expect(screen.getByText("Objectif atteint")).toBeVisible();
cleanup();
render(<BurndownReportView backlogKey="CASS" report={completedWithWork} />);
expect(screen.getByText("Travail restant à la clôture")).toBeVisible();
```

Add `it.each` cases mapping `missing_target`, `invalid_dates`, `no_estimated_initial_work` and `just_started` to `Date cible absente.`, `Dates du sprint incohérentes.`, `Aucun travail initial estimé.` and `Le sprint vient de démarrer.`. In a separate legacy test, assert `Historique burndown indisponible`, assert no `/0 pt.*historique indisponible/i`, and verify identity, goal, start and completion stay visible. In the active test, assert `burndown-chart-scroll` has `overflow-x-auto`.

For item identity, render one row with `itemId` and one with `itemId=null`; assert only the first is a link. Assert every legend label includes text or line style in addition to color.

- [ ] **Step 2: Run component tests RED**

```bash
pnpm exec vitest run components/reports/burndown-report.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the discriminated DTO and summaries**

Define active and completed branches with literal labels and one legacy branch. Render identity, goal, actual start, target, completion and frozen/live badge before metric cards. Never return early before identity and actual dates.

Cards show `Restant initial`, `Restant actuel` or `Restant à la clôture`, `Terminés` and `Non estimés`. Use the same French number formatter and UTC date formatter as existing reports.

- [ ] **Step 4: Implement a labelled figure without SVG accessibility flattening**

```tsx
<figure aria-labelledby="burndown-chart-title" className="space-y-3">
  <figcaption id="burndown-chart-title" className="font-medium">
    Travail restant et trajectoire idéale
  </figcaption>
  <div data-testid="burndown-chart-scroll" className="max-w-full overflow-x-auto">
    <svg aria-labelledby="burndown-chart-title" focusable="false" viewBox="0 0 960 320">
      <g role="list" aria-label="Points et lignes du burndown">
        <g role="listitem" aria-label={actualLineLabel}>
          <path d={actualPath} fill="none" stroke="currentColor" />
        </g>
        {guidelinePath ? (
          <g role="listitem" aria-label={guidelineLabel}>
            <path
              d={guidelinePath}
              fill="none"
              stroke="currentColor"
              strokeDasharray="6 4"
            />
          </g>
        ) : null}
        {markers.map((marker) => (
          <g key={marker.key} role="listitem" aria-label={marker.accessibleLabel}>
            <circle cx={marker.x} cy={marker.y} r="4" />
          </g>
        ))}
      </g>
    </svg>
  </div>
</figure>
```

The root SVG has no `role="img"`, so it cannot flatten descendant semantics. Every actual/guideline line and displayed marker has a role and an exact accessible name. The exact table repeats every event value, including points omitted by display projection.

- [ ] **Step 5: Implement the exact event-point table and pagination**

The caption is `Valeurs exactes du burndown`. Render the baseline value in labelled prose, then render the paged `eventPoints`; each row has exactly the same sequence as its journal event. Columns are date, item, événement, variation, restant and non estimés. Render `scope="col"` headers and link only when `itemId` remains accessible. Put the table in a labelled `tabIndex={0}` overflow region so keyboard users can scroll it. Reuse `ReportPagination` with `report=burndown`, sprint ID and `eventPage`.

- [ ] **Step 6: Verify responsive and accessibility contracts**

```bash
pnpm exec vitest run \
  components/reports/burndown-report.test.tsx \
  components/reports/sprint-event-journal.test.tsx \
  components/reports/report-navigation.test.tsx
pnpm lint
pnpm typecheck
```

- [ ] **Step 7: Commit Task 6**

```bash
git add components/reports/burndown-report.tsx \
  components/reports/burndown-report.test.tsx
git commit -m "feat(reports): render accessible sprint burndown"
```

---

### Task 7: Afficher la comparaison de vélocité dans le Backlog

**Files:**
- Modify: `lib/items/sprint-planning.ts`
- Modify: `lib/items/sprint-planning.test.ts`
- Modify: `components/items/backlog-view-content.tsx`
- Modify: `components/items/backlog-view-content.test.tsx`
- Modify: `components/items/item-backlog.tsx`
- Modify: `components/items/item-backlog.test.tsx`
- Modify: `components/sprints/sprint-section-header.tsx`
- Modify: `components/sprints/sprint-section-header.test.tsx`

**Interfaces:**
- Produces `RecentVelocityContext = { population: number; averageCompletedPoints: number | null }`.
- `SprintMetrics` gains `velocityComparison: PlanningComparison | null`.
- Planned and active headers render comparison copy; Backlog section does not.

- [ ] **Step 1: Write RED pure and component tests**

```ts
expect(calculateSprintMetrics(rows, 20, {
  population: 3,
  averageCompletedPoints: 10,
})).toMatchObject({
  capacityPoints: 20,
  overCapacityPoints: 0,
  velocityComparison: {
    state: "ready",
    commitmentPoints: 13,
    averageCompletedPoints: 10,
    difference: 3,
  },
});
```

Render a planned header and assert exact comparison plus non-blocking warning. Render zero-population context and assert `Pas encore de vélocité comparable`. Render a backlog header and assert no velocity copy.

- [ ] **Step 2: Run focused tests RED**

```bash
pnpm exec vitest run \
  lib/items/sprint-planning.test.ts \
  components/items/backlog-view-content.test.tsx \
  components/sprints/sprint-section-header.test.tsx \
  components/items/item-backlog.test.tsx
```

- [ ] **Step 3: Extend metrics without changing capacity semantics**

```ts
export function calculateSprintMetrics(
  rows: SprintPlanningItem[],
  capacityPoints: number | null,
  recentVelocity: RecentVelocityContext | null = null,
): SprintMetrics
```

Call `calculatePlanningComparison(estimatedPoints, recentVelocity)` only when context is present. Keep `overCapacityPoints` byte-for-byte equivalent.

- [ ] **Step 4: Load velocity once in the server content component**

Add `getRecentVelocityContext(backlog.id)` to the existing top-level `Promise.all` in `BacklogViewContent`. Pass the result once to `buildSprintSections` or the section mapping; do not query inside a loop or Client Component.

- [ ] **Step 5: Preserve context through optimistic recalculation**

Add `recentVelocity` to `SprintBacklogProps`. Every `calculateSprintMetrics` call rebuilding active/planned sections in `item-backlog.tsx` passes the same context. Backlog-only metrics pass null.

- [ ] **Step 6: Render factual copy**

When `kind !== "backlog"` and comparison is ready, render commitment, recent average and signed difference. Amber text is allowed only when difference is positive; the complete sentence remains understandable without color. When unavailable, render `Pas encore de vélocité comparable`. Do not disable start, drag, bulk, edit, reorder or capacity controls.

- [ ] **Step 7: Verify and commit Task 7**

```bash
pnpm exec vitest run \
  lib/items/sprint-planning.test.ts \
  components/items/backlog-view-content.test.tsx \
  components/sprints/sprint-section-header.test.tsx \
  components/items/item-backlog.test.tsx
pnpm typecheck
pnpm lint
git add lib/items/sprint-planning.ts lib/items/sprint-planning.test.ts \
  components/items/backlog-view-content.tsx \
  components/items/backlog-view-content.test.tsx \
  components/items/item-backlog.tsx components/items/item-backlog.test.tsx \
  components/sprints/sprint-section-header.tsx \
  components/sprints/sprint-section-header.test.tsx
git commit -m "feat(sprints): compare plans with recent velocity"
```

---

### Task 8: Prouver le parcours, la charge et mettre l’audit à jour

**Files:**
- Modify: `e2e/sprint-reports.spec.ts`
- Modify: `audit/README.md`
- Modify: `audit/roadmap.md`
- Modify: `audit/bugs.md`
- Modify: `audit/ux.md`
- Modify: `audit/benchmark.md`
- Create: run-scoped console, network, screenshot, JUnit and manifest artifacts under `audit/`

**Interfaces:**
- Produces persistent run ID `sprint-burndown-final`.
- Produces one immutable manifest tied to exact SHA, DB, server, scenarios and artifact paths.
- Leaves exactly three next priorities: Releases PR2, final cross-browser/AT matrix, production-volume/concurrency hardening.

- [ ] **Step 1: Add failing Playwright scenarios**

Extend the existing reporting fixture. Cover:

1. todo, done-at-start and unestimated initial work;
2. incomplete and already-done active additions;
3. incomplete and done re-estimation;
4. complete, reopen and complete again;
5. remove and re-add one stable item;
6. single edit, bulk and Board paths, plus two fixture events sharing a timestamp but ordered by sequence;
7. completion and frozen final point;
8. planned sprint comparison with recent velocity;
9. reader and second authenticated context;
10. real foreign sprint and malformed UUID concealment;
11. one injected read failure, boundary and retry.

Derive expected points from fixture constants and assert summary plus exact table. Never copy rendered values into the oracle.

- [ ] **Step 2: Run the new scenarios RED**

```bash
JIROO_E2E_RUN_ID=sprint-burndown-red \
JIROO_E2E_ISOLATED=1 \
BETTER_AUTH_URL=http://localhost:3100 \
NODE_OPTIONS=--conditions=react-server \
pnpm exec playwright test e2e/sprint-reports.spec.ts
```

Expected before final integration: at least one new assertion fails for the intended missing behavior.

- [ ] **Step 3: Complete evidence and mobile assertions**

Persist desktop and 390 × 844 screenshots for active, completed and planned-warning views. Assert:

```ts
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth -
  document.documentElement.clientWidth,
);
expect(overflow).toBeLessThanOrEqual(1);
```

The chart owns any horizontal scrolling. Monitor page errors, console, failed requests and HTTP status with existing run-scoped helpers. Whitelist only the deliberate retry fault with `[expected-fault]`. Scan persisted console/network/JUnit/manifest text for `DATABASE_URL`, `DIRECT_DATABASE_URL`, `Authorization`, `Cookie`, PostgreSQL URLs and fixture passwords; any hit outside an explicitly redacted field fails the run.

- [ ] **Step 4: Run targeted and DB verification**

```bash
pnpm exec vitest run \
  lib/reports/burndown-calculations.test.ts \
  lib/reports/report-url.test.ts \
  components/reports/burndown-report.test.tsx \
  components/reports/report-navigation.test.tsx \
  components/sprints/sprint-section-header.test.tsx \
  app/'(app)'/b/'[key]'/reports/page.test.tsx

JIROO_RUN_DB_TESTS=1 pnpm exec vitest run \
  lib/db/schema/sprint-reports.integration.test.ts \
  lib/services/sprint-events.integration.test.ts \
  lib/services/sprint-lifecycle.integration.test.ts \
  lib/services/sprint-reports.integration.test.ts \
  lib/services/sprint-burndown.integration.test.ts
```

- [ ] **Step 5: Run persistent acceptance**

```bash
JIROO_E2E_RUN_ID=sprint-burndown-final \
JIROO_E2E_PERSIST_ARTIFACTS=1 \
JIROO_E2E_ISOLATED=1 \
BETTER_AUTH_URL=http://localhost:3100 \
NODE_OPTIONS=--conditions=react-server \
pnpm exec playwright test e2e/sprint-reports.spec.ts
```

Require zero unexpected console/page/request error, zero unapproved HTTP 4xx/5xx, zero skip, and a manifest referencing every artifact exactly once.

- [ ] **Step 6: Update the audit from measured evidence**

Record exact run ID, scenario count, navigation status, duration, SHA, screenshots, query duration, event count, exact point count, display point count, 1 000-item and 10 000-event measurements, reader/second-context/foreign/retry outcomes, factual Jira parity and the Jiroo label improvement. State explicitly that no release-date or statistical confidence forecast is delivered.

End `audit/roadmap.md` with exactly:

1. Releases PR2 merge/delete-transfer/manual ordering/release notes;
2. Firefox/WebKit, 768/1024/1440, 200% zoom and VoiceOver/NVDA;
3. production-volume and higher-concurrency hardening.

- [ ] **Step 7: Run full verification**

```bash
pnpm test
pnpm typecheck
pnpm lint
git diff --check
pnpm build
```

Use Node 24/pnpm 10 from preflight. The build must exit 0; known Better Auth local warnings are recorded but not promoted to failures when deployment secrets are absent.

- [ ] **Step 8: Request review and close findings**

Use `superpowers:requesting-code-review`. Review the complete delta against the approved spec, fix all Critical and Important findings through RED/GREEN loops, then rerun relevant targeted, DB, E2E and full checks.

- [ ] **Step 9: Commit Task 8**

```bash
git add e2e/sprint-reports.spec.ts audit
git commit -m "test(reports): validate burndown and predictability"
```

---

## Final Acceptance Checklist

- [ ] `doneAtStart` and `nextDone` are captured in the same transaction as the domain mutation.
- [ ] Legacy history is explicit and no curve is fabricated.
- [ ] Replay is deterministic by timestamp then global sequence.
- [ ] Every actual movement has exact item, cause and value evidence.
- [ ] The ideal line is linear from initial remaining to zero and never shifts with scope.
- [ ] Factual trajectory labels match exact remaining versus ideal.
- [ ] Velocity comparison is separate, bounded to seven eligible sprints and non-blocking.
- [ ] Active and completed values match at the completion boundary.
- [ ] Completed history survives every source mutation and purge.
- [ ] Foreign, malformed, planned and inaccessible sprints remain concealed.
- [ ] Chart, screen-reader list and exact table agree.
- [ ] No document-level horizontal overflow at 390 × 844.
- [ ] Query count is fixed and 1 000 items / 10 000 events are measured.
- [ ] Reader, second context, retry and secret scans pass.
- [ ] Full Vitest, DB integration, TypeScript, ESLint, diff-check, Next build and persistent Playwright pass.
- [ ] Audit claims only behavior supported by immutable evidence.
