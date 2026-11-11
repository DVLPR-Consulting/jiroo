// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { runClients, summarizeLoad, readOperation, routerState, watchEvents, measureRequest, validateRead, authRequest, recordDelivery } from "./load-team-profile.mjs";
import { readActionResult } from "./probe-actions.mjs";

describe("team load driver", () => {
  it("correlates delayed SSE deliveries in writer order, once per mutation and subscriber", () => {
    const first = { started: 10, received: new Set() }, second = { started: 20, received: new Set() };
    const queue = [first, second];
    expect(recordDelivery(queue, 0, 30)).toBe(20);
    expect(recordDelivery(queue, 5, 31)).toBe(21);
    expect(recordDelivery(queue, 0, 40)).toBe(20);
    expect(recordDelivery(queue, 5, 41)).toBe(21);
    expect(recordDelivery(queue, 5, 42)).toBeNull();
    expect(first.received.size).toBe(2); expect(second.received.size).toBe(2);
  });
  it("waits for the public authentication rate limit without retrying other failures", async () => {
    let calls = 0; const pauses = [];
    const server = createServer((_req, res) => {
      calls++;
      res.writeHead(calls === 1 ? 429 : 401, { "X-Retry-After": "10" }); res.end("denied");
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const response = await authRequest(`http://127.0.0.1:${server.address().port}`, {}, async (ms) => { pauses.push(ms); });
      expect(response.status).toBe(401); expect(calls).toBe(2); expect(pauses).toEqual([10000]);
    } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  });
  it("keeps each client closed-loop, pauses after failures too, and drains in-flight operations", async () => {
    let now = 0, active = 0, peak = 0;
    const seen = [];
    const report = await runClients({ clients: 10, durationMs: 1, thinkMs: 300,
      now: () => now,
      pause: async (ms) => { expect(ms).toBe(300); now += ms; },
      perform: async (client, turn) => {
        seen.push([client, turn]); peak = Math.max(peak, ++active);
        await Promise.resolve(); active--;
        if (client === 2) throw new Error("fixture denied");
        return { operation: "List", fullMs: 10, ttfbMs: 2, bytes: 100 };
      } });
    expect(peak).toBe(10);
    expect(active).toBe(0);
    expect(seen).toEqual(Array.from({ length: 10 }, (_, i) => [i, 0]));
    expect(report.samples).toHaveLength(9);
    expect(report.errors).toEqual([{ client: 2, turn: 0, message: "fixture denied" }]);
    expect(report.elapsedMs).toBe(3000);
  });

  it("covers twelve operations and all five backlogs per client without sharing writer slots", () => {
    const profile = { backlogs: Array.from({ length: 5 }, (_, i) => ({ key: `PERF${i}`, sprintId: `s${i}`, writers: Array.from({ length: 10 }, (_, c) => ({ key: `I${i}-${c}` })) })) };
    const names = new Set();
    for (let c = 0; c < 10; c++) {
      const backlogs = new Set();
      for (let turn = 0; turn < 60; turn++) {
        const op = readOperation(profile, c, turn);
        names.add(op.operation); backlogs.add(op.backlog.key);
        expect(op.writer.key).toBe(`I${op.backlog.key.slice(4)}-${c}`);
      }
      expect(backlogs.size).toBe(5);
    }
    expect([...names].sort()).toEqual(["Backlog", "List", "Board", "Tree", "Roadmap", "Reports", "My items", "Search", "Panel", "Create", "Status", "Move"].sort());
    expect(readOperation(profile, 0, 5).path).toBe("/b/PERF0/reports?sprint=s0");
    expect(readOperation(profile, 0, 6).path).toBe("/mine");
    expect(JSON.parse(decodeURIComponent(routerState("PERFA")))[1].children[1].children[1].children[0]).toEqual(["key", "PERFA", "d", null]);
  });

  it("reports nearest-rank full-body tails and errors separately; absent operations cannot pass", () => {
    const report = summarizeLoad({ elapsedMs: 1000, errors: [{ client: 1 }], samples: [
      { operation: "List", fullMs: 1, ttfbMs: 1, bytes: 1048576 },
      { operation: "List", fullMs: 600, ttfbMs: 5, bytes: 2097152 },
      { operation: "Status", fullMs: 301, ttfbMs: 2, bytes: 100 },
    ] });
    expect(report.successes).toBe(3); expect(report.requestsPerSecond).toBe(3);
    expect(report.results.find((r) => r.operation === "List")).toMatchObject({ samples: 2, fullMs: { p50: 1, p95: 600, p99: 600 }, ttfbMs: { p95: 5 }, thresholdMs: 500, passes: false });
    expect(report.results.find((r) => r.operation === "Status")).toMatchObject({ thresholdMs: 300, passes: false });
    expect(report.results.find((r) => r.operation === "Search")).toMatchObject({ samples: 0, fullMs: null, passes: false });
  });

  it("parses a search result addressed by the Flight root, ignoring unrelated successes", () => {
    expect(readActionResult('0:{"a":"$@2","f":[]}\n1:{"ok":false}\n2:{"ok":true,"results":[{"key":"PERFA-1"}]}\n')).toEqual({ ok: true, results: [{ key: "PERFA-1" }] });
    expect(() => readActionResult('0:{"a":"$@2"}\n2:E{"digest":"fail"}\n')).toThrow(/action/i);
  });

  it("does not accept a login shell or a streamed server failure as a measured page", () => {
    expect(() => validateRead("List", "text/html", '<html>login</html>', "PERFA")).toThrow(/page/i);
    expect(() => validateRead("List", "text/html", '<html>PERFA 2:E{"digest":"oops"}</html>', "PERFA")).toThrow(/page/i);
    expect(() => validateRead("List", "application/json", '<html>PERFA</html>', "PERFA")).toThrow(/page/i);
    expect(() => validateRead("List", "text/html", '<html>PERFA</html>', "PERFA")).not.toThrow();
  });

  it("times body completion separately from headers and rejects HTTP redirects", async () => {
    const server = createServer((req, res) => {
      if (req.url === "/redirect") { res.writeHead(302, { Location: "/login" }); res.end(); return; }
      res.writeHead(200, { "Content-Type": "text/html" }); res.flushHeaders();
      setTimeout(() => res.end("<html>PERFA</html>"), 40);
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const sample = await measureRequest(`${base}/`, {});
      expect(sample.fullMs - sample.ttfbMs).toBeGreaterThan(20);
      expect(sample.bytes).toBe(18);
      await expect(measureRequest(`${base}/redirect`, {})).rejects.toThrow(/302/);
    } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  });

  it("decodes split SSE frames and reports a stream ending after ready", async () => {
    const encoder = new TextEncoder(), events = [];
    const stream = new ReadableStream({ start(controller) {
      for (const part of ['retry: 3000\n\ndata: {"kind":"rea', 'dy","self":false}\n\n: ping\n\ndata: {"kind":"item",', '"itemIds":["a"],"self":true}\n\n']) controller.enqueue(encoder.encode(part));
      controller.close();
    } });
    await expect(watchEvents(stream, (event) => events.push(event))).rejects.toThrow(/ended/i);
    expect(events).toEqual([{ kind: "ready", self: false }, { kind: "item", itemIds: ["a"], self: true }]);
  });
});
