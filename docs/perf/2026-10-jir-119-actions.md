# Serial Board action probe — JIR-119

This measures the public HTTP responses of `createItemAction`, `updateItemAction` and `moveItemAction`, including the route's RSC render when the action requests revalidation. It compares the baseline with JIR-119 Q1 (minimal action responses) and Q2 (request-local authorization reuse). No application code, migration or dependency changes are part of this probe.

## Environment and protocol

Use Node 24, Corepack pnpm, a production standalone Next.js server and a fresh copy of the JIR-41 team profile: 20,000 items, 50 people, five backlogs, three sprints and three releases per backlog. Follow the [JIR-118 reproduction](2026-10-jir-118-light-views.md#reproduction) for the disposable PostgreSQL 17 tmpfs container on loopback port 5434, migration, team-profile seed, runtime role, duration logging, production build, static assets, server readiness and cleanup trap. The seed itself rejects another port or database namespace. Keep passwords and the auth secret in process environment only; never create a `.env` file.

For actions, replace that recipe's probe invocation with the block below **before** its cleanup step. Keep the same container, server, runtime role and log prefix. The JSON emitted by `seed-team-profile.ts` is required: it supplies the backlog, epic and active sprint identities. Fixture discovery and postcondition queries use the owner and occur outside the HTTP timer and SQL markers.

```sh
export PROBE_BASE_URL=http://127.0.0.1:3441
export PROBE_PROFILE=/tmp/jiroo-team-profile.json
export PROBE_BACKLOG="$(node -p 'require(process.env.PROBE_PROFILE).backlogs[0].key')"
# A fresh contributor; index 1 may already have enrolled for the views probe.
export PROBE_EMAIL="$(node -p 'require(process.env.PROBE_PROFILE).people[2].email')"
export PROBE_PASSWORD="$JIROO_PERF_PASSWORD"
export PROBE_REQUESTS=20
export PROBE_PG_CONTAINER="$PERF_CONTAINER"
export PROBE_PG_DATABASE="$PERF_DB"
export PROBE_PG_OWNER=jiroo_owner
export PROBE_PG_ROLE=jiroo_perf_runtime
# Exact Next 16.4.1 Board router-state shape captured from a real Chromium drag.
export PROBE_ROUTER_STATE="$(node --input-type=module <<'NODE'
const page = ['__PAGE__', {}, null, null, 0];
const key = [['key', process.env.PROBE_BACKLOG, 'd', null], {children: page}, null, null, 4];
const b = ['b', {children: key}, null, null, 8];
const app = ['(app)', {children: b}, null, null, 12];
console.log(encodeURIComponent(JSON.stringify(['', {children: app}, null, null, 24])));
NODE
)"
node scripts/perf/probe-actions.mjs > /tmp/jiroo-actions.json 2> /tmp/jiroo-actions.md
# Then stop the owned server and remove its tmpfs container (the existing EXIT trap).
```

The probe signs in through `/api/auth/sign-in/email`, enrolls a fresh contributor through `/two-factor/enable`, verifies RFC 6238 TOTP through `/two-factor/verify-totp`, and checks the public session. Cookies and the TOTP secret stay in memory. A previously enrolled contributor requires `PROBE_TOTP_SECRET`; use a fresh database for comparable runs.

### HTTP contract being measured

Action IDs come from **`.next/server/server-reference-manifest.json`**, `node` entries identified by `filename: app/actions/items.ts`, `exportedName` and the `app/(app)/b/[key]/page` worker. Missing or ambiguous exports fail closed. Next 16.4.1 IDs have 42 hexadecimal characters, including the initial information byte; they must be rediscovered after every build.

The request is a `POST /b/PERFA?view=board` with `Accept: text/x-component`, `Content-Type: text/plain;charset=UTF-8`, `Next-Action`, the encoded `Next-Router-State-Tree`, same-origin `Origin`, and the authenticated cookie jar. The body is `JSON.stringify([input])`, the `encodeReply` representation for the single plain JSON argument used here; undefined properties are omitted. There is no action-only/skip-render header, prefetch header or subsequent `router.refresh()` request.

For the baseline, the router header and move body were captured in headless Chromium on the measured standalone server: authenticate and enroll through public APIs in the browser context, load the Board, drag a seeded card into another status column, and inspect its outgoing Server Action POST. Only the router header, action ID and synthetic argument were retained, without cookies. The copied tree includes Next's segment hints `24/12/8/4/0`; the reproduction block builds that same tree with the selected backlog key. Recapture this shape if a later Next version or route structure changes it.

Each operation has one excluded warm-up, then 20 measured requests, executed serially:

- **Create:** a new uniquely titled, unestimated `tache` under the profile's epic, with the backlog's todo status and active `sprintId`; the service generates a different item identity each time.
- **Status:** 21 distinct live, active-sprint tasks initially outside the done category transition to the backlog's done status, through `updateItemAction`.
- **Move:** a disjoint set of 21 other active non-done tasks move to that done column through `moveItemAction`, with `statusId`, `beforeId` set to the last existing done card and `afterId: null` (append to the populated done column); a status transition guarantees this is not a rank/status no-op.

Discovery selects only the needed 42 existing tasks, once, before measurement. Immediately before the move operation, an owner query outside markers finds the last done card by binary rank; every successful move becomes the next move’s predecessor, as the Board does when appending to a populated column. Warm-ups also mutate their own distinct tasks. The create operation grows the active sprint by 21 items, and status/move operate sequentially on the same disposable profile; repeated runs must reproduce this order on a fresh seed. A missing destination neighbor fails closed rather than measuring the empty-column/global-tail fallback. The action must return HTTP success, Flight content, `ok: true`, an item identity, and the expected backlog/status/target identity. Validation follows the Flight root's action promise, skips byte-length-delimited text/binary records and ignores unrelated RSC model successes; substring matching for `ok: true` would not prove action success. An owner-side read after each response checks the persisted status, and creation identities are checked for uniqueness.

Full-response timing runs from immediately before `fetch` to complete consumption of the decoded response body. It excludes authentication, fixture discovery, marker/verification Docker processes and JSON validation. SQL uses the same imported `countSql` as the views probe: completed simple/extended executions for the exact runtime role/database between unique owner markers, including transaction control. Owner queries, Parse and Bind messages are excluded; missing markers or zero runtime SQL abort the run. No browser, SSE subscriber or other runtime client runs during the retained measurement. Percentiles, RFC TOTP, SQL counting and Markdown formatting are imported from `probe-views.mjs` rather than duplicated. JSON stdout retains all samples; Markdown stderr reports decoded bytes/MiB, p50/p95/max full-response time and SQL p50/min/max.

## Before (main)

Recorded on **2026-10-28T10:26:58.875Z**, application/build revision **11807fc48fb895b1b5f1703443f5c3231d662f15** (main after #149). The tooling was uncommitted during measurement; application files were unchanged. Local server: `127.0.0.1:3442`; Node 24.18.1, pnpm 10.34.5, Next.js 16.4.1, PostgreSQL 17.11 in Docker tmpfs on `127.0.0.1:5434`, least-privilege `jiroo_perf_runtime` role. PostgreSQL duration prefix: `%m [%p] %u@%d `; statement parameter logging disabled. Qualification/capture and a provisional empty-neighbor run used different disposable databases and are excluded; the table below uses real destination neighbors.

Date: 2026-10-28T10:26:58.875Z; commit: 11807fc48fb895b1b5f1703443f5c3231d662f15; requests per operation: 20 (one warm-up excluded).

| Operation | Decoded bytes (p50) | MiB | Full p50 ms | Full p95 ms | Full max ms | SQL p50 [min–max] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| createItemAction | 216089 | 0.21 | 157.94 | 181.44 | 191.12 | 132 [132–132] |
| updateItemAction | 222226 | 0.21 | 125.27 | 147.63 | 171.12 | 114 [114–114] |
| moveItemAction | 222246 | 0.21 | 104.62 | 123.07 | 127.83 | 117 [117–117] |

Sixty measured mutations have sixty distinct item IDs. Including excluded warm-ups, the retained database had exactly 21 newly created probe tasks and 42 done tasks in its active sprint. Decoded byte ranges were 210,913–221,839 (create), 222,218–222,229 (status), and 222,229–222,279 (move); SQL counts were constant within each operation. The create response grows with its new cards. Every summary was recomputed from the raw samples, including nearest-rank p95. The owned server was stopped and the tmpfs container removed after checking these postconditions; absence was verified.

## Relationship to JIR-41

JIR-41 measured 1.36 MiB and 129/112/113 SQL executions for create/status/move responses, with full-response p95s 2,881/3,209/2,410 ms under ten concurrent clients. This run is serial, uses the later application after JIR-118 projection and on-demand pickers, and deliberately transitions distinct tasks to done (with its sprint ledger work). Exact arguments and the growing create scope also affect payloads and SQL. The current POSTs are about **0.21 MiB**, substantially below the old 1.36 MiB, while SQL is **132/114/117**, three/two/four more than the historical counts. JIR-118 changed the data shipped to views; this probe's input/transition/ledger work and later application revision differ from JIR-41. The existing counters do not isolate the cause of each additional SQL statement, and serial timing does not establish ten-client p95 performance. Differences cannot be attributed to JIR-119 Q1/Q2 before those changes are measured; this is their new baseline.

## After Q1

Recorded on **2026-10-28T11:42:46.368Z**, application/build revision **076499320555f355bb21cd1b0ede27ee5c32fe29** (main after #152, Q1 integrated, Q2 absent). Same Node 24.18.1, pnpm 10.34.5, Next.js 16.4.1, PostgreSQL 17, standalone server on `127.0.0.1:3442`, loopback tmpfs database on port 5434, runtime role and SQL logging protocol as Before; a fresh JIR-41 profile and contributor were prepared before the merge, with no intervening mutations or enrollment, and built only after advancing to this revision. No dependencies, seed or migrations changed between preparation and the measured revision. Main also includes #150's targeted drawer reads since Before; this probe opens no drawer.

The unchanged probe rediscovered the three action IDs from this build's manifest and validated all 63 successful mutations, including warm-ups, through the Flight root's `0.a` reference, `ok: true`, the expected returned item and its owner-read persisted status. All 60 measured item IDs are distinct; final postconditions are 20,021 items, 21 newly created probe tasks, 221 live tasks in the active sprint and 42 done tasks there. Every percentile and SQL range was independently recomputed from the raw samples; decoded byte ranges are 895–919 (create), 1,290–1,297 (status), and 1,294–1,303 (move). The ten pure probe tests pass; no probe changes were needed. The owned server was stopped, its tmpfs container removed, and their absence/closed ports verified; credentials stayed in process memory and child environments, without an environment or credential file.

Date: 2026-10-28T11:42:46.368Z; commit: 076499320555f355bb21cd1b0ede27ee5c32fe29; requests per operation: 20 (one warm-up excluded).

| Operation | Decoded bytes (p50) | MiB | Full p50 ms | Full p95 ms | Full max ms | SQL p50 [min–max] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| createItemAction | 914 | 0.00087 | 38.64 | 61.07 | 63.29 | 75 [75–75] |
| updateItemAction | 1297 | 0.00124 | 44.69 | 49.02 | 51.21 | 57 [57–57] |
| moveItemAction | 1299 | 0.00124 | 55.91 | 68.66 | 69.28 | 60 [60–60] |

Against Before, decoded p50 bytes fall by **99.58% / 99.42% / 99.42%** for create/status/move, SQL falls by **57 executions per POST** (**132→75 / 114→57 / 117→60**), and full-response p50 time falls by **75.54% / 64.33% / 46.56%** (**157.94→38.64 / 125.27→44.69 / 104.62→55.91 ms**), with the route render no longer carried in the action response. Authorization facts are still read separately at their existing boundaries: Q2's request-local reuse has not been applied. These are twenty serial, warm-cache samples on a shared local machine, excluding subsequent creation refreshes and `boardSummaryAction` reads; the result measures individual action POSTs, not settled-UI latency, concurrent capacity or an isolated timing contribution of each code change.

## After Q2

Recorded on **2026-10-28T11:54:02.200Z**, checkout/build revision **2c8ebc55e3267e604c11a3d0e47d0ec0fe6bb5cb**. This is main **199d8416b4476ebd480d8e1af6daf1c39efe7a2c** after #153 plus the rebased After Q1 documentation commit; the only difference from that main revision is this Markdown document, so application files match main exactly. The checkout SHA is also the revision reported by the probe. Same standalone production build protocol, Node 24.18.1, pnpm 10.34.5, Next.js 16.4.1, PostgreSQL 17 tmpfs on `127.0.0.1:5434`, runtime role, SQL markers and operation order as the previous runs, with a new JIR-41 profile and a fresh contributor; no dependency, migration or seed change.

The unchanged probe validated all 63 mutations through the action result referenced by `0.a`, the expected successful item and an owner-side persisted status check. All 60 measured IDs are distinct; final postconditions are 20,021 items, 21 new probe tasks, 221 live active-sprint tasks and 42 done tasks. A separate read confirmed that the last twenty done tasks are the measured moves in their append order. Every percentile and SQL range was recomputed from the raw samples; decoded byte ranges are createItemAction: 898–919; updateItemAction: 1290–1297; moveItemAction: 1294–1303. The ten pure probe tests pass, the production build succeeded, and no probe changes were needed; the owned server and tmpfs container were removed and their absence/closed ports verified, with no credential or environment file created.

Date: 2026-10-28T11:54:02.200Z; commit: 2c8ebc55e3267e604c11a3d0e47d0ec0fe6bb5cb; requests per operation: 20 (one warm-up excluded).

| Operation | Decoded bytes (p50) | MiB | Full p50 ms | Full p95 ms | Full max ms | SQL p50 [min–max] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| createItemAction | 914 | 0.00087 | 24.77 | 30.27 | 32.48 | 44 [44–44] |
| updateItemAction | 1297 | 0.00124 | 15.36 | 17.12 | 20.33 | 31 [31–31] |
| moveItemAction | 1299 | 0.00124 | 17.99 | 19.35 | 27.57 | 34 [34–34] |

Against After Q1, decoded p50 bytes are identical (**914 / 1,297 / 1,299**), SQL falls by **31 / 26 / 26 executions** (**75→44 / 57→31 / 60→34**), and full-response p50 falls by **35.89% / 65.63% / 67.83%** (**38.64→24.77 / 44.69→15.36 / 55.91→17.99 ms**) for create/status/move. Against Before, decoded p50 bytes are down **99.58% / 99.42% / 99.42%**, SQL is down **88 / 83 / 83 executions** (**132→44 / 114→31 / 117→34**), and full-response p50 is down **84.32% / 87.74% / 82.81%**. Q2 changes authorization fact reads, not response contents; the time reductions observed here are larger than the expectation of similar times, but this small serial run does not isolate query savings from shared-machine and cache variation.

## Limits and verification

- Twenty serial samples on one shared development machine, one warm-up per action, warm cache; no ten-client concurrency, throughput, CPU isolation, cold-cache, browser paint/hydration, SSE propagation or long-run soak claim.
- Measures one Server Action POST per sample, including any RSC carried inside it; excludes subsequent browser refreshes or `boardSummaryAction` requests, so this is not end-to-end time-to-settled-UI after Q1.
- The script reports the checkout commit; the operator must build and serve that same revision with matching credentials/profile. A successful HTTP mutation and its persisted status are checked, but no attempt is made to infer full application state from a minimal response.
- PostgreSQL logging and Docker/psql marker work add operational overhead outside the HTTP timer; the fixed 20,000-line log tail must retain both markers and the dedicated runtime role must have no unrelated traffic.
- Pure tests cover manifest selection/failure, browser-shaped headers/body, populated-column neighbor selection contract, Next 16 ID format, anonymous Flight hints, UTF-8 text and arbitrary Blob bytes containing misleading JSON rows, action failures, missing results and wrong target/backlog/status. No pure test requires a network or a database. At the Before revision, the full unit suite passed with four workers: 3,193 passed, one skipped; an initial default-worker run hit the existing five-second limit in an unchanged NewItemButton test, which then passed alone and in the complete four-worker run without test or timeout changes.
- The production build, public contributor authentication/enrollment, all three action POSTs and persisted mutation postconditions passed; the ten pure tests and typecheck/lint were run separately from timing (lint retains the existing `lib/auth/client.ts` warning).

## Summary

Each operation cell lists decoded MiB p50, full-response p50/p95 milliseconds and SQL p50, in that order.

| Revision | Create: MiB · p50/p95 ms · SQL | Status: MiB · p50/p95 ms · SQL | Move: MiB · p50/p95 ms · SQL |
| --- | ---: | ---: | ---: |
| Before (11807fc) | 0.20608 · 157.94/181.44 · 132 | 0.21193 · 125.27/147.63 · 114 | 0.21195 · 104.62/123.07 · 117 |
| After Q1 (0764993) | 0.00087 · 38.64/61.07 · 75 | 0.00124 · 44.69/49.02 · 57 | 0.00124 · 55.91/68.66 · 60 |
| After Q2 (2c8ebc5; main 199d841) | 0.00087 · 24.77/30.27 · 44 | 0.00124 · 15.36/17.12 · 31 | 0.00124 · 17.99/19.35 · 34 |

Q1 removes the embedded route render from the three action POSTs, cutting decoded payloads by more than 99%, while Q2 reuses authorization facts within each action, reducing SQL further to **44 / 31 / 34** for create/status/move without changing median payload sizes. Creation still triggers its separate `router.refresh()`, targeted sprint figures are read separately, and actions outside create/update/move still revalidate; changing these paths is outside this work. These are serial, warm-cache samples on one shared machine, excluding those follow-up requests, and establish neither settled-UI latency nor concurrent capacity or a guaranteed timing gain in another environment.
