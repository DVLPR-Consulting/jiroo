# Team-size load after JIR-118 / JIR-119 — November 2026 (JIR-142)

Application **`7fb47d20742d643b1bbd6e5798b85d60b451aaee`**, the `main` revision at the start of JIR-142. Only performance tooling and documentation differ in this worktree; no application, schema, migration or dependency changes. The [22 October baseline](2026-10-team-profile.md) measured `7915ba9`. The [retained JSON](2026-11-team-profile-after-jir-118-119.json) contains every HTTP sample, serial SQL count, memory sample and realtime summary; private setup/server/PostgreSQL logs remain outside Git.

## Protocol and environment

- Run started **2026-11-11T11:32:17.691Z**: ten authenticated TOTP contributors, 180-second requested window, **181.90 seconds including in-flight requests and their final 300 ms pause. **1342 successful requests**, **zero errors**, **7.38 requests/second (October: 1,238, zero, 6.74/s). Each client executes one request at a time and pauses 300 ms after completion; twelve operations and five backlogs rotate cyclically.
- Unchanged `seed-team-profile.ts` (`2863e8a`): 20,000 items, five backlogs, 50 members, 15 sprints / ten completion snapshots, 15 releases, comments, labels, links and activity. The ten contributors are distinct synthetic accounts enrolled via public Better Auth endpoints. Rate-limit waits, authentication, one warm-up and three isolated probes per operation are excluded from concurrent samples.
- Apple M5 Max, 18 cores, 64 GiB RAM; Darwin 27.0.0; Node v24.18.1; pnpm 10.34.5; Next.js 16.4.1 / React 19.2.4; PostgreSQL 17.11 (aarch64 Debian); Docker 29.6.2 (18 CPUs, 8,319,213,568 bytes VM RAM). Production standalone Node server on 127.0.0.1:3441, default application pool, existing least-privilege runtime grants. No PostgreSQL tuning.
- A new PostgreSQL 17 **tmpfs container** on 127.0.0.1:5434 and randomly named disposable database only. Never Neon, port 5433 or an existing/shared database. The server was stopped, container removed and absence verified (`cleanup: true`). No environment files or retained credentials.
- Other Docker projects and ordinary development, including the independent JIR-143 database container, remained active on this shared host. No tests/builds from this session ran during the timed workload. CPU, client and server were not isolated. October used the existing local PostgreSQL container rather than this tmpfs container; platform, application and harness versions differ. These are descriptive observations, not confidence intervals or a controlled causal attribution.
- Full-response timing is request start to complete decoded body consumption, including transport, scheduling, SQL and serialization. TTFB ends at header arrival. No browser paint/hydration, cold-cache, WAN or soak claim. Nearest-rank percentiles; roughly 110 samples per operation. See the [one-command reproduction and exact protocol](team-profile-driver.md).

## Concurrent HTTP results

Times are milliseconds; body MiB is the median decoded response size. SQL counts are the three isolated requests **before** SSE/load, not query attribution during concurrency.

| Operation | Samples | Full p50 | Full p95 | Full p99 | TTFB p95 | Body MiB | SQL / request |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Backlog | 114 | 1,696.9 | 3,225.7 | 3,452.9 | 631.7 | 13.46225 | 59 / 59 / 59 |
| List | 112 | 2,544.6 | 3,473.7 | 3,717.2 | 1,063.2 | 24.13192 | 57 / 57 / 57 |
| Board, active sprint | 113 | 685.8 | 2,235.4 | 2,351.4 | 1,155.3 | 1.93623 | 57 / 57 / 57 |
| Tree | 110 | 1,611.3 | 3,346.8 | 3,364.2 | 998.3 | 12.93416 | 57 / 57 / 57 |
| Roadmap | 109 | 761.8 | 2,245.2 | 2,696.1 | 1,935.4 | 1.50568 | 57 / 57 / 57 |
| Reports, active sprint | 110 | 699.3 | 2,088.7 | 2,496.2 | 1,100.5 | 0.26311 | 64 / 64 / 64 |
| My items | 111 | 302.8 | 2,220.3 | 2,315.2 | 2,213.0 | 1.28126 | 26 / 26 / 26 |
| Search: dossier | 112 | 246.1 | 1,594.8 | 2,257.8 | 1,401.0 | 0.00610 | 4 / 4 / 4 |
| Item panel API | 112 | 251.9 | 1,236.4 | 1,756.7 | 1,236.4 | 0.02460 | 40 / 40 / 40 |
| Create item | 113 | 849.2 | 2,827.5 | 3,048.9 | 2,826.9 | 0.00087 | 44 / 44 / 44 |
| Status | 113 | 632.9 | 2,313.8 | 2,764.9 | 2,292.7 | 0.00121 | 30 / 30 / 30 |
| Board move | 113 | 553.2 | 2,274.9 | 2,701.2 | 2,274.3 | 0.00121 | 33 / 33 / 33 |

## Comparison with 22 October

Indicative checks use **full-body p95**: 500 ms for pages/panel, 300 ms for actions and read-only search. Passing TTFB alone would hide streaming/serialization costs. A positive change below means slower than October; a negative change means faster in this observation.

| Operation | October p95 ms | November p95 ms | Change | Threshold ms | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Backlog | 2,523.8 | 3,225.7 | +27.8% | 500 | Above |
| List | 3,501.2 | 3,473.7 | -0.8% | 500 | Above |
| Board, active sprint | 2,261.2 | 2,235.4 | -1.1% | 500 | Above |
| Tree | 2,388.7 | 3,346.8 | +40.1% | 500 | Above |
| Roadmap | 1,932.9 | 2,245.2 | +16.2% | 500 | Above |
| Reports, active sprint | 2,468.2 | 2,088.7 | -15.4% | 500 | Above |
| My items | 1,730.2 | 2,220.3 | +28.3% | 500 | Above |
| Search: dossier | 2,230.6 | 1,594.8 | -28.5% | 300 | Above |
| Item panel API | 1,753.4 | 1,236.4 | -29.5% | 500 | Above |
| Create item | 2,881.0 | 2,827.5 | -1.9% | 300 | Above |
| Status | 3,209.3 | 2,313.8 | -27.9% | 300 | Above |
| Board move | 2,409.6 | 2,274.9 | -5.6% | 300 | Above |

**All twelve remain above their indicative threshold.** The List and Backlog still send about 24.13 and 13.46 MiB; Tree sends 12.93 MiB. Their full-response p95s are 3.47, 3.23 and 3.35 seconds respectively. Removing descriptions and loading picker choices on demand reduced payload, but these routes still render thousands of rows. The measurement supports continuing the already planned JIR-120 windows work; this ticket changes none of these views.

The panel falls from 1.22 MiB to 0.02460 MiB and its observed p95 from 1,753.4 to 1,236.4 ms. Create/Status/Move shrink from about 1.36 MiB to **914 / 1,273 / 1,274 bytes** at the median, with isolated SQL counts **44 / 30 / 33** instead of **129 / 112 / 113**. Concurrent tails still reach 2.83 / 2.31 / 2.27 seconds. Small responses and fast isolated actions have not removed the tails while large views are rendered concurrently. This pattern is consistent with shared scheduling/serialization pressure, but this run does not isolate its causes.

Action comparisons need care: October timed POSTs carrying embedded Board refreshes. After JIR-119 those POSTs return minimal items; separate client refresh/summary requests are excluded here, as in the retained serial action probe. Thus the old and new POSTs reflect actual changed application behavior, but these numbers do not establish settled-UI latency or total browser request volume. Status/Move cycle distinct per-client writer slots between todo and in-progress using real, fixed populated-column neighbors; the original temporary harness's exact schedule was lost. The three serial samples are reference observations, not p95 estimates.

## Realtime, memory and mutation verification

All ten SSE streams reached `ready` before the workload, two subscribers per backlog, and remained open with **zero resyncs or early ends**. **452 of 452 expected Status/Move deliveries** arrived; per-stream counts were `[46, 44, 44, 46, 46, 46, 44, 44, 46, 46]`. Correlation follows each sequential writer's commit order, once per mutation and subscriber, including self events. Request-start-to-event arrival: p50 **545.5 ms**, p95 **2,290.8 ms**, p99 **2,761.7 ms** (October 712.0 / 2,762.0 / 3,117.0 ms; 412 deliveries). This includes request queueing, authorization and commit; it is not NOTIFY-only transport or browser refresh latency. Creation is excluded from latency correlation because its ID is unknown before the response.

Node server RSS: **182 samples**, once per second; minimum **512.3 MiB**, median **891.2 MiB**, maximum **1,115.9 MiB** (October 756.4 / 1,035.6 / 1,191.2 MiB). Client, PostgreSQL and Docker collector processes are excluded. Three minutes cannot establish absence of a memory leak.

Final owner-side verification found **20,117 items**, matching the 20,000 seed plus **117 distinct creations** (four setup/warm-up/probe creations and 113 measured creations), and **zero mismatched writer statuses** across all 50 writer slots. All measured action responses matched the requested item/backlog/status; search returned results, panels returned matching detail, and HTML responses passed streamed-error/fixture checks. These checks prove persisted final state and successful returned transitions, not an independent read after every concurrent mutation.

## Reproduction and limits

```sh
corepack pnpm install --frozen-lockfile
node scripts/perf/run-team-profile.mjs /tmp/jiroo-team-measurement
```

Use Node 24, a fresh output directory and free ports; full details and smoke-test options are in [the driver guide](team-profile-driver.md). Rebuild the checkout being measured, use the unchanged seed and keep the twelve-operation default. The result identifies the application commit even while tooling is uncommitted.

SQL duration logging is enabled only for the disposable runtime role; bind values are disabled. Three isolated requests per operation are bounded by unique owner markers, using the same tested `countSql` parser as the serial probes. Unlike October, no TCP wire observer, slow-query ranking or representative EXPLAINs are collected; those are not needed to replay the twelve-operation load. SQL/log collection overhead and local tmpfs differ, so a percentage above is not an attributed optimization effect. No per-request concurrent SQL counts are inferred.

Verification: the retained production build, public TOTP enrollment, all twelve operations, SQL markers, SSE fan-out, RSS sampling, final mutations and cleanup passed. `pnpm test scripts/perf`: **31 tests passed**; final full `pnpm test`: **3,391 passed, 505 skipped** (294 passing files, 52 skipped). Typecheck passed. Lint exited successfully with the existing `lib/auth/client.ts:8` navigation warning (zero errors). An independent recomputation of all sample counts, full/TTFB/byte percentiles, SSE fan-out and item totals matched the retained JSON. Skipped database suites are not claimed as executed here. No application changes, index changes, push, PR, merge or deployment are part of JIR-142.
