import { mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const CONSOLE_PATH =
  "audit/console/2026-08-05-session-06-backlog-ranking-smoke-console.log";
const NETWORK_PATH =
  "audit/network/2026-08-05-session-06-backlog-ranking-smoke-requests.log";
const SCREENSHOT_PATH =
  "audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-backlog-ranked.png";

test("classe à la souris, restaure au clavier et conserve chaque ordre", async ({
  page,
}) => {
  const consoleLines: string[] = [];
  const consoleErrors: string[] = [];
  const networkLines: string[] = [];
  const requestFailures: string[] = [];
  const httpErrors: string[] = [];

  page.on("console", (message) => {
    const line = `[${message.type()}] ${message.text()}`;
    consoleLines.push(line);
    if (message.type() === "error") consoleErrors.push(line);
  });
  page.on("pageerror", (error) => {
    const line = `[pageerror] ${error.message}`;
    consoleLines.push(line);
    consoleErrors.push(line);
  });
  page.on("requestfailed", (request) => {
    const line = `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "échec inconnu"}`;
    networkLines.push(line);
    requestFailures.push(line);
  });
  page.on("response", (response) => {
    const request = response.request();
    const line = `${response.status()} ${request.method()} ${response.url()}`;
    networkLines.push(line);
    if (response.status() >= 400) httpErrors.push(line);
  });

  await page.goto("/b/CASS?view=backlog");
  await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
  const handles = page.getByRole("button", { name: /^Déplacer CASS-/ });
  expect(await handles.count()).toBeGreaterThan(1);

  const rows = page.locator("tr[aria-label]");
  const initialOrder = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")),
  );
  const firstHandle = handles.first();
  const movedKey = (await firstHandle.getAttribute("aria-label"))?.replace(
    "Déplacer ",
    "",
  );
  if (!movedKey) throw new Error("Clé de tâche introuvable sur la poignée.");

  const rankResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/b/CASS",
  );
  const origin = await firstHandle.boundingBox();
  const destination = await handles.nth(1).boundingBox();
  if (!origin || !destination) throw new Error("Géométrie de classement introuvable.");
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height, {
    steps: 3,
  });
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  const response = await rankResponse;
  expect(response.status()).toBeLessThan(400);
  await response.finished();
  networkLines.push(
    `[timing] POST ${response.url()} ${Math.round(response.request().timing().responseEnd)}ms`,
  );

  await expect
    .poll(async () => rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))))
    .not.toEqual(initialOrder);
  const optimisticOrder = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")),
  );

  await page.reload();
  await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
  await expect
    .poll(async () => rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))))
    .toEqual(optimisticOrder);

  const restoredHandle = page.getByRole("button", { name: `Déplacer ${movedKey}` });
  await restoredHandle.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("status").filter({ hasText: `${movedKey}, position 2` }),
  ).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("status").filter({ hasText: `${movedKey}, position 1` }),
  ).toBeVisible();
  const restoreResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/b/CASS",
  );
  await page.keyboard.press("Space");
  const restored = await restoreResponse;
  expect(restored.status()).toBeLessThan(400);
  await restored.finished();
  networkLines.push(
    `[timing] POST restore ${restored.url()} ${Math.round(restored.request().timing().responseEnd)}ms`,
  );
  await page.reload();
  await expect
    .poll(async () => rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))))
    .toEqual(initialOrder);

  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return entry
      ? {
          domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
          loadMs: Math.round(entry.loadEventEnd),
          responseStartMs: Math.round(entry.responseStart),
        }
      : null;
  });
  consoleLines.push(`[performance] ${JSON.stringify(navigation)}`);
  consoleLines.push(`[result] ${movedKey} persisted then restored after reload`);

  await mkdir("audit/console", { recursive: true });
  await mkdir("audit/network", { recursive: true });
  await mkdir("audit/screenshots", { recursive: true });
  await writeFile(CONSOLE_PATH, `${consoleLines.join("\n")}\n`, "utf8");
  await writeFile(NETWORK_PATH, `${networkLines.join("\n")}\n`, "utf8");
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

  expect(consoleErrors, "Erreurs JavaScript/console").toEqual([]);
  expect(requestFailures, "Requêtes réseau échouées").toEqual([]);
  expect(httpErrors, "Réponses HTTP en erreur").toEqual([]);
});
