import "dotenv/config";

import { expect, test, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items } from "../lib/db/schema/domain";
import { createBacklog } from "../lib/services/backlogs";

/**
 * JIR-88: a brand-new backlog guides its first steps — a Composant, then an
 * Epic, then tasks — through the calls to action of Liste, Arbre and Backlog.
 * The backlog is created here and removed afterwards: other specs (the
 * backlogs home) expect only CASS and LABS.
 */
const KEY = "ONBO";
const COMPOSANT = "Portail justiciable";
const EPIC = "Dépôt en ligne";
const TASK = "Formulaire de dépôt";

async function removeBacklog() {
  const rows = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, KEY));
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;
  await db.delete(items).where(inArray(items.backlogId, ids));
  await db.delete(backlogs).where(inArray(backlogs.id, ids));
}

test.beforeAll(async () => {
  await removeBacklog();
  const [admin] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  if (!admin) throw new Error("Compte administrateur Playwright introuvable.");
  await createBacklog({ key: KEY, name: "Premiers pas E2E", color: "#0f766e" }, admin.id);
});

test.afterAll(removeBacklog);

async function createFromDialog(page: Page, type: string, title: string, parent?: string) {
  const dialog = page.getByRole("dialog", { name: "Nouvel item" });
  await expect(dialog.getByRole("combobox", { name: "Type" })).toHaveText(type);
  if (parent) {
    await expect(dialog.getByRole("combobox", { name: /Parent/ })).toContainText(parent);
  }
  await dialog.getByRole("textbox", { name: /Titre/ }).fill(title);
  await dialog.getByRole("button", { name: "Créer" }).click();
  await expect(dialog).toHaveCount(0);
}

test("guide un nouveau backlog : Composant, puis Epic, puis Tâche", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Liste: an empty backlog starts with a Composant.
  await page.goto(`/b/${KEY}?view=list`);
  await expect(
    page.getByRole("heading", { name: "Commencez par créer un Composant (un domaine ou un produit)" }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir88-1-liste-composant.png") });
  await page.getByRole("button", { name: "Nouveau Composant" }).click();
  await createFromDialog(page, "Composant", COMPOSANT);
  await expect(page.getByRole("row", { name: new RegExp(`${COMPOSANT}$`) })).toBeVisible();
  await expect(page.getByRole("note", { name: "Créez une Epic dans un Composant" })).toBeVisible();

  // 2. Arbre: the Epic starts under the only Composant.
  await page.goto(`/b/${KEY}?view=tree`);
  const epicNote = page.getByRole("note", { name: "Créez une Epic dans un Composant" });
  await expect(epicNote).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir88-2-arbre-epic.png") });
  await epicNote.getByRole("button", { name: "Nouvelle Epic" }).click();
  await createFromDialog(page, "Epic", EPIC, COMPOSANT);
  await expect(page.getByRole("button", { name: new RegExp(`${EPIC}$`) })).toBeVisible();
  await expect(epicNote).toHaveCount(0);

  // 3. Backlog: « Créer un item » is back, under the new Epic.
  await page.goto(`/b/${KEY}?view=backlog`);
  const backlog = page.getByRole("region", { name: "Backlog", exact: true });
  await backlog.getByRole("button", { name: "Créer un item dans Backlog" }).click();
  await expect(backlog.getByRole("combobox", { name: "Epic parent" })).toContainText(EPIC);
  const field = backlog.getByRole("textbox", { name: "Titre du nouvel item dans Backlog" });
  await field.fill(TASK);
  await field.press("Enter");
  await expect(backlog.getByRole("row", { name: new RegExp(`${TASK}$`) })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir88-3-backlog-tache.png") });
});

test("remplace « Créer un item » par l’étape manquante dans le Backlog", async ({ page }, testInfo) => {
  await removeBacklog();
  const [admin] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  await createBacklog({ key: KEY, name: "Premiers pas E2E", color: "#0f766e" }, admin!.id);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/b/${KEY}?view=backlog`);
  const backlog = page.getByRole("region", { name: "Backlog", exact: true });
  await expect(
    backlog.getByRole("note", { name: "Commencez par créer un Composant (un domaine ou un produit)" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Créer un item/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("jir88-4-backlog-composant.png") });
  await backlog.getByRole("button", { name: "Nouveau Composant (Backlog)" }).click();
  await createFromDialog(page, "Composant", COMPOSANT);

  await expect(backlog.getByRole("note", { name: "Créez une Epic dans un Composant" })).toBeVisible();
  await expect(backlog.getByText("Pour créer un item, créez d’abord une Epic.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir88-5-backlog-epic.png") });
  await backlog.getByRole("button", { name: "Nouvelle Epic (Backlog)" }).click();
  await createFromDialog(page, "Epic", EPIC, COMPOSANT);

  await expect(backlog.getByRole("button", { name: "Créer un item dans Backlog" })).toBeVisible();
  await expect(backlog.getByRole("note")).toHaveCount(0);
});
