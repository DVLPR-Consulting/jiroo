import "dotenv/config";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { asc, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { user } from "../../lib/db/schema/auth";
import { statuses } from "../../lib/db/schema/domain";
import { archiveBacklog, createBacklog } from "../../lib/services/backlogs";
import { createItem, updateItem } from "../../lib/services/items";
import { startSprint } from "../../lib/services/sprint-lifecycle";
import { createSprint } from "../../lib/services/sprints";
import { createStatus } from "../../lib/services/statuses";
import { writeAuditScreenshot, writeAuditText } from "../audit-artifacts";
import { announcedDropStatus, compareDrop, estimateDropSeriesMs, offscreenDropTargets, readDropAction, type DropColumn, type DropStatus, type DropTiming } from "../support/drops";
import { createAuditEvidenceFilters } from "../support/evidence";

const TITLE = "Carte de contrôle des dépôts";
const DROPS = 50;
const BUDGET_MS = 540_000; // Reserve a minute of the ten-minute aim for process setup/teardown.
const measurements: DropTiming[] = [];
let fixture: Awaited<ReturnType<typeof seedBoard>> | undefined;
let backlogId: string | undefined;
let started = 0;
test.use({ storageState: ".playwright/.auth/platform-admin.json" });
test.setTimeout(180_000);

test.beforeAll(async ({}, info) => {
  // Full matrix projects also discover this file: never seed for their skipped cases.
  if (info.project.name !== "matrix-drops") return;
  started = performance.now();
  fixture = await seedBoard();
});
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "matrix-drops", "Stress drops run only in matrix-drops.");
});
test.afterAll(async () => {
  // Sprint events are append-only: archive only this spec's dedicated backlog.
  if (backlogId) await archiveBacklog(backlogId);
});

async function seedBoard() {
  const [actor] = await db.select({ id: user.id }).from(user).where(eq(user.email, "platform-admin@jiroo.local"));
  if (!actor) throw new Error("Missing isolated platform administrator.");
  const suffix = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const backlog = await createBacklog({ key: `DRP${suffix}`, name: "Matrice des dépôts E2E", color: "#7c3aed" }, actor.id);
  backlogId = backlog.id;
  for (let index = 1; index <= 3; index++) {
    await createStatus({ backlogId, name: `Contrôle ${index}`, category: "in_progress", color: "#7c3aed" });
  }
  const columns = await db.select({ id: statuses.id, name: statuses.name, category: statuses.category }).from(statuses)
    .where(eq(statuses.backlogId, backlog.id)).orderBy(asc(statuses.order));
  const origin = columns.find(({ category }) => category === "todo");
  if (!origin) throw new Error("Missing initial column.");
  const component = await createItem({ backlogId, type: "composant", title: "Portail dépôts" }, actor.id);
  const epic = await createItem({ backlogId, type: "epic", parentId: component.id, title: "Scénarios de dépôt" }, actor.id);
  const sprint = await createSprint({ backlogId }, actor.id);
  for (const column of columns) {
    await createItem({ backlogId, type: "tache", parentId: epic.id, title: `Repère ${column.name}`, statusId: column.id, sprintId: sprint.id }, actor.id);
  }
  const moving = await createItem({ backlogId, type: "tache", parentId: epic.id, title: TITLE, statusId: origin.id, sprintId: sprint.id }, actor.id);
  await startSprint({
    id: sprint.id, backlogId, name: "Matrice dépôts", goal: "Vérifier cible annoncée, envoyée et persistée.",
    startAt: new Date(Date.now() - 86_400_000).toISOString(),
    endAt: new Date(Date.now() + 13 * 86_400_000).toISOString(), capacityPoints: 13,
  }, actor.id);
  return { backlog, columns, origin, moving, actorId: actor.id };
}

function column(page: Page, status: DropStatus): Locator {
  return page.getByRole("group", { name: new RegExp(`^${status.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}, \\d+ items?$`) });
}

async function readyBoard(page: Page) {
  if (!fixture) throw new Error("Drop fixture was not initialized.");
  await expect(page.getByRole("heading", { name: "Board", level: 1, exact: true })).toBeVisible();
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  const handle = column(page, fixture.origin).getByRole("button", { name: `Déplacer ${fixture.moving.key}`, exact: true });
  await expect(handle).toBeEnabled();
  const scroller = column(page, fixture.origin).locator("xpath=ancestor::div[contains(@class,'overflow-x-auto')][1]");
  // Reset only while at rest. All scrolling during the drag must be pointer-induced.
  await scroller.evaluate((node) => { node.scrollLeft = 0; });
  await expect.poll(() => scroller.evaluate((node) => node.scrollLeft)).toBe(0);
  return { handle, scroller };
}

async function frameBounds(scroller: Locator) {
  return scroller.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { left: Math.max(0, box.left + node.clientLeft), right: Math.min(innerWidth, box.left + node.clientLeft + node.clientWidth) };
  });
}

async function targetsAtOpening(page: Page, scroller: Locator) {
  if (!fixture) throw new Error("Drop fixture was not initialized.");
  const bounds: DropColumn[] = [];
  for (const status of fixture.columns) {
    const box = await column(page, status).boundingBox();
    if (!box) throw new Error(`Missing geometry for ${status.name}.`);
    bounds.push({ ...status, left: box.x, right: box.x + box.width });
  }
  expect(await scroller.evaluate((node) => node.scrollWidth - node.clientWidth), "Board must scroll even at 1200px").toBeGreaterThan(0);
  return offscreenDropTargets(bounds, await frameBounds(scroller), fixture.origin.id);
}

async function observedDrop(page: Page, target: DropStatus, record: (line: string) => void) {
  if (!fixture) throw new Error("Drop fixture was not initialized.");
  const { moving, backlog, columns, origin } = fixture;
  const { handle, scroller } = await readyBoard(page);
  const frame = await frameBounds(scroller);
  const targetColumn = column(page, target);
  const initial = await targetColumn.boundingBox();
  const source = await handle.boundingBox();
  if (!initial || !source) throw new Error("Missing drag geometry.");
  expect(offscreenDropTargets([{ ...target, left: initial.x, right: initial.x + initial.width }], frame, origin.id)).toHaveLength(1);
  const live = page.locator('[id^="DndLiveRegion"]');
  await expect(live).toHaveCount(1);
  let released = false;
  try {
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2, { steps: 3 });
    const scrollStart = performance.now();
    // The rightmost two pixels trigger auto-scroll; never call scrollIntoView during a drag.
    await page.mouse.move(frame.right - 2, initial.y + initial.height - 16, { steps: 8 });
    await expect.poll(async () => {
      const box = await targetColumn.boundingBox();
      if (!box) return false;
      const center = box.x + box.width / 2;
      return center >= frame.left + 40 && center <= frame.right - 40;
    }, { timeout: 8_000, intervals: [20, 40, 60] }).toBe(true);
    const scrollMs = performance.now() - scrollStart;
    const dropBox = await targetColumn.boundingBox();
    if (!dropBox) throw new Error(`Missing final geometry for ${target.name}.`);
    await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height - 16, { steps: 4 });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const announcement = await live.textContent() ?? "";
    const scrollPx = await scroller.evaluate((node) => node.scrollLeft);
    expect(scrollPx, "Auto-scroll must be nonzero before release").toBeGreaterThan(0);
    // Match the moving item, NOT the expected status: a wrong status must remain observable.
    const responsePromise = page.waitForResponse((response) => response.request().method() === "POST"
      && new URL(response.url()).pathname === `/b/${backlog.key}`
      && Boolean(response.request().headers()["next-action"])
      && readDropAction(response.request().postData(), moving.id) !== null,
    { timeout: 10_000 }).catch(() => null);
    await page.mouse.up();
    released = true;
    const response = await responsePromise;
    const sent = response ? readDropAction(response.request().postData(), moving.id)?.statusId ?? null : null;
    // Wait for the server action's UI acknowledgement rather than a finished RSC stream.
    await expect(page.getByRole("button", { name: `Déplacer ${moving.key}`, exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
    await expect(column(page, origin)).toBeVisible();
    const groupLabel = await page.locator(`[data-card="${moving.key}"]`).evaluateAll((nodes) =>
      nodes.length === 1 ? nodes[0]!.closest('[role="group"]')?.getAttribute("aria-label") ?? "" : "");
    const reloaded = columns.find(({ name }) => groupLabel.startsWith(`${name}, `))?.id ?? null;
    const result = compareDrop({ itemKey: moving.key, expected: target.id,
      announced: announcedDropStatus(announcement, `${moving.key} — ${TITLE}`, columns), sent, reloaded }, columns);
    record(`${result.message}; autoScroll=${Math.round(scrollPx)}px`);
    expect(result.matches, result.message).toBe(true);
    expect(response?.status() ?? 0, `${result.message}; action HTTP status`).toBeGreaterThanOrEqual(200);
    expect(response?.status() ?? 500, `${result.message}; action HTTP status`).toBeLessThan(400);
    return { scrollMs, scrollPx, message: result.message };
  } finally {
    if (!released) await page.mouse.up();
  }
}

async function runSeries(page: Page, target: DropStatus, info: TestInfo) {
  if (!fixture) throw new Error("Drop fixture was not initialized.");
  const startedAt = performance.now();
  const lines: string[] = [];
  let completed = 0, scrollMs = 0, scrollPx = 0;
  try {
    for (let index = 0; index < DROPS; index++) {
      const result = await observedDrop(page, target, (line) => lines.push(`${index + 1}/${DROPS} ${line}`));
      completed++; scrollMs += result.scrollMs; scrollPx += result.scrollPx;
      // Explicitly approved fixture reset; not a measured/tested drop.
      await updateItem({ id: fixture.moving.id, statusId: fixture.origin.id }, fixture.actorId);
      await page.reload();
    }
    const timing = { drops: completed, wallMs: performance.now() - startedAt, scrollMs, scrollPx };
    measurements.push(timing);
    return timing;
  } finally {
    const summary = `[drops] width=${page.viewportSize()?.width} target=${target.name} verified=${completed}/${DROPS} wallMs=${Math.round(performance.now() - startedAt)}`;
    console.info(summary);
    info.annotations.push({ type: "drops", description: summary });
    const evidence = [...lines, summary].join("\n") + "\n";
    if (createAuditEvidenceFilters(process.env.JIROO_PLAYWRIGHT_PASSWORD ?? "Audit-Local-2026!").credentialEvidence.test(evidence)) {
      throw new Error("Credentials refused in drop evidence.");
    }
    const label = `${page.viewportSize()?.width}-${info.title.includes("farthest") ? "farthest" : "nearest"}`;
    await writeAuditText(`audit/console/drops-${label}.log`, evidence);
    if (completed !== DROPS) {
      await writeAuditScreenshot(`audit/screenshots/drops-${label}-failure.png`, (path) => page.screenshot({ path, caret: "initial" }));
    }
  }
}

for (const width of [390, 768, 1200]) {
  test(`${width}px — 50 drops to the nearest wholly offscreen column`, async ({ page }, info) => {
    if (!fixture) throw new Error("Drop fixture was not initialized.");
    await page.setViewportSize({ width, height: 800 });
    await updateItem({ id: fixture.moving.id, statusId: fixture.origin.id }, fixture.actorId);
    await page.goto(`/b/${fixture.backlog.key}?view=board`);
    const { scroller } = await readyBoard(page);
    const targets = await targetsAtOpening(page, scroller);
    expect(targets.length, "At least one wholly offscreen target is required").toBeGreaterThan(0);
    await runSeries(page, targets[0]!, info);
  });
}

test("1200px — optional 50 drops to the farthest wholly offscreen column", async ({ page }, info) => {
  test.skip(measurements.length !== 3, "All three mandatory series must finish before estimating the optional series.");
  if (!fixture) throw new Error("Drop fixture was not initialized.");
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(`/b/${fixture.backlog.key}?view=board`);
  const { scroller } = await readyBoard(page);
  const targets = await targetsAtOpening(page, scroller);
  const target = targets.at(-1);
  test.skip(!target || target.id === targets[0]?.id, "No additional farther offscreen target.");
  const frame = await frameBounds(scroller);
  const pixels = target!.left + (target!.right - target!.left) / 2 - (frame.right - 40);
  const estimate = Math.max(...measurements.map((timing) => estimateDropSeriesMs(timing, pixels, DROPS)));
  const elapsed = performance.now() - started;
  const reason = `Optional farthest series estimate ${Math.ceil(estimate / 1000)}s, elapsed ${Math.ceil(elapsed / 1000)}s; nine-minute internal budget.`;
  info.annotations.push({ type: "budget", description: reason });
  test.skip(elapsed + estimate > BUDGET_MS, reason);
  test.setTimeout(Math.max(1000, BUDGET_MS - elapsed));
  await runSeries(page, target!, info);
});
