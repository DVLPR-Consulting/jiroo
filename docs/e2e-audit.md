# E2E artifact inventory

The existing [isolated E2E audit procedure](../audit/README.md) creates a provenance manifest before the tests run; the inventory is a separate finalization step after Playwright and its JUnit reporter have exited.

From the worktree used for the run, execute `corepack pnpm e2e:inventory <runId>` once after the run finishes (including failed runs).

The command detects `audit/runs/<runId>-manifest.json` or `.playwright/reports/<runId>-manifest.json`; it refuses missing or ambiguous manifests. No database, server or browser is started, and no environment variables or credentials are required.

It preserves schema version 1 and existing provenance, adding `artifacts: [{ path, size, sha256 }]`: repository-relative POSIX paths sorted lexically, byte lengths and hexadecimal SHA-256 digests. It covers run-prefixed JUnit/integrity/scan files beside the manifest; persistent audit console/network/screenshots/a11y, or `.playwright/evidence/<runId>/`; and all Playwright output under `.playwright/test-results/<runId>/` (including traces, screenshots and videos). Run IDs that overlap as prefixes in the same manifest folder are refused: shared filenames cannot prove ownership in that case. Choose unique, non-overlapping run IDs; local and persistent runs use separate namespaces. The manifest itself is excluded to avoid a recursive digest. Missing artifact directories yield an empty inventory when no files exist.

Only metadata is stored: artifact contents are hashed without being printed or embedded. Paths outside these run scopes, symlinks and non-regular files are refused. The manifest is replaced atomically with mode `0600`; an exclusive inventory lock prevents simultaneous finalizations. A completed inventory cannot be overwritten. Do not run this command while tests, reporters or other artifact writers are still active; add any manual integrity or scan files first. Inventory completion is not proof that tests passed or that the evidence passed its separate secret scan.

## Browser and width matrix

The matrix is run on demand, outside CI. The existing `chromium` project keeps its Desktop Chrome profile (1280 × 720); `corepack pnpm test:e2e` selects only that project. Matrix runs use a separate command, one Playwright process per project, sequentially, so the guarded global setup resets the isolated database between projects.

| Project | Device profile | Viewport | Specs |
| --- | --- | --- | --- |
| `matrix-chromium` | Desktop Chrome | 1440 × 900 | All |
| `matrix-firefox` | Desktop Firefox | 1440 × 900 | All |
| `matrix-webkit` | Desktop Safari | 1440 × 900 | All |
| `matrix-chromium-1024` | Desktop Chrome | 1024 × 768 | P2, P3, P4, P6 |
| `matrix-chromium-768` | Desktop Chrome | 768 × 1024 | P2, P3, P4, P6 |
| `matrix-webkit-768` | Desktop Safari | 768 × 1024 | P2, P3, P4, P6 |
| `matrix-zoom-chromium` | Desktop Chrome | 720 × 450 | Seven zoom pages |
| `matrix-zoom-firefox` | Desktop Firefox | 720 × 450 | Seven zoom pages |
| `matrix-zoom-webkit` | Desktop Safari | 720 × 450 | Seven zoom pages |
| `matrix-drops` | Desktop Chrome | 1200 × 800 baseline | Three required drop series + one conditional farthest series |

The shared width subset contains these 21 specs (defined once with the projects in `e2e/matrix.ts`):

- P2: `board-added-column`, `board-empty-columns`, `keyboard-shortcuts`, `backlog-redesign`.
- P3: `backlog-ranking`, `list-rows`, `sprint-filter`, `create-under-version-filter`, `create-everywhere`, `new-item-missing-parent`, `new-item-required-parent`.
- P4: `item-detail-drawer`, `ticket-drawer`, `markdown-editor`, `item-templates`.
- P6: `shell-redesign`, `mobile-shell`, `help-guide`, `overlay-animations`, `loading-skeletons`, `realtime`.

Install missing engines before running the matrix: `corepack pnpm exec playwright install firefox`, and `corepack pnpm exec playwright install webkit` if WebKit is absent. These are Playwright engine builds, not a screen-reader validation in native Safari or Firefox.

Keep the local database connection, explicit reset consent, verified database system identifier, fixture password and audit-persistence variables from the [existing procedure](../audit/README.md). The matrix runner inherits these values and never prints them; it does not grant reset consent. The package command uses the same isolated-app, local auth URL and React server-condition preamble as `test:e2e`.

```sh
# All ten projects, in the table's order:
corepack pnpm test:e2e:matrix

# Only these projects, in argument order:
corepack pnpm test:e2e:matrix matrix-webkit-768 matrix-firefox
```

Unknown or repeated names and combined project flags are rejected before any process starts. Each plan entry launches exactly `corepack pnpm exec playwright test --project=<one-project>`. One UTC timestamp is captured per invocation; run IDs use `matrix-<project-without-matrix-prefix>-<YYYYMMDD>-<HHMMSS>`, for example `matrix-chromium-20261028-223000` and `matrix-chromium-768-20261028-223000`. These IDs do not nest as prefixes. Reusing a project/timestamp is refused by the existing exclusive run reservation; launches for the same project need different seconds.

Each child gets its own `JIROO_E2E_RUN_ID`, the actual command as `JIROO_E2E_COMMAND_LABEL`, and `JIROO_E2E_SCENARIOS=matrice <project>`. After process closure, including failure, the runner attempts `inventoryE2eRun` before starting the next project. It continues after a failed process or inventory, prints project / run ID / result / duration (including inventory), and exits nonzero if any row failed. Existing provenance is retained. Persistent manifests and JUnit go to `audit/runs/`; otherwise they go to `.playwright/reports/`, with temporary evidence under `.playwright/evidence/<runId>/`.

For discovery without setup, server or browser, use `NODE_OPTIONS=--conditions=react-server corepack pnpm exec playwright test --list --project=matrix-chromium-768 --reporter=list`. The list-reporter override is required for this inspection: the normal exclusive JUnit reporter expects a run reservation, which `--list` deliberately does not create. Actual runs retain the configured reporters unchanged.

### Accessibility and zoom

The legacy `chromium` acceptance project ignores `**/matrix/**`. Full matrix
projects collect `matrix/a11y.spec.ts` in addition to the existing acceptance
specs. Width projects keep the same 21-file subset. Only the three
`matrix-zoom-*` projects set `textZoom: true` and select `matrix/zoom.spec.ts`;
its tests skip in full projects where the option defaults to false.

Both new specs use the isolated platform administrator and these stable page
landmarks. No new database fixtures or item/permission mutations are required.

| Page | Route and readiness | Zoom action and observable result |
| --- | --- | --- |
| P1 `p1-accueil` | `/`, Backlogs heading and CASS row | Cour de cassation link in that row opens `/b/CASS` |
| P2 `p2-board` | `/b/CASS?view=board`, Board heading and a status group | Topbar Créer opens Nouvel item |
| P3 `p3-liste` | `/b/CASS?view=list`, Liste heading and a ticket row | Topbar Créer opens Nouvel item |
| P4 `p4-tiroir` | Liste, then open a ticket row and wait for its named dialog | Fermer (Échap) closes the dialog; the background topbar is inert |
| P5 `p5-le-point` | `/b/CASS/le-point`, heading and rules button | Comment est-ce calculé ? opens the rules dialog |
| P6 `p6-aide` | `/aide`, Guide d’utilisation heading and TOC | Sommaire expands the narrow TOC and exposes Démarrer |
| P7 `p7-reglages` | `/b/CASS/settings/access`, Accès heading and permission helper | Select the synthetic administrator; Vérifier la permission returns Autorisé |

The specs also wait for streamed Suspense content to leave its hidden staging
containers before measuring or scanning. Actions may require ordinary vertical
scrolling; the page is captured before the action is activated. P1 uses the
backlog link because the home page has no ticket-create button. P4 uses the
modal's close button rather than trying to activate its inert background.

`auditAccessibility(page, pageName)` runs `@axe-core/playwright` with tags
`wcag2a`, `wcag2aa`, `wcag21a`, and `wcag21aa`. It fails the page's test on
**critical or serious** violations; moderate/minor counts are recorded in test
annotations and the assertion message. The evidence JSON contains only rule
`id`, `impact`, `description`, `helpUrl`, `tags`, and node `target` /
`failureSummary`, ordered by impact (critical first) then id. Node HTML and
check payloads are never included. The shared credential filter checks the
serialized evidence before writing, rejecting it without printing its contents.
These automated checks do not replace the manual screen-reader script or a
formal accessibility audit.

`writeAuditText` stores `<runId>-axe-<page>.json` in `audit/a11y/` for persistent
runs, or `.playwright/evidence/<runId>/a11y/` otherwise. `inventoryE2eRun` includes
both locations in its existing run scope. Existing exclusive-write and evidence
checks are preserved. Inventory hashing alone is not a secret scan.

Zoom combines a 720 × 450 viewport (reflow equivalent to 1440 × 900 at 200%)
with a 200% root font set by `context.addInitScript`, before page scripts. The
initializer handles document creation before the HTML root exists. Each test
verifies that the root font override is present, document and `<main>` horizontal
overflow are at most **1 px**, and its primary action is visible, fully in the
viewport, enabled and actually works. Inner horizontal scrollers such as Board
columns remain allowed. `writeAuditScreenshot` stores
`<runId>-zoom-<page>.png` in the usual persistent/local screenshot directory.
This is simulated zoom, not native browser zoom; fixed pixel text and images
are not scaled by the root-font override.

For discovery only, with no database, server or browser:

```sh
NODE_OPTIONS=--conditions=react-server corepack pnpm exec playwright test --list --project=matrix-zoom-firefox --reporter=list
```

For a real isolated run, use the environment and reset safeguards above, then
`corepack pnpm test:e2e:matrix matrix-zoom-firefox`. Browser installation and real
matrix execution are separate operations; adding these specs does not run them.

### Drop matrix (BUG-JIR-011)

`corepack pnpm test:e2e:matrix matrix-drops` selects only
`matrix/drops.spec.ts`, using the existing isolated database/reset procedure.
The full browser projects discover but skip these stress cases; their setup
never creates the drop backlog. The legacy Chromium project continues to ignore
the matrix directory, and the width subsets remain unchanged.

The spec creates one dedicated `DRPxxx` backlog through services, with the four
default columns plus Contrôle 1, Contrôle 2 and Contrôle 3 added through
`createStatus`. A component, epic and started sprint own one anchor task per
column plus a moving task in À faire. The dedicated backlog is archived on
cleanup because its sprint ledger is append-only. No shared CASS/LABS data is
changed.

At each of **390, 768 and 1200 px** (height 800), the spec selects the nearest
column that is **entirely offscreen** at zero horizontal scroll, then verifies
**50 consecutive forward drops of the same card**. Partial columns do not count
as offscreen targets. Mouse drag remains supported at 390 px; this is a pointer
regression test, not a replacement for native touch coverage.

Each drag holds the pointer two pixels inside the scroller's right edge until
native dnd-kit auto-scroll exposes the chosen column's center. It then samples
fresh geometry, moves into the column, reads the live region **before releasing**,
and requires a nonzero horizontal scroll. No programmatic scrolling occurs
while the card is held. After release, the test independently compares:

1. The intended column against the column named in that card's live announcement.
2. The actual `statusId` parsed from the moving item's POST server-action arguments,
   matching the item rather than searching for the expected destination.
3. The moving card's actual parent column after a reload.

All three must agree with the intended status. Failures name the card key and
expected / announced / sent / reloaded business labels; absent observations
fail closed. Request bodies and headers are not written to evidence. The test
also checks the action's HTTP status and waits for the card's enabled handle
(server acknowledgement) rather than waiting for the RSC stream to finish.

After each verified reload, `updateItem` returns the card to À faire through
the service, followed by another reload. This explicitly approved fixture reset
is **not a tested or counted drop**. Zero scroll is restored only while at rest.
Series wall time includes these resets for project budgeting; reset latency is
not reported as a separate measured product action.

There are three required series (150 forward drops). An optional fourth series
at 1200 px targets the farthest offscreen column for another **50**. It runs only
after all three required series succeed and when a conservative estimate fits
the remaining nine-minute internal budget, leaving a minute for process overhead.
The estimate projects observed fixed work plus auto-scroll milliseconds per
pixel over the farther distance, with a **25% margin**. Otherwise Playwright
marks the fourth series skipped with the estimate and elapsed time; it never
reduces a series below 50 to claim a pass. Required series have 180-second test
timeouts, and the optional series uses the remaining internal budget.

This is a sub-ten-minute **aim**, not a measured result: no real drop run belongs
to the tooling lot. As an unmeasured planning assumption, 150 warm cycles at
2–3 seconds take about 5–7.5 minutes plus setup; the farther series may not fit.
M3 must record actual times and whether the fourth series ran or was skipped.
Filled columns are deliberate; existing `board-empty-columns` coverage remains
separate, as do native touch and initially nonzero-scroll scenarios.

Each executed series writes `<runId>-drops-<width>-nearest.log` (or `-farthest`)
in the console evidence directory, with each verified triple, positive scroll,
verified count and total duration. Counts/duration also appear in console and
test annotations. Incomplete series capture a screenshot through the normal
run-scoped writer; default Playwright failure artifacts remain enabled. The
shared credential filter is applied before writing the text evidence.

For discovery only, without database/server/browser execution:

```sh
NODE_OPTIONS=--conditions=react-server corepack pnpm exec playwright test --project=matrix-drops --list --reporter=list
```
