# Views filtered, sorted and grouped in SQL — JIR-143 (JIR-120 W0)

What computing the Liste, Backlog, Arbre and Board rows in PostgreSQL costs, before any window (W1 to W3). Same serial protocol, seed and probe as [JIR-118](2026-10-jir-118-light-views.md); every view still sends all its rows.

## Environment

- Apple M5 Max, Node 24.18.1, Corepack pnpm 10.34.5, Next.js 16.4.1, PostgreSQL 17.11 (`postgres:17`, ARM64, defaults), data on tmpfs, owned container on `127.0.0.1:5434`, runtime role `jiroo_perf_runtime`.
- The unchanged `scripts/perf/seed-team-profile.ts` (5 backlogs of 4,000 items), migrated up to `0025_view_sort_collations`; one dataset per series, shared by its two builds.
- Production builds served by `.next/standalone/server.js` on `127.0.0.1:3441`, one fresh contributor per run, 20 measured requests per operation after one warm-up.
- **Before**: the view files of `main` `7fb47d2` (`backlog-view-content.tsx`, `item-list.tsx` and their tests), the new SQL modules present but unused. **After**: commit `b0699f6`. The probe's `commit` field reads `b0699f6` for both builds because they came from the same checkout.
- The machine was shared with other agents (load average 8 to 17 on 18 cores). The first series ran before/after and its after run was disturbed: the Panel, which this change does not touch, doubled (19 → 38 ms p50). The second series, reported below, ran after/before; its Panel figures agree (21.1 / 19.4 ms). Sizes and SQL counts are exact and identical in both series.

## Serial probe (second series, 2026-11-11T11:58Z)

| Operation | Before MiB | After MiB | Before p50 ms | After p50 ms | Before p95 ms | After p95 ms | SQL before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| List | 24.05 | 24.05 | 693.11 | 705.83 | 721.20 | 739.92 | 57 → 59 |
| Backlog | 13.38 | 13.38 | 406.69 | 416.39 | 440.89 | 445.38 | 59 → 60 |
| Tree | 12.89 | 12.89 | 250.96 | 248.60 | 306.56 | 275.36 | 57 → 57 |
| Board | 1.87 | 1.87 | 93.77 | 91.28 | 106.39 | 112.20 | 57 → 57 |
| Panel | 0.02 | 0.02 | 19.41 | 21.11 | 23.98 | 23.77 | 40 → 40 |

Reading: unfiltered, the SQL computation costs the List about 13 ms (two statements: its ordered rows and its group figures) and the Backlog about 10 ms (one statement), within 3 % of the page; the Tree and Board run no new statement without a filter and stay within noise. The List body grows by 108 bytes, the group figures now served with it. The sizes do not shrink: that is the windows' job (W1 to W3).

## The SQL alone, filtered and sorted (commit `4019a35`)

The probe only requests the views without filters. The service was also timed directly on the same seed, against one backlog of 4,000 items (20 runs after a warm-up, from Node through the pool, runtime role):

| Query | p50 ms | p95 ms | Rows |
| --- | ---: | ---: | ---: |
| Liste, no filter | 6.9 | 8.5 | 4000 |
| Liste, search « a » | 13.2 | 13.8 | 4000 |
| Liste, sort by title | 7.6 | 8.3 | 4000 |
| Liste, sort by key, group by composant | 32.4 | 35.4 | 4000 |
| Liste, status + type, sort by due date, group by assignee | 2.8 | 3.0 | 693 |
| Liste, sprint « Aucun » + under an epic | 1.0 | 1.3 | 0 |
| Backlog, no filter | 8.2 | 8.9 | 1960 |
| Backlog, search « e », group by status | 14.5 | 16.1 | 1960 |
| Arbre, search « a » (matches and dimmed ancestors) | 21.6 | 23.2 | 4000 |

The first version of the service (`b0699f6`) took 448 ms for the composant group and 600 ms for the filtered Arbre, comparing every row's path with every other's; `4019a35` looks ancestors up by the ids their path names. The search folds every title and key per query (no index), about 6 ms on 4,000 items. The W4 indexes (JIR-144) are not in place yet.

## Reproduction

The views probe follows the JIR-118 reproduction unchanged, run twice on one dataset: build and probe one revision, stop its server, check out the other revision's view files, rebuild and probe again with the next seeded contributor (`people[1]`, then `people[2]`). The direct timing imports `lib/services/view-rows.ts` with `tsx --conditions=react-server` and the runtime role's `DATABASE_URL`, after the same seed.
