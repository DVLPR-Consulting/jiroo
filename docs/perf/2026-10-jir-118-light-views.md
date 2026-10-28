# Serial view probe — JIR-118

A reproducible warm-cache baseline before the light-view changes. This replaces the unavailable concurrent JIR-41 driver; it is a different workload, not a reproduction of that load campaign. See the [original team-profile report](2026-10-team-profile.md).

## Environment and dataset

- Application **`7710c1b`**, built from the unchanged application files on `main`; the probe/test were untracked tooling during measurement. No projection, picker, schema or index changes were included.
- Apple M5 Max, 18 logical CPUs, 64 GiB RAM; macOS 27.0.1. Node 24.18.1, Corepack pnpm 10.34.5, Next.js 16.4.1 and React 19.2.4.
- Docker Desktop engine 29.6.2, 18 CPUs and 8,319,213,568 bytes available to its Linux VM. PostgreSQL 17.11 (`postgres:17`, ARM64), default `shared_buffers=128MB`, `work_mem=4MB`, `max_connections=100`, JIT on.
- A newly created owned container, `jiroo-jir118-p4-2857354e9c`, with PostgreSQL data on tmpfs, exposed only at `127.0.0.1:5434`. Database `jir41_perf_d66ec80121f1`; the application's role was the non-administrative `jiroo_perf_runtime`, granted by `pnpm db:grant-runtime`. Markers used a separate schema-owner connection.
- The unchanged `scripts/perf/seed-team-profile.ts`: 5 backlogs of 4,000 items, 50 synthetic accounts, 100 components, 500 epics, 14,000 tasks, 5,400 subtasks, 15 sprints, 15 releases, 11,200 comments, 34,680 activities and 1,150 sprint events. Checked all 20,000 item paths ended with their own id label (zero mismatches).
- Production `corepack pnpm build`, then `.next/standalone/server.js` on `127.0.0.1:3441`, with copied `public` and `.next/static`. The application used only the runtime database URL, not the migration owner's credentials. Synthetic authentication secrets were supplied through process environment variables; no `.env` file was created.

## Method

`scripts/perf/probe-views.mjs` uses Node built-ins only. Docker CLI and the container's `psql` provide PostgreSQL log access; they are operational prerequisites, not Node package dependencies. Inputs are environment variables listed in the reproduction below.

The probe signs in a seed contributor through `/api/auth/sign-in/email`, enrolls it through `/api/auth/two-factor/enable`, and verifies a six-digit SHA-1 TOTP through `/api/auth/two-factor/verify-totp`. It checks the resulting session is an enrolled contributor. TOTP follows [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238#appendix-B); pure tests use its reference vectors. Cookies and TOTP material stay in the probe process, with no secret included in the output. Use a fresh contributor for each run; an already enrolled account needs `PROBE_TOTP_SECRET`.

Operations run **serially**, in this order: List, Backlog, Tree, Board and Panel. Each has one warm-up followed by **20 measured requests**. The recorded run selected the first seeded backlog (`PERFA`) and its first active writer (`PERFA-3`); all requests used one contributor. Preflight requests exercised the endpoints before the recorded run and are excluded. No test suite or build of ours ran concurrently with measurement.

Time starts immediately before `fetch` and stops when the complete response body has been received and decoded. It includes local transport and decompression, not browser rendering, hydration or JSON parsing by the application UI. Bodies of the four HTML views were gzip-encoded on the wire; reported bytes are **decoded** bytes, not compressed transfer size. The Panel is the drawer's actual JSON GET `/api/backlogs/PERFA/items/PERFA-3`, validated as `kind="item"` with `panel.detail` for the requested key. Redirects, non-success responses and missing detail fail the run instead of becoming measurements.

Percentiles use **nearest rank**: sort the 20 samples and select rank `ceil(p*n)`; p95 is sample 19, max is sample 20. JSON stdout retains every sample (bytes, complete response time, encoding, SQL count) and summaries; Markdown stderr reports median decoded size, full-response p50/p95/max and SQL median/range. MiB means 1,048,576 bytes.

For every measured request, two unique SQL `SELECT` markers bracket the HTTP call. PostgreSQL's prefix is `%m [%p] %u@%d ` and the runtime role has `log_min_duration_statement=0`; parameter-value logging is disabled. The probe reads Docker logs until the end marker appears, counting completed `statement:` and `execute` messages between the markers for the exact runtime role/database. Parse, Bind, parameter-detail lines, marker-owner statements and other roles are excluded; transaction control is included. Missing/reordered markers or zero runtime SQL fail closed. Docker/psql marker and log-reading work is outside the HTTP timer, although PostgreSQL's duration logging itself can affect server timings.

## Before (7710c1b)

Recorded start: **2026-10-28T09:07:55.724Z**, 20 successful measured requests per operation (100 total), plus the excluded warm-ups. Decoded body size and SQL count were constant across each operation's 20 samples.

| Operation | Decoded bytes (p50) | MiB | Full p50 ms | Full p95 ms | Full max ms | SQL p50 [min–max] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| List | 27446106 | 26.17 | 782.91 | 853.17 | 854.93 | 57 [57–57] |
| Backlog | 15376226 | 14.66 | 509.86 | 613.83 | 622.25 | 59 [59–59] |
| Tree | 14867933 | 14.18 | 305.74 | 344.96 | 366.42 | 57 [57–57] |
| Board | 3220373 | 3.07 | 130.05 | 148.45 | 159.65 | 57 [57–57] |
| Panel | 1267289 | 1.21 | 52.05 | 58.58 | 60.63 | 39 [39–39] |

### Relationship to JIR-41

| Operation | JIR-41 median MiB | This serial median MiB | JIR-41 full p95 ms | This serial full p95 ms |
| --- | ---: | ---: | ---: | ---: |
| List | 26.28 | 26.17 | 3501 | 853.17 |
| Backlog | 14.76 | 14.66 | 2524 | 613.83 |
| Tree | 14.24 | 14.18 | 2389 | 344.96 |
| Board | 2.55 | 3.07 | 2261 | 148.45 |
| Panel | 1.22 | 1.21 | 1753 | 58.58 |

Payloads remain of the same order: List, Backlog, Tree and Panel are close to the earlier report; Board is larger. The application revision differs from JIR-41's `7915ba9`, including the subsequently integrated JIR-126 card design. This run does not isolate the cause of the Board size difference.

Latency is substantially lower in this **single-request-at-a-time** protocol than in JIR-41's ten concurrent clients, mutations and realtime subscribers. That is not evidence of a JIR-118 speedup: this is still the before application. The fresh dataset also has 20,000 items versus JIR-41's 20,108 after its mutation campaign. The earlier exact driver is unavailable, and SQL accounting changed from a TCP observer to PostgreSQL logs. Only follow-up runs of this serial probe should be compared as its before/after series.

## After P1 (88f57d5, the files of main 476b8f8)

Recorded start: **2026-10-28T09:27:09.207Z**, same protocol and seed, on the checkout of PR #147 (`88f57d5`, whose files are those of `main` at `476b8f8`). The probe was copied into that checkout as untracked tooling. Codex's Chromium review of the next lots ran on the same machine during this run: timings are noisier than the baseline (the Backlog p95 is an outlier), sizes and SQL counts are exact.

| Operation | Decoded bytes (p50) | MiB | Full p50 ms | Full p95 ms | Full max ms | SQL p50 [min–max] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| List | 25899631 | 24.70 | 756.46 | 817.95 | 855.28 | 57 [57–57] |
| Backlog | 14711280 | 14.03 | 449.90 | 1022.26 | 1045.45 | 59 [59–59] |
| Tree | 14202987 | 13.55 | 376.56 | 398.62 | 420.92 | 57 [57–57] |
| Board | 2555427 | 2.44 | 149.28 | 167.60 | 168.54 | 57 [57–57] |
| Panel | 1267289 | 1.21 | 58.43 | 70.13 | 72.00 | 39 [39–39] |

Reading: dropping `description` and `search` from the view rows takes 1.47 MiB off the List (the descriptions it sent to the browser) and 0.63 MiB off each of the Backlog, Tree and Board (the same payload is streamed to all four views: the candidate lists of the create dialog and the Parent facet, which the next lot removes). The Panel is unchanged, as expected, until the drawer stops reading the whole backlog. The remaining bulk of the List is its 4,024 rendered rows themselves, which only server-side windows (JIR-120) can reduce.

## After P2

Pending — not measured.

## After P3

Pending — not measured.

## Reproduction

Use Node 24, Docker and Corepack pnpm from the repository root. Reserve local port 5434: the existing seed deliberately accepts only that port and the `jir41_perf_<12 hex>` namespace. Use a new container/database for each run; never an existing project database. The server must be built from the application revision being reported by `git rev-parse --short HEAD`.

Run this block as a Bash script from the repository root so the cleanup trap also runs on failure.

```sh
set -eu
corepack pnpm install --frozen-lockfile
export PERF_CONTAINER="jiroo-jir118-probe-$(node -p 'require("node:crypto").randomBytes(5).toString("hex")')"
export PERF_DB="jir41_perf_$(node -p 'require("node:crypto").randomBytes(6).toString("hex")')"
export PERF_OWNER_PASSWORD="$(node -p 'require("node:crypto").randomBytes(24).toString("hex")')"
export PERF_RUNTIME_PASSWORD="$(node -p 'require("node:crypto").randomBytes(24).toString("hex")')"
export JIROO_PERF_PASSWORD="$(node -p 'require("node:crypto").randomBytes(24).toString("hex")')"
export BETTER_AUTH_SECRET="$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
export BETTER_AUTH_URL=http://127.0.0.1:3441
export NEXT_TELEMETRY_DISABLED=1
PROBE_SERVER_PID=
cleanup() {
  if [ -n "$PROBE_SERVER_PID" ]; then kill "$PROBE_SERVER_PID" 2>/dev/null || true; wait "$PROBE_SERVER_PID" 2>/dev/null || true; fi
  docker rm -f "$PERF_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT
POSTGRES_USER=jiroo_owner POSTGRES_PASSWORD="$PERF_OWNER_PASSWORD" POSTGRES_DB="$PERF_DB" \
  docker run -d --name "$PERF_CONTAINER" --tmpfs /var/lib/postgresql/data:rw \
  -p 127.0.0.1:5434:5432 -e POSTGRES_USER -e POSTGRES_PASSWORD -e POSTGRES_DB \
  postgres:17 -c 'log_line_prefix=%m [%p] %u@%d '
until docker exec "$PERF_CONTAINER" pg_isready -U jiroo_owner -d "$PERF_DB"; do sleep 0.25; done
export DIRECT_DATABASE_URL="postgresql://jiroo_owner:$PERF_OWNER_PASSWORD@127.0.0.1:5434/$PERF_DB"
export DATABASE_URL="$DIRECT_DATABASE_URL"
corepack pnpm db:migrate
export JIROO_ALLOW_TEAM_PROFILE_SEED=1
corepack pnpm exec tsx --conditions=react-server scripts/perf/seed-team-profile.ts > /tmp/jiroo-team-profile.json
# Generated passwords above are hexadecimal, so this SQL literal is unambiguous.
docker exec -i "$PERF_CONTAINER" psql -U jiroo_owner -d "$PERF_DB" -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE jiroo_perf_runtime LOGIN PASSWORD '$PERF_RUNTIME_PASSWORD';
ALTER ROLE jiroo_perf_runtime SET log_min_duration_statement=0;
ALTER ROLE jiroo_perf_runtime SET log_parameter_max_length=0;
SQL
export JIROO_RUNTIME_ROLE=jiroo_perf_runtime
corepack pnpm db:grant-runtime
export DATABASE_URL="postgresql://jiroo_perf_runtime:$PERF_RUNTIME_PASSWORD@127.0.0.1:5434/$PERF_DB"
unset DIRECT_DATABASE_URL
corepack pnpm build
cp -R public .next/standalone/public
cp -R .next/static .next/standalone/.next/static
PORT=3441 HOSTNAME=127.0.0.1 node .next/standalone/server.js > /tmp/jiroo-probe-server.log 2>&1 &
PROBE_SERVER_PID=$!
# Wait for the owned production server before enrolling a fresh contributor.
node --input-type=module <<'NODE'
import { setTimeout as sleep } from 'node:timers/promises';
for (let attempt = 0; attempt < 80; attempt++) {
  try { if ((await fetch('http://127.0.0.1:3441/login')).ok) process.exit(0); } catch {}
  await sleep(250);
}
throw new Error('Owned server did not become ready');
NODE
export PROBE_BASE_URL=http://127.0.0.1:3441
export PROBE_BACKLOG="$(node -p 'require("/tmp/jiroo-team-profile.json").backlogs[0].key')"
export PROBE_ITEM="$(node -p 'require("/tmp/jiroo-team-profile.json").backlogs[0].writers[0].key')"
export PROBE_EMAIL="$(node -p 'require("/tmp/jiroo-team-profile.json").people[1].email')"
export PROBE_PASSWORD="$JIROO_PERF_PASSWORD"
export PROBE_REQUESTS=20
export PROBE_PG_CONTAINER="$PERF_CONTAINER"
export PROBE_PG_DATABASE="$PERF_DB"
export PROBE_PG_OWNER=jiroo_owner
export PROBE_PG_ROLE=jiroo_perf_runtime
node scripts/perf/probe-views.mjs > /tmp/jiroo-probe.json 2> /tmp/jiroo-probe.md
# Clean up now; the EXIT trap covers failures earlier in the block.
cleanup
trap - EXIT
```

For a follow-up revision, use the same script and dataset protocol and record the server's application commit. If the probe is copied into the original `7710c1b` checkout to repeat the before measurement, keep application files unchanged; its commit field must identify that checkout, not an unrelated tooling directory. Local performance captures can be retained outside Git; never retain passwords, cookies or TOTP secrets in them.

## Limitations and verification

- One warm-cache machine, shared with ordinary local development; process CPU/memory was not isolated. Twenty samples are a small distribution, not a capacity or tail-latency guarantee.
- Serial authenticated reads only: no mutation throughput, concurrent clients, realtime delivery, browser paint/hydration, cold-cache performance, compressed wire bytes, CPU profile or RSS soak measured.
- SQL log attribution assumes the owned application is the only client using its runtime role during the markers. The fixed log window must contain both markers; overflow/missing logs cause an error rather than a fabricated count.
- A production build, live public authentication/enrollment and all five real endpoints were exercised. Pure tests cover percentile selection, table formatting, RFC TOTP vectors, SQL message filtering and the actual nested Panel payload. No application code, index or migration changed.
- The owned production server was stopped and the tmpfs PostgreSQL container removed after measurement; absence was verified. No Neon, port 5433 or development launcher was used.
