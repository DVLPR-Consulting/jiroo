import "dotenv/config";

import { expect, test } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, itemFixVersions, items, releases } from "../lib/db/schema/domain";
import { createBacklog } from "../lib/services/backlogs";
import { createItem } from "../lib/services/items";
import { chooseOption } from "./select-helpers";

/**
 * JIR-92: under a Version filter that matches no item, creation still offers
 * the backlog's Composant and Epic as parents — inline in the Backlog and in
 * « + Créer ». The backlog is created here and removed afterwards: other
 * specs (the backlogs home) expect only CASS and LABS.
 */
const KEY = "VFLT";
const COMPOSANT = "Greffe numérique";
const EPIC = "Relances";
const INLINE_TASK = "Relance par courriel";
const DIALOG_TASK = "Relance par courrier";

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

let backlogId = "";
let epicId = "";
let releaseId = "";

test.beforeAll(async () => {
  await removeBacklog();
  const actorId = await adminId();
  const backlog = await createBacklog({ key: KEY, name: "Filtre Version E2E", color: "#b45309" }, actorId);
  backlogId = backlog.id;
  const composant = await createItem({ backlogId, type: "composant", title: COMPOSANT }, actorId);
  const epic = await createItem({ backlogId, type: "epic", parentId: composant.id, title: EPIC }, actorId);
  epicId = epic.id;
  // Inserted directly: the release service writes append-only events that
  // would keep the backlog from being removed.
  const [release] = await db.insert(releases)
    .values({ backlogId, name: "Version vide", createdBy: actorId })
    .returning({ id: releases.id });
  releaseId = release!.id;
});
test.afterAll(removeBacklog);

async function createdTask(title: string) {
  const [task] = await db.select({ id: items.id, type: items.type, parentId: items.parentId }).from(items)
    .where(and(eq(items.backlogId, backlogId), eq(items.title, title)));
  return task;
}

test("crée une Tâche sous l’Epic masquée par un filtre Version vide", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/b/${KEY}?view=backlog&version=${releaseId}`);
  const backlog = page.getByRole("region", { name: "Backlog" });

  // 1. Inline « Créer un item »: the hidden Epic is the parent.
  await backlog.getByRole("button", { name: "Créer un item dans Backlog" }).click();
  await expect(backlog.getByRole("combobox", { name: "Epic parent" })).toContainText(EPIC);
  await expect(backlog.getByText(/Aucun epic disponible|Aucune Epic/)).toHaveCount(0);
  const title = backlog.getByRole("textbox", { name: "Titre du nouvel item dans Backlog" });
  await title.fill(INLINE_TASK);
  await page.screenshot({ path: testInfo.outputPath("jir92-1-inline-epic-masquee.png") });
  await title.press("Enter");
  await expect(page.getByText(/^VFLT-\d+ créé\.$/)).toBeVisible();
  await expect.poll(() => createdTask(INLINE_TASK)).toEqual({
    id: expect.any(String),
    type: "tache",
    parentId: epicId,
  });
  // No Version is set for it: the filtered view keeps it hidden.
  const inlineTask = await createdTask(INLINE_TASK);
  await expect(
    db.select().from(itemFixVersions).where(eq(itemFixVersions.itemId, inlineTask!.id)),
  ).resolves.toEqual([]);
  await expect(backlog.getByText(INLINE_TASK, { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("jir92-2-inline-cree-masquee.png") });
  await title.press("Escape");

  // 2. « + Créer »: the Epic and the Composant are parent choices.
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nouvel item" });
  await chooseOption(dialog, "Type", "Epic");
  const parent = dialog.getByRole("combobox", { name: /Parent/ });
  await expect(parent).not.toHaveAttribute("aria-describedby");
  await parent.click();
  await expect(page.getByRole("option", { name: new RegExp(`${COMPOSANT}$`) })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir92-3-dialog-composant.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  await chooseOption(dialog, "Type", "Tâche");
  await chooseOption(dialog, /Parent/, new RegExp(`${EPIC}$`));
  await dialog.getByRole("textbox", { name: /Titre/ }).fill(DIALOG_TASK);
  await page.screenshot({ path: testInfo.outputPath("jir92-4-dialog-epic.png") });
  await dialog.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => createdTask(DIALOG_TASK)).toEqual({
    id: expect.any(String),
    type: "tache",
    parentId: epicId,
  });
});
