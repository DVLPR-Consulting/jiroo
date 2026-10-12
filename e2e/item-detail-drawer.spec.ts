import { expect, test, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items } from "../lib/db/schema";
import { createItem } from "../lib/services/items";

type DrawerTrace = {
  firstAnimation: string | null;
  dialogReplaced: boolean;
  overlayOutsideDialog: boolean;
};

/** Records how the detail drawer first appears and whether it is ever swapped. */
async function traceDrawer(page: Page) {
  await page.evaluate(() => {
    const trace: DrawerTrace = {
      firstAnimation: null,
      dialogReplaced: false,
      overlayOutsideDialog: false,
    };
    let firstDialog: Element | null = null;
    const check = () => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog && !firstDialog) {
        firstDialog = dialog;
        trace.firstAnimation = getComputedStyle(dialog).animationName;
      }
      if (dialog && firstDialog && dialog !== firstDialog) trace.dialogReplaced = true;
      for (const busy of document.querySelectorAll('[aria-busy="true"]')) {
        if (!busy.closest('[role="dialog"]') && busy.closest(".fixed")) {
          trace.overlayOutsideDialog = true;
        }
      }
    };
    new MutationObserver(check).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    (window as unknown as { __drawerTrace: DrawerTrace }).__drawerTrace = trace;
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __drawerTrace: DrawerTrace }).__drawerTrace,
    );
}

async function openFirstBacklogRow(page: Page) {
  await page.goto("/b/CASS?view=backlog");
  const row = page.getByRole("row", { name: /^CASS-\d+ —/ }).first();
  await expect(row).toBeVisible();
  const key = (await row.getAttribute("aria-label"))?.split(" — ")[0];
  if (!key) throw new Error("Ligne de backlog introuvable.");
  const readTrace = await traceDrawer(page);
  await row.click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`^${key} —`) });
  await expect(dialog).toBeVisible();
  return { key, dialog, readTrace };
}

/** A fresh task of the CASS backlog, so description edits stay isolated. */
async function fixtureTask(title: string, description: string) {
  const [admin] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  if (!admin || !backlog) throw new Error("Fixtures E2E introuvables.");
  const [epic] = await db.select({ id: items.id }).from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, "epic")));
  if (!epic) throw new Error("Epic fixture introuvable.");
  const runId = process.env.JIROO_E2E_RUN_ID ?? String(Date.now());
  return createItem({
    backlogId: backlog.id,
    type: "tache",
    parentId: epic.id,
    title: `${title} ${runId}`,
    description,
  }, admin.id, `e2e-item-detail-drawer-${title}-${runId}`);
}

test.describe("panneau de détail", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("glisse depuis la droite une seule fois, sans échange d’overlay, puis se referme", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const { key, dialog, readTrace } = await openFirstBacklogRow(page);

    await expect(page).toHaveURL(new RegExp(`[?&]item=${key}(&|$)`));
    const trace = await readTrace();
    expect(trace.firstAnimation).toBe("enter");
    expect(trace.dialogReplaced).toBe(false);
    expect(trace.overlayOutsideDialog).toBe(false);
    await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS(
      "backdrop-filter",
      "none",
    );

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]item=/);
    expect(consoleErrors).toEqual([]);
  });

  test("s’ouvre dès le clic, avant la réponse du serveur, puis affiche l’item", async ({
    page,
  }) => {
    await page.goto("/b/CASS?view=list");
    const row = page.locator("tbody tr[aria-label^='CASS-']").first();
    await expect(row).toBeVisible();
    const key = (await row.getAttribute("aria-label"))?.split(" — ")[0];
    if (!key) throw new Error("Ligne de liste introuvable.");
    // Opening an item re-renders the whole view on the server: hold that
    // response back, as a slow remote database does.
    let release!: () => void;
    const held = new Promise<void>((done) => {
      release = done;
    });
    await page.route(
      (url) => url.searchParams.get("item") === key,
      async (route) => {
        await held;
        await route.continue();
      },
    );

    await row.getByText(key, { exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 1_000 });
    await expect(dialog.getByRole("status", { name: "Chargement du panneau de détail" }))
      .toBeVisible();
    const loading = await dialog.elementHandle();

    release();
    await expect(page.getByRole("dialog", { name: new RegExp(`^${key} —`) })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`[?&]item=${key}(&|$)`));
    // The server body filled the drawer opened on click; it was not replaced.
    expect(await loading?.evaluate((element) => element.isConnected)).toBe(true);
  });

  test("enregistre la description en cours de frappe quand le panneau se ferme", async ({
    page,
  }) => {
    const item = await fixtureTask("JIR-71 fermeture", "Brouillon");
    await page.goto(`/b/CASS?view=list&item=${item.key}`);
    const dialog = page.getByRole("dialog", { name: new RegExp(`^${item.key} —`) });
    const editor = dialog.getByRole("textbox", { name: "Description" });
    await editor.getByText("Brouillon").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" sauvé");
    // Closed before the autosave pause ends.
    await dialog.getByRole("button", { name: "Fermer" }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(async () => {
      const [row] = await db.select({ description: items.description }).from(items)
        .where(eq(items.id, item.id));
      return row?.description;
    }).toBe("Brouillon sauvé");

    await page.goto(`/b/CASS?view=list&item=${item.key}`);
    await expect(page.getByRole("dialog").getByRole("textbox", { name: "Description" }))
      .toHaveText("Brouillon sauvé");
  });

  test("ouvre directement le lien profond sans animation si le mouvement est réduit", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { key } = await openFirstBacklogRow(page);
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/[?&]item=/);

    await page.goto(`/b/CASS?view=backlog&item=${key}`);
    const dialog = page.getByRole("dialog", { name: new RegExp(`^${key} —`) });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("animation-name", "none");
    await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS(
      "animation-name",
      "none",
    );
  });

  test("donne aux propriétés une colonne lisible, rembourrée comme la colonne principale", async ({
    page,
  }) => {
    const { dialog } = await openFirstBacklogRow(page);
    // Measure the settled drawer, not a frame of its slide-in.
    await dialog.evaluate((element) =>
      Promise.all(
          element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
        ),
    );
    const properties = page.getByTestId("item-detail-properties");
    const drawerBox = await dialog.boundingBox();
    const box = await properties.boundingBox();
    if (!drawerBox || !box) throw new Error("Panneau de détail non mesurable.");

    expect(box.width).toBeGreaterThanOrEqual(320);
    expect(box.x + box.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width + 1);
    await expect(properties).toHaveCSS("padding-right", "20px");
    await expect(page.getByTestId("item-detail-main")).toHaveCSS("padding-left", "32px");
    // No field spills over the column's right padding.
    const overflow = await properties.evaluate((column) => {
      const limit = column.getBoundingClientRect().right - 20 + 0.5;
      return [...column.querySelectorAll("input, select, button")]
        .filter((control) => control.getBoundingClientRect().right > limit).length;
    });
    expect(overflow).toBe(0);
    // Placeholders read in full (e.g. the GitHub URL field was truncated).
    const truncated = await properties.evaluate((column) => {
      const context = document.createElement("canvas").getContext("2d")!;
      return [...column.querySelectorAll<HTMLInputElement>("input[placeholder]")]
        .filter((input) => {
          const style = getComputedStyle(input);
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const room = input.clientWidth
            - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          return context.measureText(input.placeholder).width > room;
        })
        .map((input) => input.placeholder);
    });
    expect(truncated).toEqual([]);
  });

  test("empile les propriétés sous la colonne principale sur un écran étroit", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await openFirstBacklogRow(page);
    const main = await page.getByTestId("item-detail-main").boundingBox();
    const properties = await page.getByTestId("item-detail-properties").boundingBox();
    if (!main || !properties) throw new Error("Panneau de détail non mesurable.");

    expect(properties.y).toBeGreaterThanOrEqual(main.y + main.height - 1);
    expect(Math.abs(properties.width - main.width)).toBeLessThanOrEqual(1);
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 2000, height: 1100 },
  ]) {
    test(`occupe toute la hauteur et fait défiler les propriétés seules à ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const { dialog } = await openFirstBacklogRow(page);
      await dialog.evaluate((element) =>
        Promise.all(
          element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
        ),
      );
      const box = await dialog.boundingBox();
      expect(box?.y).toBe(0);
      expect(box?.height).toBe(viewport.height);

      const properties = page.getByTestId("item-detail-properties");
      // The last property section and the metadata under it are reachable.
      await expect(properties.getByRole("button", { name: "Développement" })).toBeAttached();
      const columnEnd = properties.getByText(/^Mis à jour le /);
      await columnEnd.scrollIntoViewIfNeeded();
      await expect(columnEnd).toBeInViewport();
      // The properties column is its own scroll container; when it overflows,
      // only it scrolls — never the main column or the drawer frame.
      await expect(properties).toHaveCSS("overflow-y", "auto");
      const scroll = await properties.evaluate((column) => ({
        overflows: column.scrollHeight > column.clientHeight,
        top: column.scrollTop,
      }));
      if (scroll.overflows) expect(scroll.top).toBeGreaterThan(0);
      expect(
        await page.getByTestId("item-detail-main").evaluate((column) => column.scrollTop),
      ).toBe(0);
      expect(await dialog.evaluate((frame) => frame.scrollTop)).toBe(0);
    });
  }

  test("suit la hauteur de la fenêtre quand elle change, panneau ouvert", async ({ page }) => {
    const { dialog } = await openFirstBacklogRow(page);
    await page.setViewportSize({ width: 2000, height: 1100 });
    await expect
      .poll(async () => (await dialog.boundingBox())?.height)
      .toBe(1100);
  });

  test("fait défiler la seule colonne des propriétés quand elle dépasse la hauteur", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 500 });
    const { dialog } = await openFirstBacklogRow(page);
    const properties = page.getByTestId("item-detail-properties");
    expect(
      await properties.evaluate((column) => column.scrollHeight > column.clientHeight),
    ).toBe(true);

    const columnEnd = properties.getByText(/^Mis à jour le /);
    await columnEnd.scrollIntoViewIfNeeded();
    await expect(columnEnd).toBeInViewport();
    expect(await properties.evaluate((column) => column.scrollTop)).toBeGreaterThan(0);
    expect(
      await page.getByTestId("item-detail-main").evaluate((column) => column.scrollTop),
    ).toBe(0);
    expect(await dialog.evaluate((frame) => frame.scrollTop)).toBe(0);
  });

  test("se ferme au retour arrière et se rouvre en avant dans l’historique", async ({ page }) => {
    const { key, dialog } = await openFirstBacklogRow(page);

    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]item=/);
    await expect(dialog).toHaveCount(0);

    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`[?&]item=${key}(&|$)`));
    await expect(page.getByRole("dialog", { name: new RegExp(`^${key} —`) })).toBeVisible();
  });
});

