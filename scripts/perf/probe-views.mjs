#!/usr/bin/env node
// Serial local probe. Window discovery optionally uses Chromium; measurement uses Node HTTP.
// Configure PROBE_BASE_URL, BACKLOG, ITEM, EMAIL, PASSWORD, REQUESTS (all PROBE_ prefixed),
// plus PROBE_PG_CONTAINER, DATABASE, OWNER and ROLE. See docs/perf/2026-11-jir-120-windows.md.
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

export function percentile(samples, p) {
  if (!samples.length || samples.some((n) => !Number.isFinite(n)) || p < 0 || p > 1) throw new Error("Invalid percentile samples");
  return [...samples].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * samples.length) - 1)];
}

export function formatTable(report) {
  return [
    `Date: ${report.date}; commit: ${report.commit}; requests per operation: ${report.requests} (one warm-up excluded).`, "",
    "| Operation | Decoded bytes (p50) | MiB | Full p50 ms | Full p95 ms | Full max ms | SQL p50 [min–max] |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.results.map((r) => `| ${r.operation} | ${r.bytes.p50} | ${(r.bytes.p50 / 1048576).toFixed(2)} | ${r.fullMs.p50.toFixed(2)} | ${r.fullMs.p95.toFixed(2)} | ${r.fullMs.max.toFixed(2)} | ${r.sql.p50} [${r.sql.min}–${r.sql.max}] |`),
  ].join("\n");
}

// RFC 6238, SHA-1, a 30-second step, six digits; secrets never leave memory.
export function totp(secret, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", bytes = [];
  let bits = 0, value = 0;
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 TOTP secret");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(counter).digest(), offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

// The prefix is "%m [%p] %u@%d "; completed simple/extended queries count once.
export function countSql(log, before, after, role, database) {
  const start = log.indexOf(before), end = log.indexOf(after);
  if (start < 0 || end <= start) throw new Error("SQL log marker missing or out of order");
  return log.slice(start + before.length, end).split("\n").filter((line) =>
    line.includes(` ${role}@${database} `) && /LOG:\s+duration:\s+[\d.]+\s+ms\s+(?:statement:|execute\s+[^:]+:)/.test(line),
  ).length;
}

export function validatePanel(text, itemKey) {
  const data = JSON.parse(text);
  if (data?.kind !== "item" || !data.panel?.detail?.id || data.panel.detail.key !== itemKey) throw new Error("Panel response has no matching detail");
}

async function main() {
  const { windowConfig, windowActionIds, discoverWindowRequest, validateWindowResponse } = await import("./probe-windows.mjs");
  const { validateRead } = await import("./load-team-profile.mjs");
  const windows = windowConfig(process.env);
  const env = process.env, required = (name) => {
    const value = env[`PROBE_${name}`]; if (!value) throw new Error(`Set PROBE_${name}`); return value;
  };
  const base = new URL(required("BASE_URL"));
  if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || base.username || base.password) throw new Error("Use an explicit local HTTP server");
  const backlog = required("BACKLOG"), item = required("ITEM"), email = required("EMAIL"), password = required("PASSWORD");
  const requests = Number(env.PROBE_REQUESTS ?? 20);
  if (!Number.isSafeInteger(requests) || requests < 1) throw new Error("PROBE_REQUESTS must be a positive integer");
  const container = required("PG_CONTAINER"), database = required("PG_DATABASE"), owner = required("PG_OWNER"), role = required("PG_ROLE");
  if (!container.startsWith("jiroo-") || !/^jir41_perf_[a-f0-9]{12}$/.test(database)) throw new Error("Use the owned disposable team-profile PostgreSQL container/database");
  const docker = (args) => {
    const r = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 30000 });
    if (r.error || r.status !== 0) throw new Error("Docker/psql failed; check the owned container and log setup");
    return r.stdout + r.stderr;
  };
  const mark = (id) => docker(["exec", "-e", "PGOPTIONS=-c log_min_duration_statement=0", container, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", owner, "-d", database, "-c", `SELECT '${id}'`]);
  const cookies = new Map();
  const saveCookies = (headers) => {
    for (const cookie of headers.getSetCookie()) {
      const pair = cookie.split(";")[0], equals = pair.indexOf("=");
      if (equals > 0) cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
  };
  const headers = () => ({ Origin: base.origin, Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") });
  const api = async (path, body) => {
    const response = await fetch(new URL(`/api/auth/${path}`, base), {
      method: body ? "POST" : "GET", headers: { ...headers(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, redirect: "manual", signal: AbortSignal.timeout(120000),
    });
    saveCookies(response.headers);
    if (!response.ok) throw new Error(`Authentication failed: ${path} HTTP ${response.status}`);
    return response.json();
  };
  const signedIn = await api("sign-in/email", { email, password });
  let secret = env.PROBE_TOTP_SECRET;
  if (!signedIn.twoFactorRedirect && signedIn.user?.twoFactorEnabled !== true) {
    const enabled = await api("two-factor/enable", { password });
    secret = new URL(enabled.totpURI).searchParams.get("secret");
  }
  if (!secret) throw new Error("Already enrolled: provide PROBE_TOTP_SECRET or use a fresh seed contributor");
  await api("two-factor/verify-totp", { code: totp(secret) });
  const session = await api("get-session");
  if (session?.user?.role !== "contributor" || session.user.twoFactorEnabled !== true) throw new Error("The probe requires an enrolled contributor account");
  let operations = [
    ["List", `/b/${encodeURIComponent(backlog)}?view=list`],
    ["Backlog", `/b/${encodeURIComponent(backlog)}?view=backlog`],
    ["Tree", `/b/${encodeURIComponent(backlog)}?view=tree`],
    ["Board", `/b/${encodeURIComponent(backlog)}?view=board`],
    ["Panel", `/api/backlogs/${encodeURIComponent(backlog)}/items/${encodeURIComponent(item)}`],
  ];
  if (windows) {
    const params = new URLSearchParams(windows.query); params.set("view", windows.view);
    const path = `/b/${encodeURIComponent(backlog)}?${params}`;
    const manifest = JSON.parse(readFileSync(new URL("../../.next/server/server-reference-manifest.json", import.meta.url), "utf8"));
    const request = await discoverWindowRequest({ url: new URL(path, base).href,
      cookies: [...cookies].map(([name, value]) => ({ name, value })), actionIds: windowActionIds(manifest, windows.actionName) });
    operations = [[`${windows.view} first`, path], [`${windows.view} next`, request]];
  }
  const read = async (operation, path) => {
    const started = performance.now();
    const request = typeof path === "string" ? { url: new URL(path, base).href } : path;
    const response = await fetch(request.url, { ...request, headers: { ...request.headers, ...headers() }, redirect: "manual", signal: AbortSignal.timeout(120000) });
    const body = Buffer.from(await response.arrayBuffer()), fullMs = performance.now() - started;
    saveCookies(response.headers);
    if (!response.ok) throw new Error(`${operation}: HTTP ${response.status}, not a measured success`);
    if (operation === "Panel") validatePanel(body.toString(), item);
    else if (operation.endsWith(" next")) {
      if (!response.headers.get("content-type")?.startsWith("text/x-component")) throw new Error("Window continuation is not Flight");
      validateWindowResponse(body);
    } else validateRead(operation, response.headers.get("content-type"), body.toString(), backlog);
    return { bytes: body.length, fullMs, contentEncoding: response.headers.get("content-encoding") };
  };
  const results = [], date = new Date().toISOString();
  const commit = execFileSync("git", ["-C", fileURLToPath(new URL("../../", import.meta.url)), "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const collected = new Map(operations.map(([operation]) => [operation, []]));
  // Pair the initial response with its continuation on every repetition, including
  // the excluded warm-up. Discovery and hydration are outside all SQL markers.
  for (const group of windows ? [operations] : operations.map((operation) => [operation])) {
    for (let i = -1; i < requests; i++) {
      for (const [operation, path] of group) {
        const id = `probe_${randomUUID().replaceAll("-", "")}`, before = `${id}_before`, after = `${id}_after`;
        if (i >= 0) mark(before);
        const sample = await read(operation, path);
        if (i < 0) continue;
        mark(after);
        let log = "";
        for (let attempt = 0; attempt < 20; attempt++) {
          log = docker(["logs", "--tail", "20000", container]);
          if (log.includes(after)) break;
          await sleep(50);
        }
        sample.sql = countSql(log, before, after, role, database);
        if (sample.sql === 0) throw new Error("No runtime SQL found: check role, duration logging and log prefix");
        collected.get(operation).push(sample);
      }
    }
  }
  for (const [operation, path] of operations) {
    const samples = collected.get(operation);
    const summarize = (field) => ({ p50: percentile(samples.map((s) => s[field]), 0.5), p95: percentile(samples.map((s) => s[field]), 0.95), min: Math.min(...samples.map((s) => s[field])), max: Math.max(...samples.map((s) => s[field])) });
    const bytes = summarize("bytes");
    results.push({ operation, path: typeof path === "string" ? path : new URL(path.url).pathname + new URL(path.url).search, bytes, mib: (bytes.p50 / 1048576).toFixed(2), fullMs: summarize("fullMs"), sql: summarize("sql"), samples });
  }
  const report = { date, commit, requests, warmupsPerOperation: 1, mode: windows ? "window" : "serial", ...(windows ? { window: windows } : {}), results };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.stderr.write(`${formatTable(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`Probe failed: ${error.message}`); process.exitCode = 1; });
}
