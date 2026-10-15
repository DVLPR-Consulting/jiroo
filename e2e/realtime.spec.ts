import { expect, test as base, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items } from "../lib/db/schema";
import { createItem } from "../lib/services/items";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";
import { keyPattern } from "./key-helpers";

const TIMEOUT = 10_000;
const BANNER = "Ce backlog a été modifié par quelqu'un d'autre.";
const RUN = process.env.JIROO_E2E_RUN_ID;
if (!RUN) throw new Error("Realtime E2E requires the isolated Playwright run id.");

type Capture = {
  console: string[];
  network: string[];
  errors: string[];
};

function observe(page: Page, label: string): Capture {
  const capture: Capture = { console: [label], network: [label], errors: [] };
  page.on("console", (message) => {
    capture.console.push(`[${message.type()}] ${message.text()}`);
    if (message.type() === "error") capture.errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    capture.console.push(`[pageerror] ${error.message}`);
    capture.errors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    const line = `${request.method()} ${request.url()} ${request.failure()?.errorText}`;
    capture.network.push(line);
    capture.errors.push(line);
  });
  page.on("response", (response) => {
    const line = `${response.status()} ${response.request().method()} ${response.url()}`;
    capture.network.push(line);
    if (response.status() >= 400) capture.errors.push(line);
  });
  return capture;
}

const test = base.extend<{ pair: { author: Page; viewer: Page } }>({
  pair: async ({ browser, baseURL }, runTest, testInfo) => {
    const authorContext = await browser.newContext({
      baseURL, storageState: ".playwright/.auth/platform-admin.json",
      viewport: { width: 1440, height: 900 },
    });
    const viewerContext = await browser.newContext({
      baseURL, storageState: ".playwright/.auth/reader.json",
      viewport: { width: 1440, height: 900 },
    });
    const author = await authorContext.newPage();
    const viewer = await viewerContext.newPage();
    const captures = [observe(author, "A: platform administrator"), observe(viewer, "B: reader")];
    try {
      await runTest({ author, viewer });
    } finally {
      try {
        const slug = `realtime-${testInfo.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
        await writeAuditText(`audit/console/${slug}.log`,
          captures.map((capture) => capture.console.join("\n")).join("\n") + "\n");
        await writeAuditText(`audit/network/${slug}.log`,
          captures.map((capture) => capture.network.join("\n")).join("\n") + "\n");
        expect(captures.flatMap((capture) => capture.errors), "Console, page and network errors").toEqual([]);
      } finally {
        // Close only after the audit: closing a live SSE stream aborts its request.
        await Promise.all([authorContext.close(), viewerContext.close()]);
      }
    }
  },
});

async function fixtureTask(scenario: string) {
  const [admin] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  const [reader] = await db.select({ id: user.id, name: user.name }).from(user)
    .where(eq(user.email, "reader@jiroo.local"));
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  if (!admin || !reader || !backlog) throw new Error("Missing realtime E2E accounts or backlog.");
  expect(reader.id).not.toBe(admin.id);
  const [epic] = await db.select({ id: items.id }).from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, "epic"), isNull(items.deletedAt)));
  if (!epic) throw new Error("Missing realtime E2E epic.");
  const item = await createItem({
    backlogId: backlog.id, type: "tache", parentId: epic.id,
    title: `JIR-102 ${scenario} ${RUN}`,
  }, admin.id, `e2e-realtime-${scenario}-${RUN}`);
  return { item, reader };
}

/** Wait for the real SSE response, never networkidle (the stream stays open). */
async function openBacklog(page: Page, itemKey?: string) {
  const stream = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/realtime" && url.searchParams.get("backlog") === "CASS";
  }, { timeout: TIMEOUT });
  await page.goto(`/b/CASS?view=list${itemKey ? `&item=${itemKey}` : ""}`);
  const response = await stream;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/event-stream");
  await expect(page.getByRole("list", { name: "Liste des items" })).toBeVisible();
}

function banner(page: Page) {
  return page.getByRole("status").filter({ hasText: BANNER });
}

async function rename(author: Page, title: string) {
  const dialog = author.getByRole("dialog");
  await dialog.getByRole("heading", { level: 1 }).click();
  const field = dialog.getByRole("textbox", { name: "Titre de l’item" });
  await field.fill(title);
  await field.press("Enter");
  await expect(dialog.getByRole("heading", { level: 1, name: title, exact: true }))
    .toBeVisible({ timeout: TIMEOUT });
}

async function screenshot(page: Page, scenario: string) {
  await writeAuditScreenshot(`audit/screenshots/realtime-${scenario}.png`,
    (path) => page.screenshot({ path, caret: "initial" }));
}

test.describe("realtime between two users", () => {
  test.setTimeout(60_000);

  test("offers a list refresh to the other user only", async ({ pair: { author, viewer } }) => {
    const { item } = await fixtureTask("list");
    await openBacklog(viewer);
    const list = viewer.getByRole("list", { name: "Liste des items" });
    const row = list.getByRole("listitem").filter({ has: viewer.getByText(item.key, { exact: true }) });
    await expect(row).toContainText(item.title);
    const documentStarted = await viewer.evaluate(() => performance.timeOrigin);
    await openBacklog(author, item.key);

    const title = `${item.title} renamed`;
    await rename(author, title);
    await expect(banner(viewer)).toBeVisible({ timeout: TIMEOUT });
    // B has received the same mutation before A's negative assertion.
    await expect(banner(author)).toHaveCount(0);
    await expect(row).toContainText(item.title);
    await expect(row).not.toContainText(title);
    expect(await viewer.evaluate(() => performance.timeOrigin)).toBe(documentStarted);
    await screenshot(viewer, "list-banner");

    await banner(viewer).getByRole("button", { name: "Actualiser", exact: true }).click();
    await expect(list.getByRole("listitem").filter({ has: viewer.getByText(item.key, { exact: true }) }))
      .toContainText(title, { timeout: TIMEOUT });
    await expect(banner(viewer)).toHaveCount(0);
    await expect(banner(author)).toHaveCount(0);
    expect(await viewer.evaluate(() => performance.timeOrigin)).toBe(documentStarted);
  });

  test("refreshes the other user's open item automatically", async ({ pair: { author, viewer } }) => {
    const { item } = await fixtureTask("drawer");
    await openBacklog(viewer, item.key);
    const dialog = viewer.getByRole("dialog", { name: keyPattern(item.key) });
    await expect(dialog.getByRole("heading", { level: 1, name: item.title, exact: true })).toBeVisible();
    const documentStarted = await viewer.evaluate(() => performance.timeOrigin);
    await openBacklog(author, item.key);

    const title = `${item.title} live`;
    await rename(author, title);
    await expect(dialog.getByRole("heading", { level: 1, name: title, exact: true }))
      .toBeVisible({ timeout: TIMEOUT });
    expect(await viewer.evaluate(() => performance.timeOrigin)).toBe(documentStarted);
    await expect(banner(author)).toHaveCount(0);
    await screenshot(viewer, "drawer");
  });

  test("increments the other user's bell after a mention", async ({ pair: { author, viewer } }) => {
    const { item, reader } = await fixtureTask("mention");
    await openBacklog(viewer);
    const bell = viewer.getByRole("button", { name: /^Notifications(?: \(\d+ non lues\))?$/ });
    await expect(bell).toBeVisible();
    const label = await bell.getAttribute("aria-label");
    const before = Number(label?.match(/\((\d+) non lues\)/)?.[1] ?? "0");
    const documentStarted = await viewer.evaluate(() => performance.timeOrigin);
    await openBacklog(author, item.key);
    const dialog = author.getByRole("dialog", { name: keyPattern(item.key) });
    const composer = dialog.getByRole("textbox", { name: "Nouveau commentaire" });
    await composer.click();
    await composer.pressSequentially("@Lecteur");
    const suggestions = dialog.getByRole("listbox", { name: "Suggestions de mention" });
    await expect(suggestions).toBeVisible();
    await suggestions.getByRole("button", { name: reader.name, exact: true }).click();
    await expect(composer).toContainText(`@${reader.name}`);
    await dialog.getByRole("button", { name: "Commenter", exact: true }).click();
    await expect(dialog.getByRole("article", { name: /Commentaire de/ }).filter({ hasText: reader.name }))
      .toBeVisible({ timeout: TIMEOUT });

    await expect(viewer.getByRole("button", { name: `Notifications (${before + 1} non lues)`, exact: true }))
      .toBeVisible({ timeout: TIMEOUT });
    expect(await viewer.evaluate(() => performance.timeOrigin)).toBe(documentStarted);
    await expect(banner(author)).toHaveCount(0);
    await screenshot(viewer, "bell");
  });
});
