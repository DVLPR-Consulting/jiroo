# View windows: indexes and before measurement (JIR-144 / JIR-120 W4)

## Application and method

Measured on 11 November 2026, before W0–W3. The checkout is `7b64d75`
(JIR-142 tooling); application code is identical to main `7fb47d2`. The only
application-side addition in this experiment is the two index declarations.
No windows, SQL filter rewrite or application optimization is included.

The unchanged `seed-team-profile.ts` creates 20,000 items across five backlogs;
the probe reads PERFA as a fresh, TOTP-enrolled contributor. The production
standalone build runs on Node 24.18.1 / Next 16.4.1 against a new PostgreSQL 17
Docker tmpfs database, bound to loopback port 5434. The host is an Apple M5 Max
(18 cores, 64 GiB RAM, Darwin 27.0.0). The migration is applied
only there. No existing database, Neon, DEV or target migration is used.

Both phases use the same dataset and production server: drop only the two W4
indexes, `ANALYZE items`, measure without indexes, create them from the generated
migration, `ANALYZE items`, measure with indexes. Each operation has one excluded
warm-up and 20 serial samples, with the original operation ordering. There are
no writes or SSE subscribers during measurement. Each phase uses a separate
fresh contributor. The server is stopped and the owned container removed at
completion; absence is verified.

Bytes are decoded HTTP response bytes, including HTML/Flight, rather than wire
bytes. Time runs from HTTP request start to fully consumed response, excluding
validation and SQL marker/log retrieval. SQL counts use runtime-role duration
logs between unique owner markers (transactions included, Parse/Bind excluded).
This is a warm-cache local experiment on a shared development machine, not a
concurrent-load measurement or a production latency guarantee. Changes of a
few milliseconds should not be attributed to the indexes alone.

## Results before windows

| View | Decoded bytes (MiB) | Without: p50 / p95 ms | With: p50 / p95 ms | SQL without / with |
| --- | ---: | ---: | ---: | ---: |
| List | 25,214,709 (24.05) | 1046.44 / 1462.89 | 1043.93 / 1393.05 | 57 / 57 |
| Backlog | 14,026,358 (13.38) | 746.92 / 926.20 | 739.24 / 796.07 | 59 / 59 |
| Tree | 13,518,065 (12.89) | 348.01 / 393.91 | 343.37 / 397.60 | 57 / 57 |
| Board | 1,958,651 (1.87) | 108.79 / 123.15 | 97.99 / 109.61 | 57 / 57 |
| Panel | 25,343 (0.02) | 21.83 / 25.37 | 18.17 / 19.49 | 40 / 40 |

Payload bytes and SQL counts are identical in every sample of both phases.
The indexes alone do not remove the full-backlog payload. List and Backlog still
exceed the indicative 500 ms page p95 threshold. W1–W3 must reduce the rows
returned; the timings here do not establish an index-only speedup.

Raw, credential-free samples and migration catalog evidence:
[`2026-11-jir-120-windows.json`](2026-11-jir-120-windows.json).

## Migration and reproduction

`drizzle/0025_mysterious_cerebro.sql` adds ordinary, non-unique B-tree indexes:

- `items_backlog_status_idx (backlog_id, status_id)`
- `items_backlog_parent_rank_idx (backlog_id, parent_id, rank)`

The schema declarations, Drizzle snapshot and migration journal agree. A full
migration from an empty disposable database succeeds; the catalog confirms the
column order and index type. Re-running `pnpm db:migrate` succeeds without
reapplying the indexes. Nicolas runs this migration on DEV and the target,
following the project's existing manual migration procedure.

To replay the serial comparison, follow the isolated setup and cleanup script
in [the JIR-118 measurement](2026-10-jir-118-light-views.md#reproduction), using
this checkout's `probe-views.mjs` and the current migration set. Keep the same
seed, server and runtime role throughout both phases. Before the first probe,
as the disposable database owner only, run:

```sql
DROP INDEX items_backlog_status_idx;
DROP INDEX items_backlog_parent_rank_idx;
ANALYZE items;
```

Run the default serial probe, retain stdout JSON and stderr table, then apply
`drizzle/0025_mysterious_cerebro.sql` through the owned container's `psql` and
run `ANALYZE items`. Choose the next fresh contributor in the seed profile
(`people[2]` instead of `people[1]`) for the second probe to enroll TOTP afresh.
Run the probe again, retain its JSON, then stop the server and remove only the
container created by the reproduction script. Preserve its cleanup trap on
error. Do not use `db:push` or modify a shared database for this comparison.

## Optional window mode

Serial mode remains the default (`PROBE_MODE=serial`, or unset). It needs no
browser and does not inspect the server-action manifest. It therefore works on
main while W1–W3 are absent.

Use the same owned server/database, authenticated contributor and `PROBE_*`
configuration as the serial reproduction. Once a view is delivered:

```sh
corepack pnpm exec playwright install chromium
PROBE_MODE=window PROBE_WINDOW_VIEW=list node scripts/perf/probe-views.mjs > /tmp/list-windows.json
PROBE_MODE=window PROBE_WINDOW_VIEW=backlog node scripts/perf/probe-views.mjs > /tmp/backlog-windows.json
PROBE_MODE=window PROBE_WINDOW_VIEW=tree PROBE_WINDOW_QUERY=q=dossier node scripts/perf/probe-views.mjs > /tmp/tree-windows.json
```

Use a fresh contributor for each invocation, or provide `PROBE_TOTP_SECRET`
for an already enrolled one. The seed/filter must yield more than one window.
`PROBE_WINDOW_QUERY` accepts URL query parameters for the selected view;
`view` must be selected with `PROBE_WINDOW_VIEW`. Tree uses the filtered matching
window path from D5: an unfiltered tree's roots and first expanded children are
not two consecutive pages of siblings, so that case is explicitly rejected.

The probe identifies `loadViewWindowAction` in the production build's server
reference manifest. If the implemented read action has another name, set
`PROBE_WINDOW_ACTION` to that **read-only** exported name. Missing/ambiguous
actions fail clearly instead of silently measuring a full page as a window.

Before measurement, a short-lived Chromium context receives the authenticated
cookies and visits the selected view. It captures the first continuation
request generated by automatic loading, or clicks the exact fallback button
“Charger la suite”. All POSTs are intercepted and aborted during discovery;
unexpected actions fail the probe. Background reads, prefetches, external
resources and realtime streams are blocked. The browser closes before timing.
The captured action input contains the real first-window cursor, so no cursor
format, router tree or action input schema is invented by the probe.

For each repetition, the probe reads the initial HTML response, then replays
that captured continuation over Node HTTP. Each response has its own SQL
markers and byte/time sample. The report has separate `<view> first` and
`<view> next` rows; one complete pair is the excluded warm-up. Continuations
must return HTTP success, Flight content type and a successful non-empty action
result (`ok: true` plus data). Redirects, action errors and missing SQL markers
fail the run. The seed and filters must stay unchanged during these reads.

These are HTTP-boundary measurements: browser discovery/hydration, DOM paint,
automatic scroll timing and later windows are excluded. The initial HTML also
includes layout and metadata; the Backlog's initial response includes its sprint
sections. Window mode is exercised against a local browser fixture (automatic
and fallback continuation, blocked side reads/writes, timeout and errors).
Live measurements on the real windowed views remain for W1–W3 and JIR-148;
those views do not exist in this before revision.

## Verification

```sh
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
JIROO_RUN_BROWSER_PROBE_TESTS=1 corepack pnpm test scripts/perf/probe-windows.test.mjs
```

Browser fixture tests are opt-in because the unit-test CI does not install
Chromium. Pure probe and schema-index tests run in the default suite. The
production build, real serial HTTP probes, migration and repeat migration are
also exercised by the disposable comparison above.

Final full-suite run: `pnpm test --maxWorkers=4` — **3,395 passed, 509 skipped**
(DB suites and the opt-in browser fixture are excluded by default). The initial
unrestricted run had two timing failures in the unchanged
`components/releases/release-merge-delete-dialog.test.tsx` (`keeps the dialog
open with the new count when the linked items changed`, `keeps the selection
after a network failure`); all 11 tests in that file passed on isolated rerun,
and the complete four-worker rerun passed. Typecheck passed; lint has no errors
and one existing warning in `lib/auth/client.ts`. Chromium fixture tests were
also explicitly enabled and passed.
