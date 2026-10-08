import { expect, test, type Page } from "@playwright/test";

/**
 * JIR-74: the redesigned shell — project views and « Filtres » in the
 * sidebar, search field and « + Créer » in the top bar, breadcrumb above the
 * page title, « Affichage » menu and the compact filter bar.
 */
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

function projectViews(page: Page) {
  return page.getByRole("navigation", { name: "Vues du projet" });
}

function breadcrumb(page: Page) {
  return page.getByRole("navigation", { name: "Fil d’Ariane" });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(DESKTOP);
});

test("navigue entre les vues du projet depuis la barre latérale", async ({ page }) => {
  await page.goto("/b/CASS?view=board");
  await expect(projectViews(page).getByRole("link", { name: "Board" }))
    .toHaveAttribute("aria-current", "page");
  // The view tabs are gone.
  await expect(page.getByRole("navigation", { name: "Vues du backlog" })).toHaveCount(0);

  await projectViews(page).getByRole("link", { name: "Backlog" }).click();
  await expect(page).toHaveURL(/\/b\/CASS\?view=backlog$/);
  await expect(page.getByRole("heading", { level: 1, name: "Backlog", exact: true })).toBeVisible();
  await expect(breadcrumb(page).locator('[data-slot="shell-breadcrumb-current"]'))
    .toHaveText("Backlog");
  await expect(projectViews(page).getByRole("link", { name: "Backlog" }))
    .toHaveAttribute("aria-current", "page");

  await projectViews(page).getByRole("link", { name: "Releases" }).click();
  await expect(page).toHaveURL(/\/b\/CASS\/releases$/);
  await expect(page.getByRole("heading", { level: 1, name: "Releases", exact: true })).toBeVisible();

  await projectViews(page).getByRole("link", { name: "Arbre" }).click();
  await expect(page).toHaveURL(/\/b\/CASS\?view=tree$/);
  await expect(page.getByRole("heading", { level: 1, name: "Arbre", exact: true })).toBeVisible();
});

test("ouvre la recherche depuis le champ de la barre du haut", async ({ page }) => {
  await page.goto("/b/CASS?view=list");

  const field = page.getByRole("button", { name: "Rechercher un item" });
  await expect(field).toBeVisible();
  await expect(field.locator("kbd")).toHaveText("/");
  await field.click();
  const palette = page.getByRole("dialog", { name: "Rechercher un item" });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("textbox", { name: "Rechercher" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
});

test("ouvre la création depuis « + Créer », absent hors des vues", async ({ page }) => {
  await page.goto("/b/CASS?view=list");

  const create = page.locator('[data-slot="shell-topbar"]')
    .getByRole("button", { name: "Créer", exact: true });
  await create.click();
  const dialog = page.getByRole("dialog", { name: "Nouvel item" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.goto("/aide");
  await expect(page.getByRole("heading", { level: 1, name: "Guide d’utilisation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer", exact: true })).toHaveCount(0);
});

test("règle le regroupement et la densité dans « Affichage »", async ({ page }) => {
  await page.goto("/b/CASS?view=list");

  const display = page.getByRole("button", { name: /^Affichage/ });
  await expect(display).toHaveText(/Affichage · Confort/);
  await display.click();
  await expect(page.getByRole("group", { name: "Grouper par" })).toBeVisible();
  await page.getByRole("menuitemradio", { name: "Priorité" }).click();
  await expect(page).toHaveURL(/group=priority/);

  await display.click();
  await expect(page.getByRole("menuitemradio", { name: "Priorité" }))
    .toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "Compact" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(display).toHaveText(/Affichage · Compact/);

  await display.click();
  await page.getByRole("menuitemradio", { name: "Aucun" }).click();
  await expect(page).not.toHaveURL(/group=/);
  await display.click();
  await page.getByRole("menuitemradio", { name: "Confort" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfy");
});

test("ajoute un filtre en pastille, le retire, et propose alors d’enregistrer la vue", async ({ page }) => {
  await page.goto("/b/CASS?view=list");

  await expect(page.getByRole("button", { name: /Enregistrer la vue/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Filtre", exact: true }).click();
  await page.getByRole("button", { name: "Nature", exact: true }).click();
  await page.getByLabel("Bug", { exact: true }).click();
  await expect(page).toHaveURL(/kind=bug/);
  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: "Nature : Bug" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Enregistrer la vue/ })).toBeVisible();

  await page.getByRole("button", { name: "Effacer le filtre Nature" }).click();
  await expect(page).not.toHaveURL(/kind=/);
  await expect(page.getByRole("button", { name: "Nature : Bug" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Enregistrer la vue/ })).toHaveCount(0);
});

test("filtre par assigné avec les avatars", async ({ page }) => {
  await page.goto("/b/CASS?view=list");

  const assignees = page.getByRole("group", { name: "Filtrer par assigné" });
  const unassigned = assignees.getByRole("button", { name: "Non assigné" });
  await expect(unassigned).toHaveAttribute("aria-pressed", "false");
  await unassigned.click();
  await expect(page).toHaveURL(/assignee=none/);
  await expect(unassigned).toHaveAttribute("aria-pressed", "true");
  await unassigned.click();
  await expect(page).not.toHaveURL(/assignee=/);
  await expect(unassigned).toHaveAttribute("aria-pressed", "false");
});

test("ouvre l’enregistrement d’une vue depuis la barre latérale", async ({ page }) => {
  await page.goto("/b/CASS?view=list");

  await page.getByRole("button", { name: "Enregistrer une vue" }).click();
  const dialog = page.getByRole("dialog", { name: "Enregistrer la vue" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("capture le shell en clair, en sombre et sur téléphone", async ({ page }, testInfo) => {
  await page.goto("/b/CASS?view=backlog");
  await expect(page.getByRole("heading", { level: 1, name: "Backlog", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir74-desktop-light.png") });

  await page.evaluate(() => localStorage.setItem("jiroo-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath("jir74-desktop-dark.png") });
  await page.evaluate(() => localStorage.removeItem("jiroo-theme"));

  await page.setViewportSize(PHONE);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Backlog", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir74-mobile.png") });
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation principale" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir74-mobile-drawer.png") });
});
