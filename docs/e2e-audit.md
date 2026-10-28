# E2E artifact inventory

The existing [isolated E2E audit procedure](../audit/README.md) creates a provenance manifest before the tests run; the inventory is a separate finalization step after Playwright and its JUnit reporter have exited.

From the worktree used for the run, execute `corepack pnpm e2e:inventory <runId>` once after the run finishes (including failed runs).

The command detects `audit/runs/<runId>-manifest.json` or `.playwright/reports/<runId>-manifest.json`; it refuses missing or ambiguous manifests. No database, server or browser is started, and no environment variables or credentials are required.

It preserves schema version 1 and existing provenance, adding `artifacts: [{ path, size, sha256 }]`: repository-relative POSIX paths sorted lexically, byte lengths and hexadecimal SHA-256 digests. It covers run-prefixed JUnit/integrity/scan files beside the manifest; persistent audit console/network/screenshots, or `.playwright/evidence/<runId>/`; and all Playwright output under `.playwright/test-results/<runId>/` (including traces, screenshots and videos). Run IDs that overlap as prefixes in the same manifest folder are refused: shared filenames cannot prove ownership in that case. Choose unique, non-overlapping run IDs; local and persistent runs use separate namespaces. The manifest itself is excluded to avoid a recursive digest. Missing artifact directories yield an empty inventory when no files exist.

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

The shared width subset contains these 21 specs (defined once with the projects in `e2e/matrix.ts`):

- P2: `board-added-column`, `board-empty-columns`, `keyboard-shortcuts`, `backlog-redesign`.
- P3: `backlog-ranking`, `list-rows`, `sprint-filter`, `create-under-version-filter`, `create-everywhere`, `new-item-missing-parent`, `new-item-required-parent`.
- P4: `item-detail-drawer`, `ticket-drawer`, `markdown-editor`, `item-templates`.
- P6: `shell-redesign`, `mobile-shell`, `help-guide`, `overlay-animations`, `loading-skeletons`, `realtime`.

Install missing engines before running the matrix: `corepack pnpm exec playwright install firefox`, and `corepack pnpm exec playwright install webkit` if WebKit is absent. These are Playwright engine builds, not a screen-reader validation in native Safari or Firefox.

Keep the local database connection, explicit reset consent, verified database system identifier, fixture password and audit-persistence variables from the [existing procedure](../audit/README.md). The matrix runner inherits these values and never prints them; it does not grant reset consent. The package command uses the same isolated-app, local auth URL and React server-condition preamble as `test:e2e`.

```sh
# All six projects, in the table's order:
corepack pnpm test:e2e:matrix

# Only these projects, in argument order:
corepack pnpm test:e2e:matrix matrix-webkit-768 matrix-firefox
```

Unknown or repeated names and combined project flags are rejected before any process starts. Each plan entry launches exactly `corepack pnpm exec playwright test --project=<one-project>`. One UTC timestamp is captured per invocation; run IDs use `matrix-<project-without-matrix-prefix>-<YYYYMMDD>-<HHMMSS>`, for example `matrix-chromium-20261028-223000` and `matrix-chromium-768-20261028-223000`. These IDs do not nest as prefixes. Reusing a project/timestamp is refused by the existing exclusive run reservation; launches for the same project need different seconds.

Each child gets its own `JIROO_E2E_RUN_ID`, the actual command as `JIROO_E2E_COMMAND_LABEL`, and `JIROO_E2E_SCENARIOS=matrice <project>`. After process closure, including failure, the runner attempts `inventoryE2eRun` before starting the next project. It continues after a failed process or inventory, prints project / run ID / result / duration (including inventory), and exits nonzero if any row failed. Existing provenance is retained. Persistent manifests and JUnit go to `audit/runs/`; otherwise they go to `.playwright/reports/`, with temporary evidence under `.playwright/evidence/<runId>/`.

For discovery without setup, server or browser, use `NODE_OPTIONS=--conditions=react-server corepack pnpm exec playwright test --list --project=matrix-chromium-768 --reporter=list`. The list-reporter override is required for this inspection: the normal exclusive JUnit reporter expects a run reservation, which `--list` deliberately does not create. Actual runs retain the configured reporters unchanged.
