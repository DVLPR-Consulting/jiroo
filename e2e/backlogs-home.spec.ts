import { expect, test, type Page } from "@playwright/test";
import { inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { backlogStars, backlogs } from "../lib/db/schema/domain";

/** JIR-82: the « Backlogs » home page, favourites and the backlog lead. */
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport);
}

/**
 * A row's cell. Keep the shown one: a previously rendered copy of the page
 * may linger hidden in the DOM (seen once in a full run).
 */
function cell(page: Page, key: string, name: string) {
  return page
    .locator(`[data-backlog-row="${key}"]`)
    .filter({ visible: true })
    .locator(`[data-cell="${name}"]`);
}

function rowNames(page: Page) {
  return page.locator("[data-backlog-row]").getByRole("link");
}

/** Other specs expect CASS as the default backlog: leave no favourite or lead behind. */
async function resetHomeFixtures() {
  const fixtures = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(inArray(backlogs.key, ["CASS", "LABS"]));
  const ids = fixtures.map((row) => row.id);
  if (ids.length === 0) return;
  await db.delete(backlogStars).where(inArray(backlogStars.backlogId, ids));
  await db.update(backlogs).set({ leadUserId: null }).where(inArray(backlogs.id, ids));
}

test.beforeEach(resetHomeFixtures);
test.afterEach(resetHomeFixtures);

test("liste les backlogs, garde un favori en tête après rechargement et ouvre le backlog", async ({ page }, testInfo) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/b/CASS");
  await page.getByRole("link", { name: "Tous les backlogs" }).click();

  // No more redirect: / is the backlogs list.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Backlogs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tous les backlogs" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(rowNames(page)).toHaveText(["Cour de cassation", "Laboratoire isolé"]);
  const cass = page.locator('[data-backlog-row="CASS"]').filter({ visible: true });
  await expect(cass.getByText("CASS", { exact: true })).toBeVisible();
  await expect(cell(page, "CASS", "open-items")).toHaveText(/^\d+/);

  const star = page.getByRole("button", { name: "Ajouter aux favoris : Laboratoire isolé" });
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await star.click();
  await expect(
    page.getByRole("button", { name: "Retirer des favoris : Laboratoire isolé" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(rowNames(page)).toHaveText(["Laboratoire isolé", "Cour de cassation"]);

  await page.reload();
  await expect(rowNames(page)).toHaveText(["Laboratoire isolé", "Cour de cassation"]);
  await expect(
    page.getByRole("button", { name: "Retirer des favoris : Laboratoire isolé" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: testInfo.outputPath("jir82-home-desktop-1440.png"),
    caret: "initial",
  });

  // The selector lists favourites first too.
  await page.locator("[data-sidebar-backlog-trigger]").click();
  const menuItems = page.getByRole("menuitem");
  await expect(menuItems.first()).toContainText("Laboratoire isolé");
  await expect(menuItems.first().getByRole("img", { name: "Favori" })).toBeVisible();
  await page.keyboard.press("Escape");

  // A click anywhere on the row opens the backlog.
  // (The name's hit area covers the row: click the counter's position.)
  const counter = await cell(page, "CASS", "open-items")
    .boundingBox();
  if (!counter) throw new Error("Compteur introuvable.");
  await page.mouse.click(counter.x + counter.width / 2, counter.y + counter.height / 2);
  await expect(page).toHaveURL(/\/b\/CASS$/);
});

test("affiche le responsable choisi dans l’administration", async ({ page }, testInfo) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/admin");
  const cassRow = page.locator("li").filter({ hasText: "Cour de cassation" });
  await cassRow.getByRole("button", { name: "Modifier" }).click();
  const dialog = page.getByRole("dialog", { name: "Modifier le backlog" });
  await dialog.getByLabel("Responsable").selectOption({ label: "Membre E2E" });
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/");
  const lead = cell(page, "CASS", "lead");
  await expect(lead).toContainText("Membre E2E");
  await expect(lead.getByRole("img", { name: "Membre E2E" })).toBeVisible();
  await expect(cell(page, "LABS", "lead")).toBeEmpty();
  await page.screenshot({
    path: testInfo.outputPath("jir82-home-lead-desktop-1440.png"),
    caret: "initial",
  });
});

test("reste lisible sans débordement à 390 par 844", async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Backlogs" })).toBeVisible();
  await expect(rowNames(page)).toHaveText(["Cour de cassation", "Laboratoire isolé"]);
  await expect(
    cell(page, "CASS", "open-items"),
  ).toHaveText(/items? ouverts?$/);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("jir82-home-mobile-390.png"),
    caret: "initial",
  });

  await page.getByRole("button", { name: "Ajouter aux favoris : Laboratoire isolé" }).click();
  await expect(rowNames(page)).toHaveText(["Laboratoire isolé", "Cour de cassation"]);
  await page.getByRole("link", { name: "Laboratoire isolé" }).click();
  await expect(page).toHaveURL(/\/b\/LABS$/);
});
