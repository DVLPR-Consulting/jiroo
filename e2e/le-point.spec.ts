import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { asc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { activities, backlogs, items, statuses } from "../lib/db/schema/domain";
import { archiveBacklog, createBacklog } from "../lib/services/backlogs";
import { addComment } from "../lib/services/comments";
import { createItem } from "../lib/services/items";
import { addLink } from "../lib/services/links";
import { startSprint } from "../lib/services/sprint-lifecycle";
import { createSprint } from "../lib/services/sprints";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";
import { readActionArguments } from "./support/actions";
import { observePage } from "./support/capture";
import { keyPattern } from "./key-helpers";

const RUN = process.env.JIROO_E2E_RUN_ID;
if (!RUN) throw new Error("Le point E2E requires an isolated run id.");
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const LONG_TITLE = "Choisir le format de publication des décisions pour que les équipes du greffe puissent consulter les documents signés, vérifier leur accessibilité et retrouver toutes les annexes";
const MENTION = "@Administrateur E2E, faut-il publier en PDF ou en HTML avant de terminer ce ticket ?";
let fixture: Awaited<ReturnType<typeof seedProject>>;
let ownedBacklogId: string | undefined;

type Capture = { console: string[]; network: string[]; errors: string[] };
type ObservedWrite = { actionId?: string; permissionArguments: boolean; method: string; path: string };

async function seedProject() {
  const [actor] = await db.select({ id: user.id }).from(user).where(eq(user.email, "platform-admin@jiroo.local"));
  if (!actor) throw new Error("Missing isolated platform administrator.");
  const suffix = [...randomBytes(3)].map((value) => String.fromCharCode(65 + value % 26)).join("");
  const key = `LPT${suffix}`;
  const backlog = await createBacklog({ key, name: "Le point — parcours de démonstration", color: "#7c3030" }, actor.id);
  ownedBacklogId = backlog.id;
  const columns = await db.select().from(statuses).where(eq(statuses.backlogId, backlog.id));
  const doing = columns.find((column) => column.category === "in_progress");
  if (!doing) throw new Error("Missing in-progress status.");
  const component = await createItem({ backlogId: backlog.id, type: "composant", title: "Portail des décisions" }, actor.id);
  const epic = await createItem({ backlogId: backlog.id, type: "epic", parentId: component.id, title: "Publier les décisions accessibles" }, actor.id);
  const sprint = await createSprint({ backlogId: backlog.id }, actor.id);
  const task = (title: string, points: number, statusId?: string) => createItem({
    backlogId: backlog.id, type: "tache", parentId: epic.id, title, sprintId: sprint.id,
    assigneeId: actor.id, estimatePoints: points, ...(statusId ? { statusId } : {}),
  }, actor.id);
  const working = await task("Préparer le document signé", 5, doing.id);
  const blocker = await task("Valider la signature électronique", 3, doing.id);
  const decision = await task(LONG_TITLE, 2);
  await addLink({ sourceId: blocker.id, targetId: decision.id, type: "blocks" }, actor.id);
  await addComment({ itemId: decision.id, body: MENTION, mentionIds: [actor.id] }, actor.id);
  await startSprint({
    id: sprint.id, backlogId: backlog.id, name: "Démonstration Le point", goal: "Publier les décisions accessibles.",
    startAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    endAt: new Date(Date.now() + 12 * 86_400_000).toISOString(), capacityPoints: 13,
  }, actor.id);
  return { backlog, decision, working, blocker };
}

async function businessState() {
  // Also detects primitive-argument writes such as archiveBacklogAction(id).
  const [header, tickets, history] = await Promise.all([
    db.select().from(backlogs).where(eq(backlogs.id, fixture.backlog.id)),
    db.select().from(items).where(eq(items.backlogId, fixture.backlog.id)).orderBy(asc(items.id)),
    db.select({ id: activities.id }).from(activities).innerJoin(items, eq(items.id, activities.itemId))
      .where(eq(items.backlogId, fixture.backlog.id)).orderBy(asc(activities.id)),
  ]);
  return { header, tickets, history };
}

async function permissionActionIds() {
  // next dev owns this manifest. Read only the named export, never print the
  // manifest: it also contains Next's encryption key. Fail closed if unavailable.
  let manifest: { node: Record<string, { exportedName?: string; filename?: string }> };
  try {
    manifest = JSON.parse(await readFile(".next-e2e/dev/server/server-reference-manifest.json", "utf8"));
  } catch {
    // JSON parser errors may quote the manifest, including its encryption key.
    throw new Error("Server Action metadata unavailable; read-only verification refused.");
  }
  const ids = new Set(Object.entries(manifest.node).filter(([, action]) =>
    action.exportedName === "canOpenBacklogSettingsAction" && action.filename?.includes("app/actions/backlogs.ts"),
  ).map(([id]) => id));
  expect(ids.size, "The known permission read is identified by its named export").toBeGreaterThan(0);
  return ids;
}

const test = base.extend<{ audit: Capture }>({
  audit: [async ({ page }, runTest, info) => {
    const capture: Capture = { console: [`run=${RUN}`], network: [`run=${RUN}`], errors: [] };
    const writes: ObservedWrite[] = [];
    const before = await businessState();
    observePage(page, { console: capture.console, network: capture.network, onFault: ({ line }) => capture.errors.push(line) }, "admin");
    page.on("request", (request) => {
      if (["GET", "HEAD"].includes(request.method())) return; // Includes RSC reads.
      const args = readActionArguments(request.postData());
      writes.push({ actionId: request.headers()["next-action"],
        permissionArguments: args?.length === 1 && args[0] === fixture.backlog.id,
        method: request.method(), path: new URL(request.url()).pathname });
    });
    try {
      await runTest(capture);
    } finally {
      try {
        const knownReads = await permissionActionIds();
        const reads = writes.filter((request) => request.method === "POST" && request.permissionArguments
          && !!request.actionId && knownReads.has(request.actionId));
        for (const request of writes) {
          if (!reads.includes(request)) capture.errors.push(`Mutation request: ${request.method} ${request.path}`);
        }
        expect(reads.length, "Permission reads are observed, not globally forbidden or silently skipped").toBeGreaterThan(0);
        expect(await businessState(), "The browser journey does not mutate project data").toEqual(before);
        expect(capture.errors, "No browser errors or mutations; permission and RSC reads remain allowed").toEqual([]);
      } finally {
        const slug = `le-point-${info.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
        try {
          if (info.status !== info.expectedStatus || info.errors.length > 0 || capture.errors.length > 0) {
            await writeAuditScreenshot(`audit/screenshots/${slug}-failure.png`, (path) => page.screenshot({ path, caret: "initial" }));
          }
        } finally {
          await writeAuditText(`audit/console/${slug}.log`, capture.console.join("\n") + "\n");
          await writeAuditText(`audit/network/${slug}.log`, capture.network.join("\n") + "\n");
        }
      }
    }
  }, { auto: true }],
});
test.use({ storageState: ".playwright/.auth/platform-admin.json", viewport: DESKTOP });
test.setTimeout(60_000);
test.beforeAll(async () => { fixture = await seedProject(); });
test.afterAll(async () => { if (ownedBacklogId) await archiveBacklog(ownedBacklogId); });

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let count = 0; count < 80; count++) {
    if (await target.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(target, "Reachable by Tab without mouse or programmatic focus").toBeFocused();
}
async function shot(page: Page, name: string) {
  await writeAuditScreenshot(`audit/screenshots/le-point-${name}.png`,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }));
}
async function open(page: Page) {
  await page.goto(`/b/${fixture.backlog.key}/le-point`);
  await expect(page).toHaveTitle("Le point (pilote) — Jiroo");
  await expect(page.getByRole("heading", { level: 1, name: "Le point pilote", exact: true })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Portée", exact: true }).getByRole("radio", { name: "Toute l’équipe", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Développement", exact: true })).toBeChecked();
  await expect(page.locator("#le-point-reprendre")).toContainText(fixture.working.title);
  await expect(page.locator("#le-point-bloque")).toContainText(LONG_TITLE);
  await expect(page.getByRole("heading", { name: "Santé du sprint", exact: true })).toBeAttached();
}
async function selectProductByKeyboard(page: Page) {
  const selector = page.getByRole("radiogroup", { name: "Perspective", exact: true });
  await tabTo(page, selector.getByRole("radio", { name: "Développement", exact: true }));
  await page.keyboard.press("ArrowRight");
  await expect(selector.getByRole("radio", { name: "Produit", exact: true })).toBeChecked();
  await expect(selector.getByRole("radio", { name: "Produit", exact: true })).toBeFocused();
  await expect(page.locator("#le-point-decisions")).toContainText(LONG_TITLE);
}
function decisionLink(page: Page) {
  return page.locator("#le-point-decisions").getByRole("link", { name: keyPattern(fixture.decision.key) });
}

test("keyboard journey remembers the perspective and restores focus after closing a ticket", async ({ page }) => {
  await open(page);
  await shot(page, "developer-1440");
  await selectProductByKeyboard(page);
  await shot(page, "product-1440");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Produit", exact: true })).toBeChecked();
  const opener = decisionLink(page);
  await expect(opener).toHaveAttribute("href", `/b/${fixture.backlog.key}/le-point?item=${fixture.decision.key}`);
  await tabTo(page, opener);
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: keyPattern(fixture.decision.key) });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(MENTION);
  await shot(page, "panel-1440");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("390px keeps both perspectives in one column with complete card text and no overflow", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page);
  for (const perspective of ["developer", "product"] as const) {
    const main = page.getByRole("main");
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "No page-wide horizontal overflow").toBe(true);
    const selector = perspective === "developer"
      ? "#le-point-reprendre, #le-point-bloque, #le-point-ensuite, #le-point-recent"
      : "#le-point-decisions, #le-point-objectifs, #le-point-difficultes, #le-point-livraison";
    const boxes = await main.locator(selector).evaluateAll((sections) => sections.map((section) => {
      const { x, y, width, height } = section.getBoundingClientRect();
      return { x, y, width, height };
    }));
    expect(boxes).toHaveLength(4);
    for (let index = 1; index < boxes.length; index++) {
      expect.soft(boxes[index]!.x).toBeCloseTo(boxes[0]!.x, 0);
      expect.soft(boxes[index]!.width).toBeCloseTo(boxes[0]!.width, 0);
      expect.soft(boxes[index]!.y).toBeGreaterThanOrEqual(boxes[index - 1]!.y + boxes[index - 1]!.height);
    }
    await expect(main.getByText(LONG_TITLE, { exact: true }).first()).toBeVisible();
    const clipped = await main.locator("section li .truncate, section li p").evaluateAll((elements) =>
      elements.filter((element) => element.getClientRects().length > 0).flatMap((element) => {
        const node = element as HTMLElement;
        return node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1
          ? [{ text: node.textContent, width: node.clientWidth, contentWidth: node.scrollWidth }] : [];
      }));
    expect.soft(clipped, `${perspective}: card text is neither clipped nor truncated`).toEqual([]);
    await main.locator(perspective === "developer" ? "#le-point-bloque" : "#le-point-decisions").scrollIntoViewIfNeeded();
    await shot(page, `${perspective}-390`);
    if (perspective === "developer") await selectProductByKeyboard(page);
  }
  const opener = decisionLink(page);
  await tabTo(page, opener);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: keyPattern(fixture.decision.key) })).toBeVisible();
  await shot(page, "panel-390");
});
