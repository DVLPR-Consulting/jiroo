import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Browser, type Page, type Request } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  items,
  notifications,
  permissionSchemes,
  securityAuditEvents,
} from "../lib/db/schema/domain";
import {
  addSchemeGrant,
  removeSchemeGrant,
} from "../lib/services/authorization-admin";

const AUTH = {
  admin: ".playwright/.auth/platform-admin.json",
  member: ".playwright/.auth/member.json",
  specialist: ".playwright/.auth/specialist.json",
  reader: ".playwright/.auth/reader.json",
  noAccess: ".playwright/.auth/no-access.json",
} as const;

type AuditCapture = {
  consoleLines: string[];
  consoleErrors: string[];
  networkLines: string[];
  requestFailures: string[];
  httpErrors: string[];
  expectedHttp: Array<(status: number, url: URL) => boolean>;
};

function observe(page: Page, label: string): AuditCapture {
  const capture: AuditCapture = {
    consoleLines: [`[scenario] ${label}`],
    consoleErrors: [],
    networkLines: [`[scenario] ${label}`],
    requestFailures: [],
    httpErrors: [],
    expectedHttp: [],
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
    const status = response.status();
    const url = new URL(response.url());
    const expected = capture.expectedHttp.some((predicate) => predicate(status, url));
    const line = `${expected ? "EXPECTED " : ""}${status} ${response.request().method()} ${response.url()}`;
    capture.networkLines.push(line);
    if (status >= 400 && !expected) capture.httpErrors.push(line);
  });
  return capture;
}

async function timed<T>(capture: AuditCapture, label: string, operation: () => Promise<T>) {
  const startedAt = performance.now();
  const result = await operation();
  capture.networkLines.push(`[timing] ${label} ${Math.round(performance.now() - startedAt)}ms`);
  return result;
}

async function persistAudit(slug: string, captures: AuditCapture[]) {
  await mkdir("audit/console", { recursive: true });
  await mkdir("audit/network", { recursive: true });
  const consoleLines = captures.flatMap((capture) => capture.consoleLines);
  const networkLines = captures.flatMap((capture) => capture.networkLines);
  await writeFile(
    `audit/console/2026-08-06-permission-schemes-${slug}-console.log`,
    `${consoleLines.join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    `audit/network/2026-08-06-permission-schemes-${slug}-network.log`,
    `${networkLines.join("\n")}\n`,
    "utf8",
  );
  expect(captures.flatMap((capture) => capture.consoleErrors), "Erreurs JavaScript/console").toEqual([]);
  expect(captures.flatMap((capture) => capture.requestFailures), "Requêtes réseau échouées").toEqual([]);
  expect(captures.flatMap((capture) => capture.httpErrors), "Réponses HTTP 4xx/5xx inattendues").toEqual([]);
}

function audited(
  title: string,
  slug: string,
  body: (fixtures: { page: Page; browser: Browser; captures: AuditCapture[] }) => Promise<void>,
) {
  test(title, async ({ page, browser }) => {
    const captures: AuditCapture[] = [];
    try {
      await body({ page, browser, captures });
      captures[0]?.consoleLines.push("[result] scénario validé");
    } finally {
      await persistAudit(slug, captures);
    }
  });
}

async function fixtureIds() {
  const [cass] = await db.select({ id: backlogPermissionConfigs.backlogId, schemeId: backlogPermissionConfigs.permissionSchemeId })
    .from(backlogPermissionConfigs)
    .innerJoin(permissionSchemes, eq(backlogPermissionConfigs.permissionSchemeId, permissionSchemes.id))
    .where(eq(permissionSchemes.key, "e2e-shared-permission-scheme"));
  const [noAccess] = await db.select({ id: user.id }).from(user).where(eq(user.email, "no-access@jiroo.local"));
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, "platform-admin@jiroo.local"));
  if (!cass || !noAccess || !admin) throw new Error("Fixtures de permissions Playwright introuvables.");
  return { cassBacklogId: cass.id, schemeId: cass.schemeId, noAccessId: noAccess.id, adminId: admin.id };
}

async function selectHelper(page: Page, userLabel: string, permissionLabel: string) {
  await page.getByRole("combobox", { name: "Utilisateur à vérifier" }).selectOption({ label: userLabel });
  await page.getByRole("combobox", { name: "Permission à vérifier" }).selectOption({ label: permissionLabel });
  await page.getByRole("button", { name: "Vérifier la permission" }).click();
  await expect(page.getByRole("heading", { name: /^(Autorisé|Refusé)$/ })).toBeVisible();
}

async function addMatrixGrant(
  page: Page,
  permissionLabel: string,
  principalLabel: string,
) {
  await page.getByRole("combobox", { name: "Permission de backlog" }).selectOption({ label: permissionLabel });
  await page.getByRole("combobox", { name: "Type de principal" }).selectOption("user");
  await page.getByRole("combobox", { name: "Rechercher un principal" }).fill(principalLabel);
  await page.getByRole("button", { name: "Ajouter le grant" }).click();
  const confirmation = page.getByRole("dialog", { name: "Modifier un schéma partagé" });
  if (await confirmation.isVisible().catch(() => false)) {
    await confirmation.getByRole("button", { name: "Confirmer la modification" }).click();
  }
}

test.use({ storageState: AUTH.admin });

audited(
  "1. crée un groupe, un rôle personnalisé et un clone de schéma",
  "01-create-group-role-scheme",
  async ({ page, captures }) => {
    const capture = observe(page, "création groupe + rôle + schéma");
    captures.push(capture);
    await timed(capture, "navigation groupes", () => page.goto("/admin?tab=groups"));
    await page.getByRole("textbox", { name: "Nom du nouveau groupe" }).fill("Équipe navigateur");
    await timed(capture, "création groupe", () => page.getByRole("button", { name: "Créer le groupe" }).click());
    await expect(page.getByRole("region", { name: "Équipe navigateur" })).toBeVisible();

    await timed(capture, "navigation rôles", () => page.goto("/admin?tab=roles"));
    await page.getByRole("textbox", { name: "Nom du nouveau rôle" }).fill("Pilote navigateur");
    await page.getByRole("textbox", { name: "Description du nouveau rôle" }).fill("Créé par Chromium");
    await timed(capture, "création rôle", () => page.getByRole("button", { name: "Créer le rôle" }).click());
    await expect(page.getByRole("region", { name: "Pilote navigateur" })).toBeVisible();

    await timed(capture, "navigation schémas", () => page.goto("/admin?tab=schemes"));
    await page.getByRole("button", { name: "Cloner Schéma de permissions par défaut" }).click();
    const dialog = page.getByRole("dialog", { name: "Cloner le schéma" });
    await dialog.getByRole("textbox", { name: "Nom du clone" }).fill("Schéma navigateur");
    await timed(capture, "clonage schéma", () => dialog.getByRole("button", { name: "Cloner" }).click());
    await expect(page.getByRole("heading", { name: "Schéma navigateur" })).toBeVisible();
  },
);

audited(
  "2. isole le grant de rôle et l’occupation de groupe à un seul backlog",
  "02-backlog-isolation",
  async ({ browser, captures }) => {
    const context = await browser.newContext({ storageState: AUTH.member });
    const page = await context.newPage();
    const capture = observe(page, "isolation CASS/LABS");
    captures.push(capture);
    await timed(capture, "ouverture CASS membre", () => page.goto("/b/CASS?view=backlog"));
    await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
    await expect(page.getByText("Cour de cassation", { exact: true }).first()).toBeVisible();
    const response = await timed(capture, "refus LABS membre", () => page.goto("/b/LABS"));
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.getByText("Laboratoire isolé", { exact: true })).toHaveCount(0);
    await context.close();
  },
);

audited(
  "3. explique les grants direct, groupe et rôle dans l’Assistant de permissions",
  "03-permission-helper",
  async ({ page, captures }) => {
    const capture = observe(page, "assistant direct/groupe/rôle");
    captures.push(capture);
    await timed(capture, "navigation accès", () => page.goto("/b/CASS/settings/access"));
    await expect(page.getByRole("main")).toHaveCount(1);

    await timed(capture, "explication directe", () => selectHelper(page, "Membre E2E — member@jiroo.local", "Gérer les vues partagées"));
    await expect(page.getByText("Grant direct à Membre E2E.")).toBeVisible();
    await timed(capture, "explication groupe", () => selectHelper(page, "Membre E2E — member@jiroo.local", "Supprimer les éléments"));
    await expect(page.getByText("Membre du groupe Équipe delivery.")).toBeVisible();
    await timed(capture, "explication rôle", () => selectHelper(page, "Membre E2E — member@jiroo.local", "Gérer les sprints"));
    await expect(page.getByText("Occupe le rôle Spécialiste delivery.")).toBeVisible();
  },
);

audited(
  "4. rejette une Server Action forgée par le lecteur",
  "04-reader-forged-action",
  async ({ page, browser, captures }) => {
    const adminCapture = observe(page, "capture action administrateur");
    captures.push(adminCapture);
    await page.goto("/admin?tab=groups");
    let actionRequest: Request | undefined;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"] && !actionRequest) actionRequest = request;
    });
    await page.getByRole("textbox", { name: "Nom du nouveau groupe" }).fill("Source action forgée");
    await timed(adminCapture, "action source", () => page.getByRole("button", { name: "Créer le groupe" }).click());
    await expect(page.getByRole("region", { name: "Source action forgée" })).toBeVisible();
    expect(actionRequest).toBeDefined();

    const readerContext = await browser.newContext({ storageState: AUTH.reader });
    const reader = await readerContext.newPage();
    const readerCapture = observe(reader, "rejeu lecteur");
    captures.push(readerCapture);
    await reader.goto("/b/CASS");
    const replay = await timed(readerCapture, "rejeu Server Action", () => reader.evaluate(async ({ url, headers, body }) => {
      const response = await fetch(url, { method: "POST", headers, body });
      return { status: response.status, text: await response.text() };
    }, {
      url: actionRequest!.url(),
      headers: Object.fromEntries(Object.entries(actionRequest!.headers()).filter(([key]) => ["accept", "content-type", "next-action", "next-router-state-tree"].includes(key))),
      body: actionRequest!.postData() ?? "",
    }));
    expect(replay.status).toBe(200);
    expect(replay.text).toContain("Vous n’avez pas la permission");
    expect(replay.text).toContain("Gérer les utilisateurs et les groupes");
    await readerContext.close();
  },
);

audited(
  "5. donne au spécialiste les contrôles de sprint sans édition d’item ni workflow",
  "05-specialist-controls",
  async ({ browser, captures }) => {
    const context = await browser.newContext({ storageState: AUTH.specialist });
    const page = await context.newPage();
    const capture = observe(page, "contrôles spécialiste");
    captures.push(capture);
    await timed(capture, "navigation backlog spécialiste", () => page.goto("/b/CASS?view=backlog"));
    await expect(page.getByRole("button", { name: "Créer un sprint" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nouvel item" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Colonnes" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Déplacer CASS-/ })).toHaveCount(0);
    await context.close();
  },
);

audited(
  "6. expose manage_releases dans l’Assistant sans inventer d’interface Releases",
  "06-release-permission-no-phantom-ui",
  async ({ page, browser, captures }) => {
    const adminCapture = observe(page, "permission future release");
    captures.push(adminCapture);
    await page.goto("/b/CASS/settings/access");
    await timed(adminCapture, "explication release", () => selectHelper(page, "Spécialiste E2E — specialist@jiroo.local", "Gérer les releases"));
    await expect(page.getByRole("heading", { name: "Autorisé" })).toBeVisible();
    await expect(page.getByText("Occupe le rôle Spécialiste delivery.")).toBeVisible();

    const specialistContext = await browser.newContext({ storageState: AUTH.specialist });
    const specialist = await specialistContext.newPage();
    const specialistCapture = observe(specialist, "absence interface fantôme");
    captures.push(specialistCapture);
    await specialist.goto("/b/CASS");
    await expect(specialist.getByRole("link", { name: /release/i })).toHaveCount(0);
    await expect(specialist.getByRole("button", { name: /release/i })).toHaveCount(0);
    await specialistContext.close();
  },
);

audited(
  "7. retire browse de la navigation, recherche, récents, notifications et URL",
  "07-browse-removal",
  async ({ browser, captures }) => {
    const ids = await fixtureIds();
    const [scheme] = await db.select({ version: permissionSchemes.version }).from(permissionSchemes).where(eq(permissionSchemes.id, ids.schemeId));
    if (!scheme) throw new Error("Schéma partagé introuvable.");
    const grant = await addSchemeGrant({
      schemeId: ids.schemeId,
      permission: "browse_backlog",
      principal: { type: "user", userId: ids.noAccessId },
      expectedVersion: scheme.version,
      expectedAffectedBacklogIds: (await db.select({ id: backlogPermissionConfigs.backlogId }).from(backlogPermissionConfigs).where(eq(backlogPermissionConfigs.permissionSchemeId, ids.schemeId))).map((entry) => entry.id).sort(),
    }, ids.adminId, "e2e-browse-removal-add");
    const [cassItem] = await db.select({ id: items.id, key: items.key }).from(items).where(eq(items.backlogId, ids.cassBacklogId)).orderBy(asc(items.key)).limit(1);
    if (!cassItem) throw new Error("Item CASS introuvable.");
    await db.insert(notifications).values({ userId: ids.noAccessId, type: "mention", itemId: cassItem.id });

    const context = await browser.newContext({ storageState: AUTH.noAccess });
    const page = await context.newPage();
    const capture = observe(page, "suppression browse");
    captures.push(capture);
    await page.goto("/b/CASS");
    await page.evaluate((key) => localStorage.setItem("jiroo-recent-items", JSON.stringify([key])), cassItem.key);
    await page.reload();
    await expect(page.getByText("Cour de cassation", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Notifications \(1 non lues\)/ })).toBeVisible();
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByRole("option", { name: new RegExp(cassItem.key) })).toBeVisible();
    await page.keyboard.press("Escape");

    await removeSchemeGrant({
      schemeId: ids.schemeId,
      grantId: grant.id,
      expectedVersion: grant.version,
      expectedAffectedBacklogIds: (await db.select({ id: backlogPermissionConfigs.backlogId }).from(backlogPermissionConfigs).where(eq(backlogPermissionConfigs.permissionSchemeId, ids.schemeId))).map((entry) => entry.id).sort(),
    }, ids.adminId, "e2e-browse-removal-remove");

    await timed(capture, "rechargement après retrait browse", () => page.goto("/"));
    await expect(page.getByText("Cour de cassation", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible();
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByText("Aucun item récent.")).toBeVisible();
    await page.getByRole("textbox", { name: "Rechercher" }).fill(cassItem.key);
    await expect(page.getByText("Aucun résultat.")).toBeVisible();
    await page.keyboard.press("Escape");
    const response = await timed(capture, "URL CASS après retrait browse", () => page.goto("/b/CASS"));
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await context.close();
  },
);

audited(
  "8. détecte puis récupère un conflit de version sur schéma partagé",
  "08-stale-shared-scheme",
  async ({ browser, captures }) => {
    const { schemeId } = await fixtureIds();
    const firstContext = await browser.newContext({ storageState: AUTH.admin });
    const secondContext = await browser.newContext({ storageState: AUTH.admin });
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    const firstCapture = observe(first, "éditeur A");
    const secondCapture = observe(second, "éditeur B");
    captures.push(firstCapture, secondCapture);
    const url = `/admin?tab=schemes&scheme=${schemeId}`;
    await Promise.all([first.goto(url), second.goto(url)]);
    await expect(first.getByRole("dialog", { name: /Matrice de/ })).toBeVisible();
    await expect(second.getByRole("dialog", { name: /Matrice de/ })).toBeVisible();

    await timed(firstCapture, "écriture éditeur A", () => addMatrixGrant(first, "Transitionner les éléments", "Sans accès E2E"));
    await expect(first.getByRole("button", { name: "Retirer Sans accès E2E de Transitionner les éléments" })).toBeVisible();
    await timed(secondCapture, "écriture stale éditeur B", () => addMatrixGrant(second, "Assigner les éléments", "Sans accès E2E"));
    await expect(second.getByRole("alert")).toContainText("Ce schéma a été modifié. Rechargez la page.");

    await second.reload();
    await expect(second.getByRole("dialog", { name: /Matrice de/ })).toBeVisible();
    await timed(secondCapture, "récupération après reload", () => addMatrixGrant(second, "Assigner les éléments", "Sans accès E2E"));
    await expect(second.getByRole("button", { name: "Retirer Sans accès E2E de Assigner les éléments" })).toBeVisible();
    await firstContext.close();
    await secondContext.close();
  },
);

audited(
  "9. conserve un historique de sécurité append-only",
  "09-security-history",
  async ({ page, captures }) => {
    const capture = observe(page, "historique immuable");
    captures.push(capture);
    await page.goto("/admin?tab=groups");
    await page.getByRole("textbox", { name: "Nom du nouveau groupe" }).fill("Historique navigateur A");
    await timed(capture, "événement historique A", () => page.getByRole("button", { name: "Créer le groupe" }).click());
    await expect(page.getByRole("region", { name: "Historique navigateur A" })).toBeVisible();
    const [firstEvent] = await db.select().from(securityAuditEvents).where(and(eq(securityAuditEvents.action, "group_created"), eq(securityAuditEvents.actorLabel, "Administrateur E2E"))).orderBy(asc(securityAuditEvents.createdAt)).limit(1);
    expect(firstEvent).toBeDefined();
    const snapshot = JSON.stringify(firstEvent);

    await page.getByRole("textbox", { name: "Nom du nouveau groupe" }).fill("Historique navigateur B");
    await timed(capture, "événement historique B", () => page.getByRole("button", { name: "Créer le groupe" }).click());
    await expect(page.getByRole("region", { name: "Historique navigateur B" })).toBeVisible();
    const [sameEvent] = await db.select().from(securityAuditEvents).where(eq(securityAuditEvents.id, firstEvent!.id));
    expect(JSON.stringify(sameEvent)).toBe(snapshot);
    const events = await db.select({ id: securityAuditEvents.id }).from(securityAuditEvents).where(eq(securityAuditEvents.action, "group_created"));
    expect(events.length).toBeGreaterThanOrEqual(2);
  },
);

audited(
  "10. persiste après reload et dans un second contexte utilisateur",
  "10-reload-second-user",
  async ({ page, browser, captures }) => {
    const adminCapture = observe(page, "persistance administrateur");
    captures.push(adminCapture);
    await page.goto("/b/CASS/settings/access");
    await page.getByRole("button", { name: "Mode Avancé" }).click();
    await expect(page.getByRole("region", { name: "Spécialiste delivery" })).toContainText("Équipe delivery");
    await timed(adminCapture, "reload accès", () => page.reload());
    await expect(page.getByRole("region", { name: "Spécialiste delivery" })).toContainText("Équipe delivery");

    const memberContext = await browser.newContext({ storageState: AUTH.member });
    const member = await memberContext.newPage();
    const memberCapture = observe(member, "persistance second utilisateur");
    captures.push(memberCapture);
    await timed(memberCapture, "ouverture second utilisateur", () => member.goto("/b/CASS?view=backlog"));
    await expect(member.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
    await expect(member.getByRole("button", { name: "Créer un sprint" })).toBeVisible();
    await memberContext.close();
  },
);
