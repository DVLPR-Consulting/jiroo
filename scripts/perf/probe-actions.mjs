#!/usr/bin/env node
// Serial Board mutations, Node 24 built-ins only. See docs/perf/2026-10-jir-119-actions.md.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { countSql, formatTable, percentile, totp } from "./probe-views.mjs";

export function readActionIds(manifest) {
  return Object.fromEntries(["createItemAction", "updateItemAction", "moveItemAction"].map((name) => {
    const found = Object.entries(manifest.node ?? {}).filter(([, v]) => v.filename === "app/actions/items.ts" && v.exportedName === name && v.workers?.["app/(app)/b/[key]/page"]);
    if (found.length !== 1 || !/^[a-f0-9]{42}$/.test(found[0][0])) throw new Error(`Missing or ambiguous Board action: ${name}`);
    return [name, found[0][0]];
  }));
}

// Captured Chromium router tree, including Next 16 segment hints; no action-only/skip-render flag.
export function buildActionRequest(base, backlog, actionId, input, routerState) {
  try { if (!Array.isArray(JSON.parse(decodeURIComponent(routerState)))) throw new Error(); }
  catch { throw new Error("Invalid captured router state"); }
  return { url: new URL(`/b/${encodeURIComponent(backlog)}?view=board`, base).href, method: "POST",
    headers: { Origin: new URL(base).origin, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8", "Next-Action": actionId, "Next-Router-State-Tree": routerState },
    body: JSON.stringify([input]) }; // React encodeReply for one plain JSON argument; undefined fields omitted.
}

export function validateAction(text, expected) {
  // Read Flight framing, skipping length-delimited text/binary by BYTE length (not newlines).
  const bytes = Buffer.from(text), rows = new Map(); let offset = 0;
  while (offset < bytes.length) {
    const colon = bytes.indexOf(58, offset), id = bytes.subarray(offset, colon).toString();
    if (colon < offset || !/^[a-f0-9]*$/.test(id)) throw new Error("Malformed action Flight row");
    const tag = String.fromCharCode(bytes[colon + 1]);
    if ("TAOoUSsLlGgMmVb".includes(tag)) {
      const comma = bytes.indexOf(44, colon + 2), length = bytes.subarray(colon + 2, comma).toString();
      if (comma < 0 || !/^[a-f0-9]+$/.test(length)) throw new Error("Malformed action Flight length");
      offset = comma + 1 + Number.parseInt(length, 16);
      if (offset > bytes.length) throw new Error("Truncated action Flight text");
    } else {
      const end = bytes.indexOf(10, colon); if (end < 0) throw new Error("Truncated action Flight model");
      const payload = bytes.subarray(colon + 1, end).toString();
      if (payload.startsWith("{")) rows.set(id, JSON.parse(payload));
      offset = end + 1;
    }
  }
  const ref = rows.get("0")?.a, result = typeof ref === "string" && /^\$@[a-f0-9]+$/.test(ref) ? rows.get(ref.slice(2)) : null;
  if (result?.ok !== true || !result.item?.id || !result.item.key || Object.entries(expected).some(([k, v]) => result.item[k] !== v)) throw new Error("Board action did not return a matching successful item");
  return result.item;
}

async function main() {
  const env = process.env, required = (name) => { const v = env[`PROBE_${name}`]; if (!v) throw new Error(`Set PROBE_${name}`); return v; };
  const base = new URL(required("BASE_URL"));
  if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || base.username || base.password) throw new Error("Use an explicit local HTTP server");
  const container = required("PG_CONTAINER"), database = required("PG_DATABASE"), owner = required("PG_OWNER"), role = required("PG_ROLE");
  if (!container.startsWith("jiroo-") || !/^jir41_perf_[a-f0-9]{12}$/.test(database)) throw new Error("Use the owned disposable team-profile database");
  const requests = Number(env.PROBE_REQUESTS ?? 20);
  if (!Number.isSafeInteger(requests) || requests < 1) throw new Error("PROBE_REQUESTS must be positive");
  const backlog = required("BACKLOG"); if (!/^[A-Z]{2,6}$/.test(backlog)) throw new Error("Invalid backlog key");
  const docker = (args) => { const r = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 30000 }); if (r.error || r.status !== 0) throw new Error("Owned Docker/psql command failed"); return r.stdout + r.stderr; };
  const sql = (query, logging = false) => docker(["exec", ...(logging ? ["-e", "PGOPTIONS=-c log_min_duration_statement=0"] : []), container, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", owner, "-d", database, "-c", query]).trim();
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  const ids = readActionIds(JSON.parse(readFileSync(`${repo}/.next/server/server-reference-manifest.json`, "utf8")));
  const profile = JSON.parse(readFileSync(required("PROFILE"), "utf8")), b = profile.backlogs.find((b) => b.key === backlog);
  if (!b || [b.id, b.epicId, b.sprintId].some((id) => !/^[a-f0-9-]{36}$/.test(id))) throw new Error("Backlog absent from seed profile");
  const states = JSON.parse(sql(`select json_agg(json_build_object('id',id,'category',category)) from statuses where backlog_id='${b.id}'`));
  const done = states.find((s) => s.category === "done")?.id;
  if (!done) throw new Error("No done status");
  // Discover fixtures before markers, as owner; each task is mutated only once per run.
  const tasks = JSON.parse(sql(`select json_agg(t) from (select i.id,i.key,i.status_id from items i join sprint_items m on m.item_id=i.id join statuses s on s.id=i.status_id where i.backlog_id='${b.id}' and m.sprint_id='${b.sprintId}' and m.left_at is null and i.deleted_at is null and i.type='tache' and s.category<>'done' order by i.rank collate "C",i.key limit ${2 * (requests + 1)}) t`));
  if (!tasks || tasks.length !== 2 * (requests + 1)) throw new Error("Not enough distinct active non-done tasks");
  const routerState = required("ROUTER_STATE"), password = required("PASSWORD"), cookies = new Map();
  const saveCookies = (headers) => { for (const c of headers.getSetCookie()) { const pair = c.split(";")[0], n = pair.indexOf("="); if (n > 0) cookies.set(pair.slice(0, n), pair.slice(n + 1)); } };
  const headers = () => ({ Origin: base.origin, Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") });
  const api = async (path, body) => {
    const r = await fetch(new URL(`/api/auth/${path}`, base), { method: body ? "POST" : "GET", headers: { ...headers(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual", signal: AbortSignal.timeout(120000) });
    saveCookies(r.headers); if (!r.ok) throw new Error(`Authentication failed: ${path} HTTP ${r.status}`); return r.json();
  };
  const signedIn = await api("sign-in/email", { email: required("EMAIL"), password }); let secret = env.PROBE_TOTP_SECRET;
  if (!signedIn.twoFactorRedirect && signedIn.user?.twoFactorEnabled !== true) secret = new URL((await api("two-factor/enable", { password })).totpURI).searchParams.get("secret");
  if (!secret) throw new Error("Use a fresh contributor or supply PROBE_TOTP_SECRET");
  await api("two-factor/verify-totp", { code: totp(secret) }); const session = await api("get-session");
  if (session?.user?.role !== "contributor" || session.user.twoFactorEnabled !== true) throw new Error("An enrolled contributor is required");
  const read = async (operation, input) => {
    const request = buildActionRequest(base, backlog, ids[operation], input, routerState), started = performance.now();
    const r = await fetch(request.url, { method: request.method, headers: { ...request.headers, ...headers() }, body: request.body, redirect: "manual", signal: AbortSignal.timeout(120000) });
    const body = Buffer.from(await r.arrayBuffer()), fullMs = performance.now() - started; saveCookies(r.headers);
    if (!r.ok || !r.headers.get("content-type")?.startsWith("text/x-component")) throw new Error(`${operation}: invalid HTTP action response ${r.status}`);
    const item = validateAction(body, { backlogId: b.id, statusId: input.statusId, ...(input.id ? { id: input.id } : {}) });
    if (!/^[a-f0-9-]{36}$/.test(item.id)) throw new Error("Invalid returned item UUID");
    return { bytes: body.length, fullMs, itemId: item.id, key: item.key, contentEncoding: r.headers.get("content-encoding") };
  };
  const date = new Date().toISOString(), commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), results = [], createdIds = new Set();
  for (const [opIndex, operation] of ["createItemAction", "updateItemAction", "moveItemAction"].entries()) {
    const samples = [];
    let moveBeforeId = opIndex === 2 ? sql(`select i.id from items i join sprint_items m on m.item_id=i.id where i.backlog_id='${b.id}' and m.sprint_id='${b.sprintId}' and m.left_at is null and i.status_id='${done}' and i.deleted_at is null and i.type='tache' order by i.rank collate "C" desc,i.key desc limit 1`) : null;
    for (let i = -1; i < requests; i++) {
      const task = tasks[(opIndex === 2 ? requests + 1 : 0) + i + 1];
      const input = opIndex === 0 ? { backlogKey: backlog, backlogId: b.id, type: "tache", parentId: b.epicId, title: `Probe ${randomUUID()}`, statusId: states.find((s) => s.category === "todo").id, sprintId: b.sprintId } : opIndex === 2 ? buildMoveInput(backlog, task, done, moveBeforeId) : { backlogKey: backlog, id: task.id, statusId: done };
      const id = `probe_${randomUUID().replaceAll("-", "")}`, before = `${id}_before`, after = `${id}_after`;
      if (i >= 0) sql(`select '${before}'`, true);
      const sample = await read(operation, input);
      if (i >= 0) {
        sql(`select '${after}'`, true); let log = "";
        for (let a = 0; a < 20; a++) { log = docker(["logs", "--tail", "20000", container]); if (log.includes(after)) break; await sleep(50); }
        sample.sql = countSql(log, before, after, role, database);
        if (sample.sql === 0) throw new Error("No runtime SQL between markers");
      }
      // Owner-only postcondition outside markers: reject unchanged/incorrect writes, not just HTTP 200.
      const stored = JSON.parse(sql(`select row_to_json(t) from (select id,status_id,rank from items where id='${sample.itemId}') t`));
      if (stored?.status_id !== input.statusId || (opIndex === 0 && createdIds.has(sample.itemId))) throw new Error("Action did not persist a distinct successful mutation");
      if (opIndex === 0) createdIds.add(sample.itemId);
      if (opIndex === 2) moveBeforeId = sample.itemId;
      if (i >= 0) samples.push(sample);
    }
    const summarize = (f) => { const ns = samples.map((s) => s[f]); return { p50: percentile(ns, .5), p95: percentile(ns, .95), min: Math.min(...ns), max: Math.max(...ns) }; };
    results.push({ operation, bytes: summarize("bytes"), fullMs: summarize("fullMs"), sql: summarize("sql"), samples });
  }
  const report = { date, commit, requests, warmupsPerOperation: 1, mode: "serial-actions", actionIds: ids, results };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); process.stderr.write(`${formatTable(report)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(`Probe failed: ${e.message}`); process.exitCode = 1; });

export function buildMoveInput(backlogKey, task, statusId, beforeId) {
  if (!beforeId || beforeId === task.id) throw new Error("A real destination neighbor is required");
  return { backlogKey, id: task.id, statusId, beforeId, afterId: null };
}
