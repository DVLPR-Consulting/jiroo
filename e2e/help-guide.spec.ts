import { expect, test, type Page } from "@playwright/test";

/** JIR-67: the « Aide » header link and the /aide functional user guide. */
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport);
}

function toc(page: Page) {
  return page.getByRole("navigation", { name: "Sommaire du guide" });
}

/** The TOC exists twice (collapsible on mobile, sticky on desktop): keep the shown one. */
function tocLink(page: Page, name: RegExp) {
  return toc(page).getByRole("link", { name }).filter({ visible: true });
}

test("ouvre le guide depuis l’en-tête et suit le sommaire", async ({ page }, testInfo) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/b/CASS?view=backlog");

  const help = page.getByRole("link", { name: "Aide" });
  await expect(help).toBeVisible();
  await help.click();

  await expect(page).toHaveURL(/\/aide$/);
  await expect(page.getByRole("heading", { level: 1, name: "Guide d’utilisation" })).toBeVisible();
  await expect(page.locator('[data-slot="shell-breadcrumb-current"]')).toHaveText("Aide");
  await page.screenshot({ path: testInfo.outputPath("jir67-desktop-1440.png") });

  await tocLink(page, /API et MCP/).click();
  await expect(page).toHaveURL(/\/aide#api-mcp$/);
  await expect(page.locator("section#api-mcp").getByRole("heading", { level: 2 })).toBeInViewport();

  const roadmap = page.locator("section#roadmap");
  await expect(roadmap).not.toBeInViewport();
  await tocLink(page, /Roadmap/).click();
  await expect(page).toHaveURL(/\/aide#roadmap$/);
  await expect(roadmap.getByRole("heading", { level: 2 })).toBeInViewport();
  // Only the content area scrolls: the header and the sticky table of contents stay put.
  await expect(help).toBeInViewport();
  await expect(tocLink(page, /Démarrer/)).toBeInViewport();
  expect(await page.locator("main").evaluate((main) => main.scrollTop)).toBeGreaterThan(0);
});

test("reste lisible sans débordement à 390 par 844", async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await page.goto("/aide");

  await expect(page.getByRole("heading", { level: 1, name: "Guide d’utilisation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aide" })).toBeVisible();
  await expectNoPageOverflow(page);

  await toc(page).locator("summary").click();
  await tocLink(page, /API et MCP/).click();
  await expect(page).toHaveURL(/\/aide#api-mcp$/);
  await expect(page.locator("section#api-mcp").getByRole("heading", { level: 2 })).toBeInViewport();
  await expectNoPageOverflow(page);

  await page.goto("/aide");
  await page.screenshot({ path: testInfo.outputPath("jir67-mobile-390.png") });
});

test("revient à l’accueil du backlog par le fil d’Ariane puis par le logo", async ({ page }) => {
  // JIR-72: from the guide, the breadcrumb backlog segment and the wordmark lead back home.
  await page.setViewportSize(DESKTOP);
  await page.goto("/aide");

  const breadcrumb = page.getByRole("navigation", { name: "Fil d’Ariane" });
  await breadcrumb.locator('[data-slot="shell-breadcrumb-parent"]').click();
  await expect(page).toHaveURL(/\/b\/CASS$/);

  await page.goto("/aide");
  await page.getByRole("link", { name: "Jiroo — accueil" }).click();
  await expect(page).toHaveURL(/\/b\/CASS$/);
});
