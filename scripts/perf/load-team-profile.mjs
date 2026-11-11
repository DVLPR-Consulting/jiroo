// HTTP workload only. Provisioning and cleanup live in run-team-profile.mjs.
import { setTimeout as sleep } from "node:timers/promises";
import { percentile } from "./probe-views.mjs";

export const OPERATIONS = ["Backlog", "List", "Board", "Tree", "Roadmap", "Reports", "My items", "Search", "Panel", "Create", "Status", "Move"];

export function routerState(key) {
  // Same Next 16.4.1 tree captured for probe-actions; no skip-render/prefetch flag.
  const page = ["__PAGE__", {}, null, null, 0];
  const segment = [["key", key, "d", null], { children: page }, null, null, 4];
  const b = ["b", { children: segment }, null, null, 8];
  const app = ["(app)", { children: b }, null, null, 12];
  return encodeURIComponent(JSON.stringify(["", { children: app }, null, null, 24]));
}

export function readOperation(profile, client, turn) {
  const operation = OPERATIONS[(client + turn) % OPERATIONS.length];
  const backlog = profile.backlogs[(client + Math.floor(turn / OPERATIONS.length)) % 5];
  const writer = backlog.writers[client], prefix = `/b/${backlog.key}`;
  const paths = { Backlog: `${prefix}?view=backlog`, List: `${prefix}?view=list`, Board: `${prefix}?view=board`, Tree: `${prefix}?view=tree`,
    Roadmap: `${prefix}/roadmap`, Reports: `${prefix}/reports?sprint=${backlog.sprintId}`, "My items": "/mine", Panel: `/api/backlogs/${backlog.key}/items/${writer.key}` };
  return { operation, backlog, writer, path: paths[operation] };
}

export async function runClients({ clients = 10, durationMs = 180000, thinkMs = 300, perform, signal, now = () => performance.now(), pause = sleep }) {
  const samples = [], errors = [], started = now();
  await Promise.all(Array.from({ length: clients }, async (_, client) => {
    for (let turn = 0; now() - started < durationMs && !signal?.aborted; turn++) {
      try { samples.push({ ...await perform(client, turn), client, turn }); }
      catch (error) { errors.push({ client, turn, message: error.message }); }
      await pause(thinkMs);
    }
  }));
  return { samples, errors, elapsedMs: now() - started };
}

// A writer is sequential; PostgreSQL delivers its NOTIFYs in commit order.
export function recordDelivery(queue, stream, arrived) {
  const mutation = queue?.find((m) => !m.received.has(stream));
  if (!mutation) return null;
  mutation.received.add(stream);
  return arrived - mutation.started;
}

export function summarize(values) {
  return values.length ? { min: Math.min(...values), p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), max: Math.max(...values) } : null;
}

export function summarizeLoad(report) {
  return { successes: report.samples.length, requestsPerSecond: report.samples.length * 1000 / report.elapsedMs,
    results: OPERATIONS.map((operation) => {
      const samples = report.samples.filter((s) => s.operation === operation), thresholdMs = ["Search", "Create", "Status", "Move"].includes(operation) ? 300 : 500;
      const fullMs = summarize(samples.map((s) => s.fullMs));
      return { operation, samples: samples.length, fullMs, ttfbMs: summarize(samples.map((s) => s.ttfbMs)), bytes: summarize(samples.map((s) => s.bytes)), thresholdMs, passes: fullMs !== null && fullMs.p95 <= thresholdMs };
    }) };
}

export async function measureRequest(url, options) {
  const started = performance.now();
  const response = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(120000) });
  const ttfbMs = performance.now() - started;
  const body = Buffer.from(await response.arrayBuffer()), fullMs = performance.now() - started;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { fullMs, ttfbMs, bytes: body.length, body, response };
}

// Preparation only: Better Auth uses X-Retry-After. Never retry measured requests.
export async function authRequest(url, options, pause = sleep) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 429) return response;
    const seconds = Number(response.headers.get("X-Retry-After") ?? response.headers.get("Retry-After") ?? 11);
    await response.arrayBuffer();
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120) throw new Error("Invalid auth retry delay");
    await pause(Math.max(1, seconds) * 1000);
  }
  throw new Error("Authentication rate limit did not clear");
}

export function validateRead(operation, contentType, body, marker) {
  if (!contentType?.startsWith("text/html") || !body.includes("<html") || !body.includes(marker) || /:E\\?\{/.test(body)) throw new Error(`${operation}: invalid or failed streamed page`);
}

export async function watchEvents(stream, onEvent) {
  const reader = stream.getReader(), decoder = new TextDecoder(); let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("Realtime stream ended before workload completion");
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (data) onEvent(JSON.parse(data));
      }
    }
  } finally { reader.releaseLock(); }
}
