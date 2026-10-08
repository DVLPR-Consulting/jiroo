import "dotenv/config";

import { expect, test, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { items } from "../lib/db/schema/domain";
import { updateItem } from "../lib/services/items";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";

const CONSOLE_PATH =
  "audit/console/2026-08-05-session-06-backlog-foundation-console.log";
const NETWORK_PATH =
  "audit/network/2026-08-05-session-06-backlog-foundation-requests.log";
const BULK_SCREENSHOT =
  "audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-bulk-edit.png";
const POINTS_SCREENSHOT =
  "audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-story-points.png";
const ESTIMATE_MENU_SCREENSHOT =
  "audit/screenshots/FIXED-BUG-JIR-018-estimate-menu-closes.png";
const FAILURE_CONSOLE_PATH =
  "audit/console/2026-08-05-session-06-backlog-foundation-failure-console.log";
const FAILURE_NETWORK_PATH =
  "audit/network/2026-08-05-session-06-backlog-foundation-failure-requests.log";

type AuditCapture = {
  consoleLines: string[];
  consoleErrors: string[];
  networkLines: string[];
  requestFailures: string[];
  httpErrors: string[];
};

function observe(page: Page): AuditCapture {
  const capture: AuditCapture = {
    consoleLines: [],
    consoleErrors: [],
    networkLines: [],
    requestFailures: [],
    httpErrors: [],
  };
  page.on("console", (message) => {
    const line = `[${message.type()}] ${message.text()}`;
    capture.consoleLines.push(line);
    if (message.type() === "error") capture.consoleErrors.push(line);
  });
  page.on("pageerror", (error) => {
    const line = `[pageerror] ${error.message}`;
    capture.consoleLines.push(line);
    capture.consoleErrors.push(line);
  });
  page.on("requestfailed", (request) => {
    const line = `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "échec inconnu"}`;
    capture.networkLines.push(line);
    capture.requestFailures.push(line);
  });
  page.on("response", (response) => {
    const line = `${response.status()} ${response.request().method()} ${response.url()}`;
    capture.networkLines.push(line);
    if (response.status() >= 400) capture.httpErrors.push(line);
  });
  return capture;
}

async function waitForBusinessPost(page: Page, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/b/CASS",
  );
  const startedAt = Date.now();
  await action();
  const response = await responsePromise;
  await response.finished();
  return {
    status: response.status(),
    elapsedMs: Date.now() - startedAt,
    url: response.url(),
  };
}

test("sélectionne une plage et applique les quatre actions groupées", async ({ page }) => {
  const capture = observe(page);
  await page.goto("/b/CASS?view=backlog");
  await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();

  const rowCheckboxes = page.getByRole("checkbox", { name: /^Sélectionner CASS-/ });
  expect(await rowCheckboxes.count()).toBeGreaterThan(1);
  const first = rowCheckboxes.nth(0);
  const second = rowCheckboxes.nth(1);
  const firstKey = (await first.getAttribute("aria-label"))?.replace("Sélectionner ", "");
  const secondKey = (await second.getAttribute("aria-label"))?.replace("Sélectionner ", "");
  if (!firstKey || !secondKey) throw new Error("Clés de sélection introuvables.");

  const originalRows = await db
    .select({
      id: items.id,
      key: items.key,
      statusId: items.statusId,
      priority: items.priority,
      assigneeId: items.assigneeId,
      estimatePoints: items.estimatePoints,
      closedAt: items.closedAt,
    })
    .from(items)
    .where(inArray(items.key, [firstKey, secondKey]));
  expect(originalRows).toHaveLength(2);
  const [auditActor] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  if (!auditActor) throw new Error("Compte d’audit Playwright introuvable.");

  try {
    await first.click();
    await second.click({ modifiers: ["Shift"] });
    await expect(page.getByText("2 items sélectionnés")).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Sélectionner toutes les tâches visibles" }),
    ).toHaveJSProperty("indeterminate", true);

    const timings: string[] = [];
    const priority = await waitForBusinessPost(page, async () => {
      await page.getByRole("button", { name: "Modifier la priorité" }).click();
      await page.getByRole("menuitem", { name: "Haute" }).click();
    });
    timings.push(`[timing] bulk priority ${priority.elapsedMs}ms`);
    expect(priority.status).toBeLessThan(400);
    await expect(
      page.getByRole("region", { name: "Actions groupées" }).getByText(/items? modifié/),
    ).toBeVisible();
    for (const key of [firstKey, secondKey]) {
      await expect(
        page.getByRole("row", { name: new RegExp(`^${key} —`) })
          .getByRole("button", { name: "Priorité : Haute" }),
      ).toBeVisible();
    }

    const status = await waitForBusinessPost(page, async () => {
      await page.getByRole("button", { name: "Modifier le statut" }).click();
      await page.getByRole("menuitem", { name: "En cours" }).click();
    });
    timings.push(`[timing] bulk status ${status.elapsedMs}ms`);
    expect(status.status).toBeLessThan(400);
    for (const key of [firstKey, secondKey]) {
      await expect(page.getByRole("row", { name: new RegExp(`^${key} —`) })).toContainText("En cours");
    }

    const assignee = await waitForBusinessPost(page, async () => {
      await page.getByRole("button", { name: "Modifier l’assigné" }).click();
      await page.getByRole("menuitem", { name: "Administrateur E2E", exact: true }).click();
    });
    timings.push(`[timing] bulk assignee ${assignee.elapsedMs}ms`);
    expect(assignee.status).toBeLessThan(400);
    for (const key of [firstKey, secondKey]) {
      await expect(
        page.getByRole("row", { name: new RegExp(`^${key} —`) })
          .getByRole("button", { name: "Assigné : Administrateur E2E" }),
      ).toBeVisible();
    }

    await page.getByRole("spinbutton", { name: "Estimation groupée" }).fill("5");
    const estimate = await waitForBusinessPost(page, async () => {
      await page.getByRole("button", { name: "Appliquer l’estimation" }).click();
    });
    timings.push(`[timing] bulk estimate ${estimate.elapsedMs}ms`);
    expect(estimate.status).toBeLessThan(400);
    for (const key of [firstKey, secondKey]) {
      await expect(
        page.getByRole("row", { name: new RegExp(`^${key} —`) }).getByRole("button", {
          name: "Estimation : 5 pts",
        }),
      ).toBeVisible();
    }

    capture.networkLines.push(...timings);
    capture.consoleLines.push(`[result] plage ${firstKey} → ${secondKey}, 4 mutations bulk persistées`);
    await writeAuditScreenshot(BULK_SCREENSHOT, (path) => page.screenshot({ path, fullPage: true }));
    await writeAuditScreenshot(POINTS_SCREENSHOT, (path) => page.screenshot({ path, fullPage: true }));
  } finally {
    for (const row of originalRows) {
      await updateItem(
        {
          id: row.id,
          statusId: row.statusId,
          priority: row.priority,
          assigneeId: row.assigneeId,
          estimatePoints: row.estimatePoints,
        },
        auditActor.id,
      );
    }
  }

  await page.reload();
  await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
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
  capture.consoleLines.push(`[performance] ${JSON.stringify(navigation)}`);

  await writeAuditText(CONSOLE_PATH, `${capture.consoleLines.join("\n")}\n`);
  await writeAuditText(NETWORK_PATH, `${capture.networkLines.join("\n")}\n`);

  expect(capture.consoleErrors, "Erreurs JavaScript/console").toEqual([]);
  expect(capture.requestFailures, "Requêtes réseau échouées").toEqual([]);
  expect(capture.httpErrors, "Réponses HTTP en erreur").toEqual([]);
});

test("le lecteur ne reçoit aucun contrôle de planification", async ({ browser }) => {
  const context = await browser.newContext({
    storageState: ".playwright/.auth/reader.json",
  });
  const page = await context.newPage();
  const capture = observe(page);
  await page.goto("/b/CASS?view=backlog");
  await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: /^Déplacer CASS-/ })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Actions groupées" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Estimation :/ })).toHaveCount(0);

  expect(capture.consoleErrors, "Erreurs JavaScript/console lecteur").toEqual([]);
  expect(capture.requestFailures, "Requêtes réseau échouées lecteur").toEqual([]);
  expect(capture.httpErrors, "Réponses HTTP en erreur lecteur").toEqual([]);
  await context.close();
});

test("distingue 5, zéro et non estimé puis restaure la valeur", async ({ page }) => {
  const capture = observe(page);
  await page.goto("/b/CASS?view=backlog");
  const estimateButtons = page.getByRole("button", { name: /^Estimation :/ });
  await expect(estimateButtons.first()).toBeVisible();
  const firstButton = estimateButtons.first();
  const row = firstButton.locator("xpath=ancestor::*[@role='row'][1]");
  const rowLabel = await row.getAttribute("aria-label");
  const key = rowLabel?.split(" — ")[0];
  if (!key) throw new Error("Tâche d’estimation introuvable.");
  const liveRow = page.getByRole("row", { name: new RegExp(`^${key} —`) });
  const [original] = await db
    .select({ id: items.id, estimatePoints: items.estimatePoints })
    .from(items)
    .where(eq(items.key, key));
  const [auditActor] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  if (!original || !auditActor) throw new Error("Fixture d’estimation introuvable.");

  try {
    await firstButton.click();
    await page.getByRole("spinbutton", { name: "Points" }).fill("5");
    const five = await waitForBusinessPost(page, () =>
      page.getByRole("button", { name: "Enregistrer l’estimation" }).click(),
    );
    expect(five.status).toBeLessThan(400);
    await expect(liveRow.getByRole("button", { name: "Estimation : 5 pts" })).toBeVisible();

    await liveRow.getByRole("button", { name: "Estimation : 5 pts" }).click();
    await page.getByRole("spinbutton", { name: "Points" }).fill("0");
    const zero = await waitForBusinessPost(page, () =>
      page.getByRole("button", { name: "Enregistrer l’estimation" }).click(),
    );
    expect(zero.status).toBeLessThan(400);
    await expect(liveRow.getByRole("button", { name: "Estimation : 0 pt" })).toBeVisible();

    await liveRow.getByRole("button", { name: "Estimation : 0 pt" }).click();
    const cleared = await waitForBusinessPost(page, () =>
      page.getByRole("button", { name: "Effacer l’estimation" }).click(),
    );
    expect(cleared.status).toBeLessThan(400);
    await expect(
      liveRow.getByRole("button", { name: "Estimation : Non estimé" }),
    ).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Points" })).toHaveCount(0);
    await writeAuditScreenshot(
      ESTIMATE_MENU_SCREENSHOT,
      (path) => page.screenshot({ path, fullPage: true }),
    );

    capture.networkLines.push(
      `[timing] estimate 5 ${five.elapsedMs}ms`,
      `[timing] estimate 0 ${zero.elapsedMs}ms`,
      `[timing] estimate null ${cleared.elapsedMs}ms`,
    );
  } finally {
    await updateItem(
      { id: original.id, estimatePoints: original.estimatePoints },
      auditActor.id,
    );
  }

  expect(capture.consoleErrors).toEqual([]);
  expect(capture.requestFailures).toEqual([]);
  expect(capture.httpErrors).toEqual([]);
});

test("désactive le classement avec tri ou groupement et conserve le mode Backlog", async ({ page }) => {
  const capture = observe(page);
  await page.goto("/b/CASS?view=backlog&sort=priority%3Aasc");
  await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Déplacer CASS-/ })).toHaveCount(0);
  await expect(
    page.getByText("Effacez le tri ou le groupement pour modifier l’ordre manuel."),
  ).toBeVisible();
  await page.reload();
  expect(new URL(page.url()).searchParams.get("view")).toBe("backlog");
  expect(new URL(page.url()).searchParams.get("sort")).toBe("priority:asc");

  await page.goto("/b/CASS?view=backlog&group=status");
  await expect(page.getByRole("button", { name: /^Déplacer CASS-/ })).toHaveCount(0);
  await expect(
    page.getByText("Effacez le tri ou le groupement pour modifier l’ordre manuel."),
  ).toBeVisible();
  expect(capture.consoleErrors).toEqual([]);
  expect(capture.requestFailures).toEqual([]);
  expect(capture.httpErrors).toEqual([]);
});

test("isole la sélection de la Liste et la réinitialise au changement de vue", async ({ page }) => {
  const capture = observe(page);
  await page.goto("/b/CASS?view=list");
  await expect(page.getByRole("table")).toBeVisible();
  const checkboxes = page.getByRole("checkbox", { name: /^Sélectionner CASS-/ });
  expect(await checkboxes.count()).toBeGreaterThan(1);
  await checkboxes.first().click();
  await expect(page.getByText("1 item sélectionné")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("item")).toBeNull();

  await page.getByRole("link", { name: "Backlog", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Actions groupées" })).toHaveCount(0);
  expect(capture.consoleErrors).toEqual([]);
  expect(capture.requestFailures).toEqual([]);
  expect(capture.httpErrors).toEqual([]);
});

test("restaure le classement et conserve la sélection après deux échecs réseau injectés", async ({ page }) => {
  const capture = observe(page);
  await page.goto("/b/CASS?view=backlog");
  const rows = page.locator("[role=row][aria-label]");
  const initialOrder = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")),
  );
  const firstHandle = page.getByRole("button", { name: /^Déplacer CASS-/ }).first();
  const movedKey = (await firstHandle.getAttribute("aria-label"))?.replace("Déplacer ", "");
  if (!movedKey) throw new Error("Clé de classement introuvable.");

  let abortNextPost = true;
  await page.route("**/*", async (route) => {
    if (
      abortNextPost &&
      route.request().method() === "POST" &&
      new URL(route.request().url()).pathname === "/b/CASS"
    ) {
      abortNextPost = false;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await firstHandle.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("status").filter({ hasText: `${movedKey}, position 1` }),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("status").filter({ hasText: `${movedKey}, position 2` }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("alert").filter({ hasText: "Classement impossible." }),
  ).toHaveText("Classement impossible.");
  await expect
    .poll(async () => rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))))
    .toEqual(initialOrder);
  await writeAuditScreenshot(
    "audit/screenshots/EXPECTED-backlog-rank-network-rollback.png",
    (path) => page.screenshot({ path, fullPage: true }),
  );

  const rowCheckboxes = page.getByRole("checkbox", { name: /^Sélectionner CASS-/ });
  await rowCheckboxes.nth(0).click();
  await rowCheckboxes.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 items sélectionnés")).toBeVisible();
  abortNextPost = true;
  await page.getByRole("button", { name: "Modifier la priorité" }).click();
  await page.getByRole("menuitem", { name: "Haute" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Modification groupée impossible." }),
  ).toHaveText("Modification groupée impossible.");
  await expect(page.getByText("2 items sélectionnés")).toBeVisible();
  await writeAuditScreenshot(
    "audit/screenshots/EXPECTED-backlog-bulk-network-selection-retained.png",
    (path) => page.screenshot({ path, fullPage: true }),
  );

  capture.consoleLines.push(
    `[expected] rank POST aborted; ${movedKey} rolled back`,
    "[expected] bulk POST aborted; selection retained",
  );
  await writeAuditText(FAILURE_CONSOLE_PATH, `${capture.consoleLines.join("\n")}\n`);
  await writeAuditText(FAILURE_NETWORK_PATH, `${capture.networkLines.join("\n")}\n`);
  expect(capture.requestFailures.length).toBeGreaterThanOrEqual(2);
  expect(capture.httpErrors).toEqual([]);
});

/**
 * JIR-42: at 390 px the fixed-width columns used to leave the title column at
 * zero width, so « Titre » spilled over « Statut ». Every table header row must
 * keep its cells side by side and the title column readable.
 */
async function expectReadableHeaderRows(page: Page) {
  const tables = page.getByRole("table");
  const tableCount = await tables.count();
  expect(tableCount).toBeGreaterThan(0);
  for (let index = 0; index < tableCount; index += 1) {
    const headers = tables.nth(index).locator("thead th");
    const boxes = await headers.evaluateAll((cells) =>
      cells.map((cell) => {
        const rect = cell.getBoundingClientRect();
        return {
          text: cell.textContent?.trim() ?? "",
          left: rect.left,
          right: rect.right,
          clipped: cell.scrollWidth > cell.clientWidth + 1,
        };
      }),
    );
    for (let column = 1; column < boxes.length; column += 1) {
      expect(boxes[column]!.left, `${boxes[column]!.text} chevauche ${boxes[column - 1]!.text}`)
        .toBeGreaterThanOrEqual(boxes[column - 1]!.right - 1);
    }
    expect(boxes.filter((box) => box.clipped).map((box) => box.text)).toEqual([]);
    const title = boxes.find((box) => box.text.startsWith("Titre"));
    expect(title).toBeDefined();
    expect(title!.right - title!.left).toBeGreaterThanOrEqual(190);
  }
}

/**
 * JIR-75: Backlog rows have no columns any more; at 390 px they wrap their
 * fields under a readable title and never scroll sideways.
 */
async function expectBacklogRowsFit(page: Page) {
  const rows = page.locator("[role=row][aria-label]");
  expect(await rows.count()).toBeGreaterThan(0);
  const layout = await rows.evaluateAll((elements) =>
    elements.map((row) => {
      const rect = row.getBoundingClientRect();
      const title = row.querySelector<HTMLElement>("span.truncate");
      return {
        label: row.getAttribute("aria-label") ?? "",
        right: rect.right,
        overflow: row.scrollWidth - row.clientWidth,
        titleWidth: title?.getBoundingClientRect().width ?? 0,
      };
    }),
  );
  const width = page.viewportSize()!.width;
  for (const row of layout) {
    expect(row.right, `${row.label} dépasse l’écran`).toBeLessThanOrEqual(width + 1);
    expect(row.overflow, `${row.label} défile horizontalement`).toBeLessThanOrEqual(1);
    expect(row.titleWidth, `${row.label} : titre illisible`).toBeGreaterThanOrEqual(80);
  }
  const scroller = await page.evaluate(() => {
    const main = document.querySelector("main");
    const overflowing = [...(main?.querySelectorAll<HTMLElement>("*") ?? [])].filter(
      (element) => element.scrollWidth > element.clientWidth + 1
        && getComputedStyle(element).overflowX !== "hidden"
        && getComputedStyle(element).overflowX !== "clip"
        && element.closest("[data-sprint-section]") !== null,
    );
    return overflowing.map((element) => element.className.toString().slice(0, 80));
  });
  expect(scroller, "Aucun défilement horizontal dans les sections").toEqual([]);
}

test("garde le Backlog et les en-têtes de la Liste lisibles à 390 par 844", async ({ page }) => {
  const capture = observe(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/b/CASS?view=backlog");
  await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
  await expectBacklogRowsFit(page);

  await page.goto("/b/CASS?view=list");
  await expect(page.getByRole("table")).toBeVisible();
  await expectReadableHeaderRows(page);
  expect(capture.consoleErrors).toEqual([]);
  expect(capture.requestFailures).toEqual([]);
  expect(capture.httpErrors).toEqual([]);
});
