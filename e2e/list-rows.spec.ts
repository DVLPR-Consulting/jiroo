import "dotenv/config";

import { expect, test } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items } from "../lib/db/schema/domain";
import { createLabel } from "../lib/services/labels";
import { createItem } from "../lib/services/items";

/**
 * JIR-93: every list display shows the Backlog row. The Liste adds a header
 * strip to sort and « Colonnes » to show optional fields as row pills.
 */
const RUN = process.env.JIROO_E2E_RUN_ID ?? String(Date.now());

async function context() {
  const [admin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  const [backlog] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  const [epic] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.backlogId, backlog!.id), eq(items.type, "epic"), isNull(items.deletedAt)));
  return { actorId: admin!.id, backlogId: backlog!.id, epicId: epic!.id };
}

async function task(title: string, input: Record<string, unknown> = {}) {
  const { actorId, backlogId, epicId } = await context();
  return createItem({ backlogId, type: "tache", parentId: epicId, title, ...input }, actorId);
}

test("trie la Liste par l’en-tête et affiche les colonnes choisies en pastilles", async ({ page }) => {
  const prefix = `JIR-93 liste ${RUN}`;
  const { backlogId } = await context();
  const label = await createLabel({ backlogId, name: `jir93-${RUN}`.slice(0, 40) });
  const high = await task(`${prefix} haute`, { priority: 4, labelIds: [label.id], dueDate: "2026-11-20" });
  const low = await task(`${prefix} basse`, { priority: 1 });

  await page.goto(`/b/CASS?view=list&q=${encodeURIComponent(prefix)}`);
  const table = page.getByRole("table", { name: "Liste des items" });
  const highRow = table.getByRole("row", { name: `${high.key} — ${high.title}` });
  await expect(highRow).toBeVisible();
  // The parent epic is a pill: the Liste is flat.
  await expect(highRow.getByTitle(/— 2FA TOTP$/)).toBeVisible();
  await expect(highRow.getByText(label.name)).toHaveCount(0);

  const priority = table.getByRole("columnheader", { name: "Priorité" });
  await expect(priority).toHaveAttribute("aria-sort", "none");
  await priority.getByRole("button").click();
  await expect(page).toHaveURL(/[?&]sort=priority%3Aasc/);
  await expect(priority).toHaveAttribute("aria-sort", "ascending");
  await priority.getByRole("button").press("Enter");
  await expect(page).toHaveURL(/[?&]sort=priority%3Adesc/);
  await expect(priority).toHaveAttribute("aria-sort", "descending");
  const keys = await table.locator("[role=row][data-shortcut-item]").evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-shortcut-item")),
  );
  expect(keys).toEqual([high.key, low.key]);

  await page.getByRole("button", { name: "Configurer les colonnes" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Labels" }).click();
  await expect(page).toHaveURL(/[?&]lblcol=1/);
  await page.keyboard.press("Escape");
  await expect(highRow.getByText(label.name)).toBeVisible();

  await page.reload();
  await expect(highRow.getByText(label.name)).toBeVisible();
  await expect(highRow.getByTitle("Échéance")).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: "Priorité" }))
    .toHaveAttribute("aria-sort", "descending");

  await highRow.getByText(high.title).click();
  await expect(page).toHaveURL(new RegExp(`[?&]item=${high.key}(&|$)`));
  await expect(page.getByRole("dialog", { name: new RegExp(high.key) })).toBeVisible();
});

test("montre Mes items en lignes du Backlog qui ouvrent l’item", async ({ page }) => {
  const { actorId } = await context();
  const mine = await task(`JIR-93 mes items ${RUN}`, {
    assigneeId: actorId,
    kind: "bug",
    estimatePoints: 3,
    priority: 3,
  });

  await page.goto("/mine");
  const row = page.getByRole("listitem").filter({ hasText: mine.title });
  await expect(row.getByText("Bug")).toBeVisible();
  await expect(row.getByText("À faire")).toBeVisible();
  await expect(row.getByTitle("Points")).toHaveText(/3/);
  await row.getByRole("link", { name: new RegExp(mine.key) }).click();
  await expect(page).toHaveURL(new RegExp(`/b/CASS\\?item=${mine.key}$`));
  await expect(page.getByRole("dialog", { name: new RegExp(`^${mine.key} —`) })).toBeVisible();
});
