import "dotenv/config";

import { expect, test, type Page } from "@playwright/test";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import {
  backlogs,
  items,
  sprintItems,
  sprints,
  statuses,
} from "../lib/db/schema/domain";
import { createItem, updateItem } from "../lib/services/items";
import { startSprint } from "../lib/services/sprint-lifecycle";
import { createSprint } from "../lib/services/sprints";
import { createInlineItem, sprintMenuAction } from "./backlog-helpers";
import { chooseOption } from "./select-helpers";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";

const ACTIVE_SPRINT = "Audit Sprint actif 2026-08-05";
const NEXT_SPRINT = "Sprint 2";
const RENAMED_SPRINT = "Audit recette renommée";
const TASK_DONE = "Audit sprint — tâche terminée";
const TASK_CARRIED = "Audit sprint — tâche reportée";
const TASK_BOARD = "Audit sprint — créée depuis le board";
const TASK_BACKLOG = "Audit clôture — retour backlog";
const TASK_NEW_SPRINT = "Audit clôture — nouveau sprint";
const TASK_PARENT_DONE = "Audit clôture — parent terminé";
const SUBTASK_OPEN = "Audit clôture — sous-tâche ouverte";
const TASK_OVER_CAPACITY = "Audit planification — dépassement capacité";
const TASK_ROLLBACK_ANCHOR = "Audit planification — ancre sprint";
const TEST_TITLES = [
  TASK_DONE,
  TASK_CARRIED,
  TASK_BOARD,
  TASK_BACKLOG,
  TASK_NEW_SPRINT,
  TASK_PARENT_DONE,
  SUBTASK_OPEN,
  TASK_OVER_CAPACITY,
  TASK_ROLLBACK_ANCHOR,
];
const TEST_SPRINT_NAMES = [
  "Sprint 1",
  "Sprint 2",
  ACTIVE_SPRINT,
  "Audit clôture Backlog",
  "Audit clôture Nouveau",
  "Audit clôture bloquée",
  "Audit sprint report créé",
  "Audit capacité",
  RENAMED_SPRINT,
];

const CONSOLE_PATH =
  "audit/console/2026-08-05-session-08-sprint-lifecycle-console.log";
const NETWORK_PATH =
  "audit/network/2026-08-05-session-08-sprint-lifecycle-requests.log";
const NO_ACTIVE_SCREENSHOT =
  "audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-board-sans-sprint-actif.png";
const ACTIVE_BOARD_SCREENSHOT =
  "audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-board-sprint-actif.png";
const CLOSED_SCREENSHOT =
  "audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-cloture-sprint.png";
const FAILURE_CONSOLE_PATH =
  "audit/console/2026-08-05-session-08-sprint-lifecycle-failure-console.log";
const FAILURE_NETWORK_PATH =
  "audit/network/2026-08-05-session-08-sprint-lifecycle-failure-requests.log";
const START_FAILURE_SCREENSHOT =
  "audit/screenshots/EXPECTED-sprint-start-network-error.png";
const COMPLETE_FAILURE_SCREENSHOT =
  "audit/screenshots/EXPECTED-sprint-complete-network-error.png";
const VIEWER_CONSOLE_PATH =
  "audit/console/2026-08-05-session-08-sprint-viewer-console.log";
const VIEWER_NETWORK_PATH =
  "audit/network/2026-08-05-session-08-sprint-viewer-requests.log";
const VIEWER_SCREENSHOT =
  "audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-sprint-lecteur.png";
const PLANNING_CONSOLE_PATH =
  "audit/console/2026-08-05-session-08-sprint-planning-console.log";
const PLANNING_NETWORK_PATH =
  "audit/network/2026-08-05-session-08-sprint-planning-requests.log";
const PLANNING_SCREENSHOT =
  "audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-planification-sprint-bulk.png";
const COMPLETION_VARIANTS_CONSOLE_PATH =
  "audit/console/2026-08-05-session-08-sprint-completion-variants-console.log";
const COMPLETION_VARIANTS_NETWORK_PATH =
  "audit/network/2026-08-05-session-08-sprint-completion-variants-requests.log";
const COMPLETION_VARIANTS_SCREENSHOT =
  "audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-cloture-variantes.png";
const CAPACITY_CONSOLE_PATH =
  "audit/console/2026-08-05-session-08-sprint-capacity-console.log";
const CAPACITY_NETWORK_PATH =
  "audit/network/2026-08-05-session-08-sprint-capacity-requests.log";
const CAPACITY_SCREENSHOT =
  "audit/screenshots/FIXED-PARTIAL-BUG-JIR-015-capacite-depassee.png";
const PLANNING_FAILURE_CONSOLE_PATH =
  "audit/console/2026-08-05-session-08-sprint-planning-failure-console.log";
const PLANNING_FAILURE_NETWORK_PATH =
  "audit/network/2026-08-05-session-08-sprint-planning-failure-requests.log";
const PLANNING_FAILURE_SCREENSHOT =
  "audit/screenshots/EXPECTED-sprint-planning-network-rollback.png";

type AuditCapture = {
  consoleLines: string[];
  consoleErrors: string[];
  networkLines: string[];
  requestFailures: string[];
  httpErrors: string[];
};

function observe(page: Page): AuditCapture {
  const capture: AuditCapture = {
    consoleLines: [],
    consoleErrors: [],
    networkLines: [],
    requestFailures: [],
    httpErrors: [],
  };
  page.on("console", (message) => {
    const line = `[${message.type()}] ${message.text()}`;
    capture.consoleLines.push(line);
    if (message.type() === "error") capture.consoleErrors.push(line);
  });
  page.on("pageerror", (error) => {
    const line = `[pageerror] ${error.message}`;
    capture.consoleLines.push(line);
    capture.consoleErrors.push(line);
  });
  page.on("requestfailed", (request) => {
    const line = `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "échec inconnu"}`;
    capture.networkLines.push(line);
    capture.requestFailures.push(line);
  });
  page.on("response", (response) => {
    const line = `${response.status()} ${response.request().method()} ${response.url()}`;
    capture.networkLines.push(line);
    if (response.status() >= 400) capture.httpErrors.push(line);
  });
  return capture;
}

async function businessPost(page: Page, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/b/CASS",
  );
  const startedAt = Date.now();
  await action();
  const response = await responsePromise;
  await response.finished();
  expect(response.status()).toBeLessThan(400);
  return Date.now() - startedAt;
}

async function cassBacklog() {
  const [backlog] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  if (!backlog) throw new Error("Backlog CASS introuvable.");
  return backlog;
}

async function sprintFixtureContext() {
  const backlog = await cassBacklog();
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  const [epic] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, "epic")))
    .limit(1);
  const statusRows = await db
    .select({ id: statuses.id, category: statuses.category })
    .from(statuses)
    .where(eq(statuses.backlogId, backlog.id));
  const todo = statusRows.find((status) => status.category === "todo");
  const done = statusRows.find((status) => status.category === "done");
  if (!actor || !epic || !todo || !done) {
    throw new Error("Fixture sprint CASS incomplète.");
  }
  return { actor, backlog, epic, todo, done };
}

async function createActiveFixture(input: {
  title: string;
  sprintName: string;
  statusId?: string;
  estimatePoints?: number;
  capacityPoints?: number;
}) {
  const fixture = await sprintFixtureContext();
  const sprint = await createSprint(
    { backlogId: fixture.backlog.id },
    fixture.actor.id,
  );
  const task = await createItem(
    {
      backlogId: fixture.backlog.id,
      type: "tache",
      parentId: fixture.epic.id,
      title: input.title,
      statusId: input.statusId ?? fixture.todo.id,
      sprintId: sprint.id,
    },
    fixture.actor.id,
  );
  if (input.estimatePoints !== undefined) {
    await updateItem(
      { id: task.id, estimatePoints: input.estimatePoints },
      fixture.actor.id,
    );
  }
  await startSprint(
    {
      id: sprint.id,
      backlogId: fixture.backlog.id,
      name: input.sprintName,
      goal: `Prouver ${input.sprintName}`,
      startAt: "2026-08-05T09:00:00.000Z",
      endAt: "2026-08-19T18:00:00.000Z",
      capacityPoints: input.capacityPoints ?? 13,
    },
    fixture.actor.id,
  );
  return { ...fixture, sprint, task };
}

async function cleanFixture() {
  const backlog = await cassBacklog();
  await db.execute(sql.raw(
    "TRUNCATE TABLE sprint_report_items, sprint_report_snapshots, sprint_events RESTART IDENTITY CASCADE",
  ));
  const fixtureItems = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.backlogId, backlog.id),
        inArray(items.title, TEST_TITLES),
      ),
    );
  if (fixtureItems.length > 0) {
    await db.delete(items).where(inArray(items.id, fixtureItems.map((item) => item.id)));
  }
  await db
    .delete(sprints)
    .where(
      and(
        eq(sprints.backlogId, backlog.id),
        inArray(sprints.name, TEST_SPRINT_NAMES),
      ),
    );
}

test.beforeEach(async () => {
  await cleanFixture();
});

test.afterEach(async () => {
  await cleanFixture();
});

test("planifie, exécute et clôture un sprint sans exposer le backlog sur le Board", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const capture = observe(page);
  const timings: string[] = [];
  const backlog = await cassBacklog();
  const [unrelatedTask] = await db
    .select({ title: items.title })
    .from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, "tache")))
    .limit(1);
  const statusRows = await db
    .select({ name: statuses.name, category: statuses.category })
    .from(statuses)
    .where(eq(statuses.backlogId, backlog.id));
  const doneStatus = statusRows.find((status) => status.category === "done");
  if (!unrelatedTask || !doneStatus) throw new Error("Fixture CASS incomplète.");

  await page.goto("/b/CASS?view=board&q=audit");
  await expect(page.getByRole("heading", { name: "Aucun sprint actif" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir le Backlog" })).toHaveAttribute(
    "href",
    "/b/CASS?q=audit&view=backlog",
  );
  await expect(page.getByRole("button", { name: "Créer", exact: true })).toHaveCount(0);
  await writeAuditScreenshot(
    NO_ACTIVE_SCREENSHOT,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
  );

  await page.goto("/b/CASS?view=backlog");
  await expect(page.getByRole("heading", { name: "Planification" })).toBeVisible();
  timings.push(
    `[timing] create sprint 1 ${await businessPost(page, () =>
      page.getByRole("button", { name: "Créer un sprint" }).click())}ms`,
  );
  await expect(page.getByRole("heading", { name: "Sprint 1" })).toBeVisible();

  for (const title of [TASK_DONE, TASK_CARRIED]) {
    timings.push(
      `[timing] create ${title} ${await businessPost(page, () =>
        createInlineItem(page, "Sprint 1", title))}ms`,
    );
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");

  timings.push(
    `[timing] create sprint 2 ${await businessPost(page, () =>
      page.getByRole("button", { name: "Créer un sprint" }).click())}ms`,
  );
  await expect(page.getByRole("heading", { name: NEXT_SPRINT })).toBeVisible();

  await page.getByRole("button", { name: "Démarrer le sprint Sprint 1" }).click();
  await page.getByRole("textbox", { name: "Nom" }).fill(ACTIVE_SPRINT);
  await page
    .getByRole("textbox", { name: "Objectif" })
    .fill("Valider le cycle produit complet dans Jiroo");
  await page.getByLabel("Début", { exact: true }).fill("2026-08-05T09:00");
  await page.getByLabel("Fin", { exact: true }).fill("2026-08-19T18:00");
  await page.getByRole("spinbutton", { name: "Capacité (points)" }).fill("13");
  timings.push(
    `[timing] start sprint ${await businessPost(page, () =>
      page.getByRole("button", { name: "Confirmer le démarrage" }).click())}ms`,
  );

  await expect(page).toHaveURL(/view=board/);
  await expect(page.getByRole("heading", { name: ACTIVE_SPRINT })).toBeVisible();
  await expect(
    page.getByText("Objectif : Valider le cycle produit complet dans Jiroo"),
  ).toBeVisible();
  await expect(page.getByText("2 non estimé")).toBeVisible();
  await expect(page.getByText(TASK_DONE, { exact: true })).toBeVisible();
  await expect(page.getByText(TASK_CARRIED, { exact: true })).toBeVisible();
  await expect(page.getByText(unrelatedTask.title, { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /^Créer dans / }).first().click();
  await expect(
    page.getByRole("heading", { name: `Nouvelle tâche — ${ACTIVE_SPRINT}` }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Titre" }).fill(TASK_BOARD);
  await chooseOption(page, /Parent/, { index: 0 });
  timings.push(
    `[timing] create from board ${await businessPost(page, () =>
      page.getByRole("button", { name: /Créer$/ }).click())}ms`,
  );
  await expect(page.getByText(TASK_BOARD, { exact: true })).toBeVisible();

  const [doneItem] = await db
    .select({ key: items.key })
    .from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.title, TASK_DONE)));
  if (!doneItem) throw new Error("Tâche à terminer introuvable.");
  const handle = page.getByRole("button", { name: `Déplacer ${doneItem.key}` });
  const destinationTrigger = page.getByRole("button", {
    name: `Créer dans ${doneStatus.name}`,
  });
  const destinationColumn = destinationTrigger.locator(
    "xpath=ancestor::div[contains(@class,'flex-none')][1]",
  );
  const origin = await handle.boundingBox();
  const destination = await destinationColumn.boundingBox();
  if (!origin || !destination) throw new Error("Géométrie du Board introuvable.");
  const moveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/b/CASS",
  );
  const moveStartedAt = Date.now();
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
  const moved = await moveResponse;
  expect(moved.status()).toBeLessThan(400);
  await moved.finished();
  timings.push(`[timing] board drag ${Date.now() - moveStartedAt}ms`);
  await expect(destinationColumn.getByText(TASK_DONE, { exact: true })).toBeVisible();
  await writeAuditScreenshot(
    ACTIVE_BOARD_SCREENSHOT,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
  );

  await page.goto("/b/CASS?view=backlog");
  await page.getByRole("button", { name: `Terminer le sprint ${ACTIVE_SPRINT}` }).click();
  await expect(page.getByText("1 tâche · 0 pt", { exact: true })).toBeVisible();
  await page
    .getByLabel("Destination des tâches incomplètes")
    .selectOption({ label: NEXT_SPRINT });
  timings.push(
    `[timing] complete sprint ${await businessPost(page, () =>
      page.getByRole("button", { name: "Terminer le sprint", exact: true }).click())}ms`,
  );
  await expect(page.getByRole("heading", { name: NEXT_SPRINT })).toBeVisible();
  await expect(page.getByText(TASK_CARRIED, { exact: true })).toBeVisible();
  await expect(page.getByText(TASK_BOARD, { exact: true })).toBeVisible();
  await expect(page.getByText(TASK_DONE, { exact: true })).toHaveCount(0);

  await page.goto("/b/CASS?view=board");
  await expect(page.getByRole("heading", { name: "Aucun sprint actif" })).toBeVisible();
  await expect(page.getByText(TASK_CARRIED, { exact: true })).toHaveCount(0);
  await writeAuditScreenshot(
    CLOSED_SCREENSHOT,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
  );

  const fixtureRows = await db
    .select({
      title: items.title,
      sprintName: sprints.name,
      leftAt: sprintItems.leftAt,
      outcome: sprintItems.outcome,
      destinationSprintId: sprintItems.destinationSprintId,
    })
    .from(items)
    .innerJoin(sprintItems, eq(sprintItems.itemId, items.id))
    .innerJoin(sprints, eq(sprints.id, sprintItems.sprintId))
    .where(inArray(items.title, TEST_TITLES));
  expect(fixtureRows.some((row) => row.title === TASK_DONE && row.outcome === "completed"))
    .toBe(true);
  expect(
    fixtureRows.filter(
      (row) =>
        row.sprintName === NEXT_SPRINT &&
        row.leftAt === null &&
        [TASK_CARRIED, TASK_BOARD].includes(row.title),
    ),
  ).toHaveLength(2);

  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return entry
      ? {
          responseStartMs: Math.round(entry.responseStart),
          domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
          loadMs: Math.round(entry.loadEventEnd),
        }
      : null;
  });
  capture.consoleLines.push(
    ...timings,
    `[performance] ${JSON.stringify(navigation)}`,
    "[result] cycle planification → sprint actif → board → clôture persisté",
  );
  await writeAuditText(CONSOLE_PATH, `${capture.consoleLines.join("\n")}\n`);
  await writeAuditText(NETWORK_PATH, `${capture.networkLines.join("\n")}\n`);

  expect(capture.consoleErrors, "Erreurs JavaScript/console").toEqual([]);
  expect(capture.requestFailures, "Requêtes réseau échouées").toEqual([]);
  expect(capture.httpErrors, "Réponses HTTP en erreur").toEqual([]);
});

test("conserve le sprint planifié et explique un échec réseau au démarrage", async ({
  page,
}) => {
  const capture = observe(page);
  const backlog = await cassBacklog();
  await page.goto("/b/CASS?view=backlog");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Créer un sprint" }).click(),
  );
  await expect(page.getByRole("heading", { name: "Sprint 1" })).toBeVisible();
  await page.getByRole("button", { name: "Démarrer le sprint Sprint 1" }).click();
  await page.getByLabel("Début", { exact: true }).fill("2026-08-05T09:00");
  await page.getByLabel("Fin", { exact: true }).fill("2026-08-19T18:00");

  let rejected = false;
  await page.route("**/*", async (route) => {
    if (
      !rejected &&
      route.request().method() === "POST" &&
      new URL(route.request().url()).pathname === "/b/CASS"
    ) {
      rejected = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Confirmer le démarrage" }).click();

  await expect(page.getByText("Démarrage impossible.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  const [stored] = await db
    .select({ state: sprints.state, startedAt: sprints.startedAt })
    .from(sprints)
    .where(and(eq(sprints.backlogId, backlog.id), eq(sprints.name, "Sprint 1")));
  expect(stored).toEqual({ state: "planned", startedAt: null });
  await writeAuditScreenshot(
    START_FAILURE_SCREENSHOT,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
  );

  await page.unroute("**/*");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Confirmer le démarrage" }).click(),
  );
  await expect(page).toHaveURL(/view=board/);
  await page.goto("/b/CASS?view=backlog");
  await page.getByRole("button", { name: "Terminer le sprint Sprint 1" }).click();
  let completionRejected = false;
  await page.route("**/*", async (route) => {
    if (
      !completionRejected &&
      route.request().method() === "POST" &&
      new URL(route.request().url()).pathname === "/b/CASS"
    ) {
      completionRejected = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Terminer le sprint", exact: true }).click();
  await expect(page.getByText("Impossible de terminer le sprint.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  const [stillActive] = await db
    .select({ state: sprints.state, completedAt: sprints.completedAt })
    .from(sprints)
    .where(and(eq(sprints.backlogId, backlog.id), eq(sprints.name, "Sprint 1")));
  expect(stillActive).toEqual({ state: "active", completedAt: null });
  await writeAuditScreenshot(
    COMPLETE_FAILURE_SCREENSHOT,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
  );

  capture.consoleLines.push(
    "[expected] POST de démarrage et POST de clôture interrompus volontairement",
    "[result] dialogues conservés, messages français visibles, états planifié puis actif inchangés",
  );
  await writeAuditText(
    FAILURE_CONSOLE_PATH,
    `${capture.consoleLines.join("\n")}\n`,
  );
  await writeAuditText(
    FAILURE_NETWORK_PATH,
    `${capture.networkLines.join("\n")}\n`,
  );

  expect(rejected).toBe(true);
  expect(completionRejected).toBe(true);
  expect(capture.requestFailures).toHaveLength(2);
  expect(capture.requestFailures.every((failure) => failure.includes("net::ERR_FAILED")))
    .toBe(true);
  expect(capture.httpErrors).toEqual([]);
});

test("recalcule et explique un dépassement de capacité avant démarrage", async ({
  page,
}) => {
  const capture = observe(page);
  const fixture = await sprintFixtureContext();
  const sprint = await createSprint(
    { backlogId: fixture.backlog.id },
    fixture.actor.id,
  );
  const task = await createItem(
    {
      backlogId: fixture.backlog.id,
      type: "tache",
      parentId: fixture.epic.id,
      title: TASK_OVER_CAPACITY,
      sprintId: sprint.id,
    },
    fixture.actor.id,
  );
  await updateItem({ id: task.id, estimatePoints: 8 }, fixture.actor.id);

  await page.goto("/b/CASS?view=backlog");
  await page.getByRole("button", { name: "Démarrer le sprint Sprint 1" }).click();
  await page.getByLabel("Début", { exact: true }).fill("2026-08-05T09:00");
  await page.getByLabel("Fin", { exact: true }).fill("2026-08-19T18:00");
  const capacity = page.getByRole("spinbutton", { name: "Capacité (points)" });
  await capacity.fill("5");
  await expect(page.getByRole("alert")).toHaveText(
    "Dépassement de 3 pts. Vous pouvez tout de même démarrer.",
  );
  await capacity.fill("8");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await capacity.fill("7");
  await expect(page.getByRole("alert")).toHaveText(
    "Dépassement de 1 pt. Vous pouvez tout de même démarrer.",
  );
  await writeAuditScreenshot(
    CAPACITY_SCREENSHOT,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
  );

  capture.consoleLines.push(
    "[result] capacité 5 → dépassement 3 ; capacité 8 → aucun dépassement ; capacité 7 → dépassement 1",
  );
  await writeAuditText(CAPACITY_CONSOLE_PATH, `${capture.consoleLines.join("\n")}\n`);
  await writeAuditText(CAPACITY_NETWORK_PATH, `${capture.networkLines.join("\n")}\n`);
  expect(capture.consoleErrors).toEqual([]);
  expect(capture.requestFailures).toEqual([]);
  expect(capture.httpErrors).toEqual([]);
});

test("démarre un sprint renommé avec son nom, son objectif et ses dates à jour", async ({
  page,
}) => {
  const fixture = await sprintFixtureContext();
  await createSprint({ backlogId: fixture.backlog.id }, fixture.actor.id);

  await page.goto("/b/CASS?view=backlog");
  await sprintMenuAction(page, "Sprint 1", "Modifier");
  await page.getByRole("textbox", { name: "Nom" }).fill(RENAMED_SPRINT);
  await page.getByRole("textbox", { name: "Objectif" }).fill("Sprint de test 1 semaine");
  await page.getByLabel("Début prévu").fill("2026-08-05T09:00");
  await page.getByLabel("Fin prévue").fill("2026-08-12T18:00");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Enregistrer" }).click(),
  );
  await expect(page.getByRole("heading", { name: RENAMED_SPRINT })).toBeVisible();

  await page.getByRole("button", { name: `Démarrer le sprint ${RENAMED_SPRINT}` }).click();
  await expect(page.getByRole("textbox", { name: "Nom" })).toHaveValue(RENAMED_SPRINT);
  await expect(page.getByRole("textbox", { name: "Objectif" }))
    .toHaveValue("Sprint de test 1 semaine");
  await expect(page.getByLabel("Début", { exact: true })).toHaveValue("2026-08-05T09:00");
  await expect(page.getByLabel("Fin", { exact: true })).toHaveValue("2026-08-12T18:00");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Confirmer le démarrage" }).click(),
  );

  await expect(page).toHaveURL(/view=board/);
  await expect(page.getByRole("heading", { name: RENAMED_SPRINT })).toBeVisible();
  await expect(page.getByText("Objectif : Sprint de test 1 semaine")).toBeVisible();
});

test("restaure sélection et section après deux échecs réseau de planification", async ({
  page,
}) => {
  const capture = observe(page);
  const backlog = await cassBacklog();
  await page.goto("/b/CASS?view=backlog");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Créer un sprint" }).click(),
  );
  const fixture = await sprintFixtureContext();
  const [sprint] = await db
    .select({ id: sprints.id })
    .from(sprints)
    .where(and(eq(sprints.backlogId, backlog.id), eq(sprints.name, "Sprint 1")))
    .limit(1);
  if (!sprint) throw new Error("Sprint rollback introuvable.");
  await createItem(
    {
      backlogId: backlog.id,
      type: "tache",
      parentId: fixture.epic.id,
      title: TASK_ROLLBACK_ANCHOR,
      statusId: fixture.todo.id,
      sprintId: sprint.id,
    },
    fixture.actor.id,
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sprint 1" })).toBeVisible();
  const sprintSection = page.locator("[data-sprint-section]").filter({
    has: page.getByRole("heading", { name: "Sprint 1" }),
  });
  const backlogSection = page.locator('[data-sprint-section="backlog"]');
  await expect(sprintSection.getByText(TASK_ROLLBACK_ANCHOR, { exact: true })).toBeVisible();
  const checkboxes = backlogSection.getByRole("checkbox", { name: /^Sélectionner CASS-/ });
  expect(await checkboxes.count()).toBeGreaterThan(2);
  const firstKey = (await checkboxes.nth(0).getAttribute("aria-label"))?.replace(
    "Sélectionner ",
    "",
  );
  const secondKey = (await checkboxes.nth(1).getAttribute("aria-label"))?.replace(
    "Sélectionner ",
    "",
  );
  const dragKey = firstKey;
  if (!firstKey || !secondKey || !dragKey) throw new Error("Clés rollback introuvables.");

  await backlogSection.getByRole("checkbox", { name: `Sélectionner ${firstKey}` }).click();
  await backlogSection
    .getByRole("checkbox", { name: `Sélectionner ${secondKey}` })
    .click({ modifiers: ["Shift"] });
  let bulkRejected = false;
  await page.route("**/*", async (route) => {
    if (
      !bulkRejected &&
      route.request().method() === "POST" &&
      new URL(route.request().url()).pathname === "/b/CASS"
    ) {
      bulkRejected = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Modifier le sprint" }).click();
  await page.getByRole("menuitem", { name: "Sprint 1 — Planifié" }).click();
  await expect(
    page
      .getByRole("region", { name: "Actions groupées" })
      .getByRole("alert"),
  ).toHaveText("Modification groupée impossible.");
  await expect(page.getByText("2 items sélectionnés")).toBeVisible();
  await expect(page.locator('[data-sprint-section="backlog"]').getByText(firstKey, { exact: true }))
    .toBeVisible();
  await expect(page.locator('[data-sprint-section="backlog"]').getByText(secondKey, { exact: true }))
    .toBeVisible();
  await page.unroute("**/*");
  await page.getByRole("button", { name: "Effacer la sélection" }).click();

  const handle = page.getByRole("button", { name: `Déplacer ${dragKey}` });
  const sprintHeading = sprintSection.getByRole("heading", { name: "Sprint 1" });
  await page.getByRole("heading", { name: "Planification" }).scrollIntoViewIfNeeded();
  await expect(handle).toBeEnabled();
  await expect(handle).toBeInViewport();
  await expect(sprintHeading).toBeInViewport();
  const origin = await handle.boundingBox();
  const destination = await sprintHeading.boundingBox();
  if (!origin || !destination) throw new Error("Géométrie rollback introuvable.");
  let dragRejected = false;
  await page.route("**/*", async (route) => {
    if (
      !dragRejected &&
      route.request().method() === "POST" &&
      new URL(route.request().url()).pathname === "/b/CASS"
    ) {
      dragRejected = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2 + 10, origin.y + origin.height / 2, {
    steps: 3,
  });
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height / 2,
    { steps: 16 },
  );
  await expect(sprintSection).toHaveAttribute("data-drop-target", "true");
  await page.mouse.up();
  await expect.poll(() => dragRejected).toBe(true);
  await expect(page.getByText("Planification impossible.", { exact: true })).toBeVisible();
  await expect(backlogSection.getByText(dragKey, { exact: true })).toBeVisible();
  await expect(sprintSection.getByText(dragKey, { exact: true })).toHaveCount(0);
  const [draggedItem] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.key, dragKey)));
  if (!draggedItem) throw new Error("Item rollback introuvable.");
  const currentMembership = await db
    .select({ sprintId: sprintItems.sprintId })
    .from(sprintItems)
    .where(and(eq(sprintItems.itemId, draggedItem.id), isNull(sprintItems.leftAt)));
  expect(currentMembership).toEqual([]);
  await writeAuditScreenshot(
    PLANNING_FAILURE_SCREENSHOT,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
  );

  capture.consoleLines.push(
    "[expected] POST bulk sprint et POST drag inter-section interrompus volontairement",
    "[result] sélection conservée après bulk ; ligne et base restaurées dans le Backlog après drag",
  );
  await writeAuditText(
    PLANNING_FAILURE_CONSOLE_PATH,
    `${capture.consoleLines.join("\n")}\n`,
  );
  await writeAuditText(
    PLANNING_FAILURE_NETWORK_PATH,
    `${capture.networkLines.join("\n")}\n`,
  );
  expect(bulkRejected).toBe(true);
  expect(dragRejected).toBe(true);
  expect(capture.requestFailures).toHaveLength(2);
  expect(capture.requestFailures.every((failure) => failure.includes("net::ERR_FAILED")))
    .toBe(true);
  expect(capture.httpErrors).toEqual([]);
});

test("clôture vers le Backlog ou un nouveau sprint et bloque une sous-tâche ouverte", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const capture = observe(page);

  const backlogCase = await createActiveFixture({
    title: TASK_BACKLOG,
    sprintName: "Audit clôture Backlog",
  });
  await page.goto("/b/CASS?view=backlog");
  await page
    .getByRole("button", { name: "Terminer le sprint Audit clôture Backlog" })
    .click();
  await expect(page.getByLabel("Destination des tâches incomplètes")).toHaveValue(
    "backlog",
  );
  await businessPost(page, () =>
    page.getByRole("button", { name: "Terminer le sprint", exact: true }).click(),
  );
  const backlogSection = page.locator('[data-sprint-section="backlog"]');
  await expect(backlogSection.getByText(TASK_BACKLOG, { exact: true })).toBeVisible();
  const [backlogMembership] = await db
    .select({
      outcome: sprintItems.outcome,
      destinationSprintId: sprintItems.destinationSprintId,
      leftAt: sprintItems.leftAt,
    })
    .from(sprintItems)
    .where(eq(sprintItems.itemId, backlogCase.task.id));
  expect(backlogMembership).toMatchObject({
    outcome: "carried_to_backlog",
    destinationSprintId: null,
  });
  expect(backlogMembership?.leftAt).toBeInstanceOf(Date);

  const newSprintCase = await createActiveFixture({
    title: TASK_NEW_SPRINT,
    sprintName: "Audit clôture Nouveau",
  });
  await page.goto("/b/CASS?view=backlog");
  await page
    .getByRole("button", { name: "Terminer le sprint Audit clôture Nouveau" })
    .click();
  await page
    .getByLabel("Destination des tâches incomplètes")
    .selectOption("new");
  await page
    .getByRole("textbox", { name: "Nom du nouveau sprint" })
    .fill("Audit sprint report créé");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Terminer le sprint", exact: true }).click(),
  );
  const createdSection = page.locator("[data-sprint-section]").filter({
    has: page.getByRole("heading", { name: "Audit sprint report créé" }),
  });
  await expect(createdSection.getByText(TASK_NEW_SPRINT, { exact: true })).toBeVisible();
  const destinationRows = await db
    .select({ id: sprints.id, state: sprints.state })
    .from(sprints)
    .where(
      and(
        eq(sprints.backlogId, newSprintCase.backlog.id),
        eq(sprints.name, "Audit sprint report créé"),
      ),
    );
  expect(destinationRows).toHaveLength(1);
  expect(destinationRows[0]?.state).toBe("planned");

  const blockedCase = await createActiveFixture({
    title: TASK_PARENT_DONE,
    sprintName: "Audit clôture bloquée",
    statusId: newSprintCase.done.id,
  });
  const openSubtask = await createItem(
    {
      backlogId: blockedCase.backlog.id,
      type: "soustache",
      parentId: blockedCase.task.id,
      title: SUBTASK_OPEN,
      statusId: blockedCase.todo.id,
    },
    blockedCase.actor.id,
  );
  await page.goto("/b/CASS?view=backlog");
  await page
    .getByRole("button", { name: "Terminer le sprint Audit clôture bloquée" })
    .click();
  await businessPost(page, () =>
    page.getByRole("button", { name: "Terminer le sprint", exact: true }).click(),
  );
  await expect(page.getByRole("alert")).toContainText(
    "Terminez les sous-tâches avant de clôturer le sprint.",
  );
  await expect(page.getByRole("alert")).toContainText(openSubtask.key);
  await expect(page.getByRole("dialog")).toBeVisible();
  const [blockedSprint] = await db
    .select({ state: sprints.state })
    .from(sprints)
    .where(eq(sprints.id, blockedCase.sprint.id));
  const [blockedMembership] = await db
    .select({ leftAt: sprintItems.leftAt })
    .from(sprintItems)
    .where(eq(sprintItems.itemId, blockedCase.task.id));
  expect(blockedSprint?.state).toBe("active");
  expect(blockedMembership?.leftAt).toBeNull();
  await writeAuditScreenshot(
    COMPLETION_VARIANTS_SCREENSHOT,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
  );

  capture.consoleLines.push(
    "[result] clôture Backlog et nouveau sprint persistées ; sous-tâche ouverte bloquante avec clé métier",
  );
  await writeAuditText(
    COMPLETION_VARIANTS_CONSOLE_PATH,
    `${capture.consoleLines.join("\n")}\n`,
  );
  await writeAuditText(
    COMPLETION_VARIANTS_NETWORK_PATH,
    `${capture.networkLines.join("\n")}\n`,
  );
  expect(capture.consoleErrors).toEqual([]);
  expect(capture.requestFailures).toEqual([]);
  expect(capture.httpErrors).toEqual([]);
});

test("laisse le lecteur consulter la planification et le Board sans aucun contrôle", async ({
  browser,
  page,
}) => {
  const backlog = await cassBacklog();
  await page.goto("/b/CASS?view=backlog");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Créer un sprint" }).click(),
  );
  await businessPost(page, () => createInlineItem(page, "Sprint 1", TASK_CARRIED));
  await expect(page.getByText(TASK_CARRIED, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Démarrer le sprint Sprint 1" }).click();
  await page.getByRole("textbox", { name: "Nom" }).fill(ACTIVE_SPRINT);
  await page.getByRole("textbox", { name: "Objectif" }).fill("Objectif visible lecteur");
  await page.getByLabel("Début", { exact: true }).fill("2026-08-05T09:00");
  await page.getByLabel("Fin", { exact: true }).fill("2026-08-19T18:00");
  await page.getByRole("spinbutton", { name: "Capacité (points)" }).fill("13");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Confirmer le démarrage" }).click(),
  );

  const context = await browser.newContext({
    storageState: ".playwright/.auth/reader.json",
  });
  const viewer = await context.newPage();
  const capture = observe(viewer);
  try {
    await viewer.goto("/b/CASS?view=backlog");
    await expect(viewer.getByRole("heading", { name: ACTIVE_SPRINT })).toBeVisible();
    await expect(viewer.getByText("Objectif visible lecteur", { exact: true })).toBeVisible();
    await expect(viewer.getByText("0 / 13 pts", { exact: true })).toBeVisible();
    await expect(viewer.getByText(TASK_CARRIED, { exact: true })).toBeVisible();
    await expect(viewer.getByRole("checkbox")).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: /^Déplacer CASS-/ })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: /^Créer un item dans/ })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: `Actions de ${ACTIVE_SPRINT}` })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: `Terminer le sprint ${ACTIVE_SPRINT}` })).toHaveCount(0);
    await expect(viewer.getByRole("region", { name: "Actions groupées" })).toHaveCount(0);

    await viewer.goto("/b/CASS?view=board");
    await expect(viewer.getByRole("heading", { name: ACTIVE_SPRINT })).toBeVisible();
    await expect(viewer.getByText(TASK_CARRIED, { exact: true })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Créer", exact: true })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: /^Créer dans / })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: /^Déplacer CASS-/ })).toHaveCount(0);
    await writeAuditScreenshot(
      VIEWER_SCREENSHOT,
      (path) => viewer.screenshot({ path, fullPage: true, caret: "initial" }),
    );

    const [stored] = await db
      .select({ state: sprints.state })
      .from(sprints)
      .where(and(eq(sprints.backlogId, backlog.id), eq(sprints.name, ACTIVE_SPRINT)));
    expect(stored?.state).toBe("active");
    capture.consoleLines.push(
      "[result] lecteur: métadonnées et tâche visibles, zéro contrôle de mutation",
    );
    await writeAuditText(VIEWER_CONSOLE_PATH, `${capture.consoleLines.join("\n")}\n`);
    await writeAuditText(VIEWER_NETWORK_PATH, `${capture.networkLines.join("\n")}\n`);

    expect(capture.consoleErrors).toEqual([]);
    expect(capture.requestFailures).toEqual([]);
    expect(capture.httpErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("planifie une plage de tâches en masse et conserve la section après rechargement", async ({
  page,
}) => {
  const capture = observe(page);
  await page.goto("/b/CASS?view=backlog");
  await businessPost(page, () =>
    page.getByRole("button", { name: "Créer un sprint" }).click(),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sprint 1" })).toBeVisible();

  const checkboxes = page.getByRole("checkbox", { name: /^Sélectionner CASS-/ });
  expect(await checkboxes.count()).toBeGreaterThan(2);
  const first = checkboxes.nth(0);
  const second = checkboxes.nth(1);
  const third = checkboxes.nth(2);
  const firstKey = (await first.getAttribute("aria-label"))?.replace("Sélectionner ", "");
  const secondKey = (await second.getAttribute("aria-label"))?.replace("Sélectionner ", "");
  const thirdKey = (await third.getAttribute("aria-label"))?.replace("Sélectionner ", "");
  if (!firstKey || !secondKey || !thirdKey) {
    throw new Error("Clés de planification introuvables.");
  }

  const sprintSection = page.locator('[data-sprint-section]').filter({
    has: page.getByRole("heading", { name: "Sprint 1" }),
  });
  const dragHandle = page.getByRole("button", { name: `Déplacer ${thirdKey}` });
  const origin = await dragHandle.boundingBox();
  const destination = await sprintSection.boundingBox();
  if (!origin || !destination) throw new Error("Géométrie de planification introuvable.");
  const dragResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/b/CASS",
  );
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2 + 10, origin.y + origin.height / 2, {
    steps: 3,
  });
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + Math.min(destination.height - 8, 45),
    { steps: 16 },
  );
  await expect(sprintSection).toHaveAttribute("data-drop-target", "true");
  await page.mouse.up();
  const dragged = await dragResponse;
  expect(dragged.status()).toBeLessThan(400);
  await dragged.finished();
  await expect(sprintSection.getByText(thirdKey, { exact: true })).toBeVisible();

  await page.getByRole("checkbox", { name: `Sélectionner ${firstKey}` }).click();
  await page
    .getByRole("checkbox", { name: `Sélectionner ${secondKey}` })
    .click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 items sélectionnés")).toBeVisible();
  const elapsed = await businessPost(page, async () => {
    await page.getByRole("button", { name: "Modifier le sprint" }).click();
    await page.getByRole("menuitem", { name: "Sprint 1 — Planifié" }).click();
  });

  await expect(sprintSection.getByRole("row", { name: new RegExp(`^${firstKey} —`) }))
    .toBeVisible();
  await expect(sprintSection.getByRole("row", { name: new RegExp(`^${secondKey} —`) }))
    .toBeVisible();
  await expect(sprintSection.getByText(/^3 items · /)).toBeVisible();
  // JIR-75: compact rows, no column header.
  await expect(sprintSection.getByRole("columnheader")).toHaveCount(0);
  await page.getByRole("button", { name: "Replier Sprint 1" }).click();
  await expect(sprintSection.getByRole("row", { name: new RegExp(`^${firstKey} —`) }))
    .toHaveCount(0);
  await page.getByRole("button", { name: "Déplier Sprint 1" }).click();
  await expect(sprintSection.getByRole("row", { name: new RegExp(`^${firstKey} —`) }))
    .toBeVisible();
  await page.reload();
  await expect(sprintSection.getByRole("row", { name: new RegExp(`^${firstKey} —`) }))
    .toBeVisible();
  await expect(sprintSection.getByRole("row", { name: new RegExp(`^${secondKey} —`) }))
    .toBeVisible();
  await writeAuditScreenshot(
    PLANNING_SCREENSHOT,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
  );

  capture.consoleLines.push(
    `[timing] bulk sprint ${elapsed}ms`,
    `[result] ${thirdKey} planifié par drag ; ${firstKey} → ${secondKey} par bulk, repliés puis persistés après reload`,
  );
  await writeAuditText(PLANNING_CONSOLE_PATH, `${capture.consoleLines.join("\n")}\n`);
  await writeAuditText(PLANNING_NETWORK_PATH, `${capture.networkLines.join("\n")}\n`);
  expect(capture.consoleErrors).toEqual([]);
  expect(capture.requestFailures).toEqual([]);
  expect(capture.httpErrors).toEqual([]);
});
