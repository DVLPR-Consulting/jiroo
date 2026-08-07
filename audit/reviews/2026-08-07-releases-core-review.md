# Releases core — final audit, review and delivery proof

## Status

**READY_FOR_DELIVERY.** The Releases core objective is implemented, reviewed,
and accepted locally. The final whole-branch review found three Important
findings and one security Minor; the single remediation wave closed all four,
and its scoped re-review returned `All findings addressed, no new
Critical/Important breakage`. No push, PR creation, merge, or remote mutation
is part of this proof record.

## Exact scope and provenance

- Original base and merge-base: `f828afe0a538d35a535a9ae0fdf2c28f0b0a1d0b`.
- Original reviewed head: `70ab6966912786ea959b0700e43ea1333ecbd03e`.
- Prior accepted source: `88b817134aaed3c3909f0c3585b3e358b3e6a89e`.
- Authoritative final pre-proof source:
  `8eef265f971ca8244e67299926223046a3529cda`.
- Runtime: Node `v24.13.0`, pnpm `10.19.0`, Next.js `16.2.7`.
- Browser database: guarded local `jiroo_e2e`; its physical identifier was
  checked in-process and never printed. The manifest stores only a SHA-256
  fingerprint.

The implementation was split into atomic production/test commits. The final
E2E-only alignment commit is `88b8171 test(e2e): align regressions with releases`.
The audit proof commit contains only `audit/` paths and does not alter the
source SHA recorded by the acceptance manifest.

## Final whole-branch remediation

The controller's final review found three Important findings and one security
Minor. All four are closed in the authoritative source:

1. publication preview and submit are bound by a server-generated ordered
   fingerprint of `{itemId, completion category}`; publication recomputes it
   from canonical rows after deterministic backlog/release/scope locks and
   returns a structured stale-scope result without writing;
2. `releases.backlog_id` is restrictive in the schema, amended migration
   `0011`, and its snapshot; a DB regression proves a backlog with a draft
   release cannot be deleted and its release metadata remains;
3. this review corrects the delivery-02 artifact scan from 6 + 6 in three
   scenarios to the actual **9 console + 9 request failures in six deliberate
   scenarios**: the three legacy failure logs plus Releases S07, S12 and S14;
4. Fix-version mutation now scopes the release-locking query by canonical
   `backlog_id` before any foreign UUID can be locked, while preserving one
   generic rejection and full rollback.

RED/GREEN proof includes same-incomplete-count/different-item membership drift,
completion-category drift, action validation, structured UI recovery with
preserved date input, foreign UUID rollback, and a real two-context Chromium
scenario that rejects the stale submit before allowing a fresh explicit
decision.

The scoped final re-review of `b085f85..2d1b9a7` verdicts every finding
`ADDRESSED`, reports no new breakage in the fix diff, and no out-of-scope
observation.

## Delivered requirement ledger

| Area | Result | Evidence |
|---|---|---|
| Version model | Conformant | Backlog ownership, metadata, lifecycle state and optimistic version |
| Item association | Conformant | Many-to-many `Fix versions`, multiple versions per item |
| Creation/detail/bulk | Conformant | Add, replace and remove with capability-specific authorization |
| Filtering | Conformant | SQL-direct Version membership, combined facets, URL and saved-view persistence |
| Four views | Conformant | List, Backlog, Board and Tree; ancestors enrich every hierarchical view |
| Progress | Conformant | Status and point totals, unestimated work and exact item drilldowns |
| Lifecycle | Conformant | Publish, unpublish, archive, restore and explicit incomplete-item decision |
| History | Conformant | Correlated events and immutable publication snapshots |
| Permissions | Conformant | `manage_releases` for lifecycle; `edit_items` for assignment; reader/editor/specialist split |
| Isolation | Conformant | Backlog scope, CASS/LABS separation and concealed foreign/absent/deleted IDs |
| Concurrency/failure | Conformant | Stale conflict, forged requests, malformed IDs and network rollback |
| Persistence | Conformant | Reload and second-user proof across creation, detail, filters and lifecycle |

## Independent review waves

Each wave reviewed an exact committed delta read-only. Production corrections
were preceded by focused failing tests; every final wave returned PASS with no
Critical or Important finding.

| Wave | Final exact range | Final verdict | Material closure |
|---|---|---|---|
| A | `dd68514..57214ff` | PASS C0/I0/M0 | Immutable provenance and event target integrity after deletion |
| B | `57214ff..480089d` | PASS C0/I0, minor only | Lifecycle invariants and move audit |
| C | `4843b40..3ba430a` | PASS C0/I0/M0 | Delivery UX and progress drilldowns |
| D | `be430ed..85c59e0` | PASS C0/I0/M0 | Bulk oracle closed; foreign/absent/deleted indistinguishable |
| E | `48500ea..66a8c32` | PASS C0/I0/M0 | Persistence/reload coverage and isolated board filter fixture |
| F | `251de8a..447f211` | PASS C0/I0/M0 | Malformed IDs, hierarchy ancestors and unfiltered detail context |
| E2E | `92a00b8..88b8171` | PASS C0/I0/M0 | Truthful legacy assertions and deterministic independent rollback fixture |

Wave F initially found three Important issues and closed all three:

1. malformed release UUIDs reached PostgreSQL and raised `22P02`;
2. release-filter ancestors enriched only Tree, breaking hierarchy context in
   List, Backlog and Board facets/groups;
3. selected detail reused the filtered list and could lose parent and current
   `Fix versions` context.

The remediation validates IDs before SQL, keeps valid members from mixed
inputs, loads ancestors with one bounded backlog-scoped query for every view,
and loads selected detail from an independent unfiltered context. A 1,000-link
integration case proves two exact matches and one direct item query.

## Commit ledger of audit remediations

- `4c6ff7e` asserts the backlog release capability.
- `dd68514` enforces immutable provenance.
- `57214ff` preserves event target deletion integrity.
- `480089d` enforces lifecycle and move audit.
- `4843b40`, `3ba430a` complete delivery UX and progress drilldowns.
- `be430ed`, `85c59e0` harden bulk workflows and conceal foreign probes.
- `ac3f55e`, `48500ea`, `66a8c32` close persistence and reload coverage gaps.
- `251de8a`, `447f211` implement SQL-direct filtering, ancestors and complete
  detail context.
- `92a00b8` stabilizes visibility fixture keys.
- `88b8171` aligns the legacy Chromium matrix with the delivered Releases UI.
- `fbf6bd0` binds publication to canonical scope, scopes foreign release locks,
  and makes the backlog FK restrictive.
- `8eef265` updates release-owning DB fixture teardown for the restrictive FK.

## Fresh final verification

All authoritative gates below ran after the last source commit:

- full non-DB Vitest: **135 files passed, 19 skipped; 1,182 tests passed,
  184 skipped**, 29.14 s Vitest / 29.79 s wall;
- exhaustive guarded PostgreSQL matrix: **19/19 files, 184/184 tests**,
  32.52 s Vitest / 32.98 s wall, without inter-file parallelism;
- TypeScript: passed in 2.55 s;
- ESLint: passed in 9.48 s;
- exact merge-base and `git diff --check`: passed;
- environment-backed Next.js 16.2.7 build: passed in 16.47 s; compiled in
  5.4 s, TypeScript in 8.8 s, and 12/12 static pages generated, including both
  Releases routes;
- final nonpersistent Chromium rehearsal: **40/40**, 123.39 s wall.

The first exhaustive DB wrapper attempt passed 18/19 files and 180/181 tests
but omitted the explicit reset-guard environment required by the guard’s own
integration test. The corrected wrapper passed the complete matrix above with
the physical system identifier queried and passed internally. No source change
was made between these attempts.

## Persistent browser evidence

### Diagnostic run — retained, not acceptance

`20260807-releases-core-delivery-01` is an immutable **36/39** diagnostic run
on source `92a00b8489c747a6ad2fd693964658b11e722dff`, with 84 run-scoped files:
33 console logs, 33 network logs, 16 screenshots, JUnit and manifest. It
exposed three legacy assumptions after Releases landed:

- the specialist permission scenario still asserted that no Releases UI existed;
- the sprint table expected the old column list without `Fix versions`;
- the negative sprint drag relied on off-screen pointer geometry after the
  long Releases fixture scrolled to the bulk toolbar.

These were test-oracle/fixture defects, not accepted product failures. The run
is preserved for traceability and is never cited as delivery proof.

### Historical acceptance run — corrected, retained

The unique persistent run `20260807-releases-core-delivery-02` records exact
source `88b817134aaed3c3909f0c3585b3e358b3e6a89e`:

- [JUnit](../runs/20260807-releases-core-delivery-02-junit.xml): **39 tests,
  0 failures, 0 errors, 0 skipped**, 114.635154 s;
- [manifest](../runs/20260807-releases-core-delivery-02-manifest.json): Node,
  pnpm, source SHA, database name/fingerprint, port `3100`, exact command and
  scenario label;
- **90 run-scoped files**: 35 console logs, 35 network logs, 18 screenshots,
  JUnit and manifest;
- 15/15 Releases scenarios and all 24 legacy scenarios passed.

Corrected artifact scan:

- 0 HTTP 4xx/5xx lines;
- **9 console error lines and 9 request-failure lines**, confined to six named
  deliberate scenarios: backlog-foundation-failure, sprint-lifecycle-failure,
  sprint-planning-failure, Releases S07, Releases S12 and Releases S14;
- 8 matching `[expected]` markers;
- 0 raw PostgreSQL system identifier;
- 0 PostgreSQL URL, DB environment assignment, auth/cookie header, password,
  or session token across all 72 text artifacts.

The previous 6 + 6 / three-scenario wording counted only the three legacy
failure logs and accidentally omitted the three deliberate Releases injection
logs. The frozen delivery-02 artifacts themselves are unchanged.

### Authoritative final acceptance run

The unique persistent run `20260807-releases-core-delivery-03` records exact
source `8eef265f971ca8244e67299926223046a3529cda`:

- [JUnit](../runs/20260807-releases-core-delivery-03-junit.xml): **40 tests,
  0 failures, 0 errors, 0 skipped**, 124.837637 s;
- [manifest](../runs/20260807-releases-core-delivery-03-manifest.json): exact
  Node, pnpm, source SHA, derived database fingerprint, port, command and
  scenario label;
- [reproducible scan summary](../runs/20260807-releases-core-delivery-03-scan.txt);
- **93 run-scoped files**: 36 console logs, 36 network logs, 18 screenshots,
  JUnit, manifest and scan summary;
- 16/16 Releases scenarios and all 24 legacy scenarios passed.

The 74 generated text artifacts scanned before the summary was written contain
0 HTTP 4xx/5xx response, 0 credential/header/token/DB URL or environment
assignment, and 0 raw PostgreSQL system identifier. The exact 9 + 9 deliberate
ERR_FAILED lines are confined to the same six named scenarios above, with 8
matching `[expected]` markers.

## Deliberate deviations and PR2 exclusions

The core models Jira’s Version and multivalued `Fix versions`, but deliberately
does not include the following deeper Jira capabilities:

- merge versions and atomic reference transfer;
- delete with mandatory transfer/removal decision;
- manual version ordering;
- editable/exportable release notes;
- related work and Git/PR/check/deployment readiness;
- release forecast driven by velocity or burndown.

These are PR Release 2 or reporting scope. Their absence does not weaken the
accepted core, and none is represented by a placeholder control.

## Remaining concerns and next priorities

1. Responsive 390/768/1024/1440, zoom 200 %, VoiceOver/NVDA and high-volume UI
   lists remain outside this desktop Chromium acceptance.
2. Sprint report, velocity and burndown are still absent even though the data
   foundations now support explainable reporting.

Deferred Minors are recorded without scope expansion: privileged cleanup-role
portability; correlation validation/nullability; canonical cache revalidation;
release/user option pagination; extreme page clamping; stricter expected-fault
allowlist accounting; a preexisting destination-link fixture; late post-write
rollback injection; extreme PostgreSQL bind limits; duplicate release IDs in
saved views; and a configurable Backlog `Fix versions` column. The earlier
published-destination ledger item is superseded by the approved design and its
explicit server rejection regression, not carried as open debt.

Next work should deliver reporting first, then Release PR2, then Git/PR-based
readiness and the multi-breakpoint/accessibility matrix.
