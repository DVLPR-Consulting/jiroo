import "dotenv/config";

import { expect, test } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items, releases } from "../lib/db/schema/domain";
import { createBacklog } from "../lib/services/backlogs";
import { createItem } from "../lib/services/items";
import { chooseOption } from "./select-helpers";

/**
 * JIR-69: « Nouvel item » marks the Parent field required and, on « Créer »
 * without a parent, says so on the field and focuses it instead of keeping
 * the button silently disabled. The backlog is created here and removed
 * afterwards: other specs (the backlogs home) expect only CASS and LABS.
 */
const KEY = "RQPT";
const COMPOSANT = "Bureau d’ordre";
const EPIC = "Courrier entrant";
const TASK = "Scanner les plis";

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

test.beforeAll(async () => {
  await removeBacklog();
  const actorId = await adminId();
  const backlog = await createBacklog({ key: KEY, name: "Parent obligatoire E2E", color: "#0f766e" }, actorId);
  backlogId = backlog.id;
  const composant = await createItem({ backlogId, type: "composant", title: COMPOSANT }, actorId);
  const epic = await createItem({ backlogId, type: "epic", parentId: composant.id, title: EPIC }, actorId);
  epicId = epic.id;
});
test.afterAll(removeBacklog);

test("« Créer » sans parent signale le champ Parent obligatoire, puis crée la Tâche", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/b/${KEY}?view=list`);
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nouvel item" });
  await chooseOption(dialog, "Type", "Tâche");

  // 1. Required at a glance: asterisk, « (obligatoire) » and the rule.
  const parent = dialog.getByRole("combobox", { name: "Parent (obligatoire)", exact: true });
  await expect(parent).toHaveAttribute("aria-required", "true");
  await expect(parent).toHaveAccessibleDescription("Une Tâche se rattache toujours à une Epic.");
  await dialog.getByRole("textbox", { name: /Titre/ }).fill(TASK);

  // 2. « Créer » without a parent: the error is on the field, which gets focus.
  const submit = dialog.getByRole("button", { name: "Créer", exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog.getByText("Parent obligatoire : choisissez une Epic.", { exact: true })).toBeVisible();
  await expect(parent).toBeFocused();
  await expect(parent).toHaveAttribute("aria-invalid", "true");
  await expect(parent).toHaveAccessibleDescription(
    "Parent obligatoire : choisissez une Epic. Une Tâche se rattache toujours à une Epic.",
  );
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jir69-1-parent-manquant.png") });

  // 3. Choosing the Epic clears the error; « Créer » creates the Tâche.
  await chooseOption(dialog, /Parent/, new RegExp(`${EPIC}$`));
  await expect(parent).not.toHaveAttribute("aria-invalid");
  await expect(dialog.getByText(/Parent obligatoire/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("jir69-2-parent-choisi.png") });
  await submit.click();
  await expect(dialog).toHaveCount(0);

  const [task] = await db.select({ type: items.type, parentId: items.parentId }).from(items)
    .where(and(eq(items.backlogId, backlogId), eq(items.title, TASK)));
  expect(task).toEqual({ type: "tache", parentId: epicId });
});
