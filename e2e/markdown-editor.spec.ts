import { expect, test, type Page } from "@playwright/test";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, comments, items } from "../lib/db/schema";
import { createItem } from "../lib/services/items";

// JIR-66: Markdown is edited in the shared WYSIWYG editor (Tiptap) and still
// stored as Markdown. Release notes are covered in releases.spec.ts (25, 26).

const ADMIN_EMAIL = "platform-admin@jiroo.local";

async function fixtureItem(title: string, description: string | null = null) {
  const [admin] = await db.select({ id: user.id, name: user.name }).from(user)
    .where(eq(user.email, ADMIN_EMAIL));
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  if (!admin || !backlog) throw new Error("Fixtures E2E introuvables.");
  const [epic] = await db.select({ id: items.id }).from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, "epic")));
  if (!epic) throw new Error("Epic fixture introuvable.");
  const runId = process.env.JIROO_E2E_RUN_ID ?? String(Date.now());
  const created = await createItem({
    backlogId: backlog.id,
    type: "tache",
    parentId: epic.id,
    title: `${title} ${runId}`,
    description,
  }, admin.id, `e2e-markdown-editor-${title}-${runId}`);
  return { ...created, adminName: admin.name };
}

async function openItem(page: Page, key: string) {
  await page.goto(`/b/CASS?view=list&item=${key}`);
  const dialog = page.getByRole("dialog", { name: new RegExp(`^${key} —`) });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function storedDescription(id: string) {
  const [row] = await db.select({ description: items.description }).from(items)
    .where(eq(items.id, id));
  return row?.description ?? null;
}

test.describe("éditeur Markdown visuel", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("met en forme une description à la barre d’outils et au clavier, l’enregistre en Markdown et la rouvre formatée", async ({
    page,
  }, testInfo) => {
    const item = await fixtureItem("JIR-66 description");
    const dialog = await openItem(page, item.key);

    await dialog.getByRole("button", { name: "Ajouter une description" }).click();
    const editor = dialog.getByRole("textbox", { name: "Description" });
    await expect(editor).toBeFocused();
    // The comment composer (always shown on top of the activity) has its own toolbar.
    const toolbar = dialog.getByRole("region", { name: "Description" })
      .getByRole("toolbar", { name: "Mise en forme" });

    // Toolbar: heading.
    await toolbar.getByRole("button", { name: "Titre 2" }).click();
    await expect(toolbar.getByRole("button", { name: "Titre 2" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.type("Étapes");
    await page.keyboard.press("Enter");
    // Markdown input rules: numbered list, bold, inline code, task list.
    await page.keyboard.type("1. Ouvrir");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Valider");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("**important** et `code`");
    await page.keyboard.press("Enter");
    // Keyboard shortcut: italic.
    await page.keyboard.press("ControlOrMeta+i");
    await page.keyboard.type("nuance");
    await page.keyboard.press("ControlOrMeta+i");
    await page.keyboard.press("Enter");
    await page.keyboard.type("[ ] Vérifier");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    // Link: javascript: refused, Escape closes the form only, then a valid URL.
    await page.keyboard.press("ControlOrMeta+k");
    const url = dialog.getByRole("textbox", { name: "Adresse du lien" });
    await expect(url).toBeFocused();
    await url.fill("javascript:alert(1)");
    await url.press("Enter");
    await expect(dialog.getByRole("alert")).toContainText("Adresse invalide");
    await url.press("Escape");
    await expect(url).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await toolbar.getByRole("button", { name: "Lien" }).click();
    await dialog.getByRole("textbox", { name: "Adresse du lien" }).fill("exemple.fr");
    await dialog.getByRole("textbox", { name: "Adresse du lien" }).press("Enter");

    await expect(editor.getByRole("heading", { level: 2, name: "Étapes" })).toBeVisible();
    await expect(editor.locator("strong")).toHaveText("important");
    await expect(dialog.getByText(/^\d+ \/ 20 000$/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("description-editor.png") });

    await dialog.getByTestId("item-detail-main").getByRole("button", { name: "Enregistrer" }).click();
    await expect(editor).toHaveCount(0);

    const expected = [
      "## Étapes",
      "1. Ouvrir\n2. Valider",
      "**important** et `code`",
      "*nuance*",
      "- [ ] Vérifier",
      "[https://exemple.fr](https://exemple.fr)",
    ].join("\n\n");
    await expect.poll(() => storedDescription(item.id)).toBe(expected);

    // Read mode: unchanged react-markdown rendering of the stored Markdown.
    await expect(dialog.getByRole("heading", { level: 2, name: "Étapes" })).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Ouvrir" })).toBeVisible();
    await expect(dialog.locator("strong", { hasText: "important" })).toBeVisible();
    await expect(dialog.locator("code", { hasText: "code" })).toBeVisible();
    await expect(dialog.locator('input[type="checkbox"]')).toHaveCount(1);
    await expect(dialog.getByRole("link", { name: "https://exemple.fr" })).toHaveAttribute(
      "href",
      "https://exemple.fr",
    );

    // Reopened after a reload: still formatted, and an untouched save keeps it.
    await page.reload();
    const reopened = page.getByRole("dialog", { name: new RegExp(`^${item.key} —`) });
    await reopened.getByRole("button", { name: "Éditer" }).click();
    const again = reopened.getByRole("textbox", { name: "Description" });
    await expect(again.getByRole("heading", { level: 2, name: "Étapes" })).toBeVisible();
    await expect(again.locator("em")).toHaveText("nuance");
    await expect(again.getByRole("checkbox", { name: "Tâche à faire : Vérifier" })).not.toBeChecked();
    await page.screenshot({ path: testInfo.outputPath("description-editor-reopened.png") });
    await reopened.getByTestId("item-detail-main").getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(again).toHaveCount(0);
    expect(await storedDescription(item.id)).toBe(expected);
  });

  test("écrit un commentaire formaté avec mention puis le modifie", async ({ page }, testInfo) => {
    const item = await fixtureItem("JIR-66 commentaire");
    const dialog = await openItem(page, item.key);
    await dialog.getByRole("tab", { name: "Commentaires" }).click();

    const composer = dialog.getByRole("textbox", { name: "Nouveau commentaire" });
    await composer.click();
    await page.keyboard.type("Merci @");
    await page.keyboard.type(item.adminName.slice(0, 5));
    const suggestions = dialog.getByRole("listbox", { name: "Suggestions de mention" });
    await suggestions.getByRole("button", { name: item.adminName }).click();
    await expect(suggestions).toHaveCount(0);
    await page.keyboard.type("pour le ");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type("correctif");
    await page.keyboard.press("ControlOrMeta+b");
    await page.screenshot({ path: testInfo.outputPath("comment-editor.png") });
    await page.keyboard.press("ControlOrMeta+Enter");

    const article = dialog.getByRole("article", { name: `Commentaire de ${item.adminName}` });
    await expect(article.locator("strong")).toHaveText("correctif");
    await expect(article.locator("mark[data-mention]")).toHaveText(`@${item.adminName}`);
    await expect(composer).toHaveText("");
    const [stored] = await db.select({ body: comments.body }).from(comments)
      .where(eq(comments.itemId, item.id)).orderBy(desc(comments.createdAt)).limit(1);
    expect(stored?.body).toBe(`Merci @${item.adminName} pour le **correctif**`);

    await article.getByRole("button", { name: "Modifier" }).click();
    const edit = article.getByRole("textbox", { name: "Modifier le commentaire" });
    await expect(edit.locator("strong")).toHaveText("correctif");
    await edit.locator("strong").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await article.getByRole("button", { name: "Liste à puces" }).click();
    await page.keyboard.type("à vérifier");
    await article.getByRole("button", { name: "Enregistrer" }).click();
    await expect(edit).toHaveCount(0);
    await expect(article.getByRole("listitem")).toHaveText("à vérifier");
    await expect.poll(async () => {
      const [row] = await db.select({ body: comments.body }).from(comments)
        .where(eq(comments.itemId, item.id)).orderBy(desc(comments.createdAt)).limit(1);
      return row?.body;
    }).toBe(`Merci @${item.adminName} pour le **correctif**\n\n- à vérifier`);
  });

  test("ouvre l’éditeur en cliquant dans la description, caret près du clic, ou au clavier", async ({
    page,
  }, testInfo) => {
    const description = "## Étapes\n\nCliquer sur le texte puis lire [la doc](https://exemple.fr).";
    const item = await fixtureItem("JIR-66 clic", description);
    const dialog = await openItem(page, item.key);
    const main = dialog.getByTestId("item-detail-main");
    const region = main.getByRole("button", { name: "Modifier la description" });
    await expect(region).toHaveCSS("cursor", "text");
    await expect(main.getByRole("button", { name: "Éditer" })).toHaveAttribute("data-variant", "outline");
    await region.getByText("Cliquer sur le texte").hover({ position: { x: 30, y: 8 } });
    await expect(region).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.screenshot({ path: testInfo.outputPath("description-click-hover.png") });

    // Click near the start of the paragraph: the caret lands there.
    await region.getByText("Cliquer sur le texte").click({ position: { x: 30, y: 8 } });
    const editor = main.getByRole("textbox", { name: "Description" });
    await expect(editor).toBeFocused();
    await page.keyboard.type("§");
    await main.getByRole("button", { name: "Enregistrer" }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(() => storedDescription(item.id)).toContain("§");
    const paragraph = (await storedDescription(item.id))!.split("\n").find((line) => line.includes("§"))!;
    expect(paragraph.startsWith("C")).toBe(true);
    expect(paragraph.indexOf("§")).toBeLessThanOrEqual(8);

    // Keyboard: the focused rendering opens the editor with Enter.
    await main.getByRole("button", { name: "Modifier la description" }).focus();
    await page.keyboard.press("Enter");
    await expect(editor).toBeFocused();
    await main.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(editor).toHaveCount(0);
  });
});
