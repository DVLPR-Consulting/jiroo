import "dotenv/config";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import {
  activities,
  backlogs,
  itemFixVersions,
  items,
  releaseEvents,
  releasePublicationItems,
  releasePublications,
  releases,
  sprints,
  statuses,
  views,
} from "../lib/db/schema/domain";
import { changeItemFixVersions } from "../lib/services/item-fix-versions";
import { createItem, updateItem } from "../lib/services/items";
import {
  createRelease,
  deleteRelease,
  getReleaseDetail,
  publishRelease,
} from "../lib/services/releases";
import { startSprint } from "../lib/services/sprint-lifecycle";
import { createSprint } from "../lib/services/sprints";
import {
  writeAuditScreenshot,
  writeAuditText,
} from "./audit-artifacts";

const AUTH = {
  admin: ".playwright/.auth/platform-admin.json",
  specialist: ".playwright/.auth/specialist.json",
  editor: ".playwright/.auth/editor.json",
  reader: ".playwright/.auth/reader.json",
} as const;

const EMAIL = {
  admin: "platform-admin@jiroo.local",
  specialist: "specialist@jiroo.local",
  editor: "editor-releases@jiroo.local",
  reader: "reader@jiroo.local",
} as const;

type Capture = {
  console: string[];
  network: string[];
  expectedRequestFailures: string[];
  expectedHttpErrors: string[];
  expectedConsoleErrors: string[];
  contexts: Set<BrowserContext>;
  pages: Set<Page>;
  activePage: Page;
  faults: Array<{
    kind: "console" | "page" | "request" | "http";
    line: string;
    page: Page;
  }>;
};

type ForgedRequest = {
  url: string;
  body: string;
  headers: Record<string, string>;
};

function newCapture(page: Page): Capture {
  return {
    console: [],
    network: [],
    expectedRequestFailures: [],
    expectedHttpErrors: [],
    expectedConsoleErrors: [],
    contexts: new Set(),
    pages: new Set(),
    activePage: page,
    faults: [],
  };
}

function observe(page: Page, capture: Capture, actor: string) {
  if (capture.pages.has(page)) return;
  capture.pages.add(page);
  capture.activePage = page;
  page.on("console", (message) => {
    const line = `[${actor}] ${message.type()}: ${message.text()}`;
    capture.console.push(line);
    if (message.type() === "error") {
      capture.faults.push({ kind: "console", line, page });
    }
  });
  page.on("pageerror", (error) => {
    const line = `[${actor}] pageerror: ${error.message}`;
    capture.console.push(line);
    capture.faults.push({ kind: "page", line, page });
  });
  page.on("request", (request) => {
    capture.network.push(`[request] [${actor}] ${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    const line = `[response] [${actor}] ${response.request().method()} ${response.status()} ${response.url()}`;
    capture.network.push(line);
    if (response.status() >= 400) {
      capture.faults.push({ kind: "http", line, page });
    }
  });
  page.on("requestfailed", (request) => {
    const line = `[failed] [${actor}] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`;
    capture.network.push(line);
    capture.faults.push({ kind: "request", line, page });
  });
}

function activatePage(capture: Capture, page: Page) {
  capture.activePage = page;
}

async function observedPage(
  browser: Browser,
  capture: Capture,
  actor: string,
  storageState: (typeof AUTH)[keyof typeof AUTH],
) {
  const context = await browser.newContext({ storageState });
  capture.contexts.add(context);
  const page = await context.newPage();
  observe(page, capture, actor);
  return page;
}

function unexpectedFaults(
  capture: Capture,
  kind: Capture["faults"][number]["kind"],
  expectedFragments: string[] = [],
) {
  const remaining = [...expectedFragments];
  return capture.faults.filter((fault) => {
    if (fault.kind !== kind) return false;
    const index = remaining.findIndex((fragment) => fault.line.includes(fragment));
    if (index < 0) return true;
    remaining.splice(index, 1);
    return false;
  });
}

function audited(
  number: number,
  title: string,
  body: (fixtures: {
    page: Page;
    browser: Browser;
    capture: Capture;
    audit: { use: (activePage: Page) => void };
  }) => Promise<void>,
) {
  test(`${String(number).padStart(2, "0")} — ${title}`, async ({ page, browser }) => {
    const startedAt = performance.now();
    const capture = newCapture(page);
    observe(page, capture, "admin");
    let failure: unknown;
    try {
      await body({
        page,
        browser,
        capture,
        audit: { use: (activePage) => activatePage(capture, activePage) },
      });
    } catch (error) {
      failure = error;
    }

    const unexpected = [
      ...unexpectedFaults(capture, "console", capture.expectedConsoleErrors),
      ...unexpectedFaults(capture, "page"),
      ...unexpectedFaults(capture, "request", capture.expectedRequestFailures),
      ...unexpectedFaults(capture, "http", capture.expectedHttpErrors),
    ];
    const unexpectedLines = unexpected.map((fault) => fault.line);
    if (!failure && unexpectedLines.length > 0) {
      failure = new Error(`Erreurs navigateur inattendues:\n${unexpectedLines.join("\n")}`);
    }

    if (failure) {
      const bugId = `BUG-JIR-${String(27 + number).padStart(3, "0")}`;
      capture.console.push(`[defect] ${bugId} ${failure instanceof Error ? failure.message : String(failure)}`);
      const faultPage = unexpected[0]?.page;
      const screenshotPage = [faultPage, capture.activePage, page]
        .find((candidate): candidate is Page => candidate !== undefined && !candidate.isClosed());
      if (screenshotPage) {
        await writeAuditScreenshot(
          `audit/screenshots/${bugId}-releases-s${String(number).padStart(2, "0")}.png`,
          (path) => screenshotPage.screenshot({ path, fullPage: true, caret: "initial" }),
        );
      }
    }

    capture.console.push(`[duration] scenario ${number}: ${Math.round(performance.now() - startedAt)}ms`);
    await writeAuditText(
      `audit/console/releases-s${String(number).padStart(2, "0")}.log`,
      `${capture.console.join("\n")}\n`,
    );
    await writeAuditText(
      `audit/network/releases-s${String(number).padStart(2, "0")}.log`,
      `${capture.network.join("\n")}\n`,
    );
    await Promise.allSettled([...capture.contexts].map((context) => context.close()));
    if (failure) throw failure;
  });
}

async function accountId(email: string) {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!row) throw new Error(`Compte fixture introuvable: ${email}`);
  return row.id;
}

async function backlogFixture(key = "CASS") {
  const [backlog] = await db.select({ id: backlogs.id, key: backlogs.key })
    .from(backlogs)
    .where(eq(backlogs.key, key));
  if (!backlog) throw new Error(`Backlog fixture introuvable: ${key}`);
  const statusRows = await db.select({ id: statuses.id, category: statuses.category })
    .from(statuses)
    .where(eq(statuses.backlogId, backlog.id));
  const [epic] = await db.select({ id: items.id })
    .from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, "epic")));
  if (!epic) throw new Error(`Epic fixture introuvable: ${key}`);
  const status = (category: "todo" | "in_progress" | "done") => {
    const found = statusRows.find((candidate) => candidate.category === category);
    if (!found) throw new Error(`Statut ${category} introuvable: ${key}`);
    return found.id;
  };
  return { ...backlog, epicId: epic.id, status };
}

async function fixtureRelease(name: string, backlogKey = "CASS") {
  const backlog = await backlogFixture(backlogKey);
  const actorId = await accountId(EMAIL.admin);
  const created = await createRelease({
    backlogId: backlog.id,
    name,
    description: `Fixture ${name}`,
    driverId: actorId,
    startDate: "2026-08-01",
    targetDate: "2026-08-31",
  }, actorId, `e2e-release-${name}`);
  return { ...created, backlogId: backlog.id, name };
}

async function fixtureTask(
  title: string,
  input: {
    status?: "todo" | "in_progress" | "done";
    points?: number | null;
    sprintId?: string;
    kind?: "feature" | "bug";
  } = {},
) {
  const backlog = await backlogFixture();
  const actorId = await accountId(EMAIL.admin);
  const created = await createItem({
    backlogId: backlog.id,
    type: "tache",
    parentId: backlog.epicId,
    title,
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.sprintId ? { sprintId: input.sprintId } : {}),
  }, actorId, `e2e-item-${title}`);
  await updateItem({
    id: created.id,
    statusId: backlog.status(input.status ?? "todo"),
    ...(input.points !== undefined ? { estimatePoints: input.points } : {}),
  }, actorId, `e2e-item-update-${title}`);
  return created;
}

async function assignVersions(itemId: string, releaseIds: string[]) {
  const backlog = await backlogFixture();
  const actorId = await accountId(EMAIL.admin);
  return changeItemFixVersions({
    backlogId: backlog.id,
    itemId,
    mode: "replace",
    releaseIds,
  }, actorId, `e2e-fix-${itemId}`);
}

async function assignedVersionIds(itemId: string) {
  const rows = await db.select({ releaseId: itemFixVersions.releaseId })
    .from(itemFixVersions)
    .where(eq(itemFixVersions.itemId, itemId))
    .orderBy(asc(itemFixVersions.releaseId));
  return rows.map((row) => row.releaseId);
}

async function clickPost(page: Page, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST"
    && new URL(response.url()).origin === new URL(page.url()).origin,
  );
  await action();
  const response = await responsePromise;
  await response.finished();
  expect(response.status()).toBeLessThan(400);
}

async function selectBulkItems(
  page: Page,
  selectedItems: Array<{ key: string }>,
) {
  for (const item of selectedItems) {
    await page.getByRole("checkbox", { name: `Sélectionner ${item.key}` }).check();
  }
}

async function chooseBulkFixVersions(page: Page, releaseNames: string[]) {
  const toolbar = page.getByRole("region", { name: "Actions groupées" });
  await toolbar.getByRole("button", { name: "Versions", exact: true }).click();
  for (const releaseName of releaseNames) {
    await page.getByRole("menuitemcheckbox", { name: releaseName, exact: true }).click();
  }
  await page.keyboard.press("Escape");
}

async function applyBulkFixVersions(
  page: Page,
  actionName:
    | "Ajouter aux versions"
    | "Remplacer les versions"
    | "Retirer des versions"
    | "Effacer toutes les versions",
  selectedCount: number,
  expectedConsequences: string[],
) {
  const toolbar = page.getByRole("region", { name: "Actions groupées" });
  await toolbar.getByRole("button", { name: "Appliquer les versions" }).click();
  await page.getByRole("menuitem", { name: actionName }).click();
  const dialog = page.getByRole("dialog", {
    name: "Confirmer la modification des Fix versions",
  });
  await expect(dialog).toContainText(
    `${selectedCount} ${selectedCount === 1 ? "item sélectionné" : "items sélectionnés"}`,
  );
  for (const consequence of expectedConsequences) {
    await expect(dialog).toContainText(consequence);
  }
  await clickPost(page, () =>
    dialog.getByRole("button", {
      name: `Appliquer à ${selectedCount} ${selectedCount === 1 ? "item" : "items"}`,
    }).click(),
  );
}

async function expectListFixVersions(
  page: Page,
  item: { key: string; title: string },
  expectedNames: string[],
) {
  const row = page.getByRole("row", { name: `${item.key} — ${item.title}`, exact: true });
  const cell = row.getByRole("cell").last();
  if (expectedNames.length === 0) {
    await expect(cell).toHaveText("—");
    return;
  }
  for (const name of expectedNames) await expect(cell).toContainText(name);
}

async function publishFromDialog(
  page: Page,
  releaseName: string,
  disposition: "keep" | "move",
  destinationName?: string,
) {
  await page.getByRole("button", { name: `Publier ${releaseName}` }).click();
  const dialog = page.getByRole("dialog", { name: `Publier ${releaseName}` });
  await dialog.getByLabel("Date de publication").fill("2026-08-07");
  await dialog.getByLabel(
    disposition === "keep" ? "Conserver dans cette version" : "Déplacer vers une autre version",
  ).check();
  if (disposition === "move") {
    await dialog.getByLabel("Version de destination").selectOption({ label: destinationName });
  }
  await clickPost(page, () => dialog.getByRole("button", { name: "Publier", exact: true }).click());
}

async function interceptNextPost(page: Page, pathname: string, capture: Capture) {
  let intercepted: ForgedRequest | undefined;
  capture.expectedRequestFailures.push(pathname);
  capture.expectedConsoleErrors.push("Failed to load resource: net::ERR_FAILED");
  capture.console.push(`[expected] interruption volontaire du prochain POST ${pathname}`);
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!intercepted && request.method() === "POST" && new URL(request.url()).pathname === pathname) {
      const allowedHeaders = new Set([
        "accept",
        "content-type",
        "next-action",
        "next-router-state-tree",
        "next-url",
      ]);
      intercepted = {
        url: request.url(),
        body: request.postData() ?? "",
        headers: Object.fromEntries(
          Object.entries(request.headers()).filter(([name]) => allowedHeaders.has(name.toLowerCase())),
        ),
      };
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  return () => {
    if (!intercepted) throw new Error(`POST ${pathname} non intercepté.`);
    return intercepted;
  };
}

async function replayForgedRequest(page: Page, request: ForgedRequest) {
  return page.evaluate(async (input) => {
    const response = await fetch(input.url, {
      method: "POST",
      headers: input.headers,
      body: input.body,
      credentials: "include",
    });
    return { status: response.status, text: await response.text() };
  }, request);
}

audited(1, "crée puis modifie une version", async ({ page }) => {
  await page.goto("/b/CASS/releases");
  async function createThenEdit(input: {
    initialName: string; finalName: string; initialDescription: string; finalDescription: string;
    initialStartDate: string; initialTargetDate: string; finalStartDate: string; finalTargetDate: string;
  }) {
    await page.getByRole("button", { name: "Créer une version" }).click();
    const create = page.getByRole("dialog", { name: "Créer une version" });
    await create.getByRole("textbox", { name: "Nom" }).fill(input.initialName);
    await create.getByRole("textbox", { name: "Description" }).fill(input.initialDescription);
    await create.getByLabel("Date de début").fill(input.initialStartDate);
    await create.getByLabel("Date cible").fill(input.initialTargetDate);
    await clickPost(page, () => create.getByRole("button", { name: "Créer", exact: true }).click());
    const article = page.getByRole("article", { name: input.initialName });
    await expect(article).toBeVisible();
    await article.getByText(`Actions pour ${input.initialName}`, { exact: true }).click();
    await article.getByRole("button", { name: `Modifier ${input.initialName}` }).click();
    const edit = page.getByRole("dialog", { name: `Modifier ${input.initialName}` });
    await edit.getByRole("textbox", { name: "Nom" }).fill(input.finalName);
    await edit.getByRole("textbox", { name: "Description" }).fill(input.finalDescription);
    await edit.getByLabel("Date de début").fill(input.finalStartDate);
    await edit.getByLabel("Date cible").fill(input.finalTargetDate);
    await clickPost(page, () => edit.getByRole("button", { name: "Enregistrer" }).click());
    await expect(page.getByRole("article", { name: input.finalName })).toBeVisible();
  }
  await createThenEdit({ initialName: "R09-S01 Création", finalName: "R09-S01 Modifiée", initialDescription: "Description initiale", finalDescription: "Description finale", initialStartDate: "2026-08-10", initialTargetDate: "2026-08-20", finalStartDate: "2026-08-11", finalTargetDate: "2026-08-22" });
  await createThenEdit({ initialName: "R09-S01 Seconde", finalName: "R09-S01 Seconde modifiée", initialDescription: "Deuxième description initiale", finalDescription: "Deuxième description finale", initialStartDate: "2026-09-10", initialTargetDate: "2026-09-20", finalStartDate: "2026-09-12", finalTargetDate: "2026-09-24" });
  const stored = await db.select({
    name: releases.name,
    description: releases.description,
    startDate: releases.startDate,
    targetDate: releases.releaseDate,
    revision: releases.revision,
  }).from(releases);
  expect(stored.filter((row) => row.name.startsWith("R09-S01"))
    .sort((left, right) => left.name.localeCompare(right.name))).toEqual([
    { name: "R09-S01 Modifiée", description: "Description finale", startDate: "2026-08-11", targetDate: "2026-08-22", revision: 2 },
    { name: "R09-S01 Seconde modifiée", description: "Deuxième description finale", startDate: "2026-09-12", targetDate: "2026-09-24", revision: 2 },
  ]);
});

audited(2, "persiste deux versions à la création puis depuis le détail", async ({ page, browser, capture, audit }) => {
  const first = await fixtureRelease("R09-S02 Alpha");
  const second = await fixtureRelease("R09-S02 Beta");
  const backlog = await backlogFixture();

  await page.goto("/b/CASS?view=list&fvcol=1");
  await page.getByRole("button", { name: "Nouvel item" }).click();
  const create = page.getByRole("dialog", { name: "Nouvel item" });
  await create.getByRole("textbox", { name: "Titre" }).fill("R09-S02 créé multi-version");
  await create.getByRole("button", { name: "Versions", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: first.name, exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: second.name, exact: true }).click();
  await page.keyboard.press("Escape");
  await clickPost(page, () => create.getByRole("button", { name: "Créer", exact: true }).click());
  const [created] = await db
    .select({ id: items.id, key: items.key, title: items.title })
    .from(items)
    .where(and(
      eq(items.backlogId, backlog.id),
      eq(items.title, "R09-S02 créé multi-version"),
      isNull(items.deletedAt),
    ));
  if (!created) throw new Error("Item créé avec deux versions introuvable.");
  await page.goto(`/b/CASS?view=list&item=${created.key}`);
  await page.reload();
  const createdSelection = page.getByRole("list", { name: "Versions sélectionnées" });
  await expect(createdSelection).toContainText(first.name);
  await expect(createdSelection).toContainText(second.name);
  expect(await assignedVersionIds(created.id)).toEqual([first.id, second.id].sort());

  const item = await fixtureTask("R09-S02 détail multi-version", { points: 3 });
  const editor = await observedPage(browser, capture, "editor-multi-version", AUTH.editor);
  audit.use(editor);
  await editor.goto(`/b/CASS?view=list&item=${item.key}`);
  await editor.getByRole("button", { name: "Versions", exact: true }).click();
  await clickPost(editor, () => editor.getByRole("menuitemcheckbox", { name: first.name }).click());
  await clickPost(editor, () => editor.getByRole("menuitemcheckbox", { name: second.name }).click());
  await editor.reload();
  const selected = editor.getByRole("list", { name: "Versions sélectionnées" });
  await expect(selected).toContainText(first.name);
  await expect(selected).toContainText(second.name);
  await editor.goto(`/b/CASS/releases/${first.id}`);
  await expect(editor.getByRole("region", { name: "Périmètre actuel" })).toContainText(item.key);
  await editor.goto(`/b/CASS/releases/${second.id}`);
  await expect(editor.getByRole("region", { name: "Périmètre actuel" })).toContainText(item.key);
  expect(await assignedVersionIds(item.id)).toEqual([first.id, second.id].sort());
});

audited(3, "ajoute, remplace et retire des versions en masse", async ({ browser, capture, audit }) => {
  const first = await fixtureRelease("R09-S03 Ajouter");
  const second = await fixtureRelease("R09-S03 Remplacer");
  const one = await fixtureTask("R09-S03 bulk un");
  const two = await fixtureTask("R09-S03 bulk deux");
  const editor = await observedPage(browser, capture, "editor", AUTH.editor);
  audit.use(editor);
    await editor.goto("/b/CASS?view=list&fvcol=1");
    await selectBulkItems(editor, [one, two]);
    await chooseBulkFixVersions(editor, [first.name]);
    await applyBulkFixVersions(editor, "Ajouter aux versions", 2, [
      first.name,
      "seront ajoutées sans retirer les Fix versions existantes",
    ]);
    await editor.reload();
    expect(await assignedVersionIds(one.id)).toEqual([first.id]);
    expect(await assignedVersionIds(two.id)).toEqual([first.id]);
    await expectListFixVersions(editor, one, [first.name]);
    await expectListFixVersions(editor, two, [first.name]);

    await selectBulkItems(editor, [one, two]);
    await chooseBulkFixVersions(editor, [second.name]);
    await applyBulkFixVersions(editor, "Remplacer les versions", 2, [
      second.name,
      "Les Fix versions existantes seront remplacées",
    ]);
    await editor.reload();
    expect(await assignedVersionIds(one.id)).toEqual([second.id]);
    expect(await assignedVersionIds(two.id)).toEqual([second.id]);
    await expectListFixVersions(editor, one, [second.name]);
    await expectListFixVersions(editor, two, [second.name]);

    await selectBulkItems(editor, [one, two]);
    await chooseBulkFixVersions(editor, [second.name]);
    await applyBulkFixVersions(editor, "Retirer des versions", 2, [
      second.name,
      "seront retirées. Les autres Fix versions seront conservées",
    ]);
    await editor.reload();
    expect(await assignedVersionIds(one.id)).toEqual([]);
    expect(await assignedVersionIds(two.id)).toEqual([]);
    await expectListFixVersions(editor, one, []);
    await expectListFixVersions(editor, two, []);

    await selectBulkItems(editor, [one, two]);
    await chooseBulkFixVersions(editor, [first.name, second.name]);
    await applyBulkFixVersions(editor, "Ajouter aux versions", 2, [
      first.name,
      second.name,
      "seront ajoutées sans retirer les Fix versions existantes",
    ]);
    expect(await assignedVersionIds(one.id)).toEqual([first.id, second.id].sort());
    await applyBulkFixVersions(editor, "Effacer toutes les versions", 2, [
      "Toutes les Fix versions seront retirées",
    ]);
    await editor.reload();
    expect(await assignedVersionIds(one.id)).toEqual([]);
    expect(await assignedVersionIds(two.id)).toEqual([]);
    await expectListFixVersions(editor, one, []);
    await expectListFixVersions(editor, two, []);
});

audited(4, "conserve le filtre Version après reload et dans une vue enregistrée", async ({ page }) => {
  const release = await fixtureRelease("R09-S04 Filtrée");
  const backlog = await backlogFixture();
  const actorId = await accountId(EMAIL.admin);
  const sprint = await createSprint({ backlogId: backlog.id }, actorId);
  try {
    const matching = await fixtureTask("R09-S04 visible", { sprintId: sprint.id });
    const hidden = await fixtureTask("R09-S04 masquée", { sprintId: sprint.id });
    await startSprint({
      id: sprint.id,
      backlogId: backlog.id,
      name: "R09-S04 Sprint filtre",
      goal: "Prouver le filtre Version partagé",
      startAt: "2026-08-05T09:00:00.000Z",
      endAt: "2026-08-19T18:00:00.000Z",
      capacityPoints: 13,
    }, actorId);
    await assignVersions(matching.id, [release.id]);

    await page.goto("/b/CASS?view=list");
    await page.getByRole("button", { name: "+ Version" }).click();
    await page.getByLabel(release.name).click();
    await expect(page).toHaveURL(new RegExp(`version=${release.id}`));
    await expect(page.getByText(matching.key, { exact: true })).toBeVisible();
    await expect(page.getByText(hidden.key, { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: new RegExp(`Version.*${release.name}`) })).toBeVisible();
    await expect(page.getByText(matching.key, { exact: true })).toBeVisible();
    await expect(page.getByText(hidden.key, { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Enregistrer la vue" }).click();
    await page.getByRole("menuitem", { name: "Enregistrer sous…" }).click();
    const dialog = page.getByRole("dialog", { name: "Enregistrer la vue" });
    await dialog.getByRole("textbox", { name: "Nom de la vue" }).fill("R09-S04 Vue version");
    await clickPost(page, () => dialog.getByRole("button", { name: "Enregistrer" }).click());
    await expect(page.getByRole("button", { name: /R09-S04 Vue version/ })).toBeVisible();
    await page.reload();
    await expect(page.getByText(matching.key, { exact: true })).toBeVisible();
    await expect(page.getByText(hidden.key, { exact: true })).toHaveCount(0);

    await page.goto(`/b/CASS?view=board&version=${release.id}`);
    await expect(page.getByText(matching.key, { exact: true })).toBeVisible();
    await expect(page.getByText(hidden.key, { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: new RegExp(`Version.*${release.name}`) })).toBeVisible();
    await expect(page.getByText(matching.key, { exact: true })).toBeVisible();
    await expect(page.getByText(hidden.key, { exact: true })).toHaveCount(0);
    const [stored] = await db.select({ filters: views.filters }).from(views)
      .where(eq(views.name, "R09-S04 Vue version"));
    expect(stored?.filters).toMatchObject({ releaseIds: [release.id] });
  } finally {
    await db.execute(sql.raw(
      "TRUNCATE TABLE sprint_report_items, sprint_report_snapshots, sprint_events RESTART IDENTITY CASCADE",
    ));
    await db.delete(sprints).where(eq(sprints.id, sprint.id));
  }
});

audited(5, "calcule la progression depuis les items et leurs points", async ({ page }) => {
  const release = await fixtureRelease("R09-S05 Progression");
  const todo = await fixtureTask("R09-S05 todo", { status: "todo", points: 2 });
  const doing = await fixtureTask("R09-S05 doing", { status: "in_progress", points: 3 });
  const done = await fixtureTask("R09-S05 done", { status: "done", points: 5 });
  const unknown = await fixtureTask("R09-S05 sans estimation", { status: "todo", points: null });
  for (const item of [todo, doing, done, unknown]) await assignVersions(item.id, [release.id]);

  await page.goto("/b/CASS/releases");
  const article = page.getByRole("article", { name: release.name });
  await expect(article.getByLabel("Progression de la version : 1 sur 4")).toBeVisible();
  await expect(article).toContainText("1 terminés sur 4");
  await expect(article.getByRole("link", { name: "5 points terminés" })).toHaveAttribute(
    "href",
    `/b/CASS/releases/${release.id}?scopeStatus=done&scopeEstimate=estimated`,
  );
  await expect(article.getByRole("link", { name: "10 points estimés" })).toHaveAttribute(
    "href",
    `/b/CASS/releases/${release.id}?scopeEstimate=estimated`,
  );
  await expect(article.getByRole("link", { name: "1 non estimé" })).toHaveAttribute(
    "href",
    `/b/CASS/releases/${release.id}?scopeEstimate=unestimated`,
  );
  await expect(article.getByRole("link", { name: "Terminés : 1" })).toHaveAttribute(
    "href",
    new RegExp(`version=${release.id}.*status=`),
  );
});

audited(6, "permet au spécialiste de publier en conservant les incomplets", async ({ browser, capture, audit }) => {
  const release = await fixtureRelease("R09-S06 Keep spécialiste");
  const done = await fixtureTask("R09-S06 terminé", { status: "done", points: 5 });
  const open = await fixtureTask("R09-S06 incomplet", { status: "todo", points: 3 });
  await assignVersions(done.id, [release.id]);
  await assignVersions(open.id, [release.id]);
  const specialist = await observedPage(browser, capture, "specialist", AUTH.specialist);
  audit.use(specialist);
    await specialist.goto(`/b/CASS/releases/${release.id}`);
    await specialist.getByRole("button", { name: `Publier ${release.name}` }).click();
    const dialog = specialist.getByRole("dialog", { name: `Publier ${release.name}` });
    await expect(dialog.getByLabel("Déplacer vers une autre version")).toHaveCount(0);
    await dialog.getByLabel("Date de publication").fill("2026-08-07");
    await dialog.getByLabel("Conserver dans cette version").check();
    await clickPost(specialist, () => dialog.getByRole("button", { name: "Publier", exact: true }).click());
    await expect(specialist.getByText("Publiée", { exact: true })).toBeVisible();
    expect(await assignedVersionIds(done.id)).toEqual([release.id]);
    expect(await assignedVersionIds(open.id)).toEqual([release.id]);
    const specialistId = await accountId(EMAIL.specialist);
    const [event] = await db.select({ actorId: releaseEvents.actorId, action: releaseEvents.action })
      .from(releaseEvents)
      .where(and(eq(releaseEvents.releaseId, release.id), eq(releaseEvents.action, "release_published")));
    expect(event).toEqual({ actorId: specialistId, action: "release_published" });
});

audited(7, "refuse un publish move forgé par le spécialiste", async ({ page, browser, capture, audit }) => {
  const source = await fixtureRelease("R09-S07 Source");
  const destination = await fixtureRelease("R09-S07 Destination");
  const item = await fixtureTask("R09-S07 incomplet");
  await assignVersions(item.id, [source.id]);
  await page.goto(`/b/CASS/releases/${source.id}`);
  const intercepted = await interceptNextPost(page, `/b/CASS/releases/${source.id}`, capture);
  await page.getByRole("button", { name: `Publier ${source.name}` }).click();
  const dialog = page.getByRole("dialog", { name: `Publier ${source.name}` });
  await dialog.getByLabel("Date de publication").fill("2026-08-07");
  await dialog.getByLabel("Déplacer vers une autre version").check();
  await dialog.getByLabel("Version de destination").selectOption({ label: destination.name });
  await dialog.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Publication impossible");
  const forged = intercepted();
  await page.unroute("**/*");

  const specialist = await observedPage(browser, capture, "specialist-forged", AUTH.specialist);
  audit.use(specialist);
    await specialist.goto(`/b/CASS/releases/${source.id}`);
    const response = await replayForgedRequest(specialist, forged);
    expect(response.status).toBeLessThan(500);
    expect(response.text).toContain("Modifier les éléments");
    expect(await assignedVersionIds(item.id)).toEqual([source.id]);
    const publications = await db.select({ id: releasePublications.id })
      .from(releasePublications).where(eq(releasePublications.releaseId, source.id));
    expect(publications).toEqual([]);
});

audited(8, "conserve deux snapshots après dépublication et republication", async ({ page }) => {
  const release = await fixtureRelease("R09-S08 Deux snapshots");
  const item = await fixtureTask("R09-S08 périmètre", { points: 8 });
  await assignVersions(item.id, [release.id]);
  await page.goto(`/b/CASS/releases/${release.id}`);
  await publishFromDialog(page, release.name, "keep");
  await page.getByRole("button", { name: `Annuler la publication ${release.name}` }).click();
  const unpublish = page.getByRole("dialog", { name: `Annuler la publication ${release.name}` });
  await clickPost(page, () => unpublish.getByRole("button", { name: "Confirmer l’annulation" }).click());
  await publishFromDialog(page, release.name, "keep");

  const publications = await db.select({
    id: releasePublications.id,
    sequence: releasePublications.sequence,
    unreleasedAt: releasePublications.unreleasedAt,
  }).from(releasePublications)
    .where(eq(releasePublications.releaseId, release.id))
    .orderBy(asc(releasePublications.sequence));
  expect(publications).toHaveLength(2);
  expect(publications.map((row) => row.sequence)).toEqual([1, 2]);
  expect(publications[0]?.unreleasedAt).toBeInstanceOf(Date);
  expect(publications[1]?.unreleasedAt).toBeNull();
  const snapshots = await db.select({ publicationId: releasePublicationItems.publicationId })
    .from(releasePublicationItems)
    .where(eq(releasePublicationItems.itemId, item.id));
  expect(new Set(snapshots.map((row) => row.publicationId))).toEqual(
    new Set(publications.map((row) => row.id)),
  );
  await expect(page.getByRole("region", { name: "Historique" }).getByRole("link", { name: "Voir l’instantané" }))
    .toHaveCount(3);
});

audited(9, "déplace les incomplets sans retirer leurs versions sans rapport", async ({ page }) => {
  const source = await fixtureRelease("R09-S09 Source");
  const destination = await fixtureRelease("R09-S09 Destination");
  const unrelated = await fixtureRelease("R09-S09 Sans rapport");
  const open = await fixtureTask("R09-S09 incomplet", { status: "todo" });
  const done = await fixtureTask("R09-S09 terminé", { status: "done" });
  await assignVersions(open.id, [source.id, unrelated.id]);
  await assignVersions(done.id, [source.id, unrelated.id]);

  await page.goto(`/b/CASS/releases/${source.id}`);
  await publishFromDialog(page, source.name, "move", destination.name);
  expect(await assignedVersionIds(open.id)).toEqual([destination.id, unrelated.id].sort());
  expect(await assignedVersionIds(done.id)).toEqual([source.id, unrelated.id].sort());
  const snapshot = page.getByRole("region", { name: "Instantané de publication" });
  await expect(snapshot).toContainText(`${open.key} — ${open.title}`);
  await expect(snapshot).toContainText(`Déplacée vers ${destination.name}`);
  await expect(snapshot).toContainText(`${done.key} — ${done.title}`);
  await expect(snapshot).toContainText("Conservée dans cette version");
});

audited(10, "masque une version archivée des candidats tout en gardant l’affectation courante", async ({ page }) => {
  const release = await fixtureRelease("R09-S10 Archive candidate");
  const item = await fixtureTask("R09-S10 affectation courante");
  await assignVersions(item.id, [release.id]);
  await page.goto(`/b/CASS/releases/${release.id}`);
  await page.getByRole("button", { name: `Archiver ${release.name}` }).click();
  const archive = page.getByRole("dialog", { name: `Archiver ${release.name}` });
  await clickPost(page, () => archive.getByRole("button", { name: "Confirmer l’archivage" }).click());

  await page.goto(`/b/CASS?view=list&item=${item.key}`);
  const selected = page.getByRole("list", { name: "Versions sélectionnées" });
  await expect(selected).toContainText(`${release.name} — Archivée`);
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: `${release.name} — Archivée` })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await clickPost(page, () =>
    selected.getByRole("button", { name: `Retirer ${release.name}` }).click(),
  );
  await page.reload();
  expect(await assignedVersionIds(item.id)).toEqual([]);
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: release.name, exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/b/CASS?view=list&fvcol=1");
  await page.getByRole("button", { name: "Nouvel item" }).click();
  const archivedCreate = page.getByRole("dialog", { name: "Nouvel item" });
  await archivedCreate.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: release.name, exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await selectBulkItems(page, [item]);
  const toolbar = page.getByRole("region", { name: "Actions groupées" });
  await toolbar.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: release.name, exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "+ Version" }).click();
  await expect(page.getByLabel(release.name)).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto(`/b/CASS/releases/${release.id}`);
  await page.getByRole("button", { name: `Désarchiver ${release.name}` }).click();
  const unarchive = page.getByRole("dialog", { name: `Désarchiver ${release.name}` });
  await clickPost(page, () => unarchive.getByRole("button", { name: "Confirmer le désarchivage" }).click());
  await page.goto("/b/CASS?view=list&fvcol=1");

  await page.getByRole("button", { name: "Nouvel item" }).click();
  const activeCreate = page.getByRole("dialog", { name: "Nouvel item" });
  await activeCreate.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: release.name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.goto(`/b/CASS?view=list&item=${item.key}`);
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: release.name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/b/CASS?view=list&fvcol=1");
  await selectBulkItems(page, [item]);
  await page.getByRole("region", { name: "Actions groupées" })
    .getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: release.name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "+ Version" }).click();
  await expect(page.getByLabel(release.name)).toBeVisible();
});

audited(11, "autorise l’éditeur à affecter sans exposer le cycle de vie", async ({ browser, capture, audit }) => {
  const release = await fixtureRelease("R09-S11 Assignation éditeur");
  const item = await fixtureTask("R09-S11 item éditeur");
  const editor = await observedPage(browser, capture, "editor", AUTH.editor);
  audit.use(editor);
    await editor.goto(`/b/CASS?view=list&item=${item.key}`);
    await editor.getByRole("button", { name: "Versions", exact: true }).click();
    await clickPost(editor, () => editor.getByRole("menuitemcheckbox", { name: release.name }).click());
    expect(await assignedVersionIds(item.id)).toEqual([release.id]);
    await editor.goto(`/b/CASS/releases/${release.id}`);
    await expect(editor.getByRole("button", { name: `Modifier ${release.name}` })).toHaveCount(0);
    await expect(editor.getByRole("button", { name: `Publier ${release.name}` })).toHaveCount(0);
    await expect(editor.getByRole("button", { name: `Archiver ${release.name}` })).toHaveCount(0);
    await editor.goto("/b/CASS/releases");
    await expect(editor.getByRole("button", { name: "Créer une version" })).toHaveCount(0);
});

audited(12, "refuse la requête forgée du lecteur sans changer DB ni historique", async ({ browser, capture, audit }) => {
  const release = await fixtureRelease("R09-S12 Forgée lecteur");
  const item = await fixtureTask("R09-S12 item protégé");
  const editor = await observedPage(browser, capture, "editor-capture", AUTH.editor);
  audit.use(editor);
    await editor.goto(`/b/CASS?view=list&item=${item.key}`);
    const intercepted = await interceptNextPost(editor, "/b/CASS", capture);
    await editor.getByRole("button", { name: "Versions", exact: true }).click();
    await editor.getByRole("menuitemcheckbox", { name: release.name }).click();
    await expect(editor.getByRole("alert")).toContainText("Mise à jour impossible");
    const forged = intercepted();
    await editor.unroute("**/*");
  const [activityBefore] = await db.select({ value: count() }).from(activities)
    .where(eq(activities.itemId, item.id));

  const reader = await observedPage(browser, capture, "reader-forged", AUTH.reader);
  audit.use(reader);
    await reader.goto(`/b/CASS?view=list&item=${item.key}`);
    const response = await replayForgedRequest(reader, forged!);
    expect(response.status).toBeLessThan(500);
    expect(response.text).toContain("Modifier les éléments");
    expect(await assignedVersionIds(item.id)).toEqual([]);
    const [activityAfter] = await db.select({ value: count() }).from(activities)
      .where(eq(activities.itemId, item.id));
    expect(activityAfter?.value).toBe(activityBefore?.value);
});

audited(13, "détecte une édition stale entre deux contextes", async ({ browser, capture, audit }) => {
  const release = await fixtureRelease("R09-S13 Stale");
  const first = await observedPage(browser, capture, "admin-first", AUTH.admin);
  const second = await observedPage(browser, capture, "admin-stale", AUTH.admin);
    audit.use(first);
    await Promise.all([
      first.goto(`/b/CASS/releases/${release.id}`),
      second.goto(`/b/CASS/releases/${release.id}`),
    ]);
    await first.getByRole("button", { name: `Modifier ${release.name}` }).click();
    const firstDialog = first.getByRole("dialog", { name: `Modifier ${release.name}` });
    await firstDialog.getByRole("textbox", { name: "Nom" }).fill("R09-S13 Serveur");
    await firstDialog.getByRole("textbox", { name: "Description" }).fill("R09-S13 Valeur serveur");
    await firstDialog.getByLabel("Date de début").fill("2026-08-05");
    await firstDialog.getByLabel("Date cible").fill("2026-09-05");
    await clickPost(first, () => firstDialog.getByRole("button", { name: "Enregistrer" }).click());

    audit.use(second);
    await second.getByRole("button", { name: `Modifier ${release.name}` }).click();
    const staleDialog = second.getByRole("dialog", { name: `Modifier ${release.name}` });
    await staleDialog.getByRole("textbox", { name: "Nom" }).fill("R09-S13 Saisie locale");
    await clickPost(second, () => staleDialog.getByRole("button", { name: "Enregistrer" }).click());
    await expect(staleDialog.getByRole("alert")).toContainText("a changé");
    await expect(staleDialog.getByRole("textbox", { name: "Nom" })).toHaveValue("R09-S13 Saisie locale");
    await staleDialog.getByRole("button", { name: "Recharger la version" }).click();
    await expect(staleDialog).toHaveCount(0);
    await expect(second.getByRole("button", { name: "Modifier R09-S13 Serveur" })).toBeVisible();
    await second.getByRole("button", { name: "Modifier R09-S13 Serveur" }).click();
    const freshDialog = second.getByRole("dialog", { name: "Modifier R09-S13 Serveur" });
    await expect(freshDialog.getByRole("textbox", { name: "Nom" })).toHaveValue("R09-S13 Serveur");
    await expect(freshDialog.getByRole("textbox", { name: "Description" }))
      .toHaveValue("R09-S13 Valeur serveur");
    await expect(freshDialog.getByLabel("Date de début")).toHaveValue("2026-08-05");
    await expect(freshDialog.getByLabel("Date cible")).toHaveValue("2026-09-05");
    await freshDialog.getByRole("textbox", { name: "Description" }).fill("R09-S13 Confirmée par le second");
    await clickPost(second, () => freshDialog.getByRole("button", { name: "Enregistrer" }).click());
    const [stored] = await db.select({
      name: releases.name,
      description: releases.description,
      startDate: releases.startDate,
      targetDate: releases.releaseDate,
      revision: releases.revision,
    })
      .from(releases).where(eq(releases.id, release.id));
    expect(stored).toEqual({ name: "R09-S13 Serveur", description: "R09-S13 Confirmée par le second", startDate: "2026-08-05", targetDate: "2026-09-05", revision: 3 });
});

audited(14, "garde le dialogue ouvert et rollback après publish intercepté", async ({ page, capture }) => {
  const release = await fixtureRelease("R09-S14 Rollback réseau");
  const item = await fixtureTask("R09-S14 item rollback");
  await assignVersions(item.id, [release.id]);
  await page.goto(`/b/CASS/releases/${release.id}`);
  const intercepted = await interceptNextPost(page, `/b/CASS/releases/${release.id}`, capture);
  await page.getByRole("button", { name: `Publier ${release.name}` }).click();
  const dialog = page.getByRole("dialog", { name: `Publier ${release.name}` });
  await dialog.getByLabel("Date de publication").fill("2026-08-07");
  await dialog.getByLabel("Conserver dans cette version").check();
  await dialog.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Publication impossible.");
  await expect(dialog).toBeVisible();
  intercepted();
  const publications = await db.select({ id: releasePublications.id })
    .from(releasePublications).where(eq(releasePublications.releaseId, release.id));
  expect(publications).toEqual([]);
  expect(await assignedVersionIds(item.id)).toEqual([release.id]);
  capture.console.push("[expected] POST publish interrompu volontairement; dialogue et DB conservés");
  await page.unroute("**/*");
});

audited(15, "rend la release visible au second utilisateur et isole CASS de LABS", async ({ page, browser, capture, audit }) => {
  const release = await fixtureRelease("R09-S15 Isolation CASS");
  await page.goto("/b/LABS/releases");
  await expect(page.getByText(release.name, { exact: true })).toHaveCount(0);
  await page.goto(`/b/LABS/releases/${release.id}`);
  await expect(page.getByRole("heading", { name: release.name })).toHaveCount(0);

  const reader = await observedPage(browser, capture, "reader-second-user", AUTH.reader);
  audit.use(reader);
    await reader.goto("/b/CASS/releases");
    await expect(reader.getByRole("link", { name: release.name })).toBeVisible();
    await reader.reload();
    await expect(reader.getByRole("link", { name: release.name })).toBeVisible();
    await expect(reader.getByRole("button", { name: "Créer une version" })).toHaveCount(0);
    await reader.goto("/b/LABS/releases");
    await expect(reader.getByText(release.name, { exact: true })).toHaveCount(0);
  const [labs] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "LABS"));
  if (!labs) throw new Error("Backlog LABS introuvable.");
  const rows = await db.select({ id: releases.id }).from(releases)
    .where(and(eq(releases.id, release.id), eq(releases.backlogId, labs.id)));
  expect(rows).toEqual([]);
});

audited(16, "refuse un publish quand le périmètre change entre deux contextes", async ({ page, browser, capture, audit }) => {
  const release = await fixtureRelease("R09-S16 Périmètre stale");
  const firstItem = await fixtureTask("R09-S16 premier incomplet");
  const secondItem = await fixtureTask("R09-S16 second incomplet");
  await assignVersions(firstItem.id, [release.id]);

  await page.goto(`/b/CASS/releases/${release.id}`);
  await page.getByRole("button", { name: `Publier ${release.name}` }).click();
  const staleDialog = page.getByRole("dialog", { name: `Publier ${release.name}` });
  await staleDialog.getByLabel("Date de publication").fill("2026-08-07");
  await staleDialog.getByLabel("Conserver dans cette version").check();

  const second = await observedPage(browser, capture, "admin-scope-change", AUTH.admin);
  audit.use(second);
  await second.goto(`/b/CASS?view=list&item=${firstItem.key}`);
  await second.getByRole("button", { name: "Versions", exact: true }).click();
  await clickPost(second, () =>
    second.getByRole("menuitemcheckbox", { name: release.name }).click(),
  );
  await second.goto(`/b/CASS?view=list&item=${secondItem.key}`);
  await second.getByRole("button", { name: "Versions", exact: true }).click();
  await clickPost(second, () =>
    second.getByRole("menuitemcheckbox", { name: release.name }).click(),
  );
  expect(await assignedVersionIds(firstItem.id)).toEqual([]);
  expect(await assignedVersionIds(secondItem.id)).toEqual([release.id]);

  audit.use(page);
  await clickPost(page, () =>
    staleDialog.getByRole("button", { name: "Publier", exact: true }).click(),
  );
  await expect(staleDialog.getByRole("alert")).toContainText("périmètre de publication a changé");
  await expect(staleDialog.getByLabel("Date de publication")).toHaveValue("2026-08-07");
  await expect(staleDialog.getByRole("button", { name: "Publier", exact: true })).toBeDisabled();
  await expect(
    db.select({ id: releasePublications.id }).from(releasePublications)
      .where(eq(releasePublications.releaseId, release.id)),
  ).resolves.toEqual([]);

  await page.reload();
  await publishFromDialog(page, release.name, "keep");
  await expect(page.getByText("Publiée", { exact: true })).toBeVisible();
  const snapshots = await db.select({ itemId: releasePublicationItems.itemId })
    .from(releasePublicationItems)
    .innerJoin(releasePublications, eq(releasePublications.id, releasePublicationItems.publicationId))
    .where(eq(releasePublications.releaseId, release.id));
  expect(snapshots).toEqual([{ itemId: secondItem.id }]);
});

// ── PR2 — merge, delete, manual order, release notes (JIR-39) ────────────────

async function publishKeep(releaseId: string, backlogId: string, effectiveDate = "2026-08-20") {
  const actorId = await accountId(EMAIL.admin);
  const detail = await getReleaseDetail(backlogId, releaseId);
  if (!detail) throw new Error("Release fixture introuvable.");
  return publishRelease({
    backlogId,
    releaseId,
    expectedRevision: detail.revision,
    expectedScopeRevision: detail.publicationScopeRevision,
    effectiveDate,
    incompleteDisposition: "keep",
  }, actorId, `e2e-publish-${releaseId}`);
}

async function releaseExists(releaseId: string) {
  const rows = await db.select({ id: releases.id }).from(releases).where(eq(releases.id, releaseId));
  return rows.length === 1;
}

async function openListActions(page: Page, releaseName: string) {
  const article = page.getByRole("article", { name: releaseName });
  await article.getByText(`Actions pour ${releaseName}`).click();
  return article;
}

async function articleOrder(page: Page, names: string[]) {
  const labels = await page.getByRole("article").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  );
  return labels.filter((label) => names.includes(label));
}

audited(17, "fusionne une version en dédoublonnant les liens et la retire partout", async ({ page }) => {
  const source = await fixtureRelease("R2-S17 Source");
  const target = await fixtureRelease("R2-S17 Cible");
  const onlySource = await fixtureTask("R2-S17 seulement source");
  const both = await fixtureTask("R2-S17 source et cible");
  await assignVersions(onlySource.id, [source.id]);
  await assignVersions(both.id, [source.id, target.id]);

  await page.goto("/b/CASS/releases");
  const article = await openListActions(page, source.name);
  await article.getByRole("button", { name: `Fusionner ${source.name}` }).click();
  const dialog = page.getByRole("dialog", { name: `Fusionner ${source.name}` });
  await expect(dialog).toContainText("2 éléments liés");
  await dialog.getByLabel("Version de destination").selectOption({ label: target.name });
  await clickPost(page, () => dialog.getByRole("button", { name: "Fusionner", exact: true }).click());
  await expect(page.getByRole("article", { name: source.name })).toHaveCount(0);
  await expect(page.getByRole("article", { name: target.name })).toBeVisible();

  expect(await releaseExists(source.id)).toBe(false);
  expect(await assignedVersionIds(onlySource.id)).toEqual([target.id]);
  expect(await assignedVersionIds(both.id)).toEqual([target.id]);

  await page.goto("/b/CASS?view=list");
  await page.getByRole("button", { name: "+ Version" }).click();
  await expect(page.getByLabel(target.name, { exact: true })).toBeVisible();
  await expect(page.getByLabel(source.name, { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto(`/b/CASS?view=list&item=${onlySource.key}`);
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: target.name })).toBeVisible();
  await expect(page.getByRole("menuitemcheckbox", { name: source.name })).toHaveCount(0);
});

audited(18, "fusionne une version publiée sans réécrire les snapshots ni leurs libellés", async ({ page }) => {
  const backlog = await backlogFixture();
  const actorId = await accountId(EMAIL.admin);
  const published = await fixtureRelease("R2-S18 Publiée");
  const probe = await fixtureRelease("R2-S18 Sonde");
  const target = await fixtureRelease("R2-S18 Cible");
  const delivered = await fixtureTask("R2-S18 livré", { status: "done" });
  const postponed = await fixtureTask("R2-S18 reporté");
  await assignVersions(delivered.id, [published.id]);
  await assignVersions(postponed.id, [probe.id]);
  const probeDetail = await getReleaseDetail(backlog.id, probe.id);
  const probePublication = await publishRelease({
    backlogId: backlog.id,
    releaseId: probe.id,
    expectedRevision: probeDetail!.revision,
    expectedScopeRevision: probeDetail!.publicationScopeRevision,
    effectiveDate: "2026-08-19",
    incompleteDisposition: "move",
    destinationReleaseId: published.id,
  }, actorId, "e2e-s18-probe");
  const publication = await publishKeep(published.id, backlog.id);
  const snapshotBefore = await db.select().from(releasePublicationItems)
    .where(eq(releasePublicationItems.publicationId, publication.publicationId))
    .orderBy(asc(releasePublicationItems.id));

  await page.goto(`/b/CASS/releases/${published.id}`);
  await page.getByRole("button", { name: `Fusionner ${published.name}` }).click();
  const dialog = page.getByRole("dialog", { name: `Fusionner ${published.name}` });
  await expect(dialog).toContainText("1 publication conservée");
  await dialog.getByLabel("Version de destination").selectOption({ label: target.name });
  await clickPost(page, () => dialog.getByRole("button", { name: "Fusionner", exact: true }).click());
  await expect(page).toHaveURL(/\/b\/CASS\/releases$/);

  const snapshotAfter = await db.select().from(releasePublicationItems)
    .where(eq(releasePublicationItems.publicationId, publication.publicationId))
    .orderBy(asc(releasePublicationItems.id));
  expect(snapshotAfter).toEqual(snapshotBefore);
  const [probeRow] = await db.select({
    destinationReleaseId: releasePublications.destinationReleaseId,
    destinationReleaseName: releasePublications.destinationReleaseName,
  }).from(releasePublications).where(eq(releasePublications.id, probePublication.publicationId));
  expect(probeRow).toEqual({ destinationReleaseId: null, destinationReleaseName: published.name });
  const [kept] = await db.select({ releaseId: releasePublications.releaseId, releaseName: releasePublications.releaseName })
    .from(releasePublications).where(eq(releasePublications.id, publication.publicationId));
  expect(kept).toEqual({ releaseId: null, releaseName: published.name });

  await page.goto(`/b/CASS/releases/${target.id}`);
  await expect(page.getByRole("region", { name: "Historique" }))
    .toContainText("a reçu les éléments d’une version fusionnée ou supprimée");
  expect(await assignedVersionIds(delivered.id)).toEqual([target.id]);
});

audited(19, "supprime avec transfert puis avec retrait en journalisant chaque item", async ({ page }) => {
  const transferred = await fixtureRelease("R2-S19 Transfert");
  const removed = await fixtureRelease("R2-S19 Retrait");
  const kept = await fixtureRelease("R2-S19 Gardée");
  const target = await fixtureRelease("R2-S19 Cible");
  const first = await fixtureTask("R2-S19 transféré");
  const second = await fixtureTask("R2-S19 retiré");
  await assignVersions(first.id, [transferred.id]);
  await assignVersions(second.id, [removed.id, kept.id]);

  await page.goto("/b/CASS/releases");
  const article = await openListActions(page, transferred.name);
  await article.getByRole("button", { name: `Supprimer ${transferred.name}` }).click();
  const transferDialog = page.getByRole("dialog", { name: `Supprimer ${transferred.name}` });
  await expect(transferDialog.getByRole("button", { name: "Supprimer", exact: true })).toBeDisabled();
  await transferDialog.getByLabel("Transférer vers une autre version").check();
  await transferDialog.getByLabel("Version de destination").selectOption({ label: target.name });
  await clickPost(page, () => transferDialog.getByRole("button", { name: "Supprimer", exact: true }).click());
  await expect(page.getByRole("article", { name: transferred.name })).toHaveCount(0);

  await page.goto(`/b/CASS/releases/${removed.id}`);
  await page.getByRole("button", { name: `Supprimer ${removed.name}` }).click();
  const removeDialog = page.getByRole("dialog", { name: `Supprimer ${removed.name}` });
  await removeDialog.getByLabel("Retirer la version des éléments").check();
  await clickPost(page, () => removeDialog.getByRole("button", { name: "Supprimer", exact: true }).click());
  await expect(page).toHaveURL(/\/b\/CASS\/releases$/);

  expect(await assignedVersionIds(first.id)).toEqual([target.id]);
  expect(await assignedVersionIds(second.id)).toEqual([kept.id]);
  for (const [item, expectedName] of [[first, target.name], [second, kept.name]] as const) {
    const rows = await db.select({ newValue: activities.newValue, correlation: activities.requestCorrelationId })
      .from(activities)
      .where(and(eq(activities.itemId, item.id), eq(activities.field, "fix_versions")))
      .orderBy(asc(activities.at));
    const last = rows.at(-1);
    expect(last?.newValue).toContain(expectedName);
    expect(last?.newValue).not.toContain(item === first ? transferred.name : removed.name);
    expect(last?.correlation).toBeTruthy();
  }
  await page.goto(`/b/CASS?view=list&item=${second.key}`);
  await expect(page.getByRole("button", { name: "Versions", exact: true })).toBeVisible();
  await expect(page.getByText(kept.name).first()).toBeVisible();
});

audited(20, "laisse le spécialiste fusionner et supprimer sans edit_items, comme Jira", async ({ browser, capture, audit }) => {
  const source = await fixtureRelease("R2-S20 Source spécialiste");
  const target = await fixtureRelease("R2-S20 Cible spécialiste");
  const removed = await fixtureRelease("R2-S20 Retrait spécialiste");
  const empty = await fixtureRelease("R2-S20 Vide spécialiste");
  const merged = await fixtureTask("R2-S20 fusionné");
  const detached = await fixtureTask("R2-S20 détaché");
  await assignVersions(merged.id, [source.id]);
  await assignVersions(detached.id, [removed.id]);
  const specialist = await observedPage(browser, capture, "specialist", AUTH.specialist);
  audit.use(specialist);

  await specialist.goto(`/b/CASS/releases/${source.id}`);
  await specialist.getByRole("button", { name: `Fusionner ${source.name}` }).click();
  const mergeDialog = specialist.getByRole("dialog", { name: `Fusionner ${source.name}` });
  await mergeDialog.getByLabel("Version de destination").selectOption({ label: target.name });
  await clickPost(specialist, () => mergeDialog.getByRole("button", { name: "Fusionner", exact: true }).click());
  await expect(specialist).toHaveURL(/\/b\/CASS\/releases$/);
  expect(await assignedVersionIds(merged.id)).toEqual([target.id]);

  await specialist.goto(`/b/CASS/releases/${removed.id}`);
  await specialist.getByRole("button", { name: `Supprimer ${removed.name}` }).click();
  const removeDialog = specialist.getByRole("dialog", { name: `Supprimer ${removed.name}` });
  await expect(removeDialog.getByLabel("Retirer la version des éléments")).toBeEnabled();
  await removeDialog.getByLabel("Retirer la version des éléments").check();
  await clickPost(specialist, () => removeDialog.getByRole("button", { name: "Supprimer", exact: true }).click());
  expect(await assignedVersionIds(detached.id)).toEqual([]);

  await specialist.goto(`/b/CASS/releases/${empty.id}`);
  await specialist.getByRole("button", { name: `Supprimer ${empty.name}` }).click();
  const emptyDialog = specialist.getByRole("dialog", { name: `Supprimer ${empty.name}` });
  await expect(emptyDialog).toContainText("Aucun élément lié");
  await expect(emptyDialog.getByRole("radio")).toHaveCount(0);
  await clickPost(specialist, () => emptyDialog.getByRole("button", { name: "Supprimer", exact: true }).click());
  for (const release of [source, removed, empty]) expect(await releaseExists(release.id)).toBe(false);
  const specialistId = await accountId(EMAIL.specialist);
  const [event] = await db.select({ actorId: releaseEvents.actorId })
    .from(releaseEvents)
    .where(and(eq(releaseEvents.releaseName, source.name), eq(releaseEvents.action, "release_merged")));
  expect(event).toEqual({ actorId: specialistId });
});

audited(21, "masque fusion, suppression et ordre à l’éditeur et au lecteur et refuse leurs requêtes forgées", async ({ page, browser, capture, audit }) => {
  const protectedRelease = await fixtureRelease("R2-S21 Protégée");
  const decoy = await fixtureRelease("R2-S21 Leurre");
  const item = await fixtureTask("R2-S21 item protégé");
  await assignVersions(item.id, [protectedRelease.id]);

  await page.goto(`/b/CASS/releases/${decoy.id}`);
  const intercepted = await interceptNextPost(page, `/b/CASS/releases/${decoy.id}`, capture);
  await page.getByRole("button", { name: `Supprimer ${decoy.name}` }).click();
  const dialog = page.getByRole("dialog", { name: `Supprimer ${decoy.name}` });
  await dialog.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Suppression impossible.");
  const captured = intercepted();
  await page.unroute("**/*");
  expect(await releaseExists(decoy.id)).toBe(true);

  // Capture a merge and a reorder request too: each Server Action is its own
  // authorization surface.
  const decoyTarget = await fixtureRelease("R2-S21 Leurre cible");
  await page.goto(`/b/CASS/releases/${decoy.id}`);
  const interceptedMerge = await interceptNextPost(page, `/b/CASS/releases/${decoy.id}`, capture);
  await page.getByRole("button", { name: `Fusionner ${decoy.name}` }).click();
  const mergeDialog = page.getByRole("dialog", { name: `Fusionner ${decoy.name}` });
  await mergeDialog.getByLabel("Version de destination").selectOption({ label: decoyTarget.name });
  await mergeDialog.getByRole("button", { name: "Fusionner", exact: true }).click();
  await expect(mergeDialog.getByRole("alert")).toHaveText("Fusion impossible.");
  const forgedMerge = interceptedMerge();
  await page.unroute("**/*");
  await page.goto("/b/CASS/releases");
  const interceptedReorder = await interceptNextPost(page, "/b/CASS/releases", capture);
  await page.getByRole("button", { name: `Monter ${decoyTarget.name}` }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Réordonnancement impossible.");
  const forgedReorder = interceptedReorder();
  await page.unroute("**/*");
  const decoyRevisions = await db.select({ id: releases.id, revision: releases.revision, rank: releases.rank })
    .from(releases).where(sql`${releases.id} in (${decoy.id}, ${decoyTarget.id})`).orderBy(asc(releases.id));
  const detail = await getReleaseDetail(protectedRelease.backlogId, protectedRelease.id);
  // Retarget the captured Server Action body at the protected, non-empty version.
  const forged = {
    ...captured,
    body: captured.body
      .replaceAll(decoy.id, protectedRelease.id)
      .replace(/"expectedScopeRevision":"[0-9a-f]{32}"/, `"expectedScopeRevision":"${detail!.publicationScopeRevision}"`)
      .replace(/"disposition":"none"/, '"disposition":"remove"'),
  };
  const [eventsBefore] = await db.select({ value: count() }).from(releaseEvents)
    .where(eq(releaseEvents.releaseId, protectedRelease.id));

  for (const [actor, storage] of [["editor", AUTH.editor], ["reader", AUTH.reader]] as const) {
    const other = await observedPage(browser, capture, `${actor}-forged`, storage);
    audit.use(other);
    await other.goto("/b/CASS/releases");
    await expect(other.getByRole("article", { name: protectedRelease.name })).toBeVisible();
    await expect(other.getByText(`Actions pour ${protectedRelease.name}`)).toHaveCount(0);
    await expect(other.getByRole("button", { name: `Réordonner ${protectedRelease.name}` })).toHaveCount(0);
    await expect(other.getByRole("button", { name: `Monter ${protectedRelease.name}` })).toHaveCount(0);
    await other.goto(`/b/CASS/releases/${protectedRelease.id}`);
    await expect(other.getByRole("button", { name: `Supprimer ${protectedRelease.name}` })).toHaveCount(0);
    await expect(other.getByRole("button", { name: `Fusionner ${protectedRelease.name}` })).toHaveCount(0);
    expect(forged.body).toContain(protectedRelease.id);
    expect(forged.body).toContain('"disposition":"remove"');
    const response = await replayForgedRequest(other, { ...forged, url: forged.url.replace(decoy.id, protectedRelease.id) });
    expect(response.status).toBeLessThan(500);
    expect(response.text).toContain("Gérer les releases");
    for (const replay of [forgedMerge, forgedReorder]) {
      const refused = await replayForgedRequest(other, replay);
      expect(refused.status).toBeLessThan(500);
      expect(refused.text).toContain("Gérer les releases");
    }
  }
  expect(await releaseExists(decoy.id)).toBe(true);
  await expect(
    db.select({ id: releases.id, revision: releases.revision, rank: releases.rank })
      .from(releases).where(sql`${releases.id} in (${decoy.id}, ${decoyTarget.id})`).orderBy(asc(releases.id)),
  ).resolves.toEqual(decoyRevisions);
  expect(await releaseExists(protectedRelease.id)).toBe(true);
  expect(await assignedVersionIds(item.id)).toEqual([protectedRelease.id]);
  const [eventsAfter] = await db.select({ value: count() }).from(releaseEvents)
    .where(eq(releaseEvents.releaseId, protectedRelease.id));
  expect(eventsAfter?.value).toBe(eventsBefore?.value);
});

audited(22, "refuse une suppression dont l’aperçu d’impact est devenu stale", async ({ page }) => {
  const release = await fixtureRelease("R2-S22 Impact stale");
  const first = await fixtureTask("R2-S22 premier");
  const second = await fixtureTask("R2-S22 ajouté ensuite");
  await assignVersions(first.id, [release.id]);

  await page.goto(`/b/CASS/releases/${release.id}`);
  await page.getByRole("button", { name: `Supprimer ${release.name}` }).click();
  const dialog = page.getByRole("dialog", { name: `Supprimer ${release.name}` });
  await expect(dialog).toContainText("1 élément lié");
  await dialog.getByLabel("Retirer la version des éléments").check();
  await assignVersions(second.id, [release.id]);
  await clickPost(page, () => dialog.getByRole("button", { name: "Supprimer", exact: true }).click());
  await expect(dialog.getByRole("alert")).toContainText("ont changé");
  await expect(dialog.getByRole("button", { name: "Supprimer", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Examiner l’impact actualisé" }).click();
  await expect(dialog).toContainText("2 éléments liés");
  expect(await releaseExists(release.id)).toBe(true);
  expect(await assignedVersionIds(first.id)).toEqual([release.id]);
  expect(await assignedVersionIds(second.id)).toEqual([release.id]);
});

audited(23, "garde le dialogue et la sélection après une suppression interceptée", async ({ page, capture }) => {
  const release = await fixtureRelease("R2-S23 Panne réseau");
  const target = await fixtureRelease("R2-S23 Destination");
  const item = await fixtureTask("R2-S23 item");
  await assignVersions(item.id, [release.id]);
  await page.goto(`/b/CASS/releases/${release.id}`);
  const intercepted = await interceptNextPost(page, `/b/CASS/releases/${release.id}`, capture);
  await page.getByRole("button", { name: `Supprimer ${release.name}` }).click();
  const dialog = page.getByRole("dialog", { name: `Supprimer ${release.name}` });
  await dialog.getByLabel("Transférer vers une autre version").check();
  await dialog.getByLabel("Version de destination").selectOption({ label: target.name });
  await dialog.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Suppression impossible.");
  await expect(dialog.getByLabel("Transférer vers une autre version")).toBeChecked();
  await expect(dialog.getByLabel("Version de destination")).toHaveValue(target.id);
  intercepted();
  capture.console.push("[expected] POST suppression interrompu volontairement; dialogue et DB conservés");
  await page.unroute("**/*");
  expect(await releaseExists(release.id)).toBe(true);
  expect(await assignedVersionIds(item.id)).toEqual([release.id]);
});

audited(24, "réordonne par glisser-déposer puis Monter, partout et pour un second utilisateur", async ({ page, browser, capture, audit }) => {
  const x = await fixtureRelease("R2-S24 X");
  const y = await fixtureRelease("R2-S24 Y");
  const z = await fixtureRelease("R2-S24 Z");
  const item = await fixtureTask("R2-S24 item");
  const assigned = await fixtureTask("R2-S24 item affecté");
  await assignVersions(assigned.id, [x.id]);
  const names = [x.name, y.name, z.name];

  await page.goto("/b/CASS/releases");
  await expect.poll(() => articleOrder(page, names)).toEqual([x.name, y.name, z.name]);
  const handle = page.getByRole("button", { name: `Réordonner ${z.name}` });
  const dropTarget = page.getByRole("article", { name: x.name });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await dropTarget.boundingBox();
  if (!from || !to) throw new Error("Positions de glisser-déposer introuvables.");
  await clickPost(page, async () => {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + 5, { steps: 20 });
    await page.mouse.up();
  });
  await expect.poll(() => articleOrder(page, names)).toEqual([z.name, x.name, y.name]);

  await clickPost(page, () => page.getByRole("button", { name: `Monter ${y.name}` }).click());
  await expect.poll(() => articleOrder(page, names)).toEqual([z.name, y.name, x.name]);
  await page.reload();
  await expect.poll(() => articleOrder(page, names)).toEqual([z.name, y.name, x.name]);

  await page.goto("/b/CASS?view=list");
  await page.getByRole("button", { name: "+ Version" }).click();
  await expect(page.getByLabel(z.name, { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const labels = await page.getByRole("checkbox").evaluateAll((nodes) =>
      nodes.map((node) => node.closest("label")?.textContent?.trim() ?? node.getAttribute("aria-label") ?? ""),
    );
    return labels.map((label) => names.find((name) => label.includes(name))).filter(Boolean);
  }).toEqual([z.name, y.name, x.name]);
  await page.keyboard.press("Escape");
  await page.goto(`/b/CASS?view=list&item=${item.key}`);
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: z.name })).toBeVisible();
  await expect.poll(async () => {
    const labels = await page.getByRole("menuitemcheckbox").evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ""),
    );
    return labels.map((label) => names.find((name) => label.includes(name))).filter(Boolean);
  }).toEqual([z.name, y.name, x.name]);
  // An item already on the last version (X) still lists options in manual order.
  await page.keyboard.press("Escape");
  await page.goto(`/b/CASS?view=list&item=${assigned.key}`);
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: z.name })).toBeVisible();
  await expect.poll(async () => {
    const labels = await page.getByRole("menuitemcheckbox").evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ""),
    );
    return labels.map((label) => names.find((name) => label.includes(name))).filter(Boolean);
  }).toEqual([z.name, y.name, x.name]);

  const reader = await observedPage(browser, capture, "reader-order", AUTH.reader);
  audit.use(reader);
  await reader.goto("/b/CASS/releases");
  await expect.poll(() => articleOrder(reader, names)).toEqual([z.name, y.name, x.name]);
});

audited(25, "génère les notes depuis l’état courant, publiée ou non", async ({ page }) => {
  const backlog = await backlogFixture();
  const actorId = await accountId(EMAIL.admin);
  const published = await fixtureRelease("R2-S25 Publiée");
  const draft = await fixtureRelease("R2-S25 Brouillon");
  const feature = await fixtureTask("R2-S25 fonctionnalité", { status: "done" });
  const bug = await fixtureTask("R2-S25 correction", { status: "done", kind: "bug" });
  const open = await fixtureTask("R2-S25 en cours", { status: "in_progress" });
  await assignVersions(feature.id, [published.id]);
  await assignVersions(bug.id, [published.id]);
  await assignVersions(open.id, [draft.id]);
  await publishKeep(published.id, backlog.id);

  await page.goto(`/b/CASS/releases/${published.id}`);
  await page.getByRole("link", { name: "Notes de release" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/CASS/releases/${published.id}/notes$`));
  const textarea = page.getByRole("textbox", { name: "Notes de release (Markdown)" });
  await expect(textarea).toHaveValue(new RegExp(`## Fonctionnalités\\n\\n- ${feature.key} — R2-S25 fonctionnalité`));
  await expect(textarea).toHaveValue(new RegExp(`## Corrections\\n\\n- ${bug.key} — R2-S25 correction`));
  await expect(textarea).toHaveValue(/Publiée le 20 août 2026\./);

  await updateItem({ id: feature.id, title: "R2-S25 fonctionnalité renommée" }, actorId, "e2e-s25-rename");
  await page.reload();
  await expect(textarea).toHaveValue(new RegExp(`- ${feature.key} — R2-S25 fonctionnalité renommée`));

  await page.goto(`/b/CASS/releases/${draft.id}/notes`);
  await expect(textarea).toHaveValue(/Aucun élément terminé dans cette version\./);
  await page.getByLabel("Inclure les éléments non terminés").click();
  await expect(page).toHaveURL(/incomplete=1/);
  await expect(page.getByLabel("Inclure les éléments non terminés")).toBeChecked();
  await expect(textarea).toHaveValue(new RegExp(`## Non terminés\\n\\n- ${open.key} — R2-S25 en cours`));
  await updateItem({ id: open.id, statusId: backlog.status("done") }, actorId, "e2e-s25-done");
  await page.reload();
  await expect(textarea).toHaveValue(new RegExp(`## Fonctionnalités\\n\\n- ${open.key} — R2-S25 en cours`));
});

audited(26, "édite les notes puis copie et télécharge Markdown et HTML sans HTML brut", async ({ page }) => {
  const release = await fixtureRelease("R2-S26 Export");
  const item = await fixtureTask("R2-S26 livré", { status: "done" });
  await assignVersions(item.id, [release.id]);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/b/CASS/releases/${release.id}/notes`);
  const textarea = page.getByRole("textbox", { name: "Notes de release (Markdown)" });
  await expect(textarea).toHaveValue(new RegExp(`- ${item.key} — R2-S26 livré`));
  await textarea.press("ControlOrMeta+End");
  await textarea.pressSequentially("\n- Ajout manuel\n\n<img src=x onerror=alert(1)>");
  const preview = page.getByRole("region", { name: "Aperçu" });
  await expect(preview.getByText("Ajout manuel")).toBeVisible();
  await expect(preview.locator("img")).toHaveCount(0);
  await expect(preview).toContainText("<img src=x onerror=alert(1)>");

  await page.getByRole("button", { name: "Copier le Markdown" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Markdown copié.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("- Ajout manuel");
  await page.getByRole("button", { name: "Copier le HTML" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("HTML copié.");
  const copiedHtml = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedHtml).toContain("<li>Ajout manuel</li>");
  expect(copiedHtml).not.toContain("<img");

  const [markdownDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger .md" }).click(),
  ]);
  expect(markdownDownload.suggestedFilename()).toBe("notes-de-release-r2-s26-export.md");
  const { readFile } = await import("node:fs/promises");
  expect(await readFile((await markdownDownload.path())!, "utf8")).toContain("- Ajout manuel");
  const [htmlDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger .html" }).click(),
  ]);
  expect(htmlDownload.suggestedFilename()).toBe("notes-de-release-r2-s26-export.html");
  const html = await readFile((await htmlDownload.path())!, "utf8");
  expect(html).toMatch(/^<!doctype html>/);
  expect(html).toContain('<meta charset="utf-8">');
  expect(html).toContain("<li>Ajout manuel</li>");
  expect(html).not.toContain("<img");
});

audited(27, "ignore une version supprimée dans l’URL et la vue enregistrée, et reste responsive", async ({ page }) => {
  const backlog = await backlogFixture();
  const actorId = await accountId(EMAIL.admin);
  const deleted = await fixtureRelease("R2-S27 Supprimée");
  const item = await fixtureTask("R2-S27 item filtré");
  const unrelated = await fixtureTask("R2-S27 item sans version");
  await assignVersions(item.id, [deleted.id]);
  const [view] = await db.insert(views).values({
    name: "R2-S27 Vue version supprimée",
    ownerId: actorId,
    backlogId: backlog.id,
    displayMode: "list",
    filters: { releaseIds: [deleted.id] },
  }).returning({ id: views.id });
  const detail = await getReleaseDetail(backlog.id, deleted.id);
  await deleteRelease({
    backlogId: backlog.id,
    releaseId: deleted.id,
    expectedRevision: detail!.revision,
    expectedScopeRevision: detail!.publicationScopeRevision,
    fixVersions: { disposition: "remove" },
  }, actorId, "e2e-s27-delete");

  for (const url of [
    `/b/CASS?view=list&version=${deleted.id}`,
    `/b/CASS?view=list&version=${deleted.id}&v=${view!.id}`,
  ]) {
    await page.goto(url);
    await expect(page.getByText(item.key, { exact: true })).toBeVisible();
    await expect(page.getByText(unrelated.key, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(deleted.name) })).toHaveCount(0);
  }
  const [stored] = await db.select({ filters: views.filters }).from(views).where(eq(views.id, view!.id));
  expect(stored?.filters).toEqual({ releaseIds: [deleted.id] });

  const target = await fixtureRelease("R2-S27 Responsive");
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/b/CASS/releases", `/b/CASS/releases/${target.id}/notes`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} à ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});
