# The Backlog section by windows of 100 rows — JIR-146 (JIR-120 W2)

What the Backlog's first response weighs once its « Backlog » section sends a
window of at most 100 rows instead of every task without a sprint, its sprint
sections staying whole. Same seed, protocol and probe as the
[JIR-145 measurement](2026-11-jir-145-list-windows.md); only the application
revision changes.

## Environment

- Apple M5 Max (18 cores, 64 GiB RAM, Darwin 27.0.0), Node 24.18.1, Corepack
  pnpm 10.34.5, Next.js 16.4.1, PostgreSQL 17 (`postgres:17`, ARM64, defaults),
  data on tmpfs, an owned container on `127.0.0.1:5434`, runtime role
  `jiroo_perf_runtime`.
- The unchanged `scripts/perf/seed-team-profile.ts` (5 backlogs of 4,000
  items; `PERFA`'s active sprint holds 200 tasks), migrated up to
  `0026_view_sort_collations`; the probe reads `PERFA` as a fresh,
  TOTP-enrolled contributor (`people[1]`).
- Production build of commit `6035eef` served by `.next/standalone/server.js`
  on `127.0.0.1:3441`; one warm-up and 20 serial samples per operation.
- The machine was shared with other agents (load average 6 to 7): timings are
  indicative, sizes and SQL counts are exact (identical in all 20 samples).

## Serial probe (2026-11-11T15:57Z)

| Operation | Before bytes (MiB) | After bytes (MiB) | Ratio | Before p50 / p95 ms | After p50 / p95 ms | SQL before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Backlog | 14,026,358 (13.38) | 2,277,404 (2.17) | ÷ 6.2 | 419.51 / 455.66 | 117.57 / 133.20 | 60 → 67 |
| List | 691,038 (0.66) | 691,038 (0.66) | = | 76.98 / 97.43 | 74.74 / 101.55 | 65 → 65 |
| Tree | 13,518,065 (12.89) | 13,518,065 (12.89) | = | 242.00 / 264.44 | 259.07 / 272.44 | 57 → 57 |
| Board | 1,958,651 (1.87) | 1,958,651 (1.87) | = | 86.75 / 106.88 | 89.19 / 102.48 | 57 → 57 |
| Panel | 25,343 (0.02) | 25,343 (0.02) | = | 16.29 / 19.78 | 14.48 / 17.09 | 40 → 40 |

« Before » is the JIR-145 series (`551bc41`, the same day, same seed and
probe). Decoded bytes, not wire bytes.

Reading: the Backlog's first response is divided by 6.2, short of the ÷ 10
the ticket asks. What is left is mostly rows: one Backlog row (`ItemRow`,
shared with the Liste) renders about 6 KB of HTML for 341 bytes of data
(measured with `renderToString` on synthetic rows), and the page now holds the
active sprint's 200 tasks, sent whole as the ticket requires, plus the
section's first 100 rows: about 1.8 MB of rows out of 2.2 MB. Even without any
Backlog-section row, the 200 sprint rows and the page around them stay above
1.40 MB. The extra statements read the window's rows, labels, versions,
blockers, users and group names. The page time falls from 420 to 118 ms (p50).

The page still reads every live item of the backlog on the server for its
other needs (sprint metrics, filter facets, creation choices), as after
JIR-145; that read does not reach the client.

The section's next window is not measured here: `PROBE_MODE=window` still
cannot run on these revisions (see JIR-145); it is left to the W4 measurement
(JIR-148). The window read itself is covered by
`lib/services/view-rows.integration.test.ts` (windows of 1, 13 and 100 rows
walked to the end against the in-memory reference) and
`lib/services/backlog-window.integration.test.ts`.

Raw, credential-free samples: [`2026-11-jir-146-backlog-windows.json`](2026-11-jir-146-backlog-windows.json).

## Reproduction

Follow the [JIR-118 reproduction](2026-10-jir-118-light-views.md#reproduction)
on this revision, unchanged: one owned container, the team-profile seed, the
runtime role, a production build, then `node scripts/perf/probe-views.mjs`
with a fresh contributor.
