import "dotenv/config";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { pointsLabel } from "../lib/format/plural";
import {
  backlogs,
  items,
  sprintEvents,
  sprintReportSnapshots,
  sprints,
  statuses,
} from "../lib/db/schema/domain";
import { createItem, softDeleteItem, updateItem } from "../lib/services/items";
import { completeSprint, startSprint } from "../lib/services/sprint-lifecycle";
import { getBurndownReport } from "../lib/services/sprint-burndown";
import { getSprintReport } from "../lib/services/sprint-reports";
import { createSprint, moveItemToSprint, updateSprint } from "../lib/services/sprints";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";
import { chooseOption } from "./select-helpers";
import { keyPattern } from "./key-helpers";

const AUTH = {
  admin: ".playwright/.auth/platform-admin.json",
  reader: ".playwright/.auth/reader.json",
} as const;

type Capture = {
  console: string[];
  network: string[];
  expectedHttp: string[];
  faults: string[];
  contexts: Set<BrowserContext>;
  /** Window of one deliberate read fault, settled when the scenario ends. */
  expectedFault?: { start: number; end?: number; marker: string };
};

type ReportFixtures = Awaited<ReturnType<typeof seedReportFixtures>>;
let fixtures: ReportFixtures;

// Same resolution as e2e/global.setup.ts; the value never reaches an artifact.
const FIXTURE_PASSWORD = process.env.JIROO_PLAYWRIGHT_PASSWORD ?? "Audit-Local-2026!";
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const FORBIDDEN_AUDIT_EVIDENCE = new RegExp(
  [
    "postgres(?:ql)?:",
    "authorization",
    "bearer",
    "cookie:",
    "select\\s",
    "sprint_report_snapshots",
    "database_url",
    "direct_database_url",
    "jiroo-e2e-secret",
    escapeRegExp(FIXTURE_PASSWORD),
  ].join("|"),
  "i",
);
const CREDENTIAL_EVIDENCE = new RegExp(
  ["postgres(?:ql)?:", "authorization", "bearer", "jiroo-e2e-secret", escapeRegExp(FIXTURE_PASSWORD)].join("|"),
  "i",
);
const BOUNDARY_FAULT = "handled by the <ErrorBoundaryHandler> error boundary";

/**
 * Removes the deliberate boundary lines of the fault window once the scenario
 * is over, so late console reports are covered, and replaces them with one
 * `[expected-fault]` marker. Anything else in the window stays a fault.
 */
function settleExpectedFault(capture: Capture) {
  const window = capture.expectedFault;
  if (!window) return;
  const end = window.end ?? capture.faults.length;
  const inWindow = capture.faults.slice(window.start, end);
  const expected = inWindow.filter((fault) => fault.includes(BOUNDARY_FAULT));
  expect(expected.length, "La panne injectée doit produire une preuve navigateur.").toBeGreaterThan(0);
  // Discarded lines may name internal tables (dev error forwarding) but must
  // never carry credentials.
  for (const fault of expected) expect(fault).not.toMatch(CREDENTIAL_EVIDENCE);
  capture.faults = [
    ...capture.faults.slice(0, window.start),
    ...inWindow.filter((fault) => !expected.includes(fault)),
    ...capture.faults.slice(end),
  ];
  capture.console = capture.console.filter((line) => !expected.includes(line));
  capture.console.push(window.marker);
  capture.expectedFault = undefined;
}

function observe(page: Page, capture: Capture, actor: string) {
  page.on("console", (message) => {
    const line = `[${actor}] ${message.type()}: ${message.text()}`;
    capture.console.push(line);
    if (message.type() === "error") capture.faults.push(line);
  });
  page.on("pageerror", (error) => {
    const line = `[${actor}] pageerror: ${error.message}`;
    capture.console.push(line);
    capture.faults.push(line);
  });
  page.on("requestfailed", (request) => {
    const line = `[${actor}] failed ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`;
    capture.network.push(line);
    capture.faults.push(line);
  });
  page.on("response", (response) => {
    const line = `[${actor}] ${response.status()} ${response.request().method()} ${response.url()}`;
    capture.network.push(line);
    if (response.status() >= 400) {
      const expectedIndex = capture.expectedHttp.findIndex((fragment) => line.includes(fragment));
      if (expectedIndex >= 0) capture.expectedHttp.splice(expectedIndex, 1);
      else capture.faults.push(line);
    }
  });
}

function audited(
  number: number,
  title: string,
  body: (input: {
    page: Page;
    browser: Browser;
    capture: Capture;
    observedPage: (actor: string, storageState: string) => Promise<Page>;
  }) => Promise<void>,
) {
  test(`${String(number).padStart(2, "0")} — ${title}`, async ({ page, browser }) => {
    const startedAt = performance.now();
    const capture: Capture = {
      console: [],
      network: [],
      expectedHttp: [],
      faults: [],
      contexts: new Set(),
    };
    observe(page, capture, "admin");
    const observedPage = async (actor: string, storageState: string) => {
      const context = await browser.newContext({ storageState });
      capture.contexts.add(context);
      const observed = await context.newPage();
      observe(observed, capture, actor);
      return observed;
    };
    let failure: unknown;
    try {
      await body({ page, browser, capture, observedPage });
      settleExpectedFault(capture);
      expect(capture.expectedHttp, "Réponses HTTP attendues non observées").toEqual([]);
      expect(capture.faults, "Erreurs navigateur inattendues").toEqual([]);
    } catch (error) {
      failure = error;
      capture.console.push(`[defect] ${error instanceof Error ? error.message : String(error)}`);
      await writeAuditScreenshot(
        `audit/screenshots/reports-s${String(number).padStart(2, "0")}-failure.png`,
        (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
      );
    }
    const persistedEvidence = [...capture.console, ...capture.network].join("\n");
    if (FORBIDDEN_AUDIT_EVIDENCE.test(persistedEvidence)) {
      await Promise.allSettled([...capture.contexts].map((context) => context.close()));
      throw new Error(`Scénario ${number} : preuve sensible/interne refusée avant écriture.`);
    }
    capture.console.push(`[duration] scenario ${number}: ${Math.round(performance.now() - startedAt)}ms`);
    await writeAuditText(
      `audit/console/reports-s${String(number).padStart(2, "0")}.log`,
      `${capture.console.join("\n")}\n`,
    );
    await writeAuditText(
      `audit/network/reports-s${String(number).padStart(2, "0")}.log`,
      `${capture.network.join("\n")}\n`,
    );
    await Promise.allSettled([...capture.contexts].map((context) => context.close()));
    if (failure) throw failure;
  });
}

async function fixtureContext(backlogKey: "CASS" | "LABS" = "CASS") {
  const [actor] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  const [backlog] = await db.select({ id: backlogs.id, key: backlogs.key })
    .from(backlogs).where(eq(backlogs.key, backlogKey));
  if (!actor || !backlog) throw new Error(`Fixture ${backlogKey} incomplète.`);
  const [epic] = await db.select({ id: items.id }).from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, backlogKey === "CASS" ? "epic" : "tache")));
  const statusRows = await db.select({
    id: statuses.id,
    name: statuses.name,
    category: statuses.category,
  })
    .from(statuses).where(eq(statuses.backlogId, backlog.id));
  const todo = statusRows.find((status) => status.category === "todo");
  const done = statusRows.find((status) => status.category === "done");
  if (!epic || !todo || !done) throw new Error(`Statuts ${backlogKey} incomplets.`);
  return {
    actorId: actor.id,
    backlog,
    epicId: epic.id,
    todoId: todo.id,
    todoName: todo.name,
    doneId: done.id,
    doneName: done.name,
  };
}

async function task(
  context: Awaited<ReturnType<typeof fixtureContext>>,
  title: string,
  input: { points: number | null; sprintId?: string },
) {
  const created = await createItem({
    backlogId: context.backlog.id,
    type: "tache",
    parentId: context.epicId,
    title,
    statusId: context.todoId,
    ...(input.sprintId ? { sprintId: input.sprintId } : {}),
  }, context.actorId, `reports-e2e-create-${title}`);
  await updateItem(
    { id: created.id, estimatePoints: input.points },
    context.actorId,
    `reports-e2e-estimate-${title}`,
  );
  return created;
}

async function namedSprint(
  context: Awaited<ReturnType<typeof fixtureContext>>,
  name: string,
) {
  const sprint = await createSprint({ backlogId: context.backlog.id }, context.actorId);
  await updateSprint({ id: sprint.id, backlogId: context.backlog.id, name }, context.actorId);
  return sprint;
}

async function begin(
  context: Awaited<ReturnType<typeof fixtureContext>>,
  sprintId: string,
  name: string,
) {
  await startSprint({
    id: sprintId,
    backlogId: context.backlog.id,
    name,
    goal: `Objectif ${name}`,
    startAt: "2026-08-01T09:00:00.000Z",
    endAt: "2026-08-15T18:00:00.000Z",
    capacityPoints: 21,
  }, context.actorId, `reports-e2e-start-${name}`);
}

async function businessPost(page: Page, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST"
    && new URL(response.url()).pathname === "/b/CASS",
  );
  await action();
  const response = await responsePromise;
  await response.finished();
  expect(response.status()).toBeLessThan(400);
}

async function dragBoardItemToStatus(
  page: Page,
  itemKey: string,
  statusName: string,
) {
  const handle = page.getByRole("button", { name: `Déplacer ${itemKey}`, exact: true });
  const destinationTrigger = page.getByRole("button", { name: `Créer dans ${statusName}` });
  const destinationColumn = destinationTrigger.locator(
    "xpath=ancestor::div[contains(@class,'flex-none')][1]",
  );
  const origin = await handle.boundingBox();
  const destination = await destinationColumn.boundingBox();
  if (!origin || !destination) throw new Error("Géométrie du Board introuvable.");
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST"
    && new URL(response.url()).pathname === "/b/CASS",
  );
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2 + 10, origin.y + origin.height / 2, {
    steps: 3,
  });
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height - 28,
    { steps: 18 },
  );
  await page.mouse.up();
  const response = await responsePromise;
  await response.finished();
  expect(response.status()).toBeLessThan(400);
  await expect(destinationColumn.getByText(itemKey, { exact: true })).toBeVisible();
}

async function auditedGoto(page: Page, capture: Capture, actor: string, url: string) {
  const startedAt = performance.now();
  const response = await page.goto(url);
  capture.console.push(
    `[navigation] ${actor} ${url} ${response?.status() ?? "no-response"} ${Math.round(performance.now() - startedAt)}ms`,
  );
  return response;
}

/**
 * Asserts that `fragments` happened in this chronological order. The journal
 * renders newest first (`occurredAt DESC, sequence DESC`), so its rows are
 * reversed before matching.
 */
async function expectJournalOrder(
  journal: Locator,
  fragments: string[],
) {
  const rows = (await journal.getByRole("listitem").allTextContents()).reverse();
  let previousIndex = -1;
  for (const fragment of fragments) {
    const index = rows.findIndex((row, candidateIndex) =>
      candidateIndex > previousIndex && row.includes(fragment));
    expect(index, `Événement absent ou désordonné : ${fragment}`).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

const DAY_MS = 86_400_000;
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

/** Burndown fixture estimates; every oracle value below is derived from them. */
const BURNDOWN = {
  sprintName: "Sprint Burndown",
  todo: 5,
  todoReestimated: 8,
  doneAtStart: 3,
  stable: 2,
  addedIncomplete: 3,
  addedDone: 4,
  addedDoneReestimated: 6,
  bulkFirst: 1,
  bulkSecond: 2,
  singleEdit: 2,
  plannedName: "Sprint Burndown planifié",
  plannedEstimates: [13, 8],
  labsName: "Sprint LABS burndown",
} as const;

type BurndownCause =
  | "Démarrage du sprint"
  | "Ajout"
  | "Retrait"
  | "Réestimation"
  | "Achèvement"
  | "Réouverture"
  | "Clôture du sprint";

type BurndownStep = {
  itemKey: string | null;
  cause: BurndownCause;
  deltaPoints: number;
  deltaUnestimated?: number;
};

type ExpectedBurndownRow = BurndownStep & {
  remainingPoints: number;
  unestimatedCount: number;
};

/** Cumulates fixture deltas from the frozen baseline, in ledger order. */
function expectedBurndownRows(
  baseline: { remainingPoints: number; unestimatedCount: number },
  steps: readonly BurndownStep[],
): ExpectedBurndownRow[] {
  let remainingPoints = baseline.remainingPoints;
  let unestimatedCount = baseline.unestimatedCount;
  return steps.map((step) => {
    remainingPoints += step.deltaPoints;
    unestimatedCount += step.deltaUnestimated ?? 0;
    return { ...step, remainingPoints, unestimatedCount };
  });
}

/** Parses a French rendered quantity ("+3 pts", "−8 pts", "2,5 pts") to a number. */
function parseRenderedNumber(text: string | null): number {
  const normalized = (text ?? "")
    .replace(/pts?/u, "")
    .replace(/−/gu, "-")
    .replace(/[\s  ]/gu, "")
    .replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`Valeur numérique illisible : ${text}`);
  return value;
}

async function beginAt(
  context: Awaited<ReturnType<typeof fixtureContext>>,
  sprintId: string,
  name: string,
  window: { startAt: Date; endAt: Date },
) {
  await startSprint({
    id: sprintId,
    backlogId: context.backlog.id,
    name,
    goal: `Objectif ${name}`,
    startAt: window.startAt.toISOString(),
    endAt: window.endAt.toISOString(),
    capacityPoints: 21,
  }, context.actorId, `reports-e2e-start-${name}`);
}

/**
 * Independent oracle for the commitment comparison (JIR-37, Jira "Sprint
 * commitment" insight): the five most recent completed sprints ordered before
 * `sprintId` (completion time desc, then id desc), the sprint itself excluded;
 * without a completed `sprintId`, the five latest. Inside that window a
 * snapshot with non-zero committed or completed points is included. Reads
 * immutable snapshot rows, never the rendered page.
 */
async function expectedPreviousSprintsVelocity(backlogId: string, sprintId: string | null = null) {
  const completed = await db.select({
    sprintId: sprints.id,
    committedPoints: sprintReportSnapshots.committedPoints,
    completedPoints: sprintReportSnapshots.completedPoints,
  }).from(sprints).leftJoin(
    sprintReportSnapshots,
    and(
      eq(sprintReportSnapshots.backlogId, sprints.backlogId),
      eq(sprintReportSnapshots.sprintId, sprints.id),
    ),
  ).where(and(eq(sprints.backlogId, backlogId), eq(sprints.state, "completed")))
    .orderBy(desc(sprints.completedAt), desc(sprints.id));
  const position = sprintId === null ? -1 : completed.findIndex((row) => row.sprintId === sprintId);
  const window = completed.slice(position + 1, position + 6);
  const included = window.filter((row) =>
    row.committedPoints !== null
    && row.completedPoints !== null
    && (row.committedPoints !== 0 || row.completedPoints !== 0));
  return {
    population: included.length,
    average: included.length === 0
      ? null
      : included.reduce((sum, row) => sum + row.completedPoints!, 0) / included.length,
  };
}

async function expectComparison(
  text: string | null,
  commitmentPoints: number,
  velocity: Awaited<ReturnType<typeof expectedPreviousSprintsVelocity>>,
) {
  if (velocity.average === null) {
    expect(text).toContain("Pas encore de vélocité comparable");
    return;
  }
  const match = /Engagement (.+?) pts? · moyenne des sprints précédents (.+?) pts? · écart (.+?) pts?/u.exec(text ?? "");
  expect(match, `Comparaison de vélocité absente : ${text}`).not.toBeNull();
  expect(parseRenderedNumber(match![1]!)).toBe(commitmentPoints);
  expect(parseRenderedNumber(match![2]!)).toBeCloseTo(velocity.average, 2);
  expect(parseRenderedNumber(match![3]!)).toBeCloseTo(commitmentPoints - velocity.average, 2);
}

async function expectBurndownSummary(
  page: Page,
  expected: {
    kind: "active" | "completed";
    initialRemainingPoints: number;
    remainingPoints: number;
    completedPoints: number;
    unestimatedCount: number;
  },
) {
  const region = page.getByRole("region", { name: "Mesures du burndown" });
  const value = async (label: string) => parseRenderedNumber(
    await region.getByText(label, { exact: true }).locator("xpath=following-sibling::dd").textContent(),
  );
  await expect(region).toBeVisible();
  expect(await value("Restant initial")).toBe(expected.initialRemainingPoints);
  expect(await value(expected.kind === "completed" ? "Restant à la clôture" : "Restant actuel"))
    .toBe(expected.remainingPoints);
  expect(await value("Terminés")).toBe(expected.completedPoints);
  expect(await value("Non estimés")).toBe(expected.unestimatedCount);
}

/** The table renders the newest point first; `expected` is chronological. */
async function expectBurndownTable(page: Page, expected: readonly ExpectedBurndownRow[]) {
  const table = page.getByRole("table", { name: "Valeurs exactes du burndown" });
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(expected.length);
  const rendered = await rows.evaluateAll((elements) =>
    elements.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? "")));
  const chronological = rendered.reverse();
  expected.forEach((row, index) => {
    const cells = chronological[index]!;
    const label = `ligne ${index + 1} (${row.cause} ${row.itemKey ?? "sprint"})`;
    if (row.itemKey === null) expect(cells[1], label).toBe("—");
    else expect(cells[1], label).toMatch(new RegExp(`^${row.itemKey}( —|$)`, "u"));
    expect(cells[2], label).toBe(row.cause);
    expect(parseRenderedNumber(cells[3]!), label).toBe(row.deltaPoints);
    expect(parseRenderedNumber(cells[4]!), label).toBe(row.remainingPoints);
    expect(Number(cells[5]), label).toBe(row.unestimatedCount);
  });
}

async function expectChartMatches(
  page: Page,
  expected: { firstRemaining: number; lastRemaining: number; markerCount: number; guideline: boolean },
) {
  const chart = page.getByRole("list", { name: "Points et lignes du burndown" });
  const items = chart.getByRole("listitem");
  const words = (value: number) =>
    `${value} ${Math.abs(value) >= 2 ? "points restants" : "point restant"}`;
  await expect(items.filter({ has: page.locator("circle") }))
    .toHaveCount(expected.markerCount);
  const actual = await items.first().getAttribute("aria-label");
  expect(actual).toMatch(new RegExp(
    `^Travail restant réel, ligne continue : de ${words(expected.firstRemaining)} le .+ à ${words(expected.lastRemaining)} le `,
    "u",
  ));
  const guideline = items.filter({ has: page.locator("path[stroke-dasharray]") });
  await expect(guideline).toHaveCount(expected.guideline ? 1 : 0);
  if (expected.guideline) {
    expect(await guideline.getAttribute("aria-label")).toMatch(new RegExp(
      `^Trajectoire idéale, ligne pointillée : de ${words(expected.firstRemaining)} le .+ à 0 point restant le `,
      "u",
    ));
  }
}

/**
 * Measures horizontal overflow at 390 × 844 on the document and on <main>,
 * which is the shell's `overflow-auto` scroller (document width cannot see
 * overflow inside it). Both must fit; on burndown views the chart scroller
 * owns the horizontal scrolling.
 */
async function measureMobileOverflow(page: Page, view: "burndown" | "backlog") {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.reload();
  // Measure only once streamed Suspense segments have been swapped in.
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  const measured = await page.evaluate(() => {
    const main = document.querySelector("main");
    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main: main ? main.scrollWidth - main.clientWidth : Number.NaN,
    };
  });
  expect(measured.document).toBeLessThanOrEqual(1);
  expect(Number.isNaN(measured.main), "<main> introuvable").toBe(false);
  expect(measured.main, "Débordement horizontal dans <main>").toBeLessThanOrEqual(1);
  let chart: number | null = null;
  if (view === "burndown") {
    const chartScroll = page.getByTestId("burndown-chart-scroll").filter({ visible: true });
    chart = await chartScroll.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(chart, "Le graphique porte le défilement horizontal").toBeGreaterThan(0);
  }
  return { ...measured, chart };
}

/** The app shell scrolls inside <main>, so full-page captures stop at the fold. */
function burndownFigure(page: Page) {
  return page.getByRole("figure", { name: "Travail restant et trajectoire idéale" });
}

function sprintHeader(page: Page, sprintName: string) {
  return page.locator("header").filter({
    has: page.getByRole("heading", { name: sprintName, exact: true }),
  });
}

type BurndownFixtures = {
  sprintId: string;
  window: { startAt: Date; endAt: Date };
  keys: Record<
    "todo" | "doneAtStart" | "unestimated" | "stable" | "addedIncomplete" | "addedDone",
    string
  >;
  ids: Record<"unestimated" | "stable" | "addedIncomplete", string>;
  baseline: { remainingPoints: number; unestimatedCount: number; completedPoints: number };
  commitmentPoints: number;
  steps: BurndownStep[];
  plannedSprintId?: string;
};
let burndown: BurndownFixtures;

/** S08–S12 build on the S07 sprint; fail explicitly when it is absent. */
function requireBurndownFixture() {
  expect(burndown, "Le fixture burndown de S07 est absent (S07 filtré ou en échec).").toBeDefined();
}

async function seedReportFixtures() {
  const context = await fixtureContext();
  const labs = await fixtureContext("LABS");
  const labsForeign = await namedSprint(labs, "Sprint LABS étranger");

  const first = await namedSprint(context, "Sprint Rapport 1");
  const completedFive = await task(context, "Rapport 1 — terminé figé", { points: 5, sprintId: first.id });
  await task(context, "Rapport 1 — engagement incomplet", { points: 3, sprintId: first.id });
  await begin(context, first.id, "Sprint Rapport 1");
  const added = await task(context, "Rapport 1 — ajouté après démarrage", { points: 3 });
  await moveItemToSprint({
    backlogId: context.backlog.id,
    itemId: added.id,
    sprintId: first.id,
  }, context.actorId, "reports-e2e-r1-add");
  await updateItem({ id: completedFive.id, estimatePoints: 8 }, context.actorId, "reports-e2e-r1-estimate-eight");
  await updateItem({ id: completedFive.id, estimatePoints: 5 }, context.actorId, "reports-e2e-r1-estimate-five");
  await updateItem({ id: completedFive.id, statusId: context.doneId }, context.actorId, "reports-e2e-r1-done");
  await updateItem({ id: completedFive.id, statusId: context.todoId }, context.actorId, "reports-e2e-r1-reopen");
  await updateItem({ id: completedFive.id, statusId: context.doneId }, context.actorId, "reports-e2e-r1-redone");
  await completeSprint({
    id: first.id,
    backlogId: context.backlog.id,
    destination: { type: "backlog" },
  }, context.actorId, "reports-e2e-r1-complete");
  const destination = await namedSprint(context, "Sprint Destination");
  await updateItem({
    id: completedFive.id,
    title: "Rapport 1 — titre mutable après clôture",
    estimatePoints: 21,
    statusId: context.todoId,
  }, context.actorId, "reports-e2e-r1-post-close-update");
  await moveItemToSprint({
    backlogId: context.backlog.id,
    itemId: completedFive.id,
    sprintId: destination.id,
  }, context.actorId, "reports-e2e-r1-post-close-move");
  await softDeleteItem(
    { id: completedFive.id },
    context.actorId,
    "reports-e2e-r1-post-close-soft-delete",
  );
  await db.delete(items).where(eq(items.id, completedFive.id));

  const second = await namedSprint(context, "Sprint Rapport 2");
  await task(context, "Rapport 2 — reste huit", { points: 8, sprintId: second.id });
  const removedFive = await task(context, "Rapport 2 — retiré cinq", { points: 5, sprintId: second.id });
  await begin(context, second.id, "Sprint Rapport 2");
  await moveItemToSprint({
    backlogId: context.backlog.id,
    itemId: removedFive.id,
    sprintId: null,
  }, context.actorId, "reports-e2e-r2-remove");
  const unestimated = await task(context, "Rapport 2 — estimation annulée", { points: null, sprintId: second.id });
  await updateItem({ id: unestimated.id, estimatePoints: 3 }, context.actorId, "reports-e2e-r2-three");
  await updateItem({ id: unestimated.id, estimatePoints: null }, context.actorId, "reports-e2e-r2-null");
  await completeSprint({
    id: second.id,
    backlogId: context.backlog.id,
    destination: { type: "existing_sprint", sprintId: destination.id },
  }, context.actorId, "reports-e2e-r2-complete");

  const third = await namedSprint(context, "Sprint Rapport 3");
  await task(context, "Rapport 3 — non estimé", { points: null, sprintId: third.id });
  await begin(context, third.id, "Sprint Rapport 3");
  await completeSprint({
    id: third.id,
    backlogId: context.backlog.id,
    destination: { type: "backlog" },
  }, context.actorId, "reports-e2e-r3-complete");

  const legacy = await namedSprint(context, "Sprint historique ancien");
  const legacyStartedAt = new Date("2026-07-01T09:00:00.000Z");
  await db.update(sprints).set({
    state: "completed",
    startedAt: legacyStartedAt,
    completedAt: new Date("2026-07-15T18:00:00.000Z"),
  }).where(eq(sprints.id, legacy.id));

  const active = await namedSprint(context, "Sprint actif vide");
  await begin(context, active.id, "Sprint actif vide");

  const snapshots = await db.select({
    sprintId: sprintReportSnapshots.sprintId,
    committedPoints: sprintReportSnapshots.committedPoints,
    completedPoints: sprintReportSnapshots.completedPoints,
  }).from(sprintReportSnapshots);
  expect(snapshots).toEqual(expect.arrayContaining([
    { sprintId: first.id, committedPoints: 8, completedPoints: 5 },
    { sprintId: second.id, committedPoints: 13, completedPoints: 0 },
    { sprintId: third.id, committedPoints: 0, completedPoints: 0 },
  ]));
  return {
    context,
    first,
    second,
    third,
    destination,
    legacy,
    active,
    labsForeign,
    completedFive,
    added,
  };
}

// Scenarios share one evolving fixture: a failure must stop the rest instead
// of reseeding in a new worker.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  fixtures = await seedReportFixtures();
});

audited(1, "affiche les rapports figés et la vélocité explicable", async ({ page, capture }) => {
  await auditedGoto(
    page,
    capture,
    "admin",
    `/b/CASS/reports?report=sprint&sprint=${fixtures.first.id}`,
  );
  await expect(page.getByRole("main").getByText("Historique figé", { exact: true })).toBeVisible();
  const measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Engagement", { exact: true }).locator("..")).toContainText("8 pts");
  await expect(measures.getByText("Terminés", { exact: true }).locator("..")).toContainText("5 pts");
  await expect(measures.getByText("Évolution du périmètre", { exact: true }).locator(".."))
    .toContainText("Ajoutés 3 pts");
  await expect(page.getByRole("heading", { name: /Reportés/ })).toBeVisible();
  const completedSection = page.getByRole("region", { name: "Terminés (1)" });
  // The Backlog's table (JIR-97): a card whose header counts the section.
  await expect(completedSection.locator("header")).toContainText(/Terminés\s*1 item/);
  const frozenItem = completedSection
    .getByText("Rapport 1 — terminé figé", { exact: false })
    .locator("xpath=ancestor::li");
  await expect(frozenItem).toContainText("5 pts");
  await expect(frozenItem).toContainText("Terminé");
  await expect(frozenItem.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /Reportés/ })
    .getByText("Rapport 1 — terminé figé", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("region", { name: /Retirés/ })
    .getByText("Rapport 1 — terminé figé", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Rapport 1 — titre mutable après clôture", { exact: false }))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: /Rapport 1 — terminé figé/ })).toHaveCount(0);
  const journal = page.getByRole("region", { name: "Journal du sprint" });
  await expect(journal).toContainText(
    `a ajouté ${fixtures.added.key} au sprint avec 3 pts`,
  );
  await expect(journal).toContainText(
    `a modifié ${fixtures.completedFive.key} : 5 pts → 8 pts`,
  );
  await expect(journal).toContainText("a rouvert");
  const frozenReport = await getSprintReport(fixtures.context.backlog.id, fixtures.first.id, {
    itemPage: 1,
    eventPage: 1,
    pageSize: 50,
  });
  if (!frozenReport || frozenReport.kind === "legacy_unavailable") {
    throw new Error("Rapport figé détaillé introuvable pour la mesure de pagination.");
  }
  capture.console.push(
    `[page-size] items=${frozenReport.items.pageSize} journal=${frozenReport.events.pageSize}`,
  );
  const sprintSelector = page.getByLabel("Sprint", { exact: true });
  await sprintSelector.focus();
  await expect(sprintSelector).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Afficher" })).toBeFocused();
  await writeAuditScreenshot("audit/screenshots/reports-completed-desktop.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));

  await auditedGoto(page, capture, "admin", "/b/CASS/reports?report=velocity&limit=7");
  await expect(page.getByText("Moyenne des points terminés : 2,5 sur 2 sprints inclus"))
    .toBeVisible();
  await expect(page.getByRole("row", { name: /Sprint Rapport 1 8 5 .*Incluse/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Sprint Rapport 2 13 0 .*Incluse/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Sprint Rapport 3 0 0 .*Exclue Aucune donnée de points/ }))
    .toBeVisible();
  await expect(page.getByRole("group", { name: "Sprint Rapport 1 — engagement 8 points, terminé 5 points" }))
    .toBeVisible();
  await expect(page.getByRole("group", { name: "Sprint Rapport 2 — engagement 13 points, terminé 0 point" }))
    .toBeVisible();
  await expect(page.getByRole("group", { name: "Sprint Rapport 3 — engagement 0 point, terminé 0 point" }))
    .toBeVisible();
  await page.getByRole("link", { name: "12 sprints" }).click();
  await expect(page).toHaveURL(/limit=12/);
  const velocityTable = page.getByRole("table", { name: "Valeurs exactes de vélocité" });
  const firstDetailLink = velocityTable.getByRole("link").first();
  await page.getByRole("link", { name: "12 sprints" }).focus();
  await page.keyboard.press("Tab");
  await expect(firstDetailLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/report=sprint&sprint=/);
  await page.goBack();
  await expect(velocityTable).toBeVisible();
  await writeAuditScreenshot("audit/screenshots/reports-velocity-desktop.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));
});

audited(2, "distingue les états vides, planifiés, actifs non estimés et legacy", async ({ page }) => {
  await db.delete(sprints).where(eq(sprints.id, fixtures.labsForeign.id));
  await page.goto("/b/LABS/reports");
  await expect(page.getByText("Aucun sprint actif ou terminé.")).toBeVisible();
  const labs = await fixtureContext("LABS");
  const labsPlanned = await namedSprint(labs, "Sprint LABS planifié");
  fixtures.labsForeign = labsPlanned;
  await page.reload();
  await expect(page.getByText(/sprint est planifié, mais aucun n’a encore démarré/)).toBeVisible();
  await page.goto("/b/LABS/reports?report=velocity");
  await expect(page.getByText("Pas encore de vélocité")).toBeVisible();

  const active = fixtures.active;
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${active.id}`);
  await expect(page.getByText("Données en cours", { exact: true })).toBeVisible();
  await expect(page.getByText("Ce sprint actif ne contient encore aucun élément.")).toBeVisible();
  const activeItem = await task(fixtures.context, "Sprint actif — tout non estimé", {
    points: null,
    sprintId: active.id,
  });
  await page.reload();
  await expect(page.getByText("Tous les éléments actuels de ce sprint sont non estimés.")).toBeVisible();

  // JIR-55 / JIR-74: the sidebar project views stay available on Reports, Rapports current.
  const reportsTabs = page.getByRole("navigation", { name: "Vues du projet" });
  await expect(reportsTabs.getByRole("link", { name: "Rapports" }))
    .toHaveAttribute("aria-current", "page");
  await reportsTabs.getByRole("link", { name: "Backlog" }).click();
  await expect(page).toHaveURL(/\/b\/CASS\?view=backlog$/);
  const activeRow = page.getByRole("row", { name: new RegExp(`^${activeItem.key} —`) });
  await activeRow.getByRole("button", { name: "Estimation : Non estimé" }).click();
  await page.getByRole("spinbutton", { name: "Points" }).fill("5");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Enregistrer l’estimation" }).click());
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${active.id}`);
  await expect(page.getByRole("region", { name: "Mesures du sprint" })
    .getByText("Périmètre actuel", { exact: true }).locator("..")).toContainText("5 pts");
  await expect(page.getByRole("region", { name: "Journal du sprint" }))
    .toContainText("Non estimé → 5 pts");
  await expect(page.getByText("Tous les éléments actuels de ce sprint sont non estimés."))
    .toHaveCount(0);
  const mixedUnestimated = await task(fixtures.context, "Sprint actif — mixte non estimé", {
    points: null,
    sprintId: active.id,
  });
  await page.goto("/b/CASS/reports");
  await expect(page.getByLabel("Sprint", { exact: true })).toHaveValue(active.id);
  await expect(page.getByRole("main").getByText("Données en cours", { exact: true })).toBeVisible();
  const mixedMeasures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(mixedMeasures.getByText("Périmètre actuel", { exact: true }).locator(".."))
    .toContainText("2 éléments · 5 pts · 1 non estimé");
  const mixedSection = page.getByRole("region", { name: "Non terminés (2)" });
  await expect(mixedSection).toContainText(keyPattern(activeItem.key));
  await expect(mixedSection).toContainText(keyPattern(mixedUnestimated.key));
  await writeAuditScreenshot("audit/screenshots/reports-active-desktop.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));

  await page.goto(`/b/CASS/reports?report=sprint&sprint=${fixtures.legacy.id}`);
  await expect(page.getByText("Historique détaillé indisponible", { exact: true })).toBeVisible();
  await expect(page.getByText("Engagement")).toHaveCount(0);
});

audited(3, "conserve les lectures lecteur, second contexte et dissimule les ressources", async ({
  page,
  observedPage,
}) => {
  const secondAdmin = await observedPage("admin-second", AUTH.admin);
  const reader = await observedPage("reader", AUTH.reader);
  for (const current of [page, secondAdmin, reader]) {
    await current.goto(`/b/CASS/reports?report=sprint&sprint=${fixtures.second.id}`);
    await expect(current.getByText("Historique figé", { exact: true })).toBeVisible();
    await expect(current.getByRole("region", { name: "Mesures du sprint" })
      .getByText("Engagement", { exact: true }).locator("..")).toContainText("13 pts");
    await expect(current.getByText("Sprint Destination", { exact: false }).first()).toBeVisible();
    await current.reload();
    await current.goto("/b/CASS/reports?report=velocity&limit=7");
    await expect(current.getByText("Moyenne des points terminés : 2,5 sur 2 sprints inclus"))
      .toBeVisible();
    await expect(current.getByRole("row", { name: /Sprint Rapport 2 13 0 .*Incluse/ }))
      .toBeVisible();
    await current.reload();
  }
  await expect(reader.getByRole("button", { name: /Terminer le sprint|Démarrer le sprint|Créer/ })).toHaveCount(0);

  const malformed = await page.goto("/b/CASS/reports?sprint=not-a-uuid");
  expect(malformed?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.locator("body")).toContainText(/introuvable|could not be found/i);
  const foreign = await page.goto(`/b/CASS/reports?sprint=${fixtures.labsForeign.id}`);
  expect(foreign?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.locator("body")).toContainText(/introuvable|could not be found/i);
  await expect(page.locator("body")).not.toContainText(fixtures.labsForeign.name);
});

audited(4, "reste lisible et sans débordement à 390 par 844", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/b/CASS/reports?report=velocity&limit=12");
  await expect(page.getByRole("heading", { name: "Vélocité" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("table", { name: "Valeurs exactes de vélocité" })).toBeVisible();
  await writeAuditScreenshot("audit/screenshots/reports-velocity-mobile.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));

  await page.goto(`/b/CASS/reports?report=sprint&sprint=${fixtures.first.id}`);
  await expect(page.getByRole("main").getByText("Historique figé", { exact: true })).toBeVisible();
  const sprintOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(sprintOverflow).toBeLessThanOrEqual(1);
  await writeAuditScreenshot("audit/screenshots/reports-completed-mobile.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));

  await page.goto("/b/CASS/reports");
  await expect(page.getByLabel("Sprint", { exact: true })).toHaveValue(fixtures.active.id);
  await expect(page.getByRole("main").getByText("Données en cours", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Mesures du sprint" })
    .getByText("Périmètre actuel", { exact: true }).locator(".."))
    .toContainText("2 éléments · 5 pts · 1 non estimé");
  const activeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(activeOverflow).toBeLessThanOrEqual(1);
  await writeAuditScreenshot("audit/screenshots/reports-active-mobile.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));
});

audited(5, "masque une panne de lecture et récupère après retry", async ({
  page,
  capture,
}) => {
  capture.expectedFault = {
    start: capture.faults.length,
    marker: "[expected-fault] report read failed; generic ErrorBoundaryHandler rendered and recovered",
  };
  let reportTableRenamed = false;
  try {
    await db.execute(sql.raw(
      'ALTER TABLE "sprint_report_snapshots" RENAME TO "sprint_report_snapshots_fault"',
    ));
    reportTableRenamed = true;
    await page.goto(`/b/CASS/reports?report=sprint&sprint=${fixtures.first.id}`);
    await expect(page.getByRole("heading", { name: "Impossible de charger les rapports" }))
      .toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(
      /postgres(?:ql)?:|authorization|bearer|select\s|sprint_report_snapshots|jiroo-e2e-secret/i,
    );
  } finally {
    if (reportTableRenamed) {
      await db.execute(sql.raw(
        'ALTER TABLE "sprint_report_snapshots_fault" RENAME TO "sprint_report_snapshots"',
      ));
    }
  }

  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("main").getByText("Historique figé", { exact: true }))
    .toBeVisible();
  // Faults reported after the recovered render are no longer expected.
  capture.expectedFault.end = capture.faults.length;
});

audited(6, "relie bulk, Board et clôture UI au rapport", async ({ page, capture }) => {
  await completeSprint({
    id: fixtures.active.id,
    backlogId: fixtures.context.backlog.id,
    destination: { type: "backlog" },
  }, fixtures.context.actorId, "reports-e2e-ui-prerequisite-close");
  const uiActive = await namedSprint(fixtures.context, "Sprint UI vers Backlog");
  await begin(fixtures.context, uiActive.id, "Sprint UI vers Backlog");
  const bulkTwo = await task(fixtures.context, "Rapport actif — bulk deux", { points: 2 });
  const bulkOne = await task(fixtures.context, "Rapport actif — bulk un", { points: 1 });
  const boardItem = await task(fixtures.context, "Rapport actif — Board", { points: 5 });
  const bulkItems = [bulkTwo, bulkOne, boardItem];

  await auditedGoto(page, capture, "admin", "/b/CASS?view=backlog");
  for (const item of bulkItems) {
    await page.getByRole("checkbox", { name: `Sélectionner ${item.key}`, exact: true }).click();
  }
  await expect(page.getByText("3 items sélectionnés")).toBeVisible();
  await businessPost(page, async () => {
    await page.getByRole("button", { name: "Modifier le sprint" }).click();
    await page.getByRole("menuitem", { name: "Sprint UI vers Backlog — Actif" }).click();
  });

  await auditedGoto(
    page,
    capture,
    "admin",
    `/b/CASS/reports?report=sprint&sprint=${uiActive.id}`,
  );
  let journal = page.getByRole("region", { name: "Journal du sprint" });
  await expect(journal).toContainText(`a ajouté ${bulkTwo.key} au sprint avec 2 pts`);
  await expect(journal).toContainText(`a ajouté ${bulkOne.key} au sprint avec 1 pt`);
  await expect(journal).toContainText(`a ajouté ${boardItem.key} au sprint avec 5 pts`);
  let measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Périmètre actuel", { exact: true }).locator(".."))
    .toContainText("3 éléments · 8 pts · 0 non estimé");
  const addedSection = page.getByRole("region", { name: "Non terminés (3)" });
  for (const item of bulkItems) await expect(addedSection).toContainText(keyPattern(item.key));

  await page.goto("/b/CASS?view=backlog");
  for (const item of bulkItems) {
    await page.getByRole("checkbox", { name: `Sélectionner ${item.key}`, exact: true }).click();
  }
  await page.getByRole("spinbutton", { name: "Estimation groupée" }).fill("4");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Appliquer l’estimation" }).click());
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${uiActive.id}`);
  journal = page.getByRole("region", { name: "Journal du sprint" });
  await expect(journal).toContainText(`a modifié ${bulkTwo.key} : 2 pts → 4 pts`);
  await expect(journal).toContainText(`a modifié ${bulkOne.key} : 1 pt → 4 pts`);
  await expect(journal).toContainText(`a modifié ${boardItem.key} : 5 pts → 4 pts`);
  measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Périmètre actuel", { exact: true }).locator(".."))
    .toContainText("3 éléments · 12 pts · 0 non estimé");

  await page.goto("/b/CASS?view=backlog");
  for (const item of [bulkTwo, bulkOne]) {
    await page.getByRole("checkbox", { name: `Sélectionner ${item.key}`, exact: true }).click();
  }
  await expect(page.getByText("2 items sélectionnés")).toBeVisible();
  await businessPost(page, async () => {
    await page.getByRole("button", { name: "Modifier le sprint" }).click();
    await page.getByRole("menuitem", { name: "Backlog", exact: true }).click();
  });
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${uiActive.id}`);
  journal = page.getByRole("region", { name: "Journal du sprint" });
  await expect(journal).toContainText(`a retiré ${bulkTwo.key} vers le Backlog avec 4 pts`);
  await expect(journal).toContainText(`a retiré ${bulkOne.key} vers le Backlog avec 4 pts`);
  measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Périmètre actuel", { exact: true }).locator(".."))
    .toContainText("1 élément · 4 pts · 0 non estimé");
  const remainingSection = page.getByRole("region", { name: "Non terminés (1)" });
  await expect(remainingSection).toContainText(keyPattern(boardItem.key));
  await expect(remainingSection).not.toContainText(keyPattern(bulkTwo.key));
  await expect(remainingSection).not.toContainText(keyPattern(bulkOne.key));
  const removedSection = page.getByRole("region", { name: "Retirés (2)" });
  await expect(removedSection).toContainText(keyPattern(bulkTwo.key));
  await expect(removedSection).toContainText(keyPattern(bulkOne.key));

  await page.goto("/b/CASS?view=board");
  await dragBoardItemToStatus(page, boardItem.key, fixtures.context.doneName);
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${uiActive.id}`);
  await expect(page.getByRole("region", { name: "Journal du sprint" }))
    .toContainText(`a terminé ${boardItem.key}`);
  measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Terminés", { exact: true }).locator(".."))
    .toContainText("1 élément · 4 pts");
  await expect(page.getByRole("region", { name: "Terminés (1)" })).toContainText(keyPattern(boardItem.key));

  await page.goto("/b/CASS?view=board");
  await dragBoardItemToStatus(page, boardItem.key, fixtures.context.todoName);
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${uiActive.id}`);
  journal = page.getByRole("region", { name: "Journal du sprint" });
  await expect(journal).toContainText(`a rouvert ${boardItem.key}`);
  measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Terminés", { exact: true }).locator(".."))
    .toContainText("0 élément · 0 pt");
  await expect(page.getByRole("region", { name: "Non terminés (1)" })).toContainText(keyPattern(boardItem.key));
  await expectJournalOrder(journal, [
    `a ajouté ${bulkTwo.key}`,
    `a modifié ${bulkTwo.key}`,
    `a retiré ${bulkTwo.key}`,
  ]);
  await expectJournalOrder(journal, [
    `a ajouté ${bulkOne.key}`,
    `a modifié ${bulkOne.key}`,
    `a retiré ${bulkOne.key}`,
  ]);
  await expectJournalOrder(journal, [
    `a ajouté ${boardItem.key}`,
    `a modifié ${boardItem.key}`,
    `a terminé ${boardItem.key}`,
    `a rouvert ${boardItem.key}`,
  ]);

  await page.goto("/b/CASS?view=backlog");
  await page.getByRole("button", { name: "Terminer le sprint Sprint UI vers Backlog" }).click();
  await chooseOption(page, "Destination des tâches incomplètes", "Backlog");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Terminer le sprint", exact: true }).click());
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${uiActive.id}`);
  await expect(page.getByRole("main").getByText("Historique figé", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Journal du sprint" }))
    .toContainText("a clôturé le sprint");

  await namedSprint(fixtures.context, "Sprint UI Destination");
  const uiToPlanned = await namedSprint(fixtures.context, "Sprint UI vers planifié");
  const carriedItem = await task(fixtures.context, "Rapport UI — reporté planifié", {
    points: 6,
    sprintId: uiToPlanned.id,
  });
  await begin(fixtures.context, uiToPlanned.id, "Sprint UI vers planifié");
  await page.goto("/b/CASS?view=backlog");
  await page.getByRole("button", { name: "Terminer le sprint Sprint UI vers planifié" }).click();
  await chooseOption(page, "Destination des tâches incomplètes", "Sprint UI Destination");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Terminer le sprint", exact: true }).click());
  await expect(page.getByRole("heading", { name: "Sprint UI Destination" })).toBeVisible();
  await expect(page.getByText(carriedItem.key, { exact: true })).toBeVisible();
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${uiToPlanned.id}`);
  await expect(page.getByRole("main").getByText("Historique figé", { exact: true })).toBeVisible();
  measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Engagement", { exact: true }).locator(".."))
    .toContainText("1 élément · 6 pts · 0 non estimé");
  const carriedSection = page.getByRole("region", { name: "Reportés (1)" });
  await expect(carriedSection).toContainText(keyPattern(carriedItem.key));
  await expect(carriedSection).toContainText("Reporté vers Sprint UI Destination");
  await expect(page.getByRole("region", { name: "Journal du sprint" }))
    .toContainText("a clôturé le sprint");
});

audited(7, "rejoue le burndown actif depuis le baseline figé et le ledger", async ({ page, capture }) => {
  const context = fixtures.context;
  const now = Date.now();
  const window = {
    startAt: new Date(now - 2 * DAY_MS),
    endAt: new Date(now + 12 * DAY_MS),
  };
  const sprint = await namedSprint(context, BURNDOWN.sprintName);
  // 1. Initial work: todo, done before start, unestimated, and a stable item.
  const todo = await task(context, "Burndown — à faire", { points: BURNDOWN.todo, sprintId: sprint.id });
  const doneAtStart = await task(context, "Burndown — terminé au démarrage", {
    points: BURNDOWN.doneAtStart,
    sprintId: sprint.id,
  });
  await updateItem({ id: doneAtStart.id, statusId: context.doneId }, context.actorId, "reports-e2e-bd-done-at-start");
  const unestimated = await task(context, "Burndown — non estimé", { points: null, sprintId: sprint.id });
  const stable = await task(context, "Burndown — stable retiré puis réajouté", {
    points: BURNDOWN.stable,
    sprintId: sprint.id,
  });
  await beginAt(context, sprint.id, BURNDOWN.sprintName, window);

  // 2. Incomplete and already-done additions while active.
  const addedIncomplete = await task(context, "Burndown — ajouté incomplet", { points: BURNDOWN.addedIncomplete });
  await moveItemToSprint({ backlogId: context.backlog.id, itemId: addedIncomplete.id, sprintId: sprint.id },
    context.actorId, "reports-e2e-bd-add-incomplete");
  const addedDone = await task(context, "Burndown — ajouté déjà terminé", { points: BURNDOWN.addedDone });
  await updateItem({ id: addedDone.id, statusId: context.doneId }, context.actorId, "reports-e2e-bd-added-done-status");
  await moveItemToSprint({ backlogId: context.backlog.id, itemId: addedDone.id, sprintId: sprint.id },
    context.actorId, "reports-e2e-bd-add-done");
  // 3. Re-estimation of incomplete and done work.
  await updateItem({ id: todo.id, estimatePoints: BURNDOWN.todoReestimated }, context.actorId, "reports-e2e-bd-reestimate-todo");
  await updateItem({ id: addedDone.id, estimatePoints: BURNDOWN.addedDoneReestimated }, context.actorId,
    "reports-e2e-bd-reestimate-done");
  // 4. Complete, reopen, complete again.
  await updateItem({ id: todo.id, statusId: context.doneId }, context.actorId, "reports-e2e-bd-complete");
  await updateItem({ id: todo.id, statusId: context.todoId }, context.actorId, "reports-e2e-bd-reopen");
  await updateItem({ id: todo.id, statusId: context.doneId }, context.actorId, "reports-e2e-bd-recomplete");
  // 5. Remove and re-add one stable item.
  await moveItemToSprint({ backlogId: context.backlog.id, itemId: stable.id, sprintId: null },
    context.actorId, "reports-e2e-bd-remove");
  await moveItemToSprint({ backlogId: context.backlog.id, itemId: stable.id, sprintId: sprint.id },
    context.actorId, "reports-e2e-bd-readd");

  const baseline = {
    remainingPoints: BURNDOWN.todo + BURNDOWN.stable,
    unestimatedCount: 1,
    completedPoints: BURNDOWN.doneAtStart,
  };
  const steps: BurndownStep[] = [
    { itemKey: null, cause: "Démarrage du sprint", deltaPoints: 0 },
    { itemKey: addedIncomplete.key, cause: "Ajout", deltaPoints: BURNDOWN.addedIncomplete },
    { itemKey: addedDone.key, cause: "Ajout", deltaPoints: 0 },
    { itemKey: todo.key, cause: "Réestimation", deltaPoints: BURNDOWN.todoReestimated - BURNDOWN.todo },
    { itemKey: addedDone.key, cause: "Réestimation", deltaPoints: 0 },
    { itemKey: todo.key, cause: "Achèvement", deltaPoints: -BURNDOWN.todoReestimated },
    { itemKey: todo.key, cause: "Réouverture", deltaPoints: BURNDOWN.todoReestimated },
    { itemKey: todo.key, cause: "Achèvement", deltaPoints: -BURNDOWN.todoReestimated },
    { itemKey: stable.key, cause: "Retrait", deltaPoints: -BURNDOWN.stable },
    { itemKey: stable.key, cause: "Ajout", deltaPoints: BURNDOWN.stable },
  ];
  burndown = {
    sprintId: sprint.id,
    window,
    keys: {
      todo: todo.key,
      doneAtStart: doneAtStart.key,
      unestimated: unestimated.key,
      stable: stable.key,
      addedIncomplete: addedIncomplete.key,
      addedDone: addedDone.key,
    },
    ids: { unestimated: unestimated.id, stable: stable.id, addedIncomplete: addedIncomplete.id },
    baseline,
    commitmentPoints: BURNDOWN.todo + BURNDOWN.doneAtStart + BURNDOWN.stable,
    steps,
  };
  const rows = expectedBurndownRows(baseline, steps);
  const expectedRemaining = rows.at(-1)!.remainingPoints;
  const expectedCompleted = BURNDOWN.doneAtStart + BURNDOWN.todoReestimated + BURNDOWN.addedDoneReestimated;

  // Report tab navigation: the active sprint is the default selection.
  await auditedGoto(page, capture, "admin", "/b/CASS/reports?report=sprint");
  const tabs = page.getByRole("navigation", { name: "Types de rapport" });
  await tabs.getByRole("link", { name: "Burndown", exact: true }).click();
  await expect(page).toHaveURL(/report=burndown/);
  await expect(tabs.getByRole("link", { name: "Burndown", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Sprint", { exact: true })).toHaveValue(sprint.id);
  await expect(page.getByRole("heading", { level: 1, name: BURNDOWN.sprintName })).toBeVisible();
  await expect(page.getByRole("main").getByText("Données en cours", { exact: true })).toBeVisible();

  await expectBurndownSummary(page, {
    kind: "active",
    initialRemainingPoints: baseline.remainingPoints,
    remainingPoints: expectedRemaining,
    completedPoints: expectedCompleted,
    unestimatedCount: rows.at(-1)!.unestimatedCount,
  });
  await expect(page.locator("#burndown-baseline")).toContainText(
    `Restant au démarrage : ${pointsLabel(baseline.remainingPoints)} · ${baseline.unestimatedCount} non estimé`,
  );
  await expectBurndownTable(page, rows);

  // Ideal line is linear from the initial remaining to zero at the target date.
  const observedIdeal = baseline.remainingPoints
    * (window.endAt.getTime() - Date.now()) / (window.endAt.getTime() - window.startAt.getTime());
  expect(Math.abs(observedIdeal - expectedRemaining), "Marge déterministe du libellé").toBeGreaterThan(0.25);
  const trajectory = page.getByRole("region", { name: "Trajectoire" });
  await expect(trajectory.getByText(
    expectedRemaining <= observedIdeal ? "Sur la trajectoire idéale" : "Au-dessus de la trajectoire idéale",
    { exact: true },
  )).toBeVisible();
  await expectComparison(
    await trajectory.getByText(/Engagement|Pas encore de vélocité comparable/u).textContent(),
    burndown.commitmentPoints,
    await expectedPreviousSprintsVelocity(context.backlog.id),
  );
  await expectChartMatches(page, {
    firstRemaining: baseline.remainingPoints,
    lastRemaining: expectedRemaining,
    markerCount: rows.length + 1,
    guideline: true,
  });
  await expect(page.getByText("Ligne pointillée grise : trajectoire idéale")).toBeVisible();
  await expect(page.getByText("Cercle évidé : changement de périmètre")).toBeVisible();

  const measuredAt = performance.now();
  const read = await getBurndownReport(context.backlog.id, sprint.id, { eventPage: 1, pageSize: 50 });
  const readMs = Math.round(performance.now() - measuredAt);
  if (!read || read.kind === "legacy_unavailable") throw new Error("Burndown actif introuvable.");
  capture.console.push(
    `[measure] active burndown read ${readMs}ms events=${read.eventPoints.total} exact=${read.eventPoints.rows.length + 1} display=${read.displayPoints.length}`,
  );

  await writeAuditScreenshot("audit/screenshots/burndown-active-desktop.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));
  await writeAuditScreenshot("audit/screenshots/burndown-active-chart-desktop.png", (path) =>
    burndownFigure(page).screenshot({ path, caret: "initial" }));
  const overflow = await measureMobileOverflow(page, "burndown");
  capture.console.push(
    `[overflow] active burndown 390x844 document=${overflow.document}px main=${overflow.main}px chart=${overflow.chart === null ? "n/a" : `${overflow.chart}px`}`,
  );
  await writeAuditScreenshot("audit/screenshots/burndown-active-mobile.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));
  await writeAuditScreenshot("audit/screenshots/burndown-active-chart-mobile.png", (path) =>
    burndownFigure(page).screenshot({ path, caret: "initial" }));
  await page.setViewportSize(DESKTOP_VIEWPORT);
});

audited(8, "relie édition unitaire, bulk et Board au burndown, ordre par séquence", async ({ page, capture }) => {
  requireBurndownFixture();
  const context = fixtures.context;
  const bulkFirst = await task(context, "Burndown — bulk un", { points: BURNDOWN.bulkFirst });
  const bulkSecond = await task(context, "Burndown — bulk deux", { points: BURNDOWN.bulkSecond });

  await auditedGoto(page, capture, "admin", "/b/CASS?view=backlog");
  for (const item of [bulkFirst, bulkSecond]) {
    await page.getByRole("checkbox", { name: `Sélectionner ${item.key}`, exact: true }).click();
  }
  await expect(page.getByText("2 items sélectionnés")).toBeVisible();
  await businessPost(page, async () => {
    await page.getByRole("button", { name: "Modifier le sprint" }).click();
    await page.getByRole("menuitem", { name: `${BURNDOWN.sprintName} — Actif` }).click();
  });

  // The bulk move shares one timestamp; the ledger orders it by sequence.
  const bulkEvents = await db.select({
    itemKey: sprintEvents.itemKey,
    occurredAt: sprintEvents.occurredAt,
    sequence: sprintEvents.sequence,
  }).from(sprintEvents).where(and(
    eq(sprintEvents.sprintId, burndown.sprintId),
    eq(sprintEvents.eventType, "item_added"),
    inArray(sprintEvents.itemKey, [bulkFirst.key, bulkSecond.key]),
  )).orderBy(asc(sprintEvents.sequence));
  expect(bulkEvents).toHaveLength(2);
  expect(bulkEvents[0]!.occurredAt.getTime()).toBe(bulkEvents[1]!.occurredAt.getTime());
  expect(bulkEvents[0]!.sequence < bulkEvents[1]!.sequence).toBe(true);
  capture.console.push(
    `[ordering] bulk item_added shared timestamp; sequence order ${bulkEvents.map((event) => event.itemKey).join(" < ")}`,
  );
  const bulkPoints = new Map([[bulkFirst.key, BURNDOWN.bulkFirst], [bulkSecond.key, BURNDOWN.bulkSecond]]);
  for (const event of bulkEvents) {
    burndown.steps.push({ itemKey: event.itemKey, cause: "Ajout", deltaPoints: bulkPoints.get(event.itemKey!)! });
  }

  await page.goto("/b/CASS?view=board");
  await dragBoardItemToStatus(page, burndown.keys.addedIncomplete, context.doneName);
  burndown.steps.push({
    itemKey: burndown.keys.addedIncomplete,
    cause: "Achèvement",
    deltaPoints: -BURNDOWN.addedIncomplete,
  });

  await page.goto("/b/CASS?view=backlog");
  const row = page.getByRole("row", { name: new RegExp(`^${burndown.keys.unestimated} —`, "u") });
  await row.getByRole("button", { name: "Estimation : Non estimé" }).click();
  await page.getByRole("spinbutton", { name: "Points" }).fill(String(BURNDOWN.singleEdit));
  await businessPost(page, () => page.getByRole("button", { name: "Enregistrer l’estimation" }).click());
  burndown.steps.push({
    itemKey: burndown.keys.unestimated,
    cause: "Réestimation",
    deltaPoints: BURNDOWN.singleEdit,
    deltaUnestimated: -1,
  });

  const rows = expectedBurndownRows(burndown.baseline, burndown.steps);
  const expectedRemaining = rows.at(-1)!.remainingPoints;
  const expectedCompleted = BURNDOWN.doneAtStart + BURNDOWN.todoReestimated
    + BURNDOWN.addedDoneReestimated + BURNDOWN.addedIncomplete;

  // JIR-46 (Jira velocity "Commitment"): the active header compares the
  // commitment frozen at start, and shows the live total as "Périmètre actuel".
  const activeHeader = sprintHeader(page, BURNDOWN.sprintName);
  await expectComparison(
    await activeHeader.getByText(/Engagement \d|Pas encore de vélocité comparable/u).first().textContent(),
    burndown.commitmentPoints,
    await expectedPreviousSprintsVelocity(context.backlog.id),
  );
  // Live scope = every sprint row's current estimate (remaining + completed).
  // Polled: the header re-renders after the single-edit save just above.
  const currentScope = activeHeader.getByText(/^Périmètre actuel /u);
  await expect.poll(async () => parseRenderedNumber((await currentScope.textContent())!.replace("Périmètre actuel", "")))
    .toBe(expectedRemaining + expectedCompleted);
  await expect(activeHeader.getByText("Engagement supérieur à la moyenne des sprints précédents", { exact: false })).toHaveCount(0);

  await auditedGoto(page, capture, "admin", `/b/CASS/reports?report=burndown&sprint=${burndown.sprintId}`);
  await expectBurndownSummary(page, {
    kind: "active",
    initialRemainingPoints: burndown.baseline.remainingPoints,
    remainingPoints: expectedRemaining,
    completedPoints: expectedCompleted,
    unestimatedCount: 0,
  });
  await expectBurndownTable(page, rows);
  const observedIdeal = burndown.baseline.remainingPoints
    * (burndown.window.endAt.getTime() - Date.now())
    / (burndown.window.endAt.getTime() - burndown.window.startAt.getTime());
  expect(Math.abs(observedIdeal - expectedRemaining), "Marge déterministe du libellé").toBeGreaterThan(0.25);
  await expect(page.getByRole("region", { name: "Trajectoire" }).getByText(
    expectedRemaining <= observedIdeal ? "Sur la trajectoire idéale" : "Au-dessus de la trajectoire idéale",
    { exact: true },
  )).toBeVisible();
  await expectChartMatches(page, {
    firstRemaining: burndown.baseline.remainingPoints,
    lastRemaining: expectedRemaining,
    markerCount: rows.length + 1,
    guideline: true,
  });
  const journal = page.getByRole("region", { name: "Journal du sprint" });
  await expectJournalOrder(journal, bulkEvents.map((event) => `a ajouté ${event.itemKey}`));
  await expectJournalOrder(journal, [
    `a ajouté ${burndown.keys.addedIncomplete}`,
    `a terminé ${burndown.keys.addedIncomplete}`,
  ]);
});

audited(9, "fige le point final à la clôture et ignore les mutations ultérieures", async ({ page, capture }) => {
  requireBurndownFixture();
  const context = fixtures.context;
  await auditedGoto(page, capture, "admin", "/b/CASS?view=backlog");
  await page.getByRole("button", { name: `Terminer le sprint ${BURNDOWN.sprintName}` }).click();
  await chooseOption(page, "Destination des tâches incomplètes", "Backlog");
  await businessPost(page, () => page.getByRole("button", { name: "Terminer le sprint", exact: true }).click());
  burndown.steps.push({ itemKey: null, cause: "Clôture du sprint", deltaPoints: 0 });

  const rows = expectedBurndownRows(burndown.baseline, burndown.steps);
  const finalRemaining = rows.at(-1)!.remainingPoints;
  const finalCompleted = BURNDOWN.doneAtStart + BURNDOWN.todoReestimated + BURNDOWN.addedDoneReestimated
    + BURNDOWN.addedIncomplete;
  const [snapshot] = await db.select({
    committedPoints: sprintReportSnapshots.committedPoints,
    completedPoints: sprintReportSnapshots.completedPoints,
  }).from(sprintReportSnapshots).where(eq(sprintReportSnapshots.sprintId, burndown.sprintId));
  expect(snapshot).toEqual({ committedPoints: burndown.commitmentPoints, completedPoints: finalCompleted });

  // JIR-37: a completed sprint compares to the sprints completed before it, never itself.
  const previousVelocity = await expectedPreviousSprintsVelocity(context.backlog.id, burndown.sprintId);
  capture.console.push(
    `[measure] completed commitment ${burndown.commitmentPoints} pts vs previous sprints average ${previousVelocity.average} over ${previousVelocity.population} sprints`,
  );
  const expectFrozen = async () => {
    await expect(page.getByRole("main").getByText("Historique figé", { exact: true })).toBeVisible();
    await expectBurndownSummary(page, {
      kind: "completed",
      initialRemainingPoints: burndown.baseline.remainingPoints,
      remainingPoints: finalRemaining,
      completedPoints: finalCompleted,
      unestimatedCount: 0,
    });
    await expectBurndownTable(page, rows);
    await expect(page.getByRole("region", { name: "Trajectoire" }).getByText(
      finalRemaining === 0 ? "Objectif atteint" : "Travail restant à la clôture",
      { exact: true },
    )).toBeVisible();
    await expectComparison(
      await page.getByRole("region", { name: "Trajectoire" })
        .getByText(/Engagement|Pas encore de vélocité comparable/u).textContent(),
      burndown.commitmentPoints,
      previousVelocity,
    );
    await expectChartMatches(page, {
      firstRemaining: burndown.baseline.remainingPoints,
      lastRemaining: finalRemaining,
      markerCount: rows.length + 1,
      guideline: true,
    });
    // Completed rows are immutable identities, never links to mutable items.
    await expect(page.getByRole("table", { name: "Valeurs exactes du burndown" }).getByRole("link"))
      .toHaveCount(0);
  };

  await auditedGoto(page, capture, "admin", `/b/CASS/reports?report=burndown&sprint=${burndown.sprintId}`);
  await expectFrozen();

  // Mutate every source after completion: the frozen report must not move.
  await updateItem({ id: burndown.ids.unestimated, estimatePoints: 13, statusId: context.doneId },
    context.actorId, "reports-e2e-bd-post-close-unestimated");
  await updateItem({ id: burndown.ids.stable, title: "Burndown — titre mutable après clôture", estimatePoints: 21 },
    context.actorId, "reports-e2e-bd-post-close-stable");
  await updateItem({ id: burndown.ids.addedIncomplete, statusId: context.todoId },
    context.actorId, "reports-e2e-bd-post-close-reopen");
  await page.reload();
  await expectFrozen();
  await expect(page.getByText("Burndown — titre mutable après clôture", { exact: false })).toHaveCount(0);

  const measuredAt = performance.now();
  const read = await getBurndownReport(context.backlog.id, burndown.sprintId, { eventPage: 1, pageSize: 50 });
  const readMs = Math.round(performance.now() - measuredAt);
  if (!read || read.kind !== "completed") throw new Error("Burndown terminé introuvable.");
  capture.console.push(
    `[measure] completed burndown read ${readMs}ms events=${read.eventPoints.total} exact=${read.eventPoints.rows.length + 1} display=${read.displayPoints.length}`,
  );
  await writeAuditScreenshot("audit/screenshots/burndown-completed-desktop.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));
  await writeAuditScreenshot("audit/screenshots/burndown-completed-chart-desktop.png", (path) =>
    burndownFigure(page).screenshot({ path, caret: "initial" }));
  const overflow = await measureMobileOverflow(page, "burndown");
  capture.console.push(
    `[overflow] completed burndown 390x844 document=${overflow.document}px main=${overflow.main}px chart=${overflow.chart === null ? "n/a" : `${overflow.chart}px`}`,
  );
  await writeAuditScreenshot("audit/screenshots/burndown-completed-mobile.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));
  await writeAuditScreenshot("audit/screenshots/burndown-completed-chart-mobile.png", (path) =>
    burndownFigure(page).screenshot({ path, caret: "initial" }));
  await page.setViewportSize(DESKTOP_VIEWPORT);

  await auditedGoto(page, capture, "admin", `/b/CASS/reports?report=burndown&sprint=${fixtures.legacy.id}`);
  await expect(page.getByText("Historique burndown indisponible", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Mesures du burndown" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Valeurs exactes du burndown" })).toHaveCount(0);

  // Switching report tabs keeps an older completed sprint selected (BUG-JIR-029).
  await auditedGoto(page, capture, "admin", `/b/CASS/reports?report=sprint&sprint=${fixtures.first.id}`);
  const tabs = page.getByRole("navigation", { name: "Types de rapport" });
  await tabs.getByRole("link", { name: "Burndown", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`report=burndown&sprint=${fixtures.first.id}`, "u"));
  await expect(page.getByLabel("Sprint", { exact: true })).toHaveValue(fixtures.first.id);
  await expect(page.getByRole("heading", { level: 1, name: "Sprint Rapport 1" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: BURNDOWN.sprintName })).toHaveCount(0);
  await tabs.getByRole("link", { name: "Rapport de sprint", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`report=sprint&sprint=${fixtures.first.id}`, "u"));
  await expect(page.getByLabel("Sprint", { exact: true })).toHaveValue(fixtures.first.id);
});

audited(10, "compare un sprint planifié à la vélocité récente sans bloquer", async ({ page, capture }) => {
  requireBurndownFixture();
  const context = fixtures.context;
  const planned = await namedSprint(context, BURNDOWN.plannedName);
  for (const [index, points] of BURNDOWN.plannedEstimates.entries()) {
    await task(context, `Burndown planifié — ${index + 1}`, { points, sprintId: planned.id });
  }
  burndown.plannedSprintId = planned.id;
  const commitment = BURNDOWN.plannedEstimates.reduce((sum, points) => sum + points, 0);
  const velocity = await expectedPreviousSprintsVelocity(context.backlog.id);

  await auditedGoto(page, capture, "admin", "/b/CASS?view=backlog");
  const header = sprintHeader(page, BURNDOWN.plannedName);
  await expect(header).toBeVisible();
  await expectComparison(
    await header.getByText(/Engagement \d|Pas encore de vélocité comparable/u).textContent(),
    commitment,
    velocity,
  );
  const warning = header.getByText("Engagement supérieur à la moyenne des sprints précédents : avertissement non bloquant.");
  const aboveAverage = velocity.average !== null && commitment > velocity.average;
  expect(aboveAverage, "La fixture planifiée doit dépasser la moyenne des sprints précédents").toBe(true);
  await expect(warning).toBeVisible();
  // Non-blocking: manual capacity is untouched and start stays available.
  await expect(header.getByRole("button", { name: new RegExp(`Démarrer le sprint ${BURNDOWN.plannedName}`, "u") }))
    .toBeEnabled();
  capture.console.push(
    `[measure] planned commitment ${commitment} pts vs previous sprints average ${velocity.average} over ${velocity.population} sprints`,
  );
  await header.scrollIntoViewIfNeeded();
  await writeAuditScreenshot("audit/screenshots/burndown-planned-warning-desktop.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));
  const overflow = await measureMobileOverflow(page, "backlog");
  capture.console.push(
    `[overflow] planned warning 390x844 document=${overflow.document}px main=${overflow.main}px chart=${overflow.chart === null ? "n/a" : `${overflow.chart}px`}`,
  );
  await expect(sprintHeader(page, BURNDOWN.plannedName)
    .getByText("Engagement supérieur à la moyenne des sprints précédents : avertissement non bloquant.")).toBeVisible();
  await sprintHeader(page, BURNDOWN.plannedName).scrollIntoViewIfNeeded();
  await writeAuditScreenshot("audit/screenshots/burndown-planned-warning-mobile.png", (path) =>
    page.screenshot({ path, fullPage: true, caret: "initial" }));
  await page.setViewportSize(DESKTOP_VIEWPORT);

  // A planned sprint has no burndown and stays concealed.
  await auditedGoto(page, capture, "admin", `/b/CASS/reports?report=burndown&sprint=${planned.id}`);
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.locator("body")).toContainText(/introuvable|could not be found/i);
  await expect(page.locator("body")).not.toContainText(BURNDOWN.plannedName);
});

audited(11, "conserve le burndown pour lecteur et second contexte, dissimule étranger et malformé", async ({
  page,
  capture,
  observedPage,
}) => {
  requireBurndownFixture();
  const rows = expectedBurndownRows(burndown.baseline, burndown.steps);
  const finalCompleted = BURNDOWN.doneAtStart + BURNDOWN.todoReestimated + BURNDOWN.addedDoneReestimated
    + BURNDOWN.addedIncomplete;
  const url = `/b/CASS/reports?report=burndown&sprint=${burndown.sprintId}`;
  const secondAdmin = await observedPage("admin-second", AUTH.admin);
  const reader = await observedPage("reader", AUTH.reader);
  for (const [actor, current] of [["admin", page], ["admin-second", secondAdmin], ["reader", reader]] as const) {
    await auditedGoto(current, capture, actor, url);
    await expect(current.getByRole("main").getByText("Historique figé", { exact: true })).toBeVisible();
    await expectBurndownSummary(current, {
      kind: "completed",
      initialRemainingPoints: burndown.baseline.remainingPoints,
      remainingPoints: rows.at(-1)!.remainingPoints,
      completedPoints: finalCompleted,
      unestimatedCount: 0,
    });
    await expectBurndownTable(current, rows);
    await current.reload();
    await expect(current.getByRole("table", { name: "Valeurs exactes du burndown" }).locator("tbody tr"))
      .toHaveCount(rows.length);
  }
  await expect(reader.getByRole("button", { name: /Terminer le sprint|Démarrer le sprint|Créer/ })).toHaveCount(0);

  const malformed = await auditedGoto(page, capture, "admin", "/b/CASS/reports?report=burndown&sprint=not-a-uuid");
  expect(malformed?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.locator("body")).toContainText(/introuvable|could not be found/i);
  await expect(page.getByRole("table", { name: "Valeurs exactes du burndown" })).toHaveCount(0);

  // A real, started LABS sprint renders in LABS but is concealed under CASS.
  const labs = await fixtureContext("LABS");
  const foreign = await namedSprint(labs, BURNDOWN.labsName);
  await begin(labs, foreign.id, BURNDOWN.labsName);
  await auditedGoto(page, capture, "admin", `/b/LABS/reports?report=burndown&sprint=${foreign.id}`);
  await expect(page.getByRole("heading", { level: 1, name: BURNDOWN.labsName })).toBeVisible();
  const concealed = await auditedGoto(page, capture, "admin", `/b/CASS/reports?report=burndown&sprint=${foreign.id}`);
  expect(concealed?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.locator("body")).toContainText(/introuvable|could not be found/i);
  await expect(page.locator("body")).not.toContainText(BURNDOWN.labsName);
});

audited(12, "masque une panne de lecture du burndown et récupère après retry", async ({ page, capture }) => {
  requireBurndownFixture();
  capture.expectedFault = {
    start: capture.faults.length,
    marker: "[expected-fault] burndown ledger read failed; generic ErrorBoundaryHandler rendered and recovered",
  };
  let ledgerRenamed = false;
  try {
    await db.execute(sql.raw('ALTER TABLE "sprint_events" RENAME TO "sprint_events_fault"'));
    ledgerRenamed = true;
    await auditedGoto(page, capture, "admin", `/b/CASS/reports?report=burndown&sprint=${burndown.sprintId}`);
    await expect(page.getByRole("heading", { name: "Impossible de charger les rapports" })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(
      /postgres(?:ql)?:|authorization|bearer|select\s|sprint_events|jiroo-e2e-secret/i,
    );
  } finally {
    if (ledgerRenamed) {
      await db.execute(sql.raw('ALTER TABLE "sprint_events_fault" RENAME TO "sprint_events"'));
    }
  }

  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("main").getByText("Historique figé", { exact: true })).toBeVisible();
  await expectBurndownTable(page, expectedBurndownRows(burndown.baseline, burndown.steps));
  capture.expectedFault.end = capture.faults.length;
});
