import { expect, test as base } from "@playwright/test";
import type { MatrixOptions } from "../matrix";
import { writeAuditScreenshot } from "../audit-artifacts";
import { installTextZoom } from "../support/text-zoom";
import { AUDIT_PAGES, expectAuditActionResult, openAuditPage, primaryAuditAction } from "./pages";

const test = base.extend<MatrixOptions>({ textZoom: [false, { option: true }] });
test.use({ storageState: ".playwright/.auth/platform-admin.json" });
test.beforeEach(async ({ context, textZoom }) => {
  test.skip(!textZoom, "Text zoom runs only in the dedicated zoom projects.");
  await context.addInitScript(installTextZoom);
});

for (const target of AUDIT_PAGES) {
  test(`200% text and reflow — ${target.name}`, async ({ page }) => {
    await openAuditPage(page, target);
    expect(await page.locator("html").evaluate((root) => root.style.fontSize)).toBe("200%");
    const action = await primaryAuditAction(page, target);
    // Vertical scrolling is allowed; horizontal clipping of the shell is not.
    await action.scrollIntoViewIfNeeded();
    await writeAuditScreenshot(`audit/screenshots/zoom-${target.name}.png`,
      (path) => page.screenshot({ path, caret: "initial" }));
    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main");
      return {
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        main: main ? main.scrollWidth - main.clientWidth : Number.NaN,
      };
    });
    expect(overflow.document, "Horizontal document overflow").toBeLessThanOrEqual(1);
    expect(Number.isNaN(overflow.main), "Missing <main> scroller").toBe(false);
    expect(overflow.main, "Horizontal overflow inside <main>").toBeLessThanOrEqual(1);
    await expect(action).toBeVisible();
    await expect(action).toBeInViewport({ ratio: 1 });
    await expect(action).toBeEnabled();
    await action.click();
    await expectAuditActionResult(page, target);
  });
}
