#!/usr/bin/env node
// One command owns the container, database, production server and cleanup.
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir, cpus, totalmem, release } from "node:os";
import { dirname, resolve, join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { countSql, totp, validatePanel } from "./probe-views.mjs";
import { buildActionRequest, buildMoveInput, readActionIds, readActionResult, validateAction } from "./probe-actions.mjs";
import { authRequest, measureRequest, readOperation, recordDelivery, routerState, runClients, summarize, summarizeLoad, validateRead, watchEvents } from "./load-team-profile.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const hex = (n = 24) => randomBytes(n).toString("hex");

export function runConfig(input) {
  const seconds = Number(input.PERF_SECONDS ?? 180), port = Number(input.PERF_PORT ?? 3441);
  // SSE connections expire after four minutes: leave room to drain the last requests.
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 210) throw new Error("PERF_SECONDS must be 1–210 seconds");
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || port === 5434) throw new Error("Invalid PERF_PORT");
  const database = `jir41_perf_${hex(6)}`, container = `jiroo-team-load-${hex(6)}`, ownerPassword = hex(), runtimePassword = hex();
  const base = `http://127.0.0.1:${port}`, ownerUrl = `postgresql://jiroo_owner:${ownerPassword}@127.0.0.1:5434/${database}`;
  // Do not inherit database URLs, proxies, Node preload options or deployment settings.
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "COREPACK_HOME", "PNPM_HOME"].filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  Object.assign(env, { PATH: `${dirname(process.execPath)}:${env.PATH}`, DATABASE_URL: ownerUrl, DIRECT_DATABASE_URL: ownerUrl,
    BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: hex(32), JIROO_PERF_PASSWORD: hex(), JIROO_ALLOW_TEAM_PROFILE_SEED: "1",
    NEXT_TELEMETRY_DISABLED: "1", JIROO_E2E_ISOLATED: "0", POSTGRES_USER: "jiroo_owner", POSTGRES_PASSWORD: ownerPassword, POSTGRES_DB: database });
  return { database, container, base, port, durationMs: seconds * 1000, env, runtimePassword };
}

async function freePort(port) {
  const server = createServer(); server.listen(port, "127.0.0.1");
  await once(server, "listening"); await new Promise((done) => server.close(done));
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Use Node 24 (the project runtime)");
  const config = runConfig(process.env), { env, base, database, container } = config;
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) if (existsSync(join(repo, name))) throw new Error(`Remove ${name} from this isolated worktree before measuring; no environment files are loaded`);
  await freePort(5434); await freePort(config.port);
  const output = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync(join(tmpdir(), "jiroo-team-load-"));
  if (process.argv[2]) mkdirSync(output, { mode: 0o700 }); // Exclusive: never overwrite another run.
  const step = (s) => process.stderr.write(`[team-profile] ${s}\n`);
  step(`Artifacts: ${output}`);
  const abort = new AbortController(), streams = [], children = new Set();
  const signalHandler = () => abort.abort();
  process.once("SIGINT", signalHandler); process.once("SIGTERM", signalHandler);
  let ownedId, server, logCollector, result;
  const command = async (program, args, name, childEnv = env) => {
    const fd = openSync(join(output, `${name}.log`), "a", 0o600);
    const child = spawn(program, args, { cwd: repo, env: childEnv, stdio: ["ignore", fd, fd], signal: abort.signal }); children.add(child); closeSync(fd);
    try { const [code] = await once(child, "exit"); if (code !== 0) throw new Error(`${name} failed (see private artifact log)`); }
    finally { children.delete(child); }
  };
  const docker = (args, options = {}) => {
    const r = spawnSync("docker", args, { env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 30000, ...options });
    if (r.error || r.status !== 0) throw new Error("Owned Docker command failed");
    return r.stdout.trim();
  };
  const sql = (query, marker = false) => docker(["exec", "-i", ...(marker ? ["-e", "PGOPTIONS=-c log_min_duration_statement=0"] : []), ownedId, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", "jiroo_owner", "-d", database], { input: query });
  const save = () => { if (result) writeFileSync(join(output, "results.json"), JSON.stringify(result, null, 2) + "\n", { mode: 0o600 }); };
  try {
    step("Creating a new PostgreSQL 17 tmpfs container on 127.0.0.1:5434");
    ownedId = docker(["create", "--name", container, "--tmpfs", "/var/lib/postgresql/data:rw", "-p", "127.0.0.1:5434:5432", "-e", "POSTGRES_USER", "-e", "POSTGRES_PASSWORD", "-e", "POSTGRES_DB", "postgres:17", "-c", "log_line_prefix=%m [%p] %u@%d "]);
    if (!/^[a-f0-9]{64}$/.test(ownedId)) throw new Error("Docker did not return an owned container ID");
    docker(["start", ownedId]);
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (abort.signal.aborted) throw new Error("Interrupted");
      const p = spawnSync("docker", ["exec", ownedId, "pg_isready", "-U", "jiroo_owner", "-d", database], { stdio: "ignore" });
      if (p.status === 0) { ready = true; break; } await sleep(250);
    }
    if (!ready) throw new Error("PostgreSQL did not become ready");
    const pgLog = join(output, "postgres.log"), pgFd = openSync(pgLog, "a", 0o600);
    logCollector = spawn("docker", ["logs", "--follow", ownedId], { stdio: ["ignore", pgFd, pgFd] }); closeSync(pgFd);
    step("Migrating and seeding the unchanged team profile (20,000 items, 50 accounts)");
    await command("corepack", ["pnpm", "db:migrate"], "migrate");
    await command(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/perf/seed-team-profile.ts"], "seed");
    const seedLines = readFileSync(join(output, "seed.log"), "utf8").split("\n");
    const profile = JSON.parse(seedLines.findLast((line) => line.startsWith('{"people":')));
    sql(`create role jiroo_perf_runtime login password '${config.runtimePassword}'; alter role jiroo_perf_runtime set log_min_duration_statement=0; alter role jiroo_perf_runtime set log_parameter_max_length=0;`);
    await command("corepack", ["pnpm", "db:grant-runtime"], "grant", { ...env, JIROO_RUNTIME_ROLE: "jiroo_perf_runtime" });
    const runtimeEnv = { ...env, DATABASE_URL: `postgresql://jiroo_perf_runtime:${config.runtimePassword}@127.0.0.1:5434/${database}` };
    delete runtimeEnv.DIRECT_DATABASE_URL;
    step("Building the production standalone server");
    await command("corepack", ["pnpm", "build"], "build", runtimeEnv);
    cpSync(join(repo, "public"), join(repo, ".next/standalone/public"), { recursive: true });
    cpSync(join(repo, ".next/static"), join(repo, ".next/standalone/.next/static"), { recursive: true });
    const fd = openSync(join(output, "server.log"), "a", 0o600);
    server = spawn(process.execPath, [".next/standalone/server.js"], { cwd: repo, env: { ...runtimeEnv, NODE_ENV: "production", PORT: String(config.port), HOSTNAME: "127.0.0.1" }, stdio: ["ignore", fd, fd] }); closeSync(fd);
    ready = false;
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null || abort.signal.aborted) throw new Error("Production server stopped");
      try { if ((await fetch(`${base}/login`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      await sleep(250);
    }
    if (!ready) throw new Error("Production server did not become ready");
    const manifest = JSON.parse(readFileSync(join(repo, ".next/server/server-reference-manifest.json"), "utf8")), ids = readActionIds(manifest);
    const searches = Object.entries(manifest.node).filter(([, v]) => v.filename === "app/actions/search.ts" && v.exportedName === "searchAction" && v.workers?.["app/(app)/b/[key]/page"]);
    if (searches.length !== 1) throw new Error("Missing or ambiguous search action");
    ids.searchAction = searches[0][0];
    // Fixed non-writer anchors ensure a real populated-column move, not an empty/global fallback.
    for (const b of profile.backlogs) {
      b.states = JSON.parse(sql(`select json_agg(t) from (select id,category,"order" from statuses where backlog_id='${b.id}' order by "order") t`));
      b.anchors = JSON.parse(sql(`select json_object_agg(status_id,id) from (select distinct on (i.status_id) i.status_id,i.id from items i join sprint_items m on m.item_id=i.id where m.sprint_id='${b.sprintId}' and m.left_at is null and i.type='tache' and i.deleted_at is null and i.id not in (${b.writers.map((w) => `'${w.id}'`).join(",")}) order by i.status_id,i.rank collate "C",i.key) t`));
      for (const writer of b.writers) writer.statusId = sql(`select status_id from items where id='${writer.id}'`);
    }
    const clients = [];
    step("Enrolling ten contributor accounts through public TOTP endpoints");
    for (let i = 0; i < 10; i++) {
      const jar = new Map();
      const headers = () => ({ Origin: base, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });
      const cookies = (response) => { for (const value of response.headers.getSetCookie()) { const pair = value.split(";")[0], at = pair.indexOf("="); if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1)); } };
      const api = async (path, input) => {
        const response = await authRequest(`${base}/api/auth/${path}`, { method: input ? "POST" : "GET", headers: { ...headers(), "Content-Type": "application/json" }, body: input ? JSON.stringify(input) : undefined, redirect: "manual", signal: AbortSignal.timeout(120000) });
        cookies(response); if (!response.ok) throw new Error(`Auth ${path}: HTTP ${response.status}`); return response.json();
      };
      await api("sign-in/email", { email: profile.people[i + 1].email, password: env.JIROO_PERF_PASSWORD });
      const secret = new URL((await api("two-factor/enable", { password: env.JIROO_PERF_PASSWORD })).totpURI).searchParams.get("secret");
      await api("two-factor/verify-totp", { code: totp(secret) });
      const session = await api("get-session");
      if (session?.user?.role !== "contributor" || session.user.twoFactorEnabled !== true) throw new Error("TOTP contributor session required");
      clients.push({ headers, cookies });
    }
    const pending = new Map(), deliveries = [], mutations = [], created = new Set(); let measured = false;
    const perform = async (client, turn) => {
      const { operation, backlog: b, writer, path } = readOperation(profile, client, turn), c = clients[client];
      let request = { url: new URL(path ?? `/b/${b.key}?view=board`, base).href, headers: c.headers() }, input, targetStatus;
      if (["Search", "Create", "Status", "Move"].includes(operation)) {
        const todo = b.states.find((s) => s.category === "todo"), doing = b.states.find((s) => s.category === "in_progress" && b.anchors[s.id]);
        if (!todo || !doing) throw new Error("Missing todo/in-progress fixtures");
        targetStatus = writer.statusId === todo.id ? doing.id : todo.id;
        input = operation === "Search" ? "dossier" : operation === "Create" ? { backlogKey: b.key, backlogId: b.id, type: "tache", parentId: b.epicId, title: `Load ${randomUUID()}`, statusId: todo.id, sprintId: b.sprintId } : operation === "Move" ? buildMoveInput(b.key, writer, targetStatus, b.anchors[targetStatus]) : { backlogKey: b.key, id: writer.id, statusId: targetStatus };
        request = buildActionRequest(base, b.key, ids[{ Search: "searchAction", Create: "createItemAction", Status: "updateItemAction", Move: "moveItemAction" }[operation]], input, routerState(b.key));
        request.headers = { ...request.headers, ...c.headers() };
      }
      if (measured && ["Status", "Move"].includes(operation)) {
        const mutation = { itemId: writer.id, backlog: b.key, started: performance.now(), received: new Set() };
        if (!pending.has(writer.id)) pending.set(writer.id, []);
        pending.get(writer.id).push(mutation); mutations.push(mutation);
      }
      const sample = await measureRequest(request.url, request); c.cookies(sample.response);
      const contentType = sample.response.headers.get("content-type"), text = sample.body.toString();
      if (operation === "Panel") validatePanel(text, writer.key);
      else if (["Search", "Create", "Status", "Move"].includes(operation)) {
        if (!contentType?.startsWith("text/x-component")) throw new Error(`${operation}: not a Flight response`);
        if (operation === "Search") { const result = readActionResult(sample.body); if (result?.ok !== true || !Array.isArray(result.results) || !result.results.length) throw new Error("Search returned no successful results"); }
        else {
          const item = validateAction(sample.body, { backlogId: b.id, statusId: input.statusId, ...(operation !== "Create" ? { id: writer.id } : {}) });
          if (operation === "Create") { if (created.has(item.id)) throw new Error("Duplicate created identity"); created.add(item.id); }
          else writer.statusId = item.statusId;
        }
      } else validateRead(operation, contentType, text, operation === "My items" ? "PERF" : b.key);
      return { operation, backlog: b.key, fullMs: sample.fullMs, ttfbMs: sample.ttfbMs, bytes: sample.bytes };
    };
    step("One warm-up and three isolated SQL-counted requests per operation (no SSE)");
    const serial = [];
    for (let turn = 0; turn < 12; turn++) {
      await perform(0, turn);
      for (let n = 0; n < 3; n++) {
        const marker = hex(8), before = `${marker}_before`, after = `${marker}_after`;
        sql(`select '${before}'`, true);
        const sample = await perform(0, turn);
        sql(`select '${after}'`, true);
        let log = "";
        for (let attempt = 0; attempt < 40; attempt++) { log = readFileSync(pgLog, "utf8"); if (log.includes(after)) break; await sleep(50); }
        const queries = countSql(log, before, after, "jiroo_perf_runtime", database);
        if (!queries) throw new Error("Serial probe observed no runtime SQL");
        serial.push({ ...sample, sql: queries });
      }
    }
    const realtimeErrors = [], received = Array(10).fill(0);
    for (let i = 0; i < 10; i++) {
      const controller = new AbortController(); streams.push(controller);
      let setReady; const readyPromise = new Promise((done) => { setReady = done; });
      const b = profile.backlogs[i % 5];
      const response = await fetch(`${base}/api/realtime?backlog=${b.key}`, { headers: clients[i].headers(), signal: controller.signal, redirect: "manual" });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("text/event-stream")) throw new Error("Realtime did not open");
      watchEvents(response.body, (event) => {
        if (event.kind === "ready") setReady();
        if (event.kind === "resync") realtimeErrors.push(`Stream ${i}: resync`);
        if (!measured || event.kind !== "item") return;
        for (const id of event.itemIds ?? []) {
          const queue = pending.get(id);
          if (queue?.[0].backlog === b.key) {
            const latency = recordDelivery(queue, i, performance.now());
            if (latency !== null) { received[i]++; deliveries.push(latency); }
          }
        }
      }).catch((error) => { if (!controller.signal.aborted) { realtimeErrors.push(`Stream ${i}: ${error.message}`); setReady(); } });
      await Promise.race([readyPromise, sleep(10000).then(() => { throw new Error("Realtime ready timeout"); })]);
    }
    if (realtimeErrors.length) throw new Error("Realtime setup failed");
    step(`Running 10 clients for ${config.durationMs / 1000}s; 300ms think time; 12 operations`);
    const memory = [], sampleMemory = () => {
      const r = spawnSync("ps", ["-o", "rss=", "-p", String(server.pid)], { encoding: "utf8" }), kib = Number(r.stdout?.trim());
      if (r.status === 0 && kib > 0) memory.push({ at: new Date().toISOString(), rssMiB: kib / 1024 });
    };
    sampleMemory(); const timer = setInterval(sampleMemory, 1000);
    const startedAt = new Date().toISOString(); measured = true;
    let load;
    try { load = await runClients({ durationMs: config.durationMs, signal: abort.signal, perform }); }
    finally { clearInterval(timer); }
    result = { startedAt, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
      environment: { node: process.version, next: JSON.parse(readFileSync(join(repo, "node_modules/next/package.json"))).version, cpu: cpus()[0].model, cores: cpus().length, ramGiB: totalmem() / 2 ** 30, os: release(), postgres: sql("select version()"), docker: JSON.parse(docker(["info", "--format", "{{json .}}"])).ServerVersion },
      clients: 10, thinkMs: 300, requestedDurationMs: config.durationMs, serial, ...load, ...summarizeLoad(load), memory, rssMiB: summarize(memory.map((s) => s.rssMiB)), realtime: {}, cleanup: false };
    save(); // Checkpoint before postconditions/cleanup; never lose the HTTP samples.
    await sleep(1500); measured = false;
    result.realtime = { ready: 10, errors: realtimeErrors, deliveries: deliveries.length, expected: mutations.length * 2, missing: mutations.reduce((n, m) => n + 2 - m.received.size, 0), perStream: received, requestStartToEventMs: summarize(deliveries) };
    result.postconditions = { created: created.size, items: Number(sql("select count(*) from items")), writerMismatches: 0 };
    for (const b of profile.backlogs) {
      const stored = JSON.parse(sql(`select json_object_agg(id,status_id) from items where id in (${b.writers.map((w) => `'${w.id}'`).join(",")})`));
      result.postconditions.writerMismatches += b.writers.filter((w) => stored[w.id] !== w.statusId).length;
    }
    result.valid = !abort.signal.aborted && !load.errors.length && !realtimeErrors.length && !result.realtime.missing && !!memory.length && result.results.every((r) => r.samples > 0) && result.postconditions.items === 20000 + created.size && !result.postconditions.writerMismatches;
    save();
    if (!result.valid) throw new Error("Invalid run: inspect results.json errors, realtime and postconditions");
    step(`${result.successes} successful requests; ${result.requestsPerSecond.toFixed(2)}/s; results.json saved`);
  } finally {
    for (const stream of streams) stream.abort();
    for (const child of [server, logCollector, ...children].filter(Boolean)) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit"); child.kill("SIGTERM");
        await Promise.race([exited, sleep(5000).then(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); })]);
      }
    }
    if (ownedId && /^[a-f0-9]{64}$/.test(ownedId)) {
      docker(["rm", "--force", ownedId]);
      const absent = spawnSync("docker", ["inspect", ownedId], { stdio: "ignore" }).status !== 0;
      if (!absent) throw new Error("Owned container cleanup could not be verified");
      if (result) result.cleanup = true;
      step("Owned server stopped; disposable container/database removed and absence verified");
    }
    save();
    process.removeListener("SIGINT", signalHandler); process.removeListener("SIGTERM", signalHandler);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(`Team profile failed: ${error.message}`); process.exitCode = 1; });
