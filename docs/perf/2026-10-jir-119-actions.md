# Serial Board action probe — JIR-119

This measures the public HTTP responses of `createItemAction`, `updateItemAction` and `moveItemAction`, including the route's RSC render when the action requests revalidation. It prepares the comparison for JIR-119 Q1 (minimal action responses) and Q2 (request-local authorization reuse). No application code, migration or dependency changes are part of this probe.

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

Pending: rerun the same probe on the integrated Q1 revision, fresh profile and build, recording the new commit and manifest. The three POSTs should stop carrying the re-rendered route, while the application's explicit creation refresh and targeted summary reads remain separate requests.

## After Q2

Pending: repeat after Q2, fresh profile, same operation order and transitions, recording the new commit.

## Limits and verification

- Twenty serial samples on one shared development machine, one warm-up per action, warm cache; no ten-client concurrency, throughput, CPU isolation, cold-cache, browser paint/hydration, SSE propagation or long-run soak claim.
- Measures one Server Action POST per sample, including any RSC carried inside it; excludes subsequent browser refreshes or `boardSummaryAction` requests, so this is not end-to-end time-to-settled-UI after Q1.
- The script reports the checkout commit; the operator must build and serve that same revision with matching credentials/profile. A successful HTTP mutation and its persisted status are checked, but no attempt is made to infer full application state from a minimal response.
- PostgreSQL logging and Docker/psql marker work add operational overhead outside the HTTP timer; the fixed 20,000-line log tail must retain both markers and the dedicated runtime role must have no unrelated traffic.
- Pure tests cover manifest selection/failure, browser-shaped headers/body, populated-column neighbor selection contract, Next 16 ID format, anonymous Flight hints, UTF-8 text and arbitrary Blob bytes containing misleading JSON rows, action failures, missing results and wrong target/backlog/status. No pure test requires a network or a database. The full unit suite passed with four workers: 3,193 passed, one skipped; an initial default-worker run hit the existing five-second limit in an unchanged NewItemButton test, which then passed alone and in the complete four-worker run without test or timeout changes.
- The production build, public contributor authentication/enrollment, all three action POSTs and persisted mutation postconditions passed; the ten pure tests and typecheck/lint were run separately from timing (lint retains the existing `lib/auth/client.ts` warning).
