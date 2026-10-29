import { observePage } from "./support/capture";
import { expect, test as base, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items, releases, sprintItems, sprints } from "../lib/db/schema/domain";
import { createBacklog } from "../lib/services/backlogs";
import { createItem } from "../lib/services/items";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";
import { keyPattern } from "./key-helpers";
import { chooseOption } from "./select-helpers";

const RUN = process.env.JIROO_E2E_RUN_ID;
if (!RUN) throw new Error("Create-everywhere requires an isolated E2E run id.");
const KEY = "CRTALL";
const COLOR = "#ffeeaa";
const EPIC = "Création depuis toutes les pages";
let backlogId = "";
let epicId = "";

type Capture = { console: string[]; network: string[]; errors: string[] };
function observe(page: Page): Capture {
  const capture: Capture = { console: [], network: [], errors: [] };
  observePage(page, { console: capture.console, network: capture.network, onFault: ({ line }) => capture.errors.push(line) }, "admin");
  return capture;
}
const test = base.extend<{ audit: Capture }>({
  audit: [async ({ page }, runTest, info) => {
    const capture = observe(page);
    try {
      await runTest(capture);
    } finally {
      const slug = `create-everywhere-${info.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      try {
        if (info.status !== info.expectedStatus || capture.errors.length > 0) {
          await writeAuditScreenshot(`audit/screenshots/${slug}-failure.png`,
            (path) => page.screenshot({ path, caret: "initial" }));
        }
      } finally {
        await writeAuditText(`audit/console/${slug}.log`, capture.console.join("\n") + "\n");
        await writeAuditText(`audit/network/${slug}.log`, capture.network.join("\n") + "\n");
      }
      expect(capture.errors, "Browser and network errors").toEqual([]);
    }
  }, { auto: true }],
});

test.setTimeout(60_000);

async function removeFixture() {
  const rows = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, KEY));
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;
  await db.delete(items).where(inArray(items.backlogId, ids));
  await db.delete(releases).where(inArray(releases.backlogId, ids));
  await db.delete(backlogs).where(inArray(backlogs.id, ids));
}
test.beforeAll(async () => {
  await removeFixture();
  const [admin] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  if (!admin) throw new Error("Missing isolated E2E administrator.");
  const backlog = await createBacklog({ key: KEY, name: "Créer partout E2E", color: COLOR }, admin.id);
  backlogId = backlog.id;
  const component = await createItem({ backlogId, type: "composant", title: "Composant E2E" }, admin.id);
  const epic = await createItem({ backlogId, type: "epic", parentId: component.id, title: EPIC }, admin.id);
  epicId = epic.id;
});
test.afterAll(removeFixture);

const pages = [
  { name: "Roadmap", suffix: "/roadmap", heading: "Roadmap" },
  { name: "Releases", suffix: "/releases", heading: "Releases" },
  { name: "Board sans sprint", suffix: "?view=board", heading: "Aucun sprint actif" },
] as const;

for (const scenario of pages) {
  test(`crée une tâche depuis ${scenario.name}, sans appartenance de sprint`, async ({ page }) => {
    await page.goto(`/b/${KEY}${scenario.suffix}`);
    await expect(page.getByRole("heading", { name: scenario.heading, exact: true })).toBeVisible();
    const topbarCreate = page.locator('[data-slot="topbar-create"]').getByRole("button", { name: "Créer", exact: true });
    await expect(topbarCreate).toHaveCount(1);
    await expect(topbarCreate).toBeVisible();
    if (scenario.name === "Roadmap") {
      await page.keyboard.press("c");
    } else {
      await topbarCreate.click();
    }
    const dialog = page.getByRole("dialog", { name: "Nouvel item", exact: true });
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Backlog ${KEY}`, { exact: true })).toHaveCSS("background-color", "rgb(255, 238, 170)");
    // Measure the rendered colors independently of the production helper.
    const contrast = await dialog.getByText(`Backlog ${KEY}`, { exact: true }).evaluate((node) => {
      const style = getComputedStyle(node);
      const luminance = (color: string) => {
        const channels = color.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
      };
      const background = luminance(style.backgroundColor);
      const foreground = luminance(style.color);
      return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
    });
    expect(contrast, "The small backlog key stays readable on a pale background").toBeGreaterThanOrEqual(4.5);
    await chooseOption(dialog, "Type", "Tâche");
    await chooseOption(dialog, /Parent/, new RegExp(`${EPIC}$`));
    const title = `JIR-112 ${scenario.name} ${RUN}`;
    await dialog.getByRole("textbox", { name: /Titre/ }).fill(title);
    await dialog.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(topbarCreate).toHaveCount(1);

    await expect.poll(async () => {
      const rows = await db.select({ id: items.id, key: items.key, type: items.type, parentId: items.parentId })
        .from(items).where(and(eq(items.backlogId, backlogId), eq(items.title, title)));
      return rows.length;
    }).toBe(1);
    const [task] = await db.select({ id: items.id, key: items.key, type: items.type, parentId: items.parentId })
      .from(items).where(and(eq(items.backlogId, backlogId), eq(items.title, title)));
    if (!task) throw new Error("Created task not persisted.");
    expect(task.type).toBe("tache");
    expect(task.parentId).toBe(epicId);
    expect(await db.select({ id: sprintItems.id }).from(sprintItems)
      .where(eq(sprintItems.itemId, task.id))).toEqual([]);
    expect(await db.select({ id: sprints.id }).from(sprints)
      .where(and(eq(sprints.backlogId, backlogId), eq(sprints.state, "active")))).toEqual([]);
    await expect(page.getByText(`${task.key} créé`, { exact: true })).toBeVisible();
    await writeAuditScreenshot(`audit/screenshots/create-everywhere-${scenario.name === "Roadmap" ? "roadmap" : scenario.name === "Releases" ? "releases" : "board"}.png`,
      (path) => page.screenshot({ path, caret: "initial" }));
    await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
    await expect(page.getByRole("dialog", { name: keyPattern(task.key) })).toBeVisible();
    const opened = new URL(page.url());
    expect(opened.pathname).toBe(`/b/${KEY}${scenario.name === "Roadmap" ? "/roadmap" : ""}`);
    expect(opened.searchParams.get("item")).toBe(task.key);
    if (scenario.name === "Board sans sprint") expect(opened.searchParams.get("view")).toBe("board");
    if (scenario.name === "Releases") {
      await writeAuditScreenshot("audit/screenshots/create-everywhere-releases-opened.png",
        (path) => page.screenshot({ path, caret: "initial" }));
    }
    await expect(page.locator('[data-slot="topbar-create"] button')).toHaveCount(1);
    // C cannot create a second modal while an item drawer is open.
    await page.keyboard.press("c");
    await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(1);
    await expect(page.getByRole("dialog", { name: keyPattern(task.key) })).toBeVisible();
  });
}

test.describe("sans droit de création", () => {
  test.use({ storageState: ".playwright/.auth/reader.json" });
  test("le lecteur ne voit pas de bouton Créer sur les trois pages", async ({ page }) => {
    // The reader has browse_backlog on CASS but no create_items permission.
    for (const scenario of pages) {
      await page.goto(`/b/CASS${scenario.suffix}`);
      await expect(page.getByRole("heading", { name: scenario.heading, exact: true })).toBeVisible();
      await expect(page.locator('[data-slot="topbar-create"] button')).toHaveCount(0);
    }
  });
});
