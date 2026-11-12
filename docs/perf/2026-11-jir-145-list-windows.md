# The Liste by windows of 100 rows — JIR-145 (JIR-120 W1)

What the Liste's first response weighs once it sends a window of at most 100
rows instead of every live item of the backlog. Same seed, protocol and probe
as the [before measurement](2026-11-jir-120-windows.md) and
[JIR-143](2026-11-jir-143-sql-views.md); only the application revision changes.

## Environment

- Apple M5 Max (18 cores, 64 GiB RAM, Darwin 27.0.0), Node 24.18.1, Corepack
  pnpm 10.34.5, Next.js 16.4.1, PostgreSQL 17 (`postgres:17`, ARM64, defaults),
  data on tmpfs, an owned container on `127.0.0.1:5434`, runtime role
  `jiroo_perf_runtime`.
- The unchanged `scripts/perf/seed-team-profile.ts` (5 backlogs of 4,000
  items), migrated up to `0026_view_sort_collations`; the probe reads `PERFA`
  as a fresh, TOTP-enrolled contributor (`people[1]`).
- Production build of commit `551bc41` served by `.next/standalone/server.js`
  on `127.0.0.1:3441`; one warm-up and 20 serial samples per operation.
- The machine was shared with other agents (load average 8 to 10): timings are
  indicative, sizes and SQL counts are exact (identical in all 20 samples).

## Serial probe (2026-11-11T15:21Z)

| Operation | Before bytes (MiB) | After bytes (MiB) | Ratio | Before p50 / p95 ms | After p50 / p95 ms | SQL before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| List | 25,214,709 (24.05) | 691,038 (0.66) | ÷ 36.5 | 1043.93 / 1393.05 | 76.98 / 97.43 | 57 → 65 |
| Backlog | 14,026,358 (13.38) | 14,026,358 (13.38) | = | 739.24 / 796.07 | 419.51 / 455.66 | 59 → 60 |
| Tree | 13,518,065 (12.89) | 13,518,065 (12.89) | = | 343.37 / 397.60 | 242.00 / 264.44 | 57 → 57 |
| Board | 1,958,651 (1.87) | 1,958,651 (1.87) | = | 97.99 / 109.61 | 86.75 / 106.88 | 57 → 57 |
| Panel | 25,343 (0.02) | 25,343 (0.02) | = | 18.17 / 19.49 | 16.29 / 19.78 | 40 → 40 |

« Before » is the JIR-144 series with its indexes (`7b64d75`, the same day,
same seed and probe). Decoded bytes, not wire bytes.

Reading: the Liste's first response is divided by 36.5 (the ticket asks for at
least 10). It still holds the page around the rows (shell, filters, the
structure offered to creation), which is why 100 rows weigh 0.66 MiB rather
than 120 KB. The extra statements read the window's own rows, labels,
versions, blockers, users, group names and figures; the page time falls
because rendering and sending 4,000 rows dominated it. The other views are
unchanged (same bytes); their timings moved with the machine's load, which was
lower during this run than during the before series.

The page still reads every live item of the backlog on the server for its
other needs (filter facets, creation choices); dropping that read for the
Liste is left to a later lot, since it does not reach the client.

## The next window

`PROBE_MODE=window` could not run on this revision: its browser discovery
aborts on the first server action other than the window read, and every
backlog page calls `canOpenBacklogSettingsAction` from the sidebar on load
(JIR-122). The next window's weight and timing are left to the W4
measurement (JIR-148), once the probe allows that read-only action. The
window read itself is covered by `lib/services/view-rows.integration.test.ts`
(windows of 1, 13 and 100 rows walked to the end against `listViewRows`).

Raw, credential-free samples: [`2026-11-jir-145-list-windows.json`](2026-11-jir-145-list-windows.json).

## Reproduction

Follow the [JIR-118 reproduction](2026-10-jir-118-light-views.md#reproduction)
on this revision, unchanged: one owned container, the team-profile seed, the
runtime role, a production build, then `node scripts/perf/probe-views.mjs`
with a fresh contributor.
