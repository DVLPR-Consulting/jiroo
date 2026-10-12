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

test("« j » / « k » sélectionnent un ticket et « o » l’ouvre ; dans le tiroir « j » / « k », « m » puis « i »", async ({
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

  // In the drawer, j / k open the next / previous item of the list (Jira).
  const nextKey = await rows.nth(1).getAttribute("data-shortcut-item");
  await page.keyboard.press("j");
  await expect(page).toHaveURL(new RegExp(`[?&]item=${nextKey}(&|$)`));
  const nextDrawer = page.getByRole("dialog", { name: new RegExp(`^${nextKey} —`) });
  await expect(nextDrawer).toBeVisible();
  await page.keyboard.press("k");
  await expect(page).toHaveURL(new RegExp(`[?&]item=${key}(&|$)`));
  await expect(drawer).toBeVisible();

  await page.keyboard.press("m");
  const composer = drawer.getByRole("textbox", { name: "Nouveau commentaire" });
  await expect(composer).toBeFocused();
  // The composer is the rich-text editor (contenteditable), empty here.
  await expect(composer).toHaveText("");
  // Start from an unassigned item, then « i » assigns it to the signed-in user.
  const assigneeValue = drawer.getByRole("button", { name: /^Assigné / });
  await assigneeValue.click();
  const assignee = drawer.getByRole("combobox", { name: "Assigné" });
  const previous = await assignee.inputValue();
  await assignee.selectOption("");
  await expect(assignee).toHaveValue("");
  await expect(assignee).toBeEnabled();
  await drawer.getByRole("button", { name: "Copier le lien" }).focus();
  await expect(assigneeValue).toContainText("Non assigné");
  await page.keyboard.press("i");
  await expect(assigneeValue).not.toContainText("Non assigné");
  await expect(drawer.getByRole("button", { name: "M’assigner" })).toHaveCount(0);
  // Restore the seed for the other specs.
  await assigneeValue.click();
  await drawer.getByRole("combobox", { name: "Assigné" }).selectOption(previous);
  await expect(drawer.getByRole("combobox", { name: "Assigné" })).toHaveValue(previous);
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
