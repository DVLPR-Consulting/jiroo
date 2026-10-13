import "dotenv/config";

import { expect, test } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items, releases } from "../lib/db/schema/domain";
import { createBacklog } from "../lib/services/backlogs";
import { chooseOption } from "./select-helpers";

/**
 * JIR-91: « + Créer » with the type Epic in a backlog without Composant
 * offers « Créer un Composant », which switches the same draft to a
 * Composant. The backlog is created here and removed afterwards: other specs
 * (the backlogs home) expect only CASS and LABS.
 */
const KEY = "PRNT";
const COMPOSANT = "Espace usagers";
const DESCRIPTION = "Tout ce qui concerne les usagers.";
const EPIC = "Compte usager";

async function removeBacklog() {
  const rows = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, KEY));
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;
  await db.delete(items).where(inArray(items.backlogId, ids));
  await db.delete(releases).where(inArray(releases.backlogId, ids));
  await db.delete(backlogs).where(inArray(backlogs.id, ids));
}

async function adminId() {
  const [admin] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  if (!admin) throw new Error("Compte administrateur Playwright introuvable.");
  return admin.id;
}

test.beforeAll(async () => {
  await removeBacklog();
  await createBacklog({ key: KEY, name: "Parent manquant E2E", color: "#7c3aed" }, await adminId());
});
test.afterAll(removeBacklog);

test("« + Créer » une Epic sans Composant propose de créer le Composant d’abord", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/b/${KEY}?view=list`);
  const createButton = page.getByRole("button", { name: "Créer", exact: true });

  // 1. Epic first: no Composant to attach it to.
  await createButton.click();
  const dialog = page.getByRole("dialog", { name: "Nouvel item" });
  await chooseOption(dialog, "Type", "Epic");
  await dialog.getByRole("textbox", { name: /Titre/ }).fill(COMPOSANT);
  const description = dialog.getByRole("textbox", { name: "Description" });
  await description.click();
  await description.pressSequentially(DESCRIPTION);
  const parent = dialog.getByRole("combobox", { name: /Parent/ });
  await expect(parent).toHaveAccessibleDescription(
    "Aucun Composant dans ce backlog : une Epic se rattache toujours à un Composant.",
  );
  await expect(dialog.getByRole("button", { name: "Créer", exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("jir91-1-epic-sans-composant.png") });

  // 2. « Créer un Composant » switches the same draft, text kept.
  await dialog.getByRole("button", { name: "Créer un Composant" }).click();
  const type = dialog.getByRole("combobox", { name: "Type" });
  await expect(type).toHaveText("Composant");
  await expect(type).toBeFocused();
  await expect(parent).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: /Titre/ })).toHaveValue(COMPOSANT);
  await expect(description).toContainText(DESCRIPTION);
  const submit = dialog.getByRole("button", { name: "Créer", exact: true });
  await expect(submit).toBeEnabled();
  // Waits out the button's fade from its disabled look before the capture.
  await expect(submit).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("jir91-2-bascule-composant.png") });
  await submit.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("listitem", { name: new RegExp(`${COMPOSANT}$`) })).toBeVisible();

  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, KEY));
  const [composant] = await db.select({ type: items.type, description: items.description }).from(items)
    .where(and(eq(items.backlogId, backlog!.id), eq(items.title, COMPOSANT)));
  expect(composant).toEqual({ type: "composant", description: expect.stringContaining(DESCRIPTION) });

  // 3. Under a Version filter that hides the Composant, it stays a parent
  // choice (JIR-92): no « missing parent » hint, no « Créer un Composant ».
  const [release] = await db.insert(releases)
    .values({ backlogId: backlog!.id, name: "Version vide", createdBy: await adminId() })
    .returning({ id: releases.id });
  await page.goto(`/b/${KEY}?view=list&version=${release!.id}`);
  await createButton.click();
  await chooseOption(dialog, "Type", "Epic");
  await expect(parent).not.toHaveAttribute("aria-describedby");
  await expect(dialog.getByRole("button", { name: "Créer un Composant" })).toHaveCount(0);
  await parent.click();
  await expect(page.getByRole("option", { name: new RegExp(`${COMPOSANT}$`) })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir91-3-filtre-version.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // 4. Back to the Epic: the new Composant is now a parent choice.
  await page.goto(`/b/${KEY}?view=list`);
  await createButton.click();
  await chooseOption(dialog, "Type", "Epic");
  await chooseOption(dialog, /Parent/, new RegExp(`${COMPOSANT}$`));
  await expect(parent).not.toHaveAttribute("aria-describedby");
  await dialog.getByRole("textbox", { name: /Titre/ }).fill(EPIC);
  await page.screenshot({ path: testInfo.outputPath("jir91-4-epic-avec-composant.png") });
  await dialog.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("listitem", { name: new RegExp(`${EPIC}$`) })).toBeVisible();
});
