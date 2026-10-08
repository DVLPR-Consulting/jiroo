import { expect, test, type Page } from "@playwright/test";

/** JIR-70: Jira-style keyboard shortcuts, their « ? » dialog and the off switch. */
test.use({ viewport: { width: 1440, height: 900 } });

const SHORTCUTS_KEY = "jiroo-shortcuts-enabled";

/** Keys must reach the page, not a focused field or control. */
async function blurFocus(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function gotoBacklog(page: Page) {
  await page.goto("/b/CASS?view=backlog");
  await expect(page.getByRole("row", { name: /^CASS-\d+ —/ }).first()).toBeVisible();
  await blurFocus(page);
}

test("« ? » liste les raccourcis, « / » ouvre la recherche", async ({ page }) => {
  await gotoBacklog(page);

  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Raccourcis clavier" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Ticket ouvert" })).toBeVisible();
  await expect(dialog.getByText("M’assigner le ticket")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.keyboard.press("/");
  const search = page.getByRole("dialog", { name: "Rechercher un item" });
  await expect(search).toBeVisible();
  // The « / » itself is not typed into the search field.
  await expect(search.getByRole("textbox", { name: "Rechercher" })).toHaveValue("");
  await expect(search.getByRole("textbox", { name: "Rechercher" })).toBeFocused();
  await page.keyboard.press("Escape");
});

test("« g » puis une lettre change de vue, jamais pendant la saisie", async ({ page }) => {
  await gotoBacklog(page);

  await page.keyboard.press("g");
  await page.keyboard.press("a");
  await expect(page).toHaveURL(/\/b\/CASS\?view=board$/);

  await page.keyboard.press("g");
  await page.keyboard.press("i");
  await expect(page).toHaveURL(/\/b\/CASS\?view=list$/);

  // Typing « g r » into the search field must not navigate.
  await page.keyboard.press("/");
  const field = page.getByRole("textbox", { name: "Rechercher" });
  await field.pressSequentially("gr");
  await expect(field).toHaveValue("gr");
  await expect(page).toHaveURL(/\/b\/CASS\?view=list$/);
  await page.keyboard.press("Escape");
  // Keys stay with the palette until its exit animation is over.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("g");
  await page.keyboard.press("r");
  await expect(page).toHaveURL(/\/b\/CASS\/reports$/);
});

test("« j » / « k » sélectionnent un ticket et « o » l’ouvre ; « m » puis « i » dans le tiroir", async ({
  page,
}) => {
  await gotoBacklog(page);
  const rows = page.locator("main [data-shortcut-item]");

  await page.keyboard.press("j");
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press("j");
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press("k");
  await expect(rows.nth(0)).toBeFocused();
  const key = await rows.nth(0).getAttribute("data-shortcut-item");

  await page.keyboard.press("o");
  const drawer = page.getByRole("dialog", { name: new RegExp(`^${key} —`) });
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`[?&]item=${key}(&|$)`));

  // j / k belong to the list, not to the open item.
  await page.keyboard.press("j");
  await expect(drawer).toBeVisible();

  await page.keyboard.press("m");
  const composer = drawer.getByRole("textbox", { name: "Nouveau commentaire" });
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("");
  // Start from an unassigned item, then « i » assigns it to the signed-in user.
  const assignee = drawer.getByRole("combobox", { name: "Assigné" });
  const previous = await assignee.inputValue();
  await assignee.selectOption("");
  await expect(assignee).toHaveValue("");
  await expect(assignee).toBeEnabled();
  await drawer.getByRole("button", { name: "Détail" }).focus();
  await page.keyboard.press("i");
  await expect(assignee).not.toHaveValue("");
  await expect(assignee).toBeEnabled();
  // Restore the seed for the other specs.
  await assignee.selectOption(previous);
  await expect(assignee).toHaveValue(previous);
});

test("les raccourcis à une touche se désactivent depuis la fenêtre « ? »", async ({ page }) => {
  await gotoBacklog(page);

  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Raccourcis clavier" });
  const toggle = dialog.getByRole("switch", { name: /Raccourcis à une touche/ });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  expect(await page.evaluate((key) => localStorage.getItem(key), SHORTCUTS_KEY)).toBe("false");
  await page.keyboard.press("Escape");

  await blurFocus(page);
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  await page.keyboard.press("?");
  await expect(page).toHaveURL(/view=backlog/);
  await expect(dialog).toHaveCount(0);

  await page.evaluate((key) => localStorage.removeItem(key), SHORTCUTS_KEY);
});
