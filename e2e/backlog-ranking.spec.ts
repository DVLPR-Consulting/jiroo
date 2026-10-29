import { performAction } from "./support/actions";
import { observePage } from "./support/capture";
import { expect, test } from "@playwright/test";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";

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

  observePage(page, {
    console: consoleLines,
    network: networkLines,
    onFault: ({ kind, line }) => {
      if (kind === "request") requestFailures.push(line);
      else if (kind === "http") httpErrors.push(line);
      else consoleErrors.push(line);
    },
  }, "admin");

  await page.goto("/b/CASS?view=backlog");
  await expect(page.getByRole("heading", { level: 1, name: "Backlog", exact: true })).toBeVisible();
  const handles = page.getByRole("button", { name: /^Déplacer CASS-/ });
  expect(await handles.count()).toBeGreaterThan(1);

  const rows = page.locator("[role=row][aria-label]");
  const initialOrder = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")),
  );
  const firstHandle = handles.first();
  const movedKey = (await firstHandle.getAttribute("aria-label"))?.replace(
    "Déplacer ",
    "",
  );
  if (!movedKey) throw new Error("Clé de tâche introuvable sur la poignée.");

  const neighbourIds = await handles.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-rank-handle")),
  );
  const [movedId, secondId, thirdId = null] = neighbourIds;
  if (!movedId || !secondId) throw new Error("Identifiants de classement introuvables.");
  const origin = await firstHandle.boundingBox();
  const destination = await handles.nth(1).boundingBox();
  if (!origin || !destination) throw new Error("Géométrie de classement introuvable.");
  const response = await performAction(page, (input) => input.id === movedId
    && input.beforeId === secondId && input.afterId === thirdId, async () => {
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
  });
  expect(response.status).toBeLessThan(400);
  networkLines.push(
    `[timing] POST rank ${response.elapsedMs}ms`,
  );

  await expect
    .poll(async () => rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))))
    .not.toEqual(initialOrder);
  const optimisticOrder = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")),
  );

  // The handle is disabled until the ranking action settles in the UI.
  await expect(page.getByRole("button", { name: `Déplacer ${movedKey}`, exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Backlog", exact: true })).toBeVisible();
  await expect
    .poll(async () => rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))))
    .toEqual(optimisticOrder);

  const restoredHandle = page.getByRole("button", { name: `Déplacer ${movedKey}`, exact: true });
  await restoredHandle.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("status").filter({ hasText: `${movedKey}, position 2` }),
  ).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("status").filter({ hasText: `${movedKey}, position 1` }),
  ).toBeVisible();
  const restored = await performAction(page, (input) => input.id === movedId
    && input.beforeId === null && input.afterId === secondId, () => page.keyboard.press("Space"));
  expect(restored.status).toBeLessThan(400);
  networkLines.push(`[timing] POST restore ${restored.elapsedMs}ms`);
  await expect(restoredHandle).toBeEnabled();
  await page.reload();
  await expect
    .poll(async () => rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))))
    .toEqual(initialOrder);

  // Exercise a reversible client interaction before taking the full-page
  // screenshot. This proves hydration is complete and avoids Playwright's
  // temporary caret-hiding style racing React hydration on the item inputs.
  const collapseSidebar = page.getByRole("button", {
    name: "Replier la barre latérale",
  });
  await collapseSidebar.click();
  const expandSidebar = page.getByRole("button", {
    name: "Déplier la barre latérale",
  });
  await expect(expandSidebar).toBeVisible();
  await expandSidebar.click();
  await expect(collapseSidebar).toBeVisible();

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

  await writeAuditText(CONSOLE_PATH, `${consoleLines.join("\n")}\n`);
  await writeAuditText(NETWORK_PATH, `${networkLines.join("\n")}\n`);
  await writeAuditScreenshot(
    SCREENSHOT_PATH,
    (path) => page.screenshot({ path, fullPage: true }),
  );

  expect(consoleErrors, "Erreurs JavaScript/console").toEqual([]);
  expect(requestFailures, "Requêtes réseau échouées").toEqual([]);
  expect(httpErrors, "Réponses HTTP en erreur").toEqual([]);
});
