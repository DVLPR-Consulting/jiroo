// Discover the browser's first continuation without executing it. Replay stays in
// the serial probe so HTML and continuation bytes/timings have the same boundary.
import { readActionResult } from "./probe-actions.mjs";

export function windowConfig(env) {
  const mode = env.PROBE_MODE ?? "serial";
  if (mode === "serial") return null;
  if (mode !== "window") throw new Error("PROBE_MODE must be serial or window");
  const view = env.PROBE_WINDOW_VIEW ?? "list", query = env.PROBE_WINDOW_QUERY ?? "";
  if (!["list", "backlog", "tree"].includes(view)) throw new Error("Unsupported window view");
  const params = new URLSearchParams(query);
  if (params.has("view")) throw new Error("Set PROBE_WINDOW_VIEW instead of a view query parameter");
  // Unfiltered Tree's initial roots are not a first page of siblings (D5).
  if (view === "tree" && !params.get("q")?.trim()) throw new Error("Tree measurement requires a q filter (matching windows with ancestors)");
  return { view, query, actionName: env.PROBE_WINDOW_ACTION ?? "loadViewWindowAction" };
}

export function windowActionIds(manifest, name) {
  const ids = Object.entries(manifest.node ?? {}).filter(([, entry]) => entry.exportedName === name && entry.workers?.["app/(app)/b/[key]/page"]).map(([id]) => id);
  if (ids.length !== 1 || !/^[a-f0-9]{42}$/.test(ids[0])) throw new Error(`Missing or ambiguous read action ${name}; use serial mode until the view windows are delivered`);
  return ids;
}

export function validateWindowResponse(text) {
  const result = readActionResult(text);
  if (result?.ok !== true || Object.keys(result).length < 2) throw new Error("Window action did not return a successful window");
}

export async function discoverWindowRequest({ url, cookies, actionIds, timeout = 15000 }) {
  const target = new URL(url);
  if (target.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) throw new Error("Window discovery requires a local HTTP server");
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  let timer;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "block" });
    await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: target.origin })));
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    let resolveRequest, rejectRequest;
    const captured = new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; });
    // Attach a handler immediately: an automatic sentinel can fire during goto.
    captured.catch(() => {});
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (new URL(request.url()).origin !== target.origin || new URL(request.url()).pathname === "/api/realtime") return route.abort();
      if (request.method() !== "GET") {
        const headers = request.headers();
        if (request.method() !== "POST" || !actionIds.includes(headers["next-action"])) rejectRequest(new Error("Unexpected action during window discovery; no POST was executed"));
        else {
          const allowed = ["accept", "content-type", "next-action", "next-router-state-tree", "next-url"];
          resolveRequest({ url: request.url(), method: "POST", body: request.postData(), headers: Object.fromEntries(allowed.filter((key) => headers[key]).map((key) => [key, headers[key]])) });
        }
        return route.abort(); // Every POST, including the read action, is blocked.
      }
      // Only the document and static resources are needed to discover the cursor.
      // Block prefetches, session/facet reads and other background API requests.
      if (request.resourceType() !== "document" && !new URL(request.url()).pathname.startsWith("/_next/")) return route.abort();
      return route.continue();
    });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    if (!response?.ok() || page.url() !== url) throw new Error("Window discovery did not reach the authenticated view");
    // Captures automatic loading, or uses the documented fallback if the sentinel
    // is below the fold. Never clicks an arbitrary control or a mutation button.
    return await Promise.race([
      captured,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Window discovery timed out waiting for a continuation")), timeout); }),
      page.getByRole("button", { name: "Charger la suite", exact: true }).first().click({ timeout }).then(() => captured),
    ]);
  } finally { clearTimeout(timer); await browser.close(); }
}
