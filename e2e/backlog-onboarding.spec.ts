import "dotenv/config";

import { expect, test, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items, releases } from "../lib/db/schema/domain";
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
  await db.delete(releases).where(inArray(releases.backlogId, ids));
  await db.delete(backlogs).where(inArray(backlogs.id, ids));
}

async function adminId() {
  const [admin] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  if (!admin) throw new Error("Compte administrateur Playwright introuvable.");
  return admin.id;
}

/** A fresh ONBO backlog, through the backlog service (statuses and access included). */
async function recreateBacklog() {
  await removeBacklog();
  return createBacklog({ key: KEY, name: "Premiers pas E2E", color: "#0f766e" }, await adminId());
}

/**
 * A version of ONBO without items. The row is inserted directly: the release
 * service writes append-only events that would keep the backlog from being removed.
 */
async function emptyRelease() {
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, KEY));
  const [release] = await db.insert(releases)
    .values({ backlogId: backlog!.id, name: "Version vide", createdBy: await adminId() })
    .returning({ id: releases.id });
  return release!;
}

test.beforeAll(recreateBacklog);
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
  await expect(page.getByRole("listitem", { name: new RegExp(`${COMPOSANT}$`) })).toBeVisible();
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

  // 4. A version without items is an empty result, not a new backlog.
  const release = await emptyRelease();
  for (const view of ["list", "tree"]) {
    await page.goto(`/b/${KEY}?view=${view}&version=${release.id}`);
    await expect(page.getByRole("heading", { name: "Aucun résultat" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Effacer les filtres" })).toBeVisible();
    await expect(page.getByText(/Commencez par créer un Composant/)).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath("jir88-6-version-vide.png") });
});

test("remplace « Créer un item » par l’étape manquante dans le Backlog", async ({ page }, testInfo) => {
  await recreateBacklog();
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

  // Under a Version filter the Composant is not among the candidates: no Epic
  // dialog that could not be completed, a way back to the unfiltered view.
  const release = await emptyRelease();
  await page.goto(`/b/${KEY}?view=backlog&version=${release.id}`);
  await expect(
    backlog.getByText("Pour créer un item, il faut d’abord une Epic : effacez les filtres pour la créer."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Nouvelle Epic|Créer un item/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("jir88-7-backlog-version-vide.png") });
  await backlog.getByRole("link", { name: "Effacer les filtres" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${KEY}\\?view=backlog$`));

  await backlog.getByRole("button", { name: "Nouvelle Epic (Backlog)" }).click();
  await createFromDialog(page, "Epic", EPIC, COMPOSANT);

  await expect(backlog.getByRole("button", { name: "Créer un item dans Backlog" })).toBeVisible();
  await expect(backlog.getByRole("note")).toHaveCount(0);
});
