import { expect, test, type Page } from "@playwright/test";

/** Opens the center "Nouvel item" dialog, checks its motion, then closes it. */
async function checkCenterDialog(page: Page, animation: string) {
  await page.getByRole("button", { name: "Nouvel item" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouvel item" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("animation-name", animation);
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS(
    "animation-name",
    animation,
  );

  await page.keyboard.press("Escape");
  // Radix waits for the exit animation before unmounting; it must not hang.
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
}

/** Opens the notifications dropdown, checks its motion, then closes it. */
async function checkDropdown(page: Page, animation: string) {
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS("animation-name", animation);

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
}

test.describe("animations des fenêtres et menus", () => {
  test("anime l’ouverture d’un dialogue centré et d’un menu, puis les démonte", async ({
    page,
  }) => {
    await page.goto("/b/CASS?view=backlog");
    await checkCenterDialog(page, "enter");
    await checkDropdown(page, "enter");
  });

  test("n’anime rien quand le mouvement est réduit", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/b/CASS?view=backlog");
    await checkCenterDialog(page, "none");
    await checkDropdown(page, "none");
  });
});
