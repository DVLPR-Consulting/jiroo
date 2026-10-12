import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Picks an option of a shared Radix select (`SelectField`): opens the
 * combobox named `name` inside `scope`, then clicks the option, which Radix
 * portals to the page body. A string `option` matches the option's text
 * exactly, a RegExp matches its name; `{ index }` picks by position.
 */
export async function chooseOption(
  scope: Page | Locator,
  name: string | RegExp,
  option: string | RegExp | { index: number },
) {
  const page = "page" in scope && typeof scope.page === "function" ? scope.page() : (scope as Page);
  const combobox = scope.getByRole("combobox", { name });
  await combobox.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  const target =
    typeof option === "string"
      ? listbox.getByRole("option", { name: option, exact: true })
      : option instanceof RegExp
        ? listbox.getByRole("option", { name: option })
        : listbox.getByRole("option").nth(option.index);
  await target.click();
  await expect(listbox).toHaveCount(0);
}
