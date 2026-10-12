import { expect, test, type Locator, type Page } from "@playwright/test";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items, releases, statuses } from "../lib/db/schema";
import { itemBranchName } from "../lib/items/branch-name";
import { createItem } from "../lib/services/items";
import { chooseOption } from "./select-helpers";

// JIR-73: the item drawer laid out like Jira's work item view, and the
// « Nouvel item » dialog styled as Jira's create screen.

const ADMIN_EMAIL = "platform-admin@jiroo.local";
const RUN_ID = process.env.JIROO_E2E_RUN_ID ?? String(Date.now());
/** Optional directory for the review screenshots (outside the repository). */
const SCREENSHOT_DIR = process.env.JIROO_E2E_SCREENSHOT_DIR;

async function fixtures() {
  const [admin] = await db.select({ id: user.id, name: user.name }).from(user)
    .where(eq(user.email, ADMIN_EMAIL));
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  if (!admin || !backlog) throw new Error("Fixtures E2E introuvables.");
  const [epic] = await db.select({ id: items.id, key: items.key }).from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, "epic"), isNull(items.deletedAt)))
    .orderBy(asc(items.key));
  if (!epic) throw new Error("Epic fixture introuvable.");
  return { admin, backlog, epic };
}

async function fixtureTask(title: string) {
  const { admin, backlog, epic } = await fixtures();
  const task = await createItem({
    backlogId: backlog.id,
    type: "tache",
    parentId: epic.id,
    title: `${title} ${RUN_ID}`,
  }, admin.id, `e2e-ticket-drawer-${title}-${RUN_ID}`);
  const child = await createItem({
    backlogId: backlog.id,
    type: "soustache",
    parentId: task.id,
    title: `Sous-tâche de ${title} ${RUN_ID}`,
  }, admin.id, `e2e-ticket-drawer-child-${title}-${RUN_ID}`);
  return { task, child, epic, admin };
}

async function openItem(page: Page, key: string, view = "list") {
  await page.goto(`/b/CASS?view=${view}&item=${key}`);
  const dialog = page.getByRole("dialog", { name: new RegExp(`^${key} —`) });
  await expect(dialog).toBeVisible();
  // Measure and capture the settled drawer, not a frame of its slide-in.
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
  return dialog;
}

async function screenshot(page: Page, name: string) {
  if (!SCREENSHOT_DIR) return;
  await page.screenshot({ path: `${SCREENSHOT_DIR}/jir73-${name}.png` });
}

function activityList(dialog: Locator) {
  return dialog.getByRole("tabpanel").getByRole("listitem");
}

test.describe("panneau de ticket façon Jira", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("présente l’en-tête, les sections et la colonne Détails / Développement", async ({ page }) => {
    const { task, child, epic } = await fixtureTask("JIR-73 sections");
    const dialog = await openItem(page, task.key);

    const breadcrumb = dialog.getByRole("navigation", { name: "Fil d’Ariane" });
    await expect(breadcrumb.getByRole("link", { name: new RegExp(epic.key) })).toBeVisible();
    await expect(breadcrumb).toContainText(task.key);
    for (const name of ["Copier le lien", "Plus d’actions", "Item précédent (K)", "Item suivant (J)", "Fermer (Échap)"]) {
      await expect(dialog.getByRole("button", { name })).toBeVisible();
    }
    await expect(dialog.getByRole("heading", { level: 1, name: task.title })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Créer une sous-tâche", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Lier un item", exact: true })).toBeVisible();
    await expect(dialog.getByRole("region", { name: "Description" })).toBeVisible();
    const children = dialog.getByRole("region", { name: "Sous-tâches" });
    await expect(children.getByRole("link", { name: new RegExp(child.key) })).toContainText("À faire");
    await expect(dialog.getByRole("region", { name: "Items liés" })).toBeVisible();
    await expect(dialog.getByRole("tablist", { name: "Filtrer l’activité" })).toBeVisible();
    // The former tabs are gone.
    await expect(dialog.getByRole("button", { name: "Détail", exact: true })).toHaveCount(0);

    const properties = dialog.getByTestId("item-detail-properties");
    const box = await properties.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(339);
    await expect(properties.getByRole("button", { name: "Détails" })).toHaveAttribute("aria-expanded", "true");
    await expect(properties.getByRole("button", { name: /^Priorité / })).toContainText("Aucune");
    await expect(properties.getByRole("combobox")).toHaveCount(1); // only the status menu
    await properties.getByRole("button", { name: /^Priorité / }).click();
    await expect(properties.getByRole("combobox", { name: "Priorité" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(properties.getByRole("combobox", { name: "Priorité" })).toHaveCount(0);
    await expect(properties.getByText(/^Créé le /)).toBeVisible();
    await expect(properties.getByText(/^Mis à jour le /)).toBeVisible();
    await screenshot(page, "drawer-desktop-light");

    // The fold is remembered on the device.
    await properties.getByRole("button", { name: "Développement" }).click();
    await page.reload();
    const reopened = page.getByRole("dialog", { name: new RegExp(`^${task.key} —`) });
    await expect(reopened.getByRole("button", { name: "Développement" })).toHaveAttribute("aria-expanded", "false");
    await reopened.getByRole("button", { name: "Développement" }).click();

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    // Let the colour transitions settle before the review capture.
    await page.waitForTimeout(600);
    await screenshot(page, "drawer-desktop-dark");
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  });

  test("filtre l’activité, trie, et passe au statut suivant", async ({ page }) => {
    const { task } = await fixtureTask("JIR-73 activité");
    const dialog = await openItem(page, task.key);

    const composer = dialog.getByRole("textbox", { name: "Nouveau commentaire" });
    await composer.click();
    await page.keyboard.type("Commentaire JIR-73");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(dialog.getByRole("article", { name: /Commentaire de/ })).toBeVisible();
    await expect(composer).toHaveText("");

    await dialog.getByRole("button", { name: "Passer au statut En cours" }).click();
    const status = dialog.getByRole("combobox", { name: "Statut" });
    await expect(status.locator("option:checked")).toHaveText("En cours");
    await expect(dialog.getByRole("button", { name: "Passer au statut En revue" })).toBeVisible();
    await expect.poll(async () => {
      const [row] = await db.select({ name: statuses.name }).from(items)
        .innerJoin(statuses, eq(statuses.id, items.statusId)).where(eq(items.id, task.id));
      return row?.name;
    }).toBe("En cours");

    // Tout: newest first, comment and history together.
    await expect(activityList(dialog).first()).toContainText("a changé le statut");
    await expect(activityList(dialog).first()).toContainText("À faire");
    await expect(activityList(dialog).first()).toContainText("En cours");
    await expect(activityList(dialog)).toHaveCount(3);

    await dialog.getByRole("tab", { name: "Commentaires" }).click();
    await expect(activityList(dialog)).toHaveCount(1);
    await expect(activityList(dialog).first()).toContainText("Commentaire JIR-73");

    await dialog.getByRole("tab", { name: "Historique" }).click();
    await expect(activityList(dialog)).toHaveCount(2);
    await expect(composer).toHaveCount(0);
    await dialog.getByRole("button", { name: "Trier : Plus récents" }).click();
    await expect(activityList(dialog).first()).toContainText("a créé l’item");

    // « m » brings the comments back and focuses the composer.
    await dialog.getByRole("button", { name: "Copier le lien" }).focus();
    await page.keyboard.press("m");
    await expect(dialog.getByRole("tab", { name: "Commentaires" })).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("textbox", { name: "Nouveau commentaire" })).toBeFocused();
  });

  test("copie le lien et le nom de branche dans le presse-papiers", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const { task } = await fixtureTask("JIR-73 Écran de vérification");
    const dialog = await openItem(page, task.key);

    await dialog.getByRole("button", { name: "Copier le lien" }).click();
    await expect(page.getByText("Lien copié.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());

    const branch = itemBranchName(task.key, task.title);
    expect(branch).toMatch(/^cass-\d+-jir-73-ecran-de-verification/);
    await dialog.getByRole("button", { name: /Copier le nom de branche/ }).click();
    await expect(page.getByText(`Nom de branche copié : ${branch}`)).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(branch);
  });

  test("passe à l’item précédent / suivant de la vue, au clic et avec K / J", async ({ page }) => {
    await page.goto("/b/CASS?view=list");
    const rows = page.locator("main [data-shortcut-item]");
    await expect(rows.nth(2)).toBeVisible();
    const keys = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-shortcut-item")!),
    );
    const first = await openItem(page, keys[0]!);
    await expect(first.getByRole("button", { name: "Item précédent (K)" })).toBeDisabled();

    await first.getByRole("button", { name: "Item suivant (J)" }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]item=${keys[1]}(&|$)`));
    const second = page.getByRole("dialog", { name: new RegExp(`^${keys[1]} —`) });
    await expect(second).toBeVisible();
    await second.getByRole("button", { name: "Copier le lien" }).focus();
    await page.keyboard.press("j");
    await expect(page).toHaveURL(new RegExp(`[?&]item=${keys[2]}(&|$)`));
    await page.getByRole("dialog", { name: new RegExp(`^${keys[2]} —`) })
      .getByRole("button", { name: "Copier le lien" }).focus();
    await page.keyboard.press("k");
    await expect(page).toHaveURL(new RegExp(`[?&]item=${keys[1]}(&|$)`));

    // Deep link to an item the filtered list does not show: no arrows.
    await page.goto(`/b/CASS?view=list&q=zzz-aucun-${RUN_ID}&item=${keys[0]}`);
    const alone = page.getByRole("dialog", { name: new RegExp(`^${keys[0]} —`) });
    await expect(alone).toBeVisible();
    await expect(alone.getByRole("button", { name: "Item suivant (J)" })).toHaveCount(0);
  });
});

test.describe("panneau de ticket sur mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("occupe tout l’écran et empile les propriétés sous le contenu", async ({ page }) => {
    const { task } = await fixtureTask("JIR-73 mobile");
    const dialog = await openItem(page, task.key);
    const box = await dialog.boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.width).toBe(390);
    const main = await dialog.getByTestId("item-detail-main").boundingBox();
    const properties = await dialog.getByTestId("item-detail-properties").boundingBox();
    if (!main || !properties) throw new Error("Panneau non mesurable.");
    expect(properties.y).toBeGreaterThanOrEqual(main.y + main.height - 1);
    const overflow = await dialog.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(overflow).toBe(false);
    await screenshot(page, "drawer-mobile");
  });
});

test.describe("fenêtre « Nouvel item »", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("enchaîne deux tâches avec « Créer un autre » puis ouvre la dernière depuis le message", async ({ page }) => {
    const { backlog, epic } = await fixtures();
    await page.goto("/b/CASS?view=list");
    // JIR-74: « + Créer » in the top bar opens « Nouvel item ».
    await page.locator('[data-slot="shell-topbar"]').getByRole("button", { name: "Créer", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nouvel item" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("CASS");

    await chooseOption(dialog, "Type", "Tâche");
    await chooseOption(dialog, /Parent/, new RegExp(`^${epic.key} — `));
    await dialog.getByRole("textbox", { name: "Titre" }).fill(`JIR-73 première ${RUN_ID}`);
    await dialog.getByRole("textbox", { name: "Description" }).click();
    await page.keyboard.type("Décrite à la création");
    await dialog.getByRole("spinbutton", { name: "Points" }).fill("3");
    await dialog.getByRole("checkbox", { name: "Créer un autre" }).check();
    await screenshot(page, "create-dialog");
    await dialog.getByRole("button", { name: "Créer", exact: true }).click();

    await expect(page.getByRole("status").getByText(/^CASS-\d+ créé$/).first()).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Titre" })).toHaveValue("");
    await expect(dialog.getByRole("textbox", { name: "Titre" })).toBeFocused();
    await expect(dialog.getByRole("combobox", { name: "Type" })).toHaveText("Tâche");
    await expect(dialog.getByRole("combobox", { name: /Parent/ })).toContainText(epic.key);

    await dialog.getByRole("textbox", { name: "Titre" }).fill(`JIR-73 seconde ${RUN_ID}`);
    await dialog.getByRole("checkbox", { name: "Créer un autre" }).uncheck();
    await dialog.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const created = await db.select({
      key: items.key,
      title: items.title,
      parentId: items.parentId,
      description: items.description,
      estimatePoints: items.estimatePoints,
    }).from(items).where(and(eq(items.backlogId, backlog.id), eq(items.parentId, epic.id)));
    const first = created.find((row) => row.title === `JIR-73 première ${RUN_ID}`);
    const second = created.find((row) => row.title === `JIR-73 seconde ${RUN_ID}`);
    expect(first).toMatchObject({ description: "Décrite à la création", estimatePoints: 3 });
    expect(second).toMatchObject({ description: null });

    const toast = page.getByRole("status").locator("div", { hasText: `${second!.key} créé` }).last();
    await toast.getByRole("button", { name: "Ouvrir" }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]item=${second!.key}(&|$)`));
    await expect(page.getByRole("dialog", { name: new RegExp(`^${second!.key} —`) })).toBeVisible();
  });

  test("crée une tâche sous l’epic ouvert même quand le filtre de version l’écarte de la liste", async ({ page }) => {
    const { admin, backlog, epic } = await fixtures();
    const [release] = await db.insert(releases).values({
      backlogId: backlog.id,
      name: `JIR-73 filtre ${RUN_ID}`,
      releaseDate: "2026-12-01",
      createdBy: admin.id,
    }).returning();
    // The new version has no item: the filtered list is empty.
    const dialog = await openItem(page, epic.key, `list&version=${release!.id}`);
    await expect(page.locator("main [data-shortcut-item]")).toHaveCount(0);

    await dialog.getByRole("button", { name: "Créer une tâche", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Nouvel item" });
    await expect(create.getByRole("combobox", { name: /Parent/ })).toContainText(epic.key);
    await create.getByRole("textbox", { name: "Titre" }).fill(`JIR-73 hors filtre ${RUN_ID}`);
    await create.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(create).toHaveCount(0);

    await expect.poll(async () => {
      const [row] = await db.select({ parentId: items.parentId }).from(items)
        .where(eq(items.title, `JIR-73 hors filtre ${RUN_ID}`));
      return row?.parentId;
    }).toBe(epic.id);
  });


  test("affiche des listes homogènes, le statut par défaut et une tâche de section au type fixe (JIR-80)", async ({ page }, testInfo) => {
    const { epic } = await fixtures();
    await page.goto("/b/CASS?view=list");
    await page.locator('[data-slot="shell-topbar"]').getByRole("button", { name: "Créer", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nouvel item" });
    await expect(dialog).toBeVisible();

    // Shared selects: the type icon sits inside the trigger, the status names the default one.
    const type = dialog.getByRole("combobox", { name: "Type" });
    await expect(type).toHaveText("Composant");
    await expect(type.locator('svg[aria-label="Composant"]')).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Statut" })).toHaveText("À faire");
    await expect(dialog.getByText("(par défaut)")).toHaveCount(0);
    await expect(dialog.getByLabel("Échéance")).toHaveAttribute("lang", "fr");
    await chooseOption(dialog, "Priorité", "Haute");
    await expect(dialog.getByRole("combobox", { name: "Priorité" })).toHaveText("Haute");
    await page.screenshot({ path: testInfo.outputPath("jir80-create-dialog.png"), caret: "initial" });
    await type.click();
    await expect(page.getByRole("option", { name: "Epic", exact: true })).toBeVisible();
    await expect(page.getByRole("listbox")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: testInfo.outputPath("jir80-create-dialog-type-open.png"), caret: "initial" });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // « Plus d’options » from the Backlog section: a task, shown as such.
    await page.goto("/b/CASS?view=backlog");
    const inlineTitle = page.getByRole("textbox", { name: "Titre du nouvel item dans Backlog" });
    if (!(await inlineTitle.isVisible())) {
      await page.getByRole("button", { name: "Créer un item dans Backlog" }).click();
    }
    await inlineTitle.fill(`JIR-80 section ${RUN_ID}`);
    await page.getByRole("button", { name: "Plus d’options" }).click();
    const contextual = page.getByRole("dialog", { name: "Nouvelle tâche — Backlog" });
    await expect(contextual).toBeVisible();
    await expect(contextual.getByRole("combobox", { name: "Type" })).toHaveCount(0);
    await expect(contextual.getByRole("group", { name: "Type" })).toHaveText("Tâche");
    await expect(contextual.getByRole("toolbar", { name: "Mise en forme" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("jir80-create-dialog-contextual.png"), caret: "initial" });

    // On a short screen the body scrolls and the footer stays in view.
    await page.setViewportSize({ width: 1280, height: 560 });
    await expect(contextual.getByRole("button", { name: "Créer", exact: true })).toBeInViewport();
    await expect(contextual.getByRole("checkbox", { name: "Créer un autre" })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("jir80-create-dialog-short.png"), caret: "initial" });
    await chooseOption(contextual, /Parent/, new RegExp(`^${epic.key} — `));
    await contextual.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(contextual).toHaveCount(0);
    await expect.poll(async () => {
      const [row] = await db.select({ type: items.type, parentId: items.parentId }).from(items)
        .where(eq(items.title, `JIR-80 section ${RUN_ID}`));
      return row;
    }).toEqual({ type: "tache", parentId: epic.id });
  });
});
