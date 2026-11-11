# Lighter row HTML in the Liste and Backlog — JIR-150

The Backlog's first response on the unchanged « Équipe » profile is now
**1,392,044 decoded bytes**, below the **1,402,636-byte** target: **÷ 10.08**
against main's 14,026,358 bytes. The active sprint still sends all 200 tasks;
the unscheduled section still starts with 100 rows. No loading decision changed.

## What changed

Repeated row, editor-trigger and avatar utilities are emitted once in shared
stylesheets. Their Tailwind declarations remain the same; the component layer
lets the existing utility modifiers override them. Static bug/blocker colours
and the avatar border also move out of each row's HTML.

The Liste and Backlog each define one SVG symbol set, then reference it from
their rows and inline editors. The definitions render the existing icon
components, so geometry and colours have one source. Each provider owns a
`useId` namespace, including rows loaded later and menus rendered in portals.
The visible SVGs retain their roles and names. Outside these two providers,
the icon helpers render the original full icons. Shared editor/avatar styles
also reduce other views' payloads incidentally.

No element, event handler, focus target, permission, selector used by shortcuts,
or drag-and-drop placement logic was removed. A synthetic editable row initially
rendered 6,112 bytes; the SSR budget test now limits a batch of 100 representative
rows, including its shared definitions, to 3.5 KB per row.

## Measurement

- Apple M5 Max, macOS 27, Node **24.18.1**, pnpm **10.34.5**, Next **16.4.1**,
  PostgreSQL **17** in an owned tmpfs Docker container at `127.0.0.1:5434`.
- The unchanged `scripts/perf/seed-team-profile.ts`: 20,000 items in five
  backlogs, including PERFA's 200 active-sprint tasks. Migrations through 0026.
- Production standalone servers at `127.0.0.1:3441`, runtime database role;
  fresh TOTP-enrolled seed contributors, same PERFA endpoints and data.
- Unchanged repository `scripts/perf/probe-views.mjs`: one excluded warm-up,
  **20 serial samples per operation**, decoded body bytes, complete-response
  time, SQL counted between PostgreSQL markers. Percentiles use nearest rank.
- Before: unchanged application at **417b91e**. After: the JIR-150 application
  files committed with this report. The probe's raw `commit` field reports
  checkout HEAD, which was still 417b91e before committing; the JSON adds an
  explicit application-source SHA-256 manifest to identify the measured files.
- Matched series started **2026-11-11T18:10:32Z** and **18:11:07Z**. The original
  application was rebuilt in this same worktree without changing branch, then
  the preserved final build was restored. No test, capture or build ran during
  either series. The machine was otherwise shared, not CPU-isolated.

| First response | Before bytes | After bytes | Reduction | Before p50 / p95 ms | After p50 / p95 ms | SQL before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Liste | 691,038 | 495,090 | 28.36% | 72.44 / 78.20 | 69.82 / 79.66 | 65 → 65 |
| Backlog | 2,277,404 | 1,392,044 | 38.88% | 108.97 / 121.58 | 103.31 / 112.77 | 67 → 67 |

The Liste is smaller and its median response is faster. Its p95 differs by
1.46 ms (+1.9%); its maximum falls from 88.59 to 87.27 ms. This is neutral
within the observed local timing variation, rather than evidence of a tail
latency improvement. An earlier clean before series measured 71.16 / 79.92 ms;
preliminary after runs varied substantially while other work was running. The
table uses the adjacent, otherwise idle pair, not the run overlapping unit tests.

The final Backlog has **10,592 bytes of margin** under the ÷ 10 threshold.
The payload result is exact on this fixed profile (identical across every
sample); it is not a guarantee for every combination of optional columns or
ticket titles. Concurrent load is JIR-148's separate measurement.

Raw samples, source manifest and all five measured endpoints:
[`2026-11-jir-150-row-html.json`](2026-11-jir-150-row-html.json).
Follow the unchanged [JIR-118 reproduction protocol](2026-10-jir-118-light-views.md#reproduction)
on the before revision and this revision. Use a fresh contributor for each run.

## Visual and accessibility evidence

Chromium, same contributor and unchanged data, 1440 × 900 desktop and
390 × 844 mobile; fonts loaded, reduced motion, screenshots with animations
disabled. The first representative row's accessibility snapshot is identical
in both views, including roles and accessible names. Unit tests also check
hidden definitions, multiple provider namespaces and references from later rows.

| State | Liste before / after | Backlog before / after |
| --- | --- | --- |
| Desktop | [before](jir-150/before/list-desktop.png) / [after](jir-150/after/list-desktop.png) | [before](jir-150/before/backlog-desktop.png) / [after](jir-150/after/backlog-desktop.png) |
| Row hovered | [before](jir-150/before/list-hover.png) / [after](jir-150/after/list-hover.png) | [before](jir-150/before/backlog-hover.png) / [after](jir-150/after/backlog-hover.png) |
| Priority menu open | [before](jir-150/before/list-priority.png) / [after](jir-150/after/list-priority.png) | [before](jir-150/before/backlog-priority.png) / [after](jir-150/after/backlog-priority.png) |
| Dark | [before](jir-150/before/list-dark.png) / [after](jir-150/after/list-dark.png) | [before](jir-150/before/backlog-dark.png) / [after](jir-150/after/backlog-dark.png) |
| Compact density | [before](jir-150/before/list-compact.png) / [after](jir-150/after/list-compact.png) | [before](jir-150/before/backlog-compact.png) / [after](jir-150/after/backlog-compact.png) |
| Mobile | [before](jir-150/before/list-mobile.png) / [after](jir-150/after/list-mobile.png) | [before](jir-150/before/backlog-mobile.png) / [after](jir-150/after/backlog-mobile.png) |

Eleven pairs are pixel-identical. The dark Backlog pair differs in 14 pixels
at the sprint card's rounded corners, by at most one RGB level per channel;
the row contents are identical. No page errors were reported during capture.
[Pixel counts and accessible snapshots](jir-150/visual-comparison.json) accompany
the captures. They are stored for the later issue PR; this ticket opens no PR.

## Verification

- `pnpm exec vitest run --project=unit`: **299 files, 3,441 passed, 5 skipped**.
  The row size test was observed failing before the optimization. Three existing
  assertions naming extracted utilities were updated to their shared classes;
  the browser captures verify the actual styling.
- `pnpm build`: production build and TypeScript passed.
- `pnpm typecheck` and `pnpm lint`: passed, with no lint errors and the existing
  internal-navigation warning in the unchanged `lib/auth/client.ts`.
- Chromium: **22 passed** across `list-rows.spec.ts`, `backlog-redesign.spec.ts`,
  `backlog-ranking.spec.ts`, `keyboard-shortcuts.spec.ts` and
  `backlog-foundation.spec.ts`. These exercise inline edits, selection, sorting,
  optional columns, drag-and-drop, drawer navigation, J/K and read-only history.
  An owned `jiroo_e2e` database with the repository's identity/reset guards and a
  local configuration override on port **3442** avoided the occupied port 3100.
  The dev server was used for E2E, as in the standard configuration; the
  production authentication rate limit prevents the fixture's rapid enrollment
  of all six accounts. The performance and visual series used production builds.
