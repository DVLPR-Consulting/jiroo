import { expect, type Page } from "@playwright/test";

/**
 * JIR-75: « + Créer un item » at the bottom of a Backlog section. Opens the
 * inline field if needed, types the title, keeps the pre-selected epic (or
 * picks the first one) and presses Entrée. The field stays open afterwards.
 */
export async function createInlineItem(page: Page, sectionLabel: string, title: string) {
  const field = page.getByRole("textbox", { name: `Titre du nouvel item dans ${sectionLabel}` });
  if (!(await field.isVisible())) {
    await page.getByRole("button", { name: `Créer un item dans ${sectionLabel}` }).click();
  }
  await expect(field).toBeFocused();
  await field.fill(title);
  const parent = page
    .getByRole("form", { name: `Créer un item dans ${sectionLabel}` })
    .getByRole("combobox", { name: "Epic parent" });
  if ((await parent.inputValue()) === "") await parent.selectOption({ index: 1 });
  await field.press("Enter");
}

/** Opens a sprint header's ⋯ menu and picks one of its actions. */
export async function sprintMenuAction(
  page: Page,
  sprintName: string,
  action: "Modifier" | "Monter" | "Descendre",
) {
  await page.getByRole("button", { name: `Actions de ${sprintName}` }).click();
  await page.getByRole("menuitem", { name: action }).click();
}
