# Drawer previous / next beyond the rows shown — JIR-153

An item opened by its link outside the rows a view has loaded keeps its
« Item précédent (K) » and « Item suivant (J) » buttons again. The pages' first
response is unchanged in substance: **+84 bytes** for the Liste and **+87 bytes**
for the Backlog on the « Équipe » profile, the same SQL count, and the Backlog
stays under its ÷ 10 target (**1,392,131** bytes against **1,402,636**, ÷ 10.08).

## What changed

The drawer asks the server for the open item's neighbors over the whole view
(`loadViewNeighborsAction`), after it opened:

- **Liste**: the same filtered, grouped and sorted set as its windows
  (`viewNeighbors`, `lib/services/list-window.ts`), read with `lag` / `lead`.
  Its windows load from the start, so the rows shown are right but at their
  end: the server is asked only for an item outside them or the last of them.
- **Backlog**: the « Backlog » section in its order (`backlogSectionNeighbors`).
  Sprint sections are sent whole, so an item outside the rows shown is in the
  section, which comes last. Asked as for the Liste.
- **Arbre**: the tree unfolded whole, a parent before its children, siblings
  by rank; with a filter, only the matches (`treeNeighbors`). Its rows shown
  leave gaps anywhere (children not loaded yet, a filter's later matches), so
  the server is always asked and its answer wins; the branches the user folded
  (`data-tree-folded`) are skipped, as the rows shown skip them.

The only addition to the first response is the view's name and state handed
to the drawer; no window is read and the windows stay at 100 rows. The
measurement below was taken at 75a999e; the Arbre's correction that followed
adds an attribute only to rows the user folds, absent from a first response.

## Measurement

- Apple Silicon Mac, macOS 27, Node **24.18.1**, pnpm **10.34.5**, Next **16.4.1**,
  PostgreSQL **17** in an owned tmpfs Docker container at `127.0.0.1:5434`.
- Unchanged `scripts/perf/seed-team-profile.ts` (20,000 items, five backlogs)
  and `scripts/perf/probe-views.mjs`: one excluded warm-up, **20 serial samples**
  per operation, production standalone server at `127.0.0.1:3441`, a fresh
  enrolled contributor per series, protocol of
  [JIR-118](2026-10-jir-118-light-views.md#reproduction).
- Before: the application files of **b3f0418** (the JIR-41 branch before this
  ticket), rebuilt in the same worktree; after: **75a999e**. The probe's raw
  `commit` field reports checkout HEAD for both. The before bytes match JIR-150's
  final figures exactly. Series started 2026-11-12T10:42:49Z and 10:43:27Z.

| First response | Before bytes | After bytes | Δ | Before p50 / p95 ms | After p50 / p95 ms | SQL before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Liste | 495,090 | 495,174 | +84 | 71.93 / 77.79 | 72.33 / 81.29 | 65 → 65 |
| Backlog | 1,392,044 | 1,392,131 | +87 | 101.86 / 111.37 | 102.55 / 115.34 | 67 → 67 |
| Arbre | 512,236 | 512,320 | +84 | 50.82 / 56.28 | 54.31 / 58.35 | 57 → 57 |
| Board | 1,827,361 | 1,827,396 | +35 | 86.01 / 98.66 | 85.67 / 97.81 | 57 → 57 |
| Panel | 25,343 | 25,343 | 0 | 16.44 / 20.67 | 15.10 / 18.66 | 40 → 40 |

Timings differ within the machine's usual variation (shared, not CPU-isolated).
The neighbors lookup itself is a separate request made only when the drawer
needs it; it is not part of this table.

Raw samples: [`2026-11-jir-153-drawer-neighbors.json`](2026-11-jir-153-drawer-neighbors.json).

## Verification

- `lib/services/view-neighbors.integration.test.ts`: 130 Tâches (over 100),
  the Liste (manual, and sorted and grouped), a filter, the Backlog section and
  the Arbre (whole, filtered and with a folded branch), against orders
  computed in the test itself.
- `components/items/item-detail-panel.test.tsx`: an item outside the rows
  shown gets its buttons and K / J from the server; the last row shown asks for
  its next item; in the Arbre, T101 → K → T100 → J reaches T101 again, not the
  next Epic shown after T100 (fails on 66c83e0).
- Playwright Chromium, full suite on an owned `jiroo_e2e` database, local
  configuration override on port 3153 (3100 occupied): **172 passed**, including
  `ticket-drawer` « présente l'en-tête… » with the CASS Liste above 100 tickets.
- `JIROO_RUN_DB_TESTS=1 pnpm test`: all green except two files unrelated to this
  change: `sprint-reports` « query count … one thousand items » times out at
  5 s on this machine (passes with 30 s), and the E2E reset guard needs its
  consent variables.
