import "dotenv/config";

import {
  expect,
  test,
  type Browser,
  type Page,
} from "@playwright/test";
import { and, asc, count, eq } from "drizzle-orm";
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
  statuses,
  views,
} from "../lib/db/schema/domain";
import { changeItemFixVersions } from "../lib/services/item-fix-versions";
import { createItem, updateItem } from "../lib/services/items";
import { createRelease } from "../lib/services/releases";
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
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  httpErrors: string[];
  expectedRequestFailures: string[];
  expectedHttpErrors: string[];
  expectedConsoleErrors: string[];
};

type ForgedRequest = {
  url: string;
  body: string;
  headers: Record<string, string>;
};

function newCapture(): Capture {
  return {
    console: [],
    network: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    httpErrors: [],
    expectedRequestFailures: [],
    expectedHttpErrors: [],
    expectedConsoleErrors: [],
  };
}

function observe(page: Page, capture: Capture, actor: string) {
  page.on("console", (message) => {
    const line = `[${actor}] ${message.type()}: ${message.text()}`;
    capture.console.push(line);
    if (message.type() === "error") capture.consoleErrors.push(line);
  });
  page.on("pageerror", (error) => {
    const line = `[${actor}] pageerror: ${error.message}`;
    capture.console.push(line);
    capture.pageErrors.push(line);
  });
  page.on("request", (request) => {
    capture.network.push(`[request] [${actor}] ${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    const line = `[response] [${actor}] ${response.request().method()} ${response.status()} ${response.url()}`;
    capture.network.push(line);
    if (response.status() >= 400) capture.httpErrors.push(line);
  });
  page.on("requestfailed", (request) => {
    const line = `[failed] [${actor}] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`;
    capture.network.push(line);
    capture.requestFailures.push(line);
  });
}

function withoutExpected(lines: string[], expectedFragments: string[]) {
  const remaining = [...expectedFragments];
  return lines.filter((line) => {
    const index = remaining.findIndex((fragment) => line.includes(fragment));
    if (index < 0) return true;
    remaining.splice(index, 1);
    return false;
  });
}

function audited(
  number: number,
  title: string,
  body: (fixtures: { page: Page; browser: Browser; capture: Capture }) => Promise<void>,
) {
  test(`${String(number).padStart(2, "0")} — ${title}`, async ({ page, browser }) => {
    const startedAt = performance.now();
    const capture = newCapture();
    observe(page, capture, "admin");
    let bodyFailure: unknown;
    try {
      await body({ page, browser, capture });
    } catch (error) {
      bodyFailure = error;
      const bugId = `BUG-JIR-${String(27 + number).padStart(3, "0")}`;
      capture.console.push(`[defect] ${bugId} ${error instanceof Error ? error.message : String(error)}`);
      if (!page.isClosed()) {
        await writeAuditScreenshot(
          `audit/screenshots/${bugId}-releases-s${String(number).padStart(2, "0")}.png`,
          (path) => page.screenshot({ path, fullPage: true, caret: "initial" }),
        );
      }
      throw error;
    } finally {
      capture.console.push(`[duration] scenario ${number}: ${Math.round(performance.now() - startedAt)}ms`);
      await writeAuditText(
        `audit/console/releases-s${String(number).padStart(2, "0")}.log`,
        `${capture.console.join("\n")}\n`,
      );
      await writeAuditText(
        `audit/network/releases-s${String(number).padStart(2, "0")}.log`,
        `${capture.network.join("\n")}\n`,
      );
      if (!bodyFailure) {
        const unexpectedRequestFailures = withoutExpected(
          capture.requestFailures,
          capture.expectedRequestFailures,
        );
        const unexpectedHttpErrors = withoutExpected(
          capture.httpErrors,
          capture.expectedHttpErrors,
        );
        const unexpectedConsoleErrors = withoutExpected(
          capture.consoleErrors,
          capture.expectedConsoleErrors,
        );
        expect(unexpectedConsoleErrors).toEqual([]);
        expect(capture.pageErrors).toEqual([]);
        expect(unexpectedRequestFailures).toEqual([]);
        expect(unexpectedHttpErrors).toEqual([]);
      }
    }
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
  input: { status?: "todo" | "in_progress" | "done"; points?: number | null } = {},
) {
  const backlog = await backlogFixture();
  const actorId = await accountId(EMAIL.admin);
  const created = await createItem({
    backlogId: backlog.id,
    type: "tache",
    parentId: backlog.epicId,
    title,
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
  const name = "R09-S01 Création";
  await page.goto("/b/CASS/releases");
  await page.getByRole("button", { name: "Créer une version" }).click();
  const create = page.getByRole("dialog", { name: "Créer une version" });
  await create.getByRole("textbox", { name: "Nom" }).fill(name);
  await create.getByRole("textbox", { name: "Description" }).fill("Description initiale");
  await create.getByLabel("Date de début").fill("2026-08-10");
  await create.getByLabel("Date cible").fill("2026-08-20");
  await clickPost(page, () => create.getByRole("button", { name: "Créer", exact: true }).click());
  const article = page.getByRole("article", { name });
  await expect(article).toBeVisible();
  await article.getByRole("button", { name: `Modifier ${name}` }).click();
  const edit = page.getByRole("dialog", { name: `Modifier ${name}` });
  await edit.getByRole("textbox", { name: "Nom" }).fill("R09-S01 Modifiée");
  await edit.getByRole("textbox", { name: "Description" }).fill("Description finale");
  await clickPost(page, () => edit.getByRole("button", { name: "Enregistrer" }).click());
  await expect(page.getByRole("article", { name: "R09-S01 Modifiée" })).toBeVisible();
  const stored = await db.select({
    name: releases.name,
    description: releases.description,
    revision: releases.revision,
  })
    .from(releases).where(eq(releases.name, "R09-S01 Modifiée"));
  expect(stored).toEqual([{
    name: "R09-S01 Modifiée",
    description: "Description finale",
    revision: 2,
  }]);
});

audited(2, "affiche un item lié à plusieurs versions sur les détails", async ({ page }) => {
  const first = await fixtureRelease("R09-S02 Alpha");
  const second = await fixtureRelease("R09-S02 Beta");
  const item = await fixtureTask("R09-S02 multi-version", { points: 3 });
  await assignVersions(item.id, [first.id, second.id]);

  await page.goto(`/b/CASS?view=list&item=${item.key}`);
  const selected = page.getByRole("list", { name: "Versions sélectionnées" });
  await expect(selected).toContainText(first.name);
  await expect(selected).toContainText(second.name);
  await page.goto(`/b/CASS/releases/${first.id}`);
  await expect(page.getByRole("region", { name: "Périmètre actuel" })).toContainText(item.key);
  await page.goto(`/b/CASS/releases/${second.id}`);
  await expect(page.getByRole("region", { name: "Périmètre actuel" })).toContainText(item.key);
});

audited(3, "ajoute, remplace et retire des versions en masse", async ({ browser, capture }) => {
  const first = await fixtureRelease("R09-S03 Ajouter");
  const second = await fixtureRelease("R09-S03 Remplacer");
  const one = await fixtureTask("R09-S03 bulk un");
  const two = await fixtureTask("R09-S03 bulk deux");
  const editorContext = await browser.newContext({ storageState: AUTH.editor });
  const editor = await editorContext.newPage();
  observe(editor, capture, "editor");
  try {
    await editor.goto("/b/CASS?view=list");
    await editor.getByRole("checkbox", { name: `Sélectionner ${one.key}` }).check();
    await editor.getByRole("checkbox", { name: `Sélectionner ${two.key}` }).check();
    const toolbar = editor.getByRole("region", { name: "Actions groupées" });
    await toolbar.getByRole("button", { name: "Versions", exact: true }).click();
    await editor.getByRole("menuitemcheckbox", { name: first.name }).click();
    await toolbar.getByRole("button", { name: "Appliquer les versions" }).click();
    await clickPost(editor, () => editor.getByRole("menuitem", { name: "Ajouter aux versions" }).click());
    expect(await assignedVersionIds(one.id)).toEqual([first.id]);
    expect(await assignedVersionIds(two.id)).toEqual([first.id]);

    await toolbar.getByRole("button", { name: "Versions", exact: true }).click();
    await editor.getByRole("menuitemcheckbox", { name: first.name }).click();
    await editor.getByRole("menuitemcheckbox", { name: second.name }).click();
    await toolbar.getByRole("button", { name: "Appliquer les versions" }).click();
    await clickPost(editor, () => editor.getByRole("menuitem", { name: "Remplacer les versions" }).click());
    expect(await assignedVersionIds(one.id)).toEqual([second.id]);
    expect(await assignedVersionIds(two.id)).toEqual([second.id]);

    await toolbar.getByRole("button", { name: "Appliquer les versions" }).click();
    await clickPost(editor, () => editor.getByRole("menuitem", { name: "Retirer des versions" }).click());
    expect(await assignedVersionIds(one.id)).toEqual([]);
    expect(await assignedVersionIds(two.id)).toEqual([]);
  } finally {
    await editorContext.close();
  }
});

audited(4, "conserve le filtre Version après reload et dans une vue enregistrée", async ({ page }) => {
  const release = await fixtureRelease("R09-S04 Filtrée");
  const matching = await fixtureTask("R09-S04 visible");
  const hidden = await fixtureTask("R09-S04 masquée");
  await assignVersions(matching.id, [release.id]);

  await page.goto("/b/CASS?view=list");
  await page.getByRole("button", { name: "+ Version" }).click();
  await page.getByLabel(release.name).click();
  await expect(page).toHaveURL(new RegExp(`version=${release.id}`));
  await expect(page.getByText(matching.key, { exact: true })).toBeVisible();
  await expect(page.getByText(hidden.key, { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: new RegExp(`Version.*${release.name}`) })).toBeVisible();

  await page.getByRole("button", { name: "Enregistrer la vue" }).click();
  await page.getByRole("menuitem", { name: "Enregistrer sous…" }).click();
  const dialog = page.getByRole("dialog", { name: "Enregistrer la vue" });
  await dialog.getByRole("textbox", { name: "Nom de la vue" }).fill("R09-S04 Vue version");
  await clickPost(page, () => dialog.getByRole("button", { name: "Enregistrer" }).click());
  await expect(page.getByRole("button", { name: /R09-S04 Vue version/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText(matching.key, { exact: true })).toBeVisible();
  const [stored] = await db.select({ filters: views.filters }).from(views)
    .where(eq(views.name, "R09-S04 Vue version"));
  expect(stored?.filters).toMatchObject({ releaseIds: [release.id] });
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
  await expect(article).toContainText("5 / 10 points");
  await expect(article).toContainText("1 non estimé");
  await expect(article.getByRole("link", { name: "Terminés : 1" })).toHaveAttribute(
    "href",
    new RegExp(`version=${release.id}.*status=`),
  );
});

audited(6, "permet au spécialiste de publier en conservant les incomplets", async ({ browser, capture }) => {
  const release = await fixtureRelease("R09-S06 Keep spécialiste");
  const done = await fixtureTask("R09-S06 terminé", { status: "done", points: 5 });
  const open = await fixtureTask("R09-S06 incomplet", { status: "todo", points: 3 });
  await assignVersions(done.id, [release.id]);
  await assignVersions(open.id, [release.id]);
  const context = await browser.newContext({ storageState: AUTH.specialist });
  const specialist = await context.newPage();
  observe(specialist, capture, "specialist");
  try {
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
  } finally {
    await context.close();
  }
});

audited(7, "refuse un publish move forgé par le spécialiste", async ({ page, browser, capture }) => {
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

  const context = await browser.newContext({ storageState: AUTH.specialist });
  const specialist = await context.newPage();
  observe(specialist, capture, "specialist-forged");
  try {
    await specialist.goto(`/b/CASS/releases/${source.id}`);
    const response = await replayForgedRequest(specialist, forged);
    expect(response.status).toBeLessThan(500);
    expect(response.text).toContain("Modifier les éléments");
    expect(await assignedVersionIds(item.id)).toEqual([source.id]);
    const publications = await db.select({ id: releasePublications.id })
      .from(releasePublications).where(eq(releasePublications.releaseId, source.id));
    expect(publications).toEqual([]);
  } finally {
    await context.close();
  }
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
    supersededAt: releasePublications.supersededAt,
  }).from(releasePublications)
    .where(eq(releasePublications.releaseId, release.id))
    .orderBy(asc(releasePublications.sequence));
  expect(publications).toHaveLength(2);
  expect(publications.map((row) => row.sequence)).toEqual([1, 2]);
  expect(publications[0]?.supersededAt).toBeInstanceOf(Date);
  expect(publications[1]?.supersededAt).toBeNull();
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
  await page.goto("/b/CASS?view=list");
  await page.getByRole("button", { name: "+ Version" }).click();
  await expect(page.getByLabel(release.name)).toHaveCount(0);

  await page.goto(`/b/CASS/releases/${release.id}`);
  await page.getByRole("button", { name: `Désarchiver ${release.name}` }).click();
  const unarchive = page.getByRole("dialog", { name: `Désarchiver ${release.name}` });
  await clickPost(page, () => unarchive.getByRole("button", { name: "Confirmer le désarchivage" }).click());
  await page.goto("/b/CASS?view=list");
  await page.getByRole("button", { name: "+ Version" }).click();
  await expect(page.getByLabel(release.name)).toBeVisible();
});

audited(11, "autorise l’éditeur à affecter sans exposer le cycle de vie", async ({ browser, capture }) => {
  const release = await fixtureRelease("R09-S11 Assignation éditeur");
  const item = await fixtureTask("R09-S11 item éditeur");
  const context = await browser.newContext({ storageState: AUTH.editor });
  const editor = await context.newPage();
  observe(editor, capture, "editor");
  try {
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
  } finally {
    await context.close();
  }
});

audited(12, "refuse la requête forgée du lecteur sans changer DB ni historique", async ({ browser, capture }) => {
  const release = await fixtureRelease("R09-S12 Forgée lecteur");
  const item = await fixtureTask("R09-S12 item protégé");
  const editorContext = await browser.newContext({ storageState: AUTH.editor });
  const editor = await editorContext.newPage();
  observe(editor, capture, "editor-capture");
  let forged: ForgedRequest;
  try {
    await editor.goto(`/b/CASS?view=list&item=${item.key}`);
    const intercepted = await interceptNextPost(editor, "/b/CASS", capture);
    await editor.getByRole("button", { name: "Versions", exact: true }).click();
    await editor.getByRole("menuitemcheckbox", { name: release.name }).click();
    await expect(editor.getByRole("alert")).toContainText("Mise à jour impossible");
    forged = intercepted();
    await editor.unroute("**/*");
  } finally {
    await editorContext.close();
  }
  const [activityBefore] = await db.select({ value: count() }).from(activities)
    .where(eq(activities.itemId, item.id));

  const readerContext = await browser.newContext({ storageState: AUTH.reader });
  const reader = await readerContext.newPage();
  observe(reader, capture, "reader-forged");
  try {
    await reader.goto(`/b/CASS?view=list&item=${item.key}`);
    const response = await replayForgedRequest(reader, forged!);
    expect(response.status).toBeLessThan(500);
    expect(response.text).toContain("Modifier les éléments");
    expect(await assignedVersionIds(item.id)).toEqual([]);
    const [activityAfter] = await db.select({ value: count() }).from(activities)
      .where(eq(activities.itemId, item.id));
    expect(activityAfter?.value).toBe(activityBefore?.value);
  } finally {
    await readerContext.close();
  }
});

audited(13, "détecte une édition stale entre deux contextes", async ({ browser, capture }) => {
  const release = await fixtureRelease("R09-S13 Stale");
  const firstContext = await browser.newContext({ storageState: AUTH.admin });
  const secondContext = await browser.newContext({ storageState: AUTH.admin });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  observe(first, capture, "admin-first");
  observe(second, capture, "admin-stale");
  try {
    await Promise.all([
      first.goto(`/b/CASS/releases/${release.id}`),
      second.goto(`/b/CASS/releases/${release.id}`),
    ]);
    await first.getByRole("button", { name: `Modifier ${release.name}` }).click();
    const firstDialog = first.getByRole("dialog", { name: `Modifier ${release.name}` });
    await firstDialog.getByRole("textbox", { name: "Nom" }).fill("R09-S13 Serveur");
    await clickPost(first, () => firstDialog.getByRole("button", { name: "Enregistrer" }).click());

    await second.getByRole("button", { name: `Modifier ${release.name}` }).click();
    const staleDialog = second.getByRole("dialog", { name: `Modifier ${release.name}` });
    await staleDialog.getByRole("textbox", { name: "Nom" }).fill("R09-S13 Saisie locale");
    await clickPost(second, () => staleDialog.getByRole("button", { name: "Enregistrer" }).click());
    await expect(staleDialog.getByRole("alert")).toContainText("a changé");
    await expect(staleDialog.getByRole("textbox", { name: "Nom" })).toHaveValue("R09-S13 Saisie locale");
    await expect(staleDialog.getByRole("button", { name: "Recharger la version" })).toBeVisible();
    const [stored] = await db.select({ name: releases.name, revision: releases.revision })
      .from(releases).where(eq(releases.id, release.id));
    expect(stored).toEqual({ name: "R09-S13 Serveur", revision: 2 });
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
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

audited(15, "rend la release visible au second utilisateur et isole CASS de LABS", async ({ page, browser, capture }) => {
  const release = await fixtureRelease("R09-S15 Isolation CASS");
  await page.goto("/b/LABS/releases");
  await expect(page.getByText(release.name, { exact: true })).toHaveCount(0);
  await page.goto(`/b/LABS/releases/${release.id}`);
  await expect(page.getByRole("heading", { name: release.name })).toHaveCount(0);

  const readerContext = await browser.newContext({ storageState: AUTH.reader });
  const reader = await readerContext.newPage();
  observe(reader, capture, "reader-second-user");
  try {
    await reader.goto("/b/CASS/releases");
    await expect(reader.getByRole("link", { name: release.name })).toBeVisible();
    await reader.reload();
    await expect(reader.getByRole("link", { name: release.name })).toBeVisible();
    await expect(reader.getByRole("button", { name: "Créer une version" })).toHaveCount(0);
    await reader.goto("/b/LABS/releases");
    await expect(reader.getByText(release.name, { exact: true })).toHaveCount(0);
  } finally {
    await readerContext.close();
  }
  const [labs] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "LABS"));
  if (!labs) throw new Error("Backlog LABS introuvable.");
  const rows = await db.select({ id: releases.id }).from(releases)
    .where(and(eq(releases.id, release.id), eq(releases.backlogId, labs.id)));
  expect(rows).toEqual([]);
});
