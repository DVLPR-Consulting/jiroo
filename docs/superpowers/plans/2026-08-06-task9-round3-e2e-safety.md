# Task 9 Round 3 E2E Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make destructive Playwright resets instance-bound, reserve each run exactly once, make every E2E proof immutable and run-scoped, and persist non-secret provenance.

**Architecture:** The reset gate will validate the URL, then use one PostgreSQL `PoolClient` to read `current_database()` and `pg_control_system().system_identifier` immediately before `TRUNCATE`. `globalSetup` alone will acquire an exclusive run lock, verify the database, write an exclusive provenance manifest, and reset. A shared artifact module will map every legacy evidence path to a run-scoped destination and use exclusive text writes or atomic screenshot copies.

**Tech Stack:** TypeScript, Node 24.13.0, Vitest 4.1.8, Playwright 1.62.1, PostgreSQL 17, node-postgres, Drizzle ORM.

## Global Constraints

- Run every verification with `PATH=/Users/nkrmr/.nvm/versions/node/v24.13.0/bin:/usr/local/bin:/usr/bin:/bin`.
- Permit destructive reset only for `current_database() = 'jiroo_e2e'`.
- Require `JIROO_ALLOW_E2E_RESET=1` and `JIROO_E2E_DATABASE_SYSTEM_IDENTIFIER` explicitly from the operator.
- Never write the raw PostgreSQL system identifier, credentials, TOTP data, cookies, or recovery codes to tracked artifacts.
- Preserve all 2026-08-05 and round-1/round-2 artifacts byte-for-byte; do not restore them after final proof runs because the runs themselves must leave them untouched.
- Do not push or merge.

---

### Task 1: Instance-bound destructive reset

**Files:**
- Modify: `lib/db/index.ts`
- Modify: `scripts/e2e-reset-guard.ts`
- Modify: `scripts/e2e-reset-guard.test.ts`
- Create: `scripts/e2e-reset-guard.integration.test.ts`
- Modify: `e2e/global.setup.ts`

**Interfaces:**
- Produces: `assertE2eDatabaseIdentity(input): VerifiedE2eDatabaseIdentity`
- Produces: `verifyE2eDatabaseIdentity(client, expectedSystemIdentifier): Promise<VerifiedE2eDatabaseIdentity>`
- `VerifiedE2eDatabaseIdentity` contains only `databaseName` and `systemIdentifierFingerprint`; the raw identifier remains local to the verification call.

- [x] **Step 1: Write failing URL-name tests**

Change the allowlist expectations so `jiroo` and `jiroo_test` throw, while `jiroo_e2e` remains accepted.

- [x] **Step 2: Run the guard test and observe RED**

Run: `PATH=/Users/nkrmr/.nvm/versions/node/v24.13.0/bin:/usr/local/bin:/usr/bin:/bin pnpm --ignore-workspace exec vitest run scripts/e2e-reset-guard.test.ts`

Expected: the cases for `jiroo` and `jiroo_test` fail because they are currently allowed.

- [x] **Step 3: Write failing identity tests**

Cover absent expected identifier, wrong current database, mismatch, and matching identity. The matching literal must return a hand-derived SHA-256 fingerprint and must not expose the raw identifier in serialized output.

- [x] **Step 4: Implement the minimal identity gate**

Use one query on the supplied `PoolClient`:

```sql
SELECT current_database() AS "databaseName",
       system_identifier::text AS "systemIdentifier"
FROM pg_control_system()
```

Compare against the explicit environment value, hash with SHA-256, and retain no raw identity in the return value.

- [x] **Step 5: Bind verification and truncate to one session**

Export the existing pool from `lib/db/index.ts`, acquire one client in `resetBrowserDatabase`, verify first, then call `TRUNCATE` through that same client, and release it in `finally`.

- [x] **Step 6: Run unit and local integration diagnostics**

Run the unit files, then run the gated integration test against `jiroo_e2e` with the explicitly queried local system identifier. Confirm mismatch fails without mutation.

### Task 2: Single-owner run reservation

**Files:**
- Modify: `scripts/e2e-run-reservation.ts`
- Modify: `scripts/e2e-run-reservation.test.ts`
- Modify: `playwright.config.ts`
- Modify: `e2e/global.setup.ts`

**Interfaces:**
- Produces: `reserveE2eRunId(runId, lockRoot?): string`
- Consumes: `JIROO_E2E_RUN_ID` in `globalSetup` only.

- [x] **Step 1: Change the process-contention test to share the same token**

Spawn two Node 24 processes that call `reserveE2eRunId` with the same run ID and the same `JIROO_E2E_RUN_OWNER_TOKEN`. Assert sorted exit codes `[0, 1]` and the collision message.

- [x] **Step 2: Observe RED**

Expected: both calls are accepted because the current helper treats a shared token as reentrant.

- [x] **Step 3: Remove token ownership and config-time reservation**

Make the helper a single `openSync(path, 'wx', 0o600)` operation, write PID/timestamp only, and throw on every `EEXIST`. Remove owner-token code and the top-level config call.

- [x] **Step 4: Reserve first in `globalSetup`**

Call `reserveE2eRunId` before auth cleanup, database verification, manifest creation, reset, or any artifact write.

- [x] **Step 5: Run contention tests GREEN**

Confirm exactly one process wins even with identical inherited environment.

### Task 3: Immutable run-scoped legacy evidence

**Files:**
- Create: `e2e/audit-artifacts.ts`
- Create: `scripts/e2e-audit-artifacts.test.ts`
- Modify: `e2e/backlog-foundation.spec.ts`
- Modify: `e2e/backlog-ranking.spec.ts`
- Modify: `e2e/sprint-lifecycle.spec.ts`
- Modify: `e2e/permission-schemes.spec.ts`

**Interfaces:**
- Produces: `resolveAuditArtifactPath(legacyPath, env?): string`
- Produces: `writeAuditText(legacyPath, contents): Promise<string>` using `flag: 'wx'`
- Produces: `writeAuditScreenshot(legacyPath, capture): Promise<string>` using a temporary file and an exclusive atomic hard-link publication.

- [x] **Step 1: Write failing path/exclusivity tests**

Assert persistent paths are `audit/<kind>/<run-id>-<legacy-basename>`, temporary paths live below `.playwright/evidence/<run-id>/`, duplicate text writes fail without changing bytes, and duplicate screenshot publication fails without changing bytes.

- [x] **Step 2: Observe RED**

Run the new unit file and confirm current direct legacy writes cannot satisfy it.

- [x] **Step 3: Implement the shared artifact functions**

Require a validated run ID, choose persistent output only when `JIROO_E2E_PERSIST_AUDIT_ARTIFACTS=1`, create parent directories, and publish screenshots atomically through `COPYFILE_EXCL`.

- [x] **Step 4: Migrate all four specs**

Replace every direct `writeFile` and `page.screenshot` targeting audit paths. Keep legacy constants only as semantic basenames; no test may directly open a 2026-08-05 path.

- [x] **Step 5: Run artifact tests GREEN and typecheck**

Confirm all artifact helpers and spec call sites compile.

### Task 4: Exclusive provenance manifest

**Files:**
- Create: `scripts/e2e-run-manifest.ts`
- Create: `scripts/e2e-run-manifest.test.ts`
- Modify: `e2e/global.setup.ts`

**Interfaces:**
- Produces: `buildE2eRunManifest(input): E2eRunManifest`
- Produces: `writeE2eRunManifest(input): Promise<string>` with `wx` and mode `0600`.

- [x] **Step 1: Write failing manifest tests**

Assert literal Node/pnpm versions, git SHA, `jiroo_e2e`, fingerprint, base URL/port, run ID, timestamps, command/scenarios, and JUnit path. Assert raw system identity never appears in JSON and duplicate write preserves original bytes.

- [x] **Step 2: Observe RED**

Run the new unit file and confirm the missing manifest behavior fails.

- [x] **Step 3: Implement manifest construction and exclusive writing**

For persistent runs write `audit/runs/<run-id>-manifest.json`; otherwise write below `.playwright/reports`. Require command/scenario labels for persistent audit runs.

- [x] **Step 4: Write manifest after same-session identity verification and before truncate**

Read Node from `process.version`, pnpm from `pnpm --version`, git SHA from `git rev-parse HEAD`, base URL from `FullConfig`, and JUnit link from the known run ID.

### Task 5: Verification, committed-code audit runs, and handoff

**Files:**
- Modify: `audit/README.md`
- Modify: `audit/roadmap.md`
- Modify: `audit/ux.md`
- Create: `audit/reviews/2026-08-06-task9-review-r3.md`
- Create: round-3 JUnit, manifests, console/network logs, and screenshots under run IDs.

- [x] **Step 1: Run code-level Node 24 verification**

Run guard/identity/lock/artifact/manifest tests, full Vitest, DB integration, typecheck, lint, and build.

- [ ] **Step 2: Commit harness code**

Create a local code commit before browser proof so manifest `gitSha` names the exact committed harness under test.

- [ ] **Step 3: Hash every historical audit file**

Write the hash list outside Git under `.playwright/` and retain it for comparison.

- [ ] **Step 4: Run certified browser proofs**

Supply Node 24 PATH, explicit reset opt-in, raw local system identifier, `jiroo_e2e`, run ID, command/scenario labels, and persistent artifact flags. Run permissions 10/10, then Chromium 24/24.

- [ ] **Step 5: Compare historical hashes without restore**

Require exact equality of the before/after hash lists. Any changed historical file fails the task.

- [ ] **Step 6: Validate artifacts and provenance**

Scan for secrets, console/page errors, failed requests, unexpected HTTP status, manifest raw identity leakage, file collisions, and incorrect Node/base/SHA provenance.

- [ ] **Step 7: Update audit and commit evidence**

Document all findings, the safe operator command for querying the identifier without logging it, both immutable runs, verification counts, and the unchanged-history hash proof. Commit locally, then confirm a clean worktree.
