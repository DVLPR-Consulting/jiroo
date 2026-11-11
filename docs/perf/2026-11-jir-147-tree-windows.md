# The Arbre unfolded on demand — JIR-147 (JIR-120 W3)

What the Arbre's first response weighs once it sends its structure only
(Composants and Epics, each with its live children counted) instead of every
item of the backlog, a parent's children being read when it is unfolded.
Same seed, protocol and probe as the
[JIR-146 measurement](2026-11-jir-146-backlog-windows.md); only the
application revision changes.

## Environment

- Apple M5 Max (18 cores, 64 GiB RAM, Darwin 27.0.0), Node 24.18.1, Corepack
  pnpm 10.34.5, Next.js 16.4.1, PostgreSQL 17 (`postgres:17`, ARM64, defaults),
  data on tmpfs, an owned container on `127.0.0.1:5434`, runtime role
  `jiroo_perf_runtime`.
- The unchanged `scripts/perf/seed-team-profile.ts` (5 backlogs of 4,000
  items; `PERFA` holds 20 Composants, 100 Epics, 2,800 Tâches and 1,080
  Sous-tâches), migrated up to `0026_view_sort_collations`; the probe reads
  `PERFA` as a fresh, TOTP-enrolled contributor (`people[1]`).
- Production build of commit `93cf8d4` served by `.next/standalone/server.js`
  on `127.0.0.1:3441`; one warm-up and 20 serial samples per operation.
- The machine was shared with other agents (load average up to 31): timings
  are indicative, sizes and SQL counts are exact (identical in all 20 samples).

## Serial probe (2026-11-11T16:39Z)

| Operation | Before bytes (MiB) | After bytes (MiB) | Ratio | Before p50 / p95 ms | After p50 / p95 ms | SQL before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tree | 13,518,065 (12.89) | 530,724 (0.51) | ÷ 25.5 | 259.07 / 272.44 | 60.94 / 69.80 | 57 → 57 |
| List | 691,038 (0.66) | 691,038 (0.66) | = | 74.74 / 101.55 | 103.53 / 118.14 | 65 → 65 |
| Backlog | 2,277,404 (2.17) | 2,277,404 (2.17) | = | 117.57 / 133.20 | 139.82 / 159.05 | 67 → 67 |
| Board | 1,958,651 (1.87) | 1,958,651 (1.87) | = | 89.19 / 102.48 | 102.97 / 122.31 | 57 → 57 |
| Panel | 25,343 (0.02) | 25,343 (0.02) | = | 14.48 / 17.09 | 18.28 / 21.69 | 40 → 40 |

« Before » is the JIR-146 series (`6035eef`, the same day, same seed and
probe). Decoded bytes, not wire bytes.

Reading: the Arbre's first response is divided by 25.5, beyond the ÷ 10 the
ticket asks (target 1,351,807 bytes). It now holds the 120 structure rows of
`PERFA` (20 Composants, 100 Epics) and the page around them; the 3,880 Tâches
and Sous-tâches come only when their parent is unfolded, 100 at a time. The
filtered Arbre sends at most 100 matches with their ancestors; it is not
probed here (the probe reads the default view). The other views are
unchanged; their timings moved with the machine's load only (same sizes,
same SQL counts).

The page still reads every live item of the backlog on the server for its
other needs (filter facets, creation choices, child counts), as after JIR-145
and JIR-146; that read does not reach the client.

A parent's children window (`loadTreeChildrenAction`) and the next filtered
matches (`loadTreeMatchesAction`) are not measured here: `PROBE_MODE=window`
still cannot run on these revisions (see JIR-145); they are left to the W4
measurement (JIR-148). Both reads are covered by
`lib/services/tree-window.integration.test.ts` (children walked window by
window, filtered windows of 1, 2, 3 and 100 matches walked against the whole
filtered tree).

Raw, credential-free samples: [`2026-11-jir-147-tree-windows.json`](2026-11-jir-147-tree-windows.json).

## Reproduction

Follow the [JIR-118 reproduction](2026-10-jir-118-light-views.md#reproduction)
on this revision, unchanged: one owned container, the team-profile seed, the
runtime role, a production build, then `node scripts/perf/probe-views.mjs`
with a fresh contributor.
