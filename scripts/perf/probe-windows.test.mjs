// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { windowConfig, discoverWindowRequest, validateWindowResponse } from "./probe-windows.mjs";

const action = "a".repeat(42);
describe("window probe", () => {
  it("is opt-in and rejects unsupported views and unfiltered trees", () => {
    expect(windowConfig({})).toBeNull();
    expect(windowConfig({ PROBE_MODE: "serial" })).toBeNull();
    expect(windowConfig({ PROBE_MODE: "window" })).toEqual({ view: "list", query: "", actionName: "loadViewWindowAction" });
    expect(() => windowConfig({ PROBE_MODE: "typo" })).toThrow(/mode/i);
    expect(() => windowConfig({ PROBE_MODE: "window", PROBE_WINDOW_VIEW: "board" })).toThrow(/view/i);
    expect(() => windowConfig({ PROBE_MODE: "window", PROBE_WINDOW_VIEW: "tree" })).toThrow(/filter/i);
    expect(windowConfig({ PROBE_MODE: "window", PROBE_WINDOW_VIEW: "tree", PROBE_WINDOW_QUERY: "q=dossier" }).query).toBe("q=dossier");
    expect(() => windowConfig({ PROBE_MODE: "window", PROBE_WINDOW_QUERY: "view=board" })).toThrow(/view/i);
  });
  it("rejects HTTP-200 Flight failures instead of recording them as successful windows", () => {
    expect(() => validateWindowResponse('0:{"a":"$@1"}\n1:{"ok":true,"window":{"items":[{"id":"x"}]}}\n')).not.toThrow();
    expect(() => validateWindowResponse('0:{"a":"$@1"}\n1:{"ok":false,"error":"forbidden"}\n')).toThrow(/window/i);
    expect(() => validateWindowResponse('<html>login</html>')).toThrow();
  });
});

describe.skipIf(process.env.JIROO_RUN_BROWSER_PROBE_TESTS !== "1")("browser discovery against a real local page", () => {
  let server, base, posts, sideReads;
  beforeAll(async () => {
    posts = []; sideReads = [];
    server = createServer((req, res) => {
      if (req.url === "/api/side-read") sideReads.push(req.url);
      if (req.method === "POST") { posts.push(req.url); res.end("unexpected POST"); return; }
      res.setHeader("Content-Type", "text/html");
      const request = req.url.includes("inert") ? "void 0" : `fetch(location.href,{method:'POST',headers:{'Next-Action':'${action}','Next-Router-State-Tree':'%5B%22%22%5D','Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify([{cursor:'first-100',view:'list'}])})`;
      res.end(`<button onclick="${request}">Charger la suite</button>${req.url.includes("auto") ? `<script>fetch("/api/side-read"); ${request}</script>` : ""}`);
    }).listen(0, "127.0.0.1");
    await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => { await new Promise((done) => server.close(done)); });
  it.each(["button", "auto"])("captures %s loading without executing the action", async (kind) => {
    const request = await discoverWindowRequest({ url: `${base}/b/PERFA?${kind}`, cookies: [], actionIds: [action], timeout: 5000 });
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toEqual([{ cursor: "first-100", view: "list" }]);
    expect(request.headers["next-action"]).toBe(action);
    expect(posts).toEqual([]);
    expect(sideReads).toEqual([]);
  }, 15000);
  it("times out when the fallback button does not load a window", async () => {
    await expect(discoverWindowRequest({ url: `${base}/b/PERFA?inert`, cookies: [], actionIds: [action], timeout: 1500 })).rejects.toThrow(/timed out/i);
  }, 10000);
  it("fails clearly when the page calls an unexpected action", async () => {
    await expect(discoverWindowRequest({ url: `${base}/b/PERFA?auto`, cookies: [], actionIds: ["b".repeat(42)], timeout: 3000 })).rejects.toThrow(/unexpected action/i);
    expect(posts).toEqual([]);
    expect(sideReads).toEqual([]);
  }, 15000);
});

it("resolves the read action from the actual page worker and rejects missing or ambiguous manifests", async () => {
  const { windowActionIds } = await import("./probe-windows.mjs");
  const entry = { exportedName: "loadViewWindowAction", workers: { "app/(app)/b/[key]/page": {} } };
  expect(windowActionIds({ node: { [action]: entry } }, "loadViewWindowAction")).toEqual([action]);
  expect(() => windowActionIds({ node: {} }, "loadViewWindowAction")).toThrow(/serial mode/i);
  expect(() => windowActionIds({ node: { [action]: entry, ["b".repeat(42)]: entry } }, "loadViewWindowAction")).toThrow(/ambiguous/i);
});
