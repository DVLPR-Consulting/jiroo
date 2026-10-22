import { expect, test, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogRoleActors, backlogs, itemLabels, items, itemTemplates, labels, projectRoles } from "../lib/db/schema/domain";
import { assignBacklogRoleActor, removeBacklogRoleActor } from "../lib/services/authorization-admin";
import { createLabel } from "../lib/services/labels";
import { chooseOption } from "./select-helpers";

const RUN_ID = process.env.JIROO_E2E_RUN_ID ?? String(Date.now());

async function screenshots(page: Page, name: string, output: (name: string) => string) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: output(`jir43-${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
}

/** The direct action refusal must be asserted from the Flight result, not just HTTP 200. */
function actionResult(body: string): { ok: boolean; error?: string } {
  for (const line of body.split("\n")) {
    try {
      const value: unknown = JSON.parse(line.slice(line.indexOf(":") + 1));
      if (value && typeof value === "object" && "ok" in value && typeof value.ok === "boolean") return value as { ok: boolean; error?: string };
    } catch { /* Other Flight rows can be references or streamed module data. */ }
  }
  throw new Error("Server Action returned no discriminated result.");
}

test("an administrator shares a template, a member applies it, and management remains protected", async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const output = (name: string) => testInfo.outputPath(name);
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "CASS"));
  if (!backlog) throw new Error("CASS fixture missing.");
  const [administrator] = await db.select({ id: user.id }).from(user).where(eq(user.email, "platform-admin@jiroo.local"));
  const [memberActor] = await db.select({ id: user.id }).from(user).where(eq(user.email, "member@jiroo.local"));
  const [memberRole] = await db.select({ id: projectRoles.id }).from(projectRoles).where(eq(projectRoles.key, "members"));
  if (!administrator || !memberActor || !memberRole) throw new Error("Member role fixture missing.");
  // The shared fixture gives this account a specialised delivery role, not Member.
  // Give it the real Member role here so creating an item exercises those permissions.
  const assignment = { backlogId: backlog.id, projectRoleId: memberRole.id, principal: { type: "user" as const, userId: memberActor.id } };
  const [existingRole] = await db.select({ id: backlogRoleActors.id }).from(backlogRoleActors).where(and(
    eq(backlogRoleActors.backlogId, backlog.id),
    eq(backlogRoleActors.projectRoleId, memberRole.id),
    eq(backlogRoleActors.actorType, "user"),
    eq(backlogRoleActors.userId, memberActor.id),
  ));
  const addedRole = existingRole ? null : await assignBacklogRoleActor(assignment, administrator.id);
  try {
    const live = await createLabel({ backlogId: backlog.id, name: `sécurité-${RUN_ID}` });
    const removed = await createLabel({ backlogId: backlog.id, name: `retiré-${RUN_ID}` });
    const name = `Incident partagé ${RUN_ID}`;
    const description = "Décrire le contexte et les critères de validation.";

    await page.goto("/b/CASS/settings/templates");
    await expect(page.getByRole("heading", { name: "Modèles — Cour de cassation", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Modèles", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[data-slot="shell-breadcrumb-current"]')).toHaveText("Modèles");
    await page.getByRole("button", { name: "Nouveau modèle", exact: true }).click();
    const form = page.getByRole("form", { name: "Modèle de ticket" });
    await form.getByLabel("Nom du modèle").fill(name);
    await chooseOption(form, "Type d’item", "Tâche");
    await chooseOption(form, "Nature", "Bug");
    await form.getByLabel("Titre de départ").fill("Incident :");
    await form.getByRole("textbox", { name: "Description du modèle", exact: true }).fill(description);
    await chooseOption(form, "Priorité", "Haute");
    await form.getByRole("checkbox", { name: live.name, exact: true }).check();
    await form.getByRole("checkbox", { name: removed.name, exact: true }).check();
    await screenshots(page, "template-editor", output);
    const createRequest = page.waitForRequest((request) => request.method() === "POST" && Boolean(request.headers()["next-action"]));
    await form.getByRole("button", { name: "Créer le modèle", exact: true }).click();
    const actionId = (await createRequest).headers()["next-action"];
    if (!actionId) throw new Error("Template action ID missing.");
    await expect(page.getByRole("dialog", { name: "Nouveau modèle", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: `Modifier le modèle ${name}`, exact: true })).toBeVisible();

    await page.getByRole("button", { name: `Modifier le modèle ${name}`, exact: true }).click();
    await page.getByLabel("Titre de départ").fill("Incident de sécurité :");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Modifier le modèle", exact: true })).toBeHidden();
    // Both labels still exist while the administrator intentionally edits the title.
    const [stored] = await db.select().from(itemTemplates).where(and(eq(itemTemplates.backlogId, backlog.id), eq(itemTemplates.name, name)));
    expect(stored?.title).toBe("Incident de sécurité :");
    expect(stored?.labelIds).toEqual([live.id, removed.id]);

    // Fixture deletion simulates a label removed after saving a template.
    await db.delete(labels).where(eq(labels.id, removed.id));
    await page.reload();
    await expect(page.getByText("1 label du modèle n’existe plus", { exact: true })).toBeVisible();
    await screenshots(page, "settings", output);


    const memberContext = await browser.newContext({ baseURL, storageState: ".playwright/.auth/member.json", viewport: { width: 1440, height: 960 } });
    try {
      const member = await memberContext.newPage();
      await member.goto("/b/CASS/settings/templates");
      await expect(member).toHaveURL(/\/b\/CASS$/u);
      await expect(member.getByRole("link", { name: "Modèles", exact: true })).toHaveCount(0);
      const forbiddenName = `Interdit ${RUN_ID}`;
      const refusal = await memberContext.request.post("/b/CASS/settings/templates", {
        headers: { Origin: baseURL!, "next-action": actionId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
        data: JSON.stringify([{ backlogId: backlog.id, name: forbiddenName }]),
      });
      const refused = actionResult(await refusal.text());
      expect(refused.ok).toBe(false);
      expect(refused.error).toContain("permission");
      expect(await db.select({ id: itemTemplates.id }).from(itemTemplates).where(eq(itemTemplates.name, forbiddenName))).toEqual([]);

      await member.goto("/b/CASS?view=list");
      await expect(member.getByRole("button", { name: "Créer", exact: true })).toBeVisible();
      await member.getByRole("button", { name: "Créer", exact: true }).click();
      const createDialog = member.getByRole("dialog", { name: "Nouvel item", exact: true });
      await createDialog.getByRole("combobox", { name: "Modèle", exact: true }).click();
      await expect(member.getByRole("option", { name: "Rapport de bug", exact: true })).toBeVisible();
      await expect(member.getByRole("option", { name: "User story", exact: true })).toBeVisible();
      await expect(member.getByRole("group", { name: "Modèles du backlog", exact: true })).toContainText(name);
      await member.getByRole("option", { name, exact: true }).click();
      await expect(createDialog.getByRole("textbox", { name: "Titre", exact: true })).toHaveValue("Incident de sécurité :");
      await expect(createDialog.getByRole("textbox", { name: "Description", exact: true })).toContainText(description);
      await expect(createDialog.getByRole("combobox", { name: "Nature", exact: true })).toContainText("Bug");
      await expect(createDialog.getByRole("combobox", { name: "Priorité", exact: true })).toContainText("Haute");
      await expect(createDialog.getByRole("button", { name: "Labels", exact: true })).toContainText(live.name);
      await expect(createDialog.getByText("1 label du modèle n’existe plus", { exact: true })).toBeVisible();
      await chooseOption(createDialog, /Parent/u, { index: 0 });
      const title = `Ticket depuis le modèle ${RUN_ID}`;
      await createDialog.getByRole("textbox", { name: "Titre", exact: true }).fill(title);
      await screenshots(member, "creation", output);
      await createDialog.getByRole("button", { name: "Créer", exact: true }).click();
      await expect(createDialog).toBeHidden();
      const [created] = await db.select().from(items).where(and(eq(items.backlogId, backlog.id), eq(items.title, title)));
      const [actor] = await db.select({ id: user.id }).from(user).where(eq(user.email, "member@jiroo.local"));
      expect(created).toMatchObject({ type: "tache", kind: "bug", priority: 3, reporterId: actor!.id });
      expect(created?.description).toContain(description);
      const [unchanged] = await db.select().from(itemTemplates).where(eq(itemTemplates.id, stored!.id));
      expect(unchanged?.labelIds).toEqual([live.id, removed.id]);
      expect(unchanged?.title).toBe("Incident de sécurité :");
      expect(await db.select({ labelId: itemLabels.labelId }).from(itemLabels).where(eq(itemLabels.itemId, created!.id))).toEqual([{ labelId: live.id }]);

      await page.goto("/b/CASS/settings/templates");
      await page.getByRole("button", { name: `Supprimer le modèle ${name}`, exact: true }).click();
      await page.getByRole("dialog", { name: "Supprimer le modèle ?", exact: true }).getByRole("button", { name: "Supprimer", exact: true }).click();
      await expect(page.getByRole("button", { name: `Supprimer le modèle ${name}`, exact: true })).toHaveCount(0);
      expect(await db.select({ id: items.id }).from(items).where(eq(items.id, created!.id))).toHaveLength(1);
      await member.goto("/aide");
      await expect(member.getByRole("heading", { name: "Paramètres du backlog", exact: true })).toBeVisible();
    } finally { await memberContext.close().catch(() => {}); }
  } finally {
    // Preserve pre-existing roles and restore permissions even if the UI flow fails.
    if (addedRole) await removeBacklogRoleActor(assignment, administrator.id);
  }
});
