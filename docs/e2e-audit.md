# E2E artifact inventory

The existing [isolated E2E audit procedure](../audit/README.md) creates a provenance manifest before the tests run; the inventory is a separate finalization step after Playwright and its JUnit reporter have exited.

From the worktree used for the run, execute `corepack pnpm e2e:inventory <runId>` once after the run finishes (including failed runs).

The command detects `audit/runs/<runId>-manifest.json` or `.playwright/reports/<runId>-manifest.json`; it refuses missing or ambiguous manifests. No database, server or browser is started, and no environment variables or credentials are required.

It preserves schema version 1 and existing provenance, adding `artifacts: [{ path, size, sha256 }]`: repository-relative POSIX paths sorted lexically, byte lengths and hexadecimal SHA-256 digests. It covers run-prefixed JUnit/integrity/scan files beside the manifest; persistent audit console/network/screenshots, or `.playwright/evidence/<runId>/`; and all Playwright output under `.playwright/test-results/<runId>/` (including traces, screenshots and videos). Run IDs that overlap as prefixes in the same manifest folder are refused: shared filenames cannot prove ownership in that case. Choose unique, non-overlapping run IDs; local and persistent runs use separate namespaces. The manifest itself is excluded to avoid a recursive digest. Missing artifact directories yield an empty inventory when no files exist.

Only metadata is stored: artifact contents are hashed without being printed or embedded. Paths outside these run scopes, symlinks and non-regular files are refused. The manifest is replaced atomically with mode `0600`; an exclusive inventory lock prevents simultaneous finalizations. A completed inventory cannot be overwritten. Do not run this command while tests, reporters or other artifact writers are still active; add any manual integrity or scan files first. Inventory completion is not proof that tests passed or that the evidence passed its separate secret scan.
