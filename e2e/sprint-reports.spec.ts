import "dotenv/config";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import {
  backlogs,
  items,
  sprintReportSnapshots,
  sprints,
  statuses,
} from "../lib/db/schema/domain";
import { createItem, softDeleteItem, updateItem } from "../lib/services/items";
import { completeSprint, startSprint } from "../lib/services/sprint-lifecycle";
import { getSprintReport } from "../lib/services/sprint-reports";
import { createSprint, moveItemToSprint, updateSprint } from "../lib/services/sprints";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";

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
};

type ReportFixtures = Awaited<ReturnType<typeof seedReportFixtures>>;
let fixtures: ReportFixtures;

const FORBIDDEN_AUDIT_EVIDENCE =
  /postgres(?:ql)?:|authorization|bearer|cookie:|select\s|sprint_report_snapshots|database_url|direct_database_url|jiroo-e2e-secret/i;

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
  const handle = page.getByRole("button", { name: `Déplacer ${itemKey}` });
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

async function expectJournalOrder(
  journal: Locator,
  fragments: string[],
) {
  const rows = await journal.getByRole("listitem").allTextContents();
  let previousIndex = -1;
  for (const fragment of fragments) {
    const index = rows.findIndex((row, candidateIndex) =>
      candidateIndex > previousIndex && row.includes(fragment));
    expect(index, `Événement absent ou désordonné : ${fragment}`).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
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
  const frozenItem = completedSection
    .getByText("Rapport 1 — terminé figé", { exact: false })
    .locator("xpath=ancestor::li");
  await expect(frozenItem).toContainText("5 pts");
  await expect(frozenItem).toContainText("done");
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
  await expect(page.getByRole("group", { name: "Sprint Rapport 2 — engagement 13 points, terminé 0 points" }))
    .toBeVisible();
  await expect(page.getByRole("group", { name: "Sprint Rapport 3 — engagement 0 points, terminé 0 points" }))
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

  await page.goto("/b/CASS?view=backlog");
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
  await expect(mixedSection).toContainText(activeItem.key);
  await expect(mixedSection).toContainText(mixedUnestimated.key);
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
  await expect(reader.getByRole("button", { name: /Clôturer|Démarrer|Créer/ })).toHaveCount(0);

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
  const faultStart = capture.faults.length;
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

  const expectedFaults = capture.faults.splice(faultStart);
  expect(expectedFaults.length, "La panne injectée doit produire une preuve navigateur.")
    .toBeGreaterThan(0);
  for (const fault of expectedFaults) {
    expect(fault).toContain("handled by the <ErrorBoundaryHandler> error boundary");
    expect(fault).not.toMatch(/postgres(?:ql)?:|authorization|bearer|jiroo-e2e-secret/i);
  }
  capture.console = capture.console.filter((line) => !expectedFaults.includes(line));
  capture.console.push(
    "[expected-fault] report read failed; generic ErrorBoundaryHandler rendered and recovered",
  );

  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("main").getByText("Historique figé", { exact: true }))
    .toBeVisible();
  expect([...capture.console, ...capture.network].join("\n"))
    .not.toMatch(FORBIDDEN_AUDIT_EVIDENCE);
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
    await page.getByRole("checkbox", { name: `Sélectionner ${item.key}` }).click();
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
  await expect(journal).toContainText(`a ajouté ${bulkOne.key} au sprint avec 1 pts`);
  await expect(journal).toContainText(`a ajouté ${boardItem.key} au sprint avec 5 pts`);
  let measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Périmètre actuel", { exact: true }).locator(".."))
    .toContainText("3 éléments · 8 pts · 0 non estimé");
  const addedSection = page.getByRole("region", { name: "Non terminés (3)" });
  for (const item of bulkItems) await expect(addedSection).toContainText(item.key);

  await page.goto("/b/CASS?view=backlog");
  for (const item of bulkItems) {
    await page.getByRole("checkbox", { name: `Sélectionner ${item.key}` }).click();
  }
  await page.getByRole("spinbutton", { name: "Estimation groupée" }).fill("4");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Appliquer l’estimation" }).click());
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${uiActive.id}`);
  journal = page.getByRole("region", { name: "Journal du sprint" });
  await expect(journal).toContainText(`a modifié ${bulkTwo.key} : 2 pts → 4 pts`);
  await expect(journal).toContainText(`a modifié ${bulkOne.key} : 1 pts → 4 pts`);
  await expect(journal).toContainText(`a modifié ${boardItem.key} : 5 pts → 4 pts`);
  measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Périmètre actuel", { exact: true }).locator(".."))
    .toContainText("3 éléments · 12 pts · 0 non estimé");

  await page.goto("/b/CASS?view=backlog");
  for (const item of [bulkTwo, bulkOne]) {
    await page.getByRole("checkbox", { name: `Sélectionner ${item.key}` }).click();
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
    .toContainText("1 éléments · 4 pts · 0 non estimé");
  const remainingSection = page.getByRole("region", { name: "Non terminés (1)" });
  await expect(remainingSection).toContainText(boardItem.key);
  await expect(remainingSection).not.toContainText(bulkTwo.key);
  await expect(remainingSection).not.toContainText(bulkOne.key);
  const removedSection = page.getByRole("region", { name: "Retirés (2)" });
  await expect(removedSection).toContainText(bulkTwo.key);
  await expect(removedSection).toContainText(bulkOne.key);

  await page.goto("/b/CASS?view=board");
  await dragBoardItemToStatus(page, boardItem.key, fixtures.context.doneName);
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${uiActive.id}`);
  await expect(page.getByRole("region", { name: "Journal du sprint" }))
    .toContainText(`a terminé ${boardItem.key}`);
  measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Terminés", { exact: true }).locator(".."))
    .toContainText("1 éléments · 4 pts");
  await expect(page.getByRole("region", { name: "Terminés (1)" })).toContainText(boardItem.key);

  await page.goto("/b/CASS?view=board");
  await dragBoardItemToStatus(page, boardItem.key, fixtures.context.todoName);
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${uiActive.id}`);
  journal = page.getByRole("region", { name: "Journal du sprint" });
  await expect(journal).toContainText(`a rouvert ${boardItem.key}`);
  measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Terminés", { exact: true }).locator(".."))
    .toContainText("0 éléments · 0 pts");
  await expect(page.getByRole("region", { name: "Non terminés (1)" })).toContainText(boardItem.key);
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
  await page.getByRole("button", { name: "Clôturer Sprint UI vers Backlog" }).click();
  await page.getByLabel("Destination des tâches incomplètes").selectOption({ label: "Backlog" });
  await businessPost(page, () =>
    page.getByRole("button", { name: "Confirmer la clôture" }).click());
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
  await page.getByRole("button", { name: "Clôturer Sprint UI vers planifié" }).click();
  await page.getByLabel("Destination des tâches incomplètes")
    .selectOption({ label: "Sprint UI Destination" });
  await businessPost(page, () =>
    page.getByRole("button", { name: "Confirmer la clôture" }).click());
  await expect(page.getByRole("heading", { name: "Sprint UI Destination" })).toBeVisible();
  await expect(page.getByText(carriedItem.key, { exact: true })).toBeVisible();
  await page.goto(`/b/CASS/reports?report=sprint&sprint=${uiToPlanned.id}`);
  await expect(page.getByRole("main").getByText("Historique figé", { exact: true })).toBeVisible();
  measures = page.getByRole("region", { name: "Mesures du sprint" });
  await expect(measures.getByText("Engagement", { exact: true }).locator(".."))
    .toContainText("1 éléments · 6 pts · 0 non estimé");
  const carriedSection = page.getByRole("region", { name: "Reportés (1)" });
  await expect(carriedSection).toContainText(carriedItem.key);
  await expect(carriedSection).toContainText("Reporté vers Sprint UI Destination");
  await expect(page.getByRole("region", { name: "Journal du sprint" }))
    .toContainText("a clôturé le sprint");
});
