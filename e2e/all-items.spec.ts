import "dotenv/config";

import { expect, test } from "@playwright/test";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "../lib/db";
import { backlogs, items } from "../lib/db/schema/domain";

/**
 * JIR-94: « Tous les items » is Jira's "All work" — the backlog's unfiltered
 * Liste, whose result count matches the sidebar counter. It used to open the
 * Board (active sprint only), empty while the counter said otherwise.
 */

async function liveCassItemCount() {
  const [row] = await db
    .select({ count: count() })
    .from(items)
    .innerJoin(backlogs, eq(items.backlogId, backlogs.id))
    .where(and(eq(backlogs.key, "CASS"), isNull(items.deletedAt)));
  return Number(row?.count ?? 0);
}

test("ouvre la Liste non filtrée depuis le Board, au même nombre que le compteur", async ({
  page,
}, testInfo) => {
  const total = await liveCassItemCount();
  expect(total).toBeGreaterThan(1);

  // A filtered Board: neither the view nor its filter must survive the click.
  await page.goto("/b/CASS?view=board&q=introuvable");
  const allItems = page.getByRole("link", { name: `Tous les items ${total}` });
  await expect(allItems).toBeVisible();
  await expect(allItems).toHaveAttribute("href", "/b/CASS?view=list");
  await expect(allItems).not.toHaveAttribute("aria-current", "page");

  await allItems.click();

  await expect(page).toHaveURL(/\/b\/CASS\?view=list$/);
  await expect(page.getByRole("status").filter({ hasText: "résultat" })).toHaveText(
    `${total} résultats`,
  );
  await expect(allItems).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("jir94-tous-les-items-liste.png") });

  // Back on the Board, the link is no longer the current page.
  await page.getByRole("navigation", { name: "Vues du projet" })
    .getByRole("link", { name: "Board" })
    .click();
  await expect(page).toHaveURL(/[?&]view=board(&|$)/);
  await expect(allItems).not.toHaveAttribute("aria-current", "page");
});
