import "dotenv/config";

import { expect, test } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { backlogs, sprints, statuses } from "../lib/db/schema/domain";

/** JIR-89: without an active sprint, the Board keeps its status columns visible. */

async function cassStatusNames() {
  const [backlog] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  if (!backlog) throw new Error("Backlog CASS introuvable.");
  const active = await db
    .select({ id: sprints.id })
    .from(sprints)
    .where(and(eq(sprints.backlogId, backlog.id), eq(sprints.state, "active")));
  if (active.length > 0) throw new Error("La fixture CASS ne doit pas avoir de sprint actif.");
  const rows = await db
    .select({ name: statuses.name })
    .from(statuses)
    .where(eq(statuses.backlogId, backlog.id))
    .orderBy(asc(statuses.order));
  return rows.map((row) => row.name);
}

test("affiche les colonnes vides et inertes sous le bandeau sans sprint actif", async ({
  page,
}, testInfo) => {
  const statusNames = await cassStatusNames();
  expect(statusNames.length).toBeGreaterThan(0);

  await page.goto("/b/CASS?view=board");

  const banner = page.getByRole("region", { name: "Aucun sprint actif" });
  await expect(banner).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aucun sprint actif" })).toHaveCount(1);
  await expect(banner.getByRole("link", { name: "Voir le Backlog" })).toHaveAttribute(
    "href",
    "/b/CASS?view=backlog",
  );

  const columns = page.getByRole("group", { name: /, 0 ticket$/ });
  await expect(columns).toHaveCount(statusNames.length);
  for (const [index, name] of statusNames.entries()) {
    await expect(columns.nth(index)).toHaveAccessibleName(`${name}, 0 ticket`);
    await expect(columns.nth(index)).toContainText(name);
  }

  // Structure only: no drag handle, no creation, no dnd-kit live region or
  // keyboard instructions.
  await expect(page.getByRole("button", { name: /^Déplacer / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Créer dans / })).toHaveCount(0);
  await expect(page.locator("[id^='DndLiveRegion']")).toHaveCount(0);
  await expect(page.getByText(/Pour sélectionner une carte/)).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath("jir89-board-no-sprint-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(banner).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir89-board-no-sprint-phone.png") });
});
