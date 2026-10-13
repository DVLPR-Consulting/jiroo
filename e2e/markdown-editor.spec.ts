import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { activities, backlogs, comments, items } from "../lib/db/schema";
import { createItem } from "../lib/services/items";

// JIR-66: Markdown is edited in the shared WYSIWYG editor (Tiptap) and still
// stored as Markdown. Release notes are covered in releases.spec.ts (25, 26).
// JIR-71: the description is a Notion-like page edited in place and saved
// automatically, with a « / » block menu and a bar over the selection.

const ADMIN_EMAIL = "platform-admin@jiroo.local";
/** Review screenshots (JIR-71): JIROO_E2E_SHOTS_DIR or the test output. */
function shotPath(testInfo: TestInfo, name: string) {
  const dir = process.env.JIROO_E2E_SHOTS_DIR;
  return dir ? `${dir}/${name}` : testInfo.outputPath(name);
}

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

/** In the page: the caret is collapsed at the end of its text block. */
function caretAtBlockEnd() {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!selection?.isCollapsed || !node) return false;
  const element = node instanceof Element ? node : node.parentElement;
  const block = element?.closest("p, li, h1, h2, h3, h4, h5, h6");
  if (!block) return false;
  const rest = document.createRange();
  rest.setStart(node, selection.anchorOffset);
  rest.setEnd(block, block.childNodes.length);
  return rest.toString() === "";
}

async function descriptionActivities(id: string) {
  return db.select({ oldValue: activities.oldValue, newValue: activities.newValue })
    .from(activities)
    .where(and(eq(activities.itemId, id), eq(activities.field, "description")));
}

async function storedDescription(id: string) {
  const [row] = await db.select({ description: items.description }).from(items)
    .where(eq(items.id, id));
  return row?.description ?? null;
}

test.describe("éditeur Markdown visuel", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("écrit la description en place, l’enregistre automatiquement en Markdown et la rouvre formatée", async ({
    page,
  }, testInfo) => {
    const item = await fixtureItem("JIR-71 description");
    const dialog = await openItem(page, item.key);
    const main = dialog.getByTestId("item-detail-main");
    const editor = main.getByRole("textbox", { name: "Description" });

    // No edit mode: the editor is there, with its placeholder.
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await expect(main.getByText("Écrivez, ou tapez « / » pour insérer un bloc…")).toBeVisible();
    await expect(main.getByRole("button", { name: "Éditer" })).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
    // Only the comment composer, below, keeps a formatting toolbar.
    await expect(dialog.getByRole("region", { name: "Description" })
      .getByRole("toolbar", { name: "Mise en forme" })).toHaveCount(0);
    await page.screenshot({ path: shotPath(testInfo, "jir71-rest-empty.png") });

    // « / » menu: filter, then insert a heading with the keyboard.
    await editor.click();
    await page.keyboard.type("/");
    const menu = main.getByRole("listbox", { name: "Insérer un bloc" });
    await expect(menu.getByRole("option")).toHaveCount(10);
    await page.keyboard.type("titre");
    await expect(menu.getByRole("option")).toHaveText(["Titre 1#", "Titre 2##", "Titre 3###"]);
    await page.screenshot({ path: shotPath(testInfo, "jir71-focus-slash-menu.png") });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await page.keyboard.type("Étapes");
    await page.keyboard.press("Enter");
    // Mouse: a task list from the menu.
    await page.keyboard.type("/tâch");
    await menu.getByRole("option", { name: /Liste de tâches/ }).click();
    await page.keyboard.type("Vérifier");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    // Markdown input rules still work.
    await page.keyboard.type("1. Ouvrir");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Valider");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Un mot important ici");

    // Selection bar over « important »: bold, then a link checked against
    // the link policy.
    for (let i = 0; i < " ici".length; i += 1) await page.keyboard.press("ArrowLeft");
    for (let i = 0; i < "important".length; i += 1) await page.keyboard.press("Shift+ArrowLeft");
    const bar = main.getByRole("toolbar", { name: "Mise en forme de la sélection" });
    await expect(bar).toBeVisible();
    for (const name of ["Gras", "Italique", "Barré", "Code", "Lien"]) {
      await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await bar.getByRole("button", { name: "Gras" }).click();
    await expect(editor.locator("strong")).toHaveText("important");
    await page.screenshot({ path: shotPath(testInfo, "jir71-bubble-menu.png") });
    await bar.getByRole("button", { name: "Lien" }).click();
    const url = main.getByRole("textbox", { name: "Adresse du lien" });
    await url.fill("javascript:alert(1)");
    await url.press("Enter");
    await expect(main.getByRole("alert")).toContainText("Adresse invalide");
    await url.press("Escape");
    await expect(url).toHaveCount(0);
    await expect(dialog).toBeVisible();

    // Autosave after the pause, with its status.
    const status = main.getByText("Enregistré", { exact: true });
    await expect(status).toBeVisible();
    const expected = [
      "## Étapes",
      "- [ ] Vérifier",
      "1. Ouvrir\n2. Valider",
      "Un mot **important** ici",
    ].join("\n\n");
    await expect.poll(() => storedDescription(item.id)).toBe(expected);

    // Reloaded: same page, formatted, and nothing is saved again.
    await page.reload();
    const reopened = page.getByRole("dialog", { name: new RegExp(`^${item.key} —`) })
      .getByRole("textbox", { name: "Description" });
    await expect(reopened.getByRole("heading", { level: 2, name: "Étapes" })).toBeVisible();
    await expect(reopened.locator("strong")).toHaveText("important");
    await expect(reopened.getByRole("checkbox", { name: "Tâche à faire : Vérifier" })).not.toBeChecked();
    await page.screenshot({ path: shotPath(testInfo, "jir71-rest.png") });
    expect(await storedDescription(item.id)).toBe(expected);
  });

  test("garde une seule entrée d’historique pour plusieurs enregistrements automatiques", async ({
    page,
  }) => {
    const item = await fixtureItem("JIR-71 historique", "Premier jet");
    const dialog = await openItem(page, item.key);
    const main = dialog.getByTestId("item-detail-main");
    const editor = main.getByRole("textbox", { name: "Description" });
    const saved = main.getByText("Enregistré", { exact: true });

    await editor.getByText("Premier jet").click();
    await page.keyboard.press("End");
    await page.keyboard.type(", complété");
    await expect(saved).toBeVisible();
    await expect.poll(() => storedDescription(item.id)).toBe("Premier jet, complété");
    await page.keyboard.type(" puis relu");
    await expect.poll(() => storedDescription(item.id)).toBe("Premier jet, complété puis relu");
    // Blur saves too.
    await page.keyboard.type(".");
    await main.getByRole("tab", { name: "Historique" }).click();
    await expect.poll(() => storedDescription(item.id)).toBe("Premier jet, complété puis relu.");

    expect(await descriptionActivities(item.id)).toEqual([
      { oldValue: "Premier jet", newValue: "Premier jet, complété puis relu." },
    ]);
    await page.reload();
    await page.getByRole("dialog", { name: new RegExp(`^${item.key} —`) })
      .getByRole("tab", { name: "Historique" }).click();
    await expect(page.getByText("a modifié la description")).toHaveCount(1);
  });

  test("quitte l’éditeur avec Échap en enregistrant, puis ferme le panneau au second Échap", async ({
    page,
  }) => {
    const item = await fixtureItem("JIR-71 échap", "Texte");
    const dialog = await openItem(page, item.key);
    const editor = dialog.getByRole("textbox", { name: "Description" });
    await editor.getByText("Texte").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" final");
    await page.keyboard.press("Escape");
    await expect(editor).not.toBeFocused();
    await expect(dialog).toBeVisible();
    await expect.poll(() => storedDescription(item.id)).toBe("Texte final");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("affiche la description en lecture seule au lecteur", async ({ browser }, testInfo) => {
    const item = await fixtureItem(
      "JIR-71 lecteur",
      "## Contexte\n\nVoir [la doc](https://exemple.fr).",
    );
    const context = await browser.newContext({
      storageState: ".playwright/.auth/reader.json",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    try {
      const dialog = await openItem(page, item.key);
      const main = dialog.getByTestId("item-detail-main");
      const editor = main.getByRole("textbox", { name: "Description" });
      await expect(editor.getByRole("heading", { level: 2, name: "Contexte" })).toBeVisible();
      await expect(editor).toHaveAttribute("contenteditable", "false");
      await expect(editor).toHaveAttribute("aria-readonly", "true");
      await expect(editor.getByRole("link", { name: "la doc" })).toHaveAttribute(
        "href",
        "https://exemple.fr",
      );
      await expect(main.getByText("Écrivez, ou tapez « / » pour insérer un bloc…")).toHaveCount(0);
      await editor.getByText("Voir").click();
      await page.keyboard.type("/");
      await expect(main.getByRole("listbox")).toHaveCount(0);
      await page.screenshot({ path: shotPath(testInfo, "jir71-read-only.png") });
      expect(await storedDescription(item.id)).toBe("## Contexte\n\nVoir [la doc](https://exemple.fr).");
    } finally {
      await context.close();
    }
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
    // Keyboard only: after a click, ProseMirror writes its own selection back
    // to the DOM on a timer, which could undo an End pressed right after it
    // (Enter then split « correctif »). Move to the document end instead.
    await edit.focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
    await expect.poll(() => page.evaluate(caretAtBlockEnd)).toBe(true);
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

  test("affiche les titres d’un commentaire enregistré comme dans l’éditeur", async ({ page }, testInfo) => {
    const item = await fixtureItem("JIR-68 titres");
    const dialog = await openItem(page, item.key);
    await dialog.getByRole("tab", { name: "Commentaires" }).click();

    const composer = dialog.getByRole("textbox", { name: "Nouveau commentaire" });
    await composer.click();
    await page.keyboard.type("## Contexte");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Détail");
    const typed = composer.getByRole("heading", { level: 2, name: "Contexte" });
    const editorSize = await typed.evaluate((el) => getComputedStyle(el).fontSize);
    await page.keyboard.press("ControlOrMeta+Enter");

    // Saved, the heading keeps the editor's size instead of body text (JIR-68).
    const article = dialog.getByRole("article", { name: `Commentaire de ${item.adminName}` });
    const heading = article.getByRole("heading", { level: 2, name: "Contexte" });
    await expect(heading).toBeVisible();
    const style = await heading.evaluate((el) => {
      const computed = getComputedStyle(el);
      return { fontSize: computed.fontSize, fontWeight: computed.fontWeight };
    });
    expect(style).toEqual({ fontSize: "17px", fontWeight: "600" });
    expect(editorSize).toBe("17px");
    await article.screenshot({ path: testInfo.outputPath("comment-heading.png") });
  });
});
