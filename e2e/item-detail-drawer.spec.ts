import { expect, test, type Page } from "@playwright/test";

type DrawerTrace = {
  firstAnimation: string | null;
  dialogReplaced: boolean;
  overlayOutsideDialog: boolean;
};

/** Records how the detail drawer first appears and whether it is ever swapped. */
async function traceDrawer(page: Page) {
  await page.evaluate(() => {
    const trace: DrawerTrace = {
      firstAnimation: null,
      dialogReplaced: false,
      overlayOutsideDialog: false,
    };
    let firstDialog: Element | null = null;
    const check = () => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog && !firstDialog) {
        firstDialog = dialog;
        trace.firstAnimation = getComputedStyle(dialog).animationName;
      }
      if (dialog && firstDialog && dialog !== firstDialog) trace.dialogReplaced = true;
      for (const busy of document.querySelectorAll('[aria-busy="true"]')) {
        if (!busy.closest('[role="dialog"]') && busy.closest(".fixed")) {
          trace.overlayOutsideDialog = true;
        }
      }
    };
    new MutationObserver(check).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    (window as unknown as { __drawerTrace: DrawerTrace }).__drawerTrace = trace;
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __drawerTrace: DrawerTrace }).__drawerTrace,
    );
}

async function openFirstBacklogRow(page: Page) {
  await page.goto("/b/CASS?view=backlog");
  const row = page.getByRole("row", { name: /^CASS-\d+ —/ }).first();
  await expect(row).toBeVisible();
  const key = (await row.getAttribute("aria-label"))?.split(" — ")[0];
  if (!key) throw new Error("Ligne de backlog introuvable.");
  const readTrace = await traceDrawer(page);
  await row.click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`^${key} —`) });
  await expect(dialog).toBeVisible();
  return { key, dialog, readTrace };
}

test.describe("panneau de détail", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("glisse depuis la droite une seule fois, sans échange d’overlay, puis se referme", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const { key, dialog, readTrace } = await openFirstBacklogRow(page);

    await expect(page).toHaveURL(new RegExp(`[?&]item=${key}(&|$)`));
    const trace = await readTrace();
    expect(trace.firstAnimation).toBe("enter");
    expect(trace.dialogReplaced).toBe(false);
    expect(trace.overlayOutsideDialog).toBe(false);
    await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS(
      "backdrop-filter",
      "none",
    );

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]item=/);
    expect(consoleErrors).toEqual([]);
  });

  test("ouvre directement le lien profond sans animation si le mouvement est réduit", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { key } = await openFirstBacklogRow(page);
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/[?&]item=/);

    await page.goto(`/b/CASS?view=backlog&item=${key}`);
    const dialog = page.getByRole("dialog", { name: new RegExp(`^${key} —`) });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("animation-name", "none");
    await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS(
      "animation-name",
      "none",
    );
  });
});
