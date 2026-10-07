import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * JIR-63: the shell chrome at phone width (390 × 844). The header breadcrumb
 * used to truncate both segments and the view tabs ran into the right edge.
 */
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function expectNotClipped(locator: Locator) {
  await expect(locator).toBeVisible();
  const clipped = await locator.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
  expect(clipped, `« ${await locator.textContent()} » est tronqué`).toBe(false);
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport);
}

function breadcrumb(page: Page) {
  return page.getByRole("navigation", { name: "Fil d’Ariane" });
}

test("garde la page courante du fil d’Ariane lisible à 390 par 844", async ({ page }) => {
  await page.setViewportSize(PHONE);

  await page.goto("/b/CASS?view=list");
  const current = breadcrumb(page).locator('[data-slot="shell-breadcrumb-current"]');
  await expect(current).toHaveText("Tous les items");
  await expectNotClipped(current);
  await expect(breadcrumb(page).locator('[data-slot="shell-breadcrumb-parent"]')).toBeHidden();
  await expect(breadcrumb(page).locator("[title]"))
    .toHaveAttribute("title", /· Liste \/ Tous les items$/);
  await expectNoPageOverflow(page);

  await page.goto("/b/CASS/reports");
  await expect(current).toHaveText("Rapports");
  await expectNotClipped(current);
  await expectNoPageOverflow(page);
});

test("conserve le fil d’Ariane complet sur grand écran", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/b/CASS?view=list");

  const parent = breadcrumb(page).locator('[data-slot="shell-breadcrumb-parent"]');
  await expect(parent).toHaveText(/· Liste$/);
  await expectNotClipped(parent);
  await expectNotClipped(breadcrumb(page).locator('[data-slot="shell-breadcrumb-current"]'));
});

function viewTabs(page: Page) {
  return page.getByRole("navigation", { name: "Vues du backlog" });
}

async function horizontalBox(locator: Locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  });
}

test("fait défiler les onglets de vue dans la marge à 390 par 844", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/b/CASS?view=list");

  const row = viewTabs(page);
  await expect(row).toBeVisible();
  const rowBox = await horizontalBox(row);
  expect(rowBox.left).toBeGreaterThanOrEqual(12);
  expect(rowBox.right).toBeLessThanOrEqual(PHONE.width - 12);
  expect(await row.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  await expectNoPageOverflow(page);

  const reports = row.getByRole("link", { name: "Rapports" });
  await reports.focus();
  await expect(reports).toBeFocused();
  expect(await reports.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe("none");
  await row.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  const reportsBox = await horizontalBox(reports);
  expect(reportsBox.right).toBeLessThanOrEqual(rowBox.right + 1);
  expect(reportsBox.left).toBeGreaterThanOrEqual(rowBox.left - 1);

  await reports.click();
  await expect(page).toHaveURL(/\/b\/CASS\/reports$/);
  const active = viewTabs(page).locator('[aria-current="page"]');
  await expect(active).toHaveText("Rapports");
  await expect.poll(async () => {
    const [tab, frame] = await Promise.all([horizontalBox(active), horizontalBox(viewTabs(page))]);
    return tab.right <= frame.right + 1 && tab.left >= frame.left - 1;
  }).toBe(true);
  await expectNoPageOverflow(page);
});

test("garde la rangée d’onglets entière sur grand écran", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/b/CASS?view=list");

  const row = viewTabs(page);
  await expect(row).toBeVisible();
  expect(await row.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await expect(row.getByRole("link")).toHaveCount(6);
});
