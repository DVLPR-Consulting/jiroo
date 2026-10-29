import { observePage } from "./support/capture";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items } from "../lib/db/schema/domain";
import { createItem } from "../lib/services/items";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";
import { keyPattern } from "./key-helpers";

const RUN = process.env.JIROO_E2E_RUN_ID;
if (!RUN) throw new Error("Roadmap E2E requires the isolated Playwright run id.");
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const TIMEOUT = 10_000;
type Capture = { console: string[]; network: string[]; errors: string[]; navigating: boolean };
const captures = new Map<Page, Capture>();

function observe(page: Page, label: string) {
  const capture: Capture = { console: [label], network: [label], errors: [], navigating: false };
  captures.set(page, capture);
  observePage(page, { console: capture.console, network: capture.network, onFault: ({ line }) => capture.errors.push(line) }, label);
  return capture;
}

const test = base.extend<{ pair: { editor: Page; reader: Page } }>({
  pair: async ({ browser, baseURL }, runTest, info) => {
    const editorContext = await browser.newContext({ baseURL, viewport: DESKTOP,
      storageState: ".playwright/.auth/editor.json" });
    const readerContext = await browser.newContext({ baseURL, viewport: DESKTOP,
      storageState: ".playwright/.auth/reader.json" });
    const editor = await editorContext.newPage();
    const reader = await readerContext.newPage();
    const observed = [observe(editor, "editor"), observe(reader, "reader")];
    try {
      await runTest({ editor, reader });
    } finally {
      try {
        const slug = `roadmap-${info.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
        if (info.status !== info.expectedStatus || observed.some((capture) => capture.errors.length > 0)) {
          await writeAuditScreenshot(`audit/screenshots/${slug}-failure.png`,
            (path) => (reader.url() === "about:blank" ? editor : reader).screenshot({ path, caret: "initial" }));
        }
        await writeAuditText(`audit/console/${slug}.log`,
          observed.map((capture) => capture.console.join("\n")).join("\n") + "\n");
        await writeAuditText(`audit/network/${slug}.log`,
          observed.map((capture) => capture.network.join("\n")).join("\n") + "\n");
        expect(observed.flatMap((capture) => capture.errors), "Browser and network errors").toEqual([]);
      } finally {
        captures.delete(editor);
        captures.delete(reader);
        await Promise.all([editorContext.close(), readerContext.close()]);
      }
    }
  },
});

async function fixture(scenario: string) {
  const [admin] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  const accounts = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "reader@jiroo.local"));
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "CASS"));
  if (!admin || !accounts[0] || !backlog) throw new Error("Missing isolated Roadmap fixtures.");
  expect(admin.id).not.toBe(accounts[0].id);
  const create = (type: "composant" | "epic" | "tache", parentId: string | null,
    title: string, dates: { startDate?: string; dueDate?: string } = {}) =>
    createItem({ backlogId: backlog.id, type, parentId, title, ...dates }, admin.id,
      `roadmap-${scenario}-${RUN}`);
  const component = await create("composant", null, `Roadmap ${scenario} ${RUN}`);
  const epic = await create("epic", component.id, "Parcours daté", {
    startDate: "2026-10-19", dueDate: "2026-10-28",
  });
  const task = await create("tache", epic.id, "Tâche du parcours", {
    startDate: "2026-10-20", dueDate: "2026-10-22",
  });
  const empty = await create("epic", component.id, "Période à planifier");
  return { component, epic, task, empty };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const bar = (page: Page, key: string) => page.locator(`[data-roadmap-bar="${key}"]`);
const row = (page: Page, key: string) => page.locator(`[data-roadmap-row="${key}"]`);

async function openRoadmap(page: Page, reload = false) {
  const capture = captures.get(page);
  if (capture) capture.navigating = true;
  try {
    const stream = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/realtime");
    if (reload) await page.reload();
    else await page.goto("/b/CASS/roadmap");
    expect((await stream).status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Roadmap", exact: true })).toBeVisible();
    await expect(page.getByTestId("roadmap-scroller")).toBeVisible();
  } finally {
    if (capture) capture.navigating = false;
  }
}

/** Keep a bar to the right of the sticky labels, not hidden underneath them. */
async function showBar(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((node) => {
    const scroller = node.closest('[data-testid="roadmap-scroller"]');
    if (scroller) {
      scroller.scrollLeft = Math.max(0, (node as HTMLElement).offsetLeft - 32);
      const row = node.closest("[data-roadmap-row]");
      if (row) scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 100;
    }
  });
}

async function drag(page: Page, target: Locator, dx: number) {
  await showBar(target);
  const box = await target.boundingBox();
  if (!box) throw new Error("Missing bar geometry.");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

async function days(id: string) {
  const [result] = await db.select({ startDate: items.startDate, dueDate: items.dueDate })
    .from(items).where(eq(items.id, id));
  return result;
}

async function expectDays(id: string, startDate: string, dueDate: string) {
  await expect.poll(() => days(id), { timeout: TIMEOUT }).toEqual({ startDate, dueDate });
}

async function expectInitialBars(page: Page, data: Fixture) {
  await expect(bar(page, data.component.key)).toHaveAttribute("aria-label", /19 oct\. 2026 au 28 oct\. 2026 \(déduit\)/);
  await expect(bar(page, data.epic.key)).toHaveAttribute("aria-label", /19 oct\. 2026 au 28 oct\. 2026$/);
  await expect(row(page, data.task.key)).toHaveCount(0);
  await row(page, data.epic.key).getByRole("button", { name: `Déplier ${data.epic.key}`, exact: true }).click();
  await expect(bar(page, data.task.key)).toHaveAttribute("aria-label", /20 oct\. 2026 au 22 oct\. 2026$/);
}

test.describe("planning on the Roadmap", () => {
  test.setTimeout(60_000);

  test("shows the hierarchy and calendar on desktop and mobile", async ({ pair: { editor } }) => {
    const data = await fixture("hierarchy");
    await openRoadmap(editor);
    await expectInitialBars(editor, data);
    await showBar(bar(editor, data.epic.key));
    await writeAuditScreenshot("audit/screenshots/roadmap-desktop-1440.png",
      (path) => editor.screenshot({ path, caret: "initial" }));
    await editor.setViewportSize(PHONE);
    await showBar(bar(editor, data.epic.key));
    await writeAuditScreenshot("audit/screenshots/roadmap-mobile-390.png",
      (path) => editor.screenshot({ path, caret: "initial" }));
  });

  test("persists a dragged epic and opens matching dates in its drawer", async ({ pair: { editor } }) => {
    const { epic } = await fixture("drag");
    await openRoadmap(editor);
    await expect(editor.getByRole("button", { name: "Mois", exact: true })).toHaveAttribute("aria-pressed", "true");
    await drag(editor, bar(editor, epic.key), 30); // Three days at the default month scale.
    await expectDays(epic.id, "2026-10-22", "2026-10-31");
    expect(new URL(editor.url()).searchParams.has("item")).toBe(false);
    await openRoadmap(editor, true);
    await expect(bar(editor, epic.key)).toHaveAttribute("aria-label", /22 oct\. 2026 au 31 oct\. 2026$/);
    await showBar(bar(editor, epic.key));
    await bar(editor, epic.key).click();
    await expect(editor).toHaveURL(new RegExp(`[?&]item=${epic.key}(?:&|$)`));
    const drawer = editor.getByRole("dialog", { name: keyPattern(epic.key) });
    await expect(drawer.getByRole("button", { name: "Début 22 oct. 2026", exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Échéance 31 oct. 2026", exact: true })).toBeVisible();
  });

  test("plans seven days from a click on an empty row and keeps them", async ({ pair: { editor } }) => {
    const { epic, empty } = await fixture("empty");
    await openRoadmap(editor);
    const target = bar(editor, epic.key);
    await showBar(target);
    const reference = await target.boundingBox();
    const track = await editor.locator(`[data-roadmap-track="${empty.key}"]`).boundingBox();
    if (!reference || !track) throw new Error("Missing calendar geometry.");
    await editor.mouse.click(reference.x + 4, track.y + track.height / 2);
    await expectDays(empty.id, "2026-10-19", "2026-10-25");
    await openRoadmap(editor, true);
    await expect(bar(editor, empty.key)).toHaveAttribute("aria-label", /19 oct\. 2026 au 25 oct\. 2026$/);
  });

  test("persists two one-day keyboard moves", async ({ pair: { editor } }) => {
    const { epic } = await fixture("keyboard");
    await openRoadmap(editor);
    const target = bar(editor, epic.key);
    await showBar(target);
    await target.focus();
    await target.press("ArrowRight");
    await target.press("ArrowRight");
    await expectDays(epic.id, "2026-10-21", "2026-10-30");
    await openRoadmap(editor, true);
    await expect(bar(editor, epic.key)).toHaveAttribute("aria-label", /21 oct\. 2026 au 30 oct\. 2026$/);
  });

  test("keeps the reader's bars read only", async ({ pair: { reader } }) => {
    const { epic } = await fixture("reader");
    await openRoadmap(reader);
    await expect(reader.locator("[data-edge]")).toHaveCount(0);
    await drag(reader, bar(reader, epic.key), 30);
    // A read-only press may open the item: navigate back to the clean route.
    await openRoadmap(reader);
    expect(await days(epic.id)).toEqual({ startDate: "2026-10-19", dueDate: "2026-10-28" });
    await expect(bar(reader, epic.key)).toHaveAttribute("aria-label", /19 oct\. 2026 au 28 oct\. 2026$/);
  });

  test("remembers the selected zoom after reload", async ({ pair: { editor } }) => {
    await fixture("zoom");
    await openRoadmap(editor);
    await editor.getByRole("button", { name: "Trimestres", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Trimestres", exact: true })).toHaveAttribute("aria-pressed", "true");
    await openRoadmap(editor, true);
    await expect(editor.getByRole("button", { name: "Trimestres", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await editor.evaluate(() => localStorage.getItem("jiroo.roadmap.zoom"))).toBe("quarters");
  });
});
