import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * JIR-63 / JIR-74: the shell chrome at phone width (390 × 844). The
 * breadcrumb now sits above the page title and the project views live in the
 * sidebar, which becomes a drawer on a phone.
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

test("garde le fil d’Ariane complet et lisible au-dessus du titre à 390 par 844", async ({ page }) => {
  await page.setViewportSize(PHONE);

  await page.goto("/b/CASS?view=list");
  const current = breadcrumb(page).locator('[data-slot="shell-breadcrumb-current"]');
  await expect(current).toHaveText("Liste");
  await expectNotClipped(current);
  await expectNotClipped(breadcrumb(page).locator('[data-slot="shell-breadcrumb-parent"]'));
  await expect(page.getByRole("heading", { level: 1, name: "Liste" })).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto("/b/CASS/reports");
  await expect(current).toHaveText("Rapports");
  await expectNotClipped(current);
  await expectNoPageOverflow(page);
});

test("mène du fil d’Ariane au backlog sur grand écran", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/b/CASS/releases");

  const parent = breadcrumb(page).locator('[data-slot="shell-breadcrumb-parent"]');
  await expectNotClipped(parent);
  await parent.click();
  await expect(page).toHaveURL(/\/b\/CASS$/);
  await expect(breadcrumb(page).locator('[data-slot="shell-breadcrumb-current"]'))
    .toHaveText("Board");
});

test("ouvre les vues du projet dans le tiroir de navigation à 390 par 844", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/b/CASS?view=list");

  await expect(page.getByRole("navigation", { name: "Vues du projet" })).toHaveCount(0);
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation principale" });
  const views = drawer.getByRole("navigation", { name: "Vues du projet" });
  for (const name of ["Backlog", "Board", "Liste", "Arbre", "Roadmap", "Releases", "Rapports"]) {
    await expect(views.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(views.getByRole("link", { name: /^Le point/ })).toBeVisible();
  await expect(views.getByRole("link", { name: "Liste" })).toHaveAttribute("aria-current", "page");

  await views.getByRole("link", { name: "Rapports" }).click();
  await expect(page).toHaveURL(/\/b\/CASS\/reports$/);
  await expect(drawer).toHaveCount(0);
  await expectNoPageOverflow(page);
});

test("garde l’accès aux vues du projet quand la police du navigateur est agrandie (JIR-127)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes est propre à Chromium.");
  // A 20 px base font moves the shell's 48rem breakpoint to 960 px: at 800 px
  // the inline sidebar is hidden by CSS, so the drawer must be offered.
  const session = await page.context().newCDPSession(page);
  await session.send("Page.setFontSizes", { fontSizes: { standard: 20 } });
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/b/CASS?view=list");

  await expect(page.getByRole("navigation", { name: "Vues du projet" })).toHaveCount(0);
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation principale" });
  await expect(drawer.getByRole("navigation", { name: "Vues du projet" }).getByRole("link", { name: "Board", exact: true }))
    .toBeVisible();
  await expectNoPageOverflow(page);
});

test("fait passer la barre du haut et les filtres à la ligne sans débordement à 390 par 844", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/b/CASS?view=backlog");

  const topbar = page.locator('[data-slot="shell-topbar"]');
  for (const control of [
    topbar.getByRole("button", { name: "Ouvrir la navigation" }),
    topbar.getByRole("button", { name: "Rechercher un item" }),
    topbar.getByRole("button", { name: "Créer", exact: true }),
    topbar.getByRole("button", { name: "Notifications" }),
    topbar.getByRole("link", { name: "Aide" }),
  ]) {
    await expect(control).toBeInViewport({ ratio: 1 });
  }
  await expect(page.getByRole("button", { name: /^Affichage/ })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Filtre", exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
});
