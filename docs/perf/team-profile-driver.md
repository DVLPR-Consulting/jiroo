# Replaying the team-size load profile (JIR-142)

Run from the ticket's repository root with **Node 24**, Corepack pnpm and Docker:

```sh
corepack pnpm install --frozen-lockfile
node scripts/perf/run-team-profile.mjs /tmp/jiroo-team-measurement
```

The output directory must not exist. Omit the argument to allocate a fresh private
temporary directory automatically. The driver prints its path and each phase to
stderr. `PERF_PORT=3442` selects another HTTP port; `PERF_SECONDS=15` is useful for
a smoke test, **not a retained measurement**. The default retained workload is
180 seconds, ten clients and 300 ms of think time after each response, including
failures. In-flight requests drain before the timer stops. Use a fresh database
for every run, including after a failed attempt.

## Isolation and lifecycle

The command refuses occupied ports (PostgreSQL **5434**, HTTP **3441** by default)
and local `.env`/production environment files. It never connects to an existing
database: it creates a randomly named `jiroo-team-load-<12 hex>` PostgreSQL 17
container with a tmpfs data directory, bound only to `127.0.0.1:5434`, and a fresh
`jir41_perf_<12 hex>` database. It ignores inherited database/auth URLs, proxies
and Node preload options. It cannot target Neon or port 5433. It does not restart
or change shared containers. A port conflict fails rather than stopping its owner.

It runs the existing migrations and `seed-team-profile.ts`, creates and grants the
existing least-privilege runtime role, builds the current checkout and starts its
standalone production server. No application code is patched. Migration, seed,
grant, build and server logs stay in the private output directory. Generated
passwords, TOTP secrets and cookies are never included in `results.json` and no
environment file is written. Treat the private logs as local diagnostic data;
only the credential-free result file is suitable for publication.

On success, error, SIGINT or SIGTERM, the driver stops its processes and removes
**only the container ID returned by its own Docker create**. It verifies that
container is absent. A host crash or SIGKILL cannot run this cleanup: remove the
specific `jiroo-team-load-*` container shown by `docker ps -a` after verifying
ownership; never prune or remove other projects' containers.

## Protocol

The [22 October baseline](2026-10-team-profile.md) defines the profile: 20,000
items across five backlogs, 50 members, active/completed sprints, releases,
comments, labels, links and activity. The seed is reused unchanged. Ten fresh
contributors authenticate and enroll TOTP through public HTTP endpoints. Auth
429s honor Better Auth's `X-Retry-After` during preparation only; failed measured
requests are recorded without retries.

Each client executes the twelve operations in cyclic order, offset by its client
index: Backlog, List, Board (active sprint), Tree, Roadmap, Reports (active sprint),
My items, Search (`dossier`), Panel, Create, Status, Move. It advances to another
backlog every twelve operations. The seed supplies ten writer slots per backlog:
each client owns its slot across all five backlogs. Status and Move alternate
that writer between todo and in-progress, guaranteeing a transition; Move uses
a fixed, populated-column neighbor outside the writer slots. Create adds a
unique task under the seeded epic to the active sprint. These arguments make
the run repeatable; the original temporary harness's exact writer selection
and status schedule were not retained, so claim a protocol comparison, not a
bit-for-bit replay of that harness.

Actions use IDs discovered from the production server-reference manifest and
the Next 16.4.1 Board router tree already captured and documented by
[`probe-actions`](2026-10-jir-119-actions.md). Recapture that tree if Next or the
route structure changes. Every response is completely consumed. Writes must
return the Flight root's matching successful item, search must return results,
panel must contain matching detail, and pages must be HTML with the expected
fixture marker and no streamed error row. Redirects are failures. Creation IDs
must be unique; final owner queries verify the item count and each writer's
persisted status outside the timers.

The HTTP boundary is the same as the serial probes: create/update/move POSTs
include whatever RSC refresh the application emits in that response. Since
JIR-119, separate client refresh/summary requests are **not** timed or driven.
There is no browser paint/hydration measurement, browser background activity or
automatic SSE-triggered refresh. This limitation matters when comparing old
embedded Board renders with today's minimal action responses.

Before SSE/load, one warm-up plus three serial requests per operation provide
SQL execution counts. The disposable runtime role alone enables duration
logging, with bind values disabled. Unique owner markers and the shared
`countSql` helper count simple statements and extended executions, including
transactions, excluding owner statements and Parse/Bind. Missing markers or
zero runtime queries fail the run. Docker logs stream to disk rather than being
buffered through the entire load. This replaces the old temporary wire observer;
there is no new slow-query/EXPLAIN audit or per-request SQL attribution under
concurrency.

Then ten SSE streams (two per backlog) must reach `ready` and remain open.
Status/Move requests are correlated by writer ID and subscriber, once per
mutation/subscriber, including self events. The result includes expected,
observed and missing deliveries and request-start-to-event arrival percentiles;
this is not isolated NOTIFY latency. Creation is excluded from event latency
because its ID is unknown before the response. An unexpected stream end/resync
invalidates the run. A short final drain allows already committed events to
arrive. RSS of the owned Node server PID is sampled every second with `ps`;
client, PostgreSQL and Docker log collector memory are excluded.

## Results and verification

`results.json` retains the application commit, environment, all successful HTTP
samples (operation/backlog/client/turn, decoded bytes, TTFB and full-body ms),
errors, serial SQL counts, RSS trace, realtime delivery counts/latencies,
postconditions and verified cleanup. A checkpoint is saved before postconditions
so later failure does not discard the HTTP samples. A run with missing operations,
HTTP errors, realtime loss, missing RSS or incorrect writes exits nonzero and
sets `valid: false`; never publish it as a successful baseline.

Percentiles use the shared nearest-rank implementation. Indicative full-response
p95 thresholds: **500 ms** per page/panel, **300 ms** per action/search. TTFB is
reported separately and cannot substitute for full-body latency. This is a
warm-cache, single-host, three-minute observation, not a production capacity
guarantee, cold-cache test, soak test or memory-leak verdict. Record competing
host activity and version/container differences alongside comparisons.

```sh
corepack pnpm test scripts/perf
corepack pnpm typecheck
corepack pnpm lint
```

The tests cover the closed-loop scheduler, failure accounting, operation/backlog
rotation and writer ownership, nearest-rank tails and missing operations, public
auth rate limits, split SSE frames and early close, streamed HTTP errors,
body-completion timing, Flight action validation, and disposable configuration.
