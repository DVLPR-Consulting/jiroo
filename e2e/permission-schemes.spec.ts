import "dotenv/config";

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Browser, type Locator, type Page, type Request } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  backlogRoleActors,
  backlogs,
  groupMembers,
  items,
  notifications,
  permissionSchemes,
  projectRoles,
  securityAuditEvents,
  userGroups,
} from "../lib/db/schema/domain";

const AUTH = {
  admin: ".playwright/.auth/platform-admin.json",
  member: ".playwright/.auth/member.json",
  specialist: ".playwright/.auth/specialist.json",
  reader: ".playwright/.auth/reader.json",
  noAccess: ".playwright/.auth/no-access.json",
} as const;

const RUN_ID = process.env.JIROO_E2E_RUN_ID ?? "local-untracked";
const PERSIST_SCENARIO_LOGS = process.env.JIROO_E2E_PERSIST_SCENARIO_LOGS === "1";
const CAPTURE_REVIEW_BUGS = process.env.JIROO_E2E_CAPTURE_REVIEW_BUGS === "1";

type AuditCapture = {
  consoleLines: string[];
  consoleErrors: string[];
  networkLines: string[];
  requestFailures: string[];
  httpErrors: string[];
};

function observe(page: Page, label: string): AuditCapture {
  const capture: AuditCapture = {
    consoleLines: [`[scenario] ${label}`],
    consoleErrors: [],
    networkLines: [`[scenario] ${label}`],
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
    const status = response.status();
    const line = `${status} ${response.request().method()} ${response.url()}`;
    capture.networkLines.push(line);
    if (status >= 400) capture.httpErrors.push(line);
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
  const root = PERSIST_SCENARIO_LOGS ? "audit" : `.playwright/evidence/${RUN_ID}`;
  await mkdir(`${root}/console`, { recursive: true });
  await mkdir(`${root}/network`, { recursive: true });
  const consoleLines = captures.flatMap((capture) => capture.consoleLines);
  const networkLines = captures.flatMap((capture) => capture.networkLines);
  await writeFile(
    `${root}/console/${RUN_ID}-permission-schemes-${slug}-console.log`,
    `${consoleLines.join("\n")}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  await writeFile(
    `${root}/network/${RUN_ID}-permission-schemes-${slug}-network.log`,
    `${networkLines.join("\n")}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  expect(captures.flatMap((capture) => capture.consoleErrors), "Erreurs JavaScript/console").toEqual([]);
  expect(captures.flatMap((capture) => capture.requestFailures), "Requêtes réseau échouées").toEqual([]);
  expect(captures.flatMap((capture) => capture.httpErrors), "Réponses HTTP 4xx/5xx inattendues").toEqual([]);
}

async function captureReviewScreenshot(target: Page | Locator, bugId: string) {
  const root = CAPTURE_REVIEW_BUGS
    ? "audit/screenshots"
    : `.playwright/evidence/${RUN_ID}/screenshots`;
  await mkdir(root, { recursive: true });
  const path = `${root}/${RUN_ID}-FIXED-${bugId}.png`;
  if (CAPTURE_REVIEW_BUGS && existsSync(path)) {
    throw new Error(`La preuve Playwright ${path} existe déjà ; choisissez un run-id unique.`);
  }
  await target.screenshot({
    path,
  });
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
    .innerJoin(backlogs, eq(backlogPermissionConfigs.backlogId, backlogs.id))
    .where(and(
      eq(permissionSchemes.key, "e2e-shared-permission-scheme"),
      eq(backlogs.key, "CASS"),
    ));
  const [noAccess] = await db.select({ id: user.id }).from(user).where(eq(user.email, "no-access@jiroo.local"));
  const [member] = await db.select({ id: user.id }).from(user).where(eq(user.email, "member@jiroo.local"));
  if (!cass || !noAccess || !member) throw new Error("Fixtures de permissions Playwright introuvables.");
  return { cassBacklogId: cass.id, schemeId: cass.schemeId, noAccessId: noAccess.id, memberId: member.id };
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
  async ({ page, browser, captures }) => {
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
    const specialistRole = page.getByRole("region", { name: "Spécialiste delivery" });
    await expect(specialistRole).toContainText("Affectation dans Cour de cassation");
    await captureReviewScreenshot(specialistRole, "BUG-JIR-025-project-role-blockers-clean-console");

    await timed(capture, "navigation schémas", () => page.goto("/admin?tab=schemes"));
    await page.getByRole("button", { name: "Cloner Schéma de permissions par défaut" }).click();
    const dialog = page.getByRole("dialog", { name: "Cloner le schéma" });
    await dialog.getByRole("textbox", { name: "Nom du clone" }).fill("Schéma navigateur");
    await timed(capture, "clonage schéma", () => dialog.getByRole("button", { name: "Cloner" }).click());
    await expect(page.getByRole("heading", { name: "Schéma navigateur" })).toBeVisible();

    const limitedContext = await browser.newContext({ storageState: AUTH.member });
    const limited = await limitedContext.newPage();
    const limitedCapture = observe(limited, "gestionnaire de groupes limité");
    captures.push(limitedCapture);
    await limited.goto("/admin?tab=groups");
    const protectedGroup = limited.getByRole("region", { name: "Administrateurs de la plateforme" });
    await expect(protectedGroup).toBeVisible();
    await expect(protectedGroup.getByRole("button", { name: /^Retirer / })).toHaveCount(0);
    await expect(protectedGroup.getByRole("combobox", { name: "Ajouter un membre" })).toHaveCount(0);
    await captureReviewScreenshot(limited, "BUG-JIR-024-protected-admin-group-membership-controls");
    await limitedContext.close();
  },
);

audited(
  "2. isole le grant de rôle et l’occupation de groupe à un seul backlog",
  "02-backlog-isolation",
  async ({ browser, captures }) => {
    const ids = await fixtureIds();
    const directRoles = await db.select({ name: projectRoles.name, protected: projectRoles.protected })
      .from(backlogRoleActors)
      .innerJoin(projectRoles, eq(backlogRoleActors.projectRoleId, projectRoles.id))
      .where(and(
        eq(backlogRoleActors.backlogId, ids.cassBacklogId),
        eq(backlogRoleActors.actorType, "user"),
        eq(backlogRoleActors.userId, ids.memberId),
      ));
    expect(directRoles, "Le membre testé ne doit avoir aucun rôle direct ou protégé").toEqual([]);

    const cassGroupRoles = await db.select({
      group: userGroups.name,
      role: projectRoles.name,
      roleProtected: projectRoles.protected,
    })
      .from(backlogRoleActors)
      .innerJoin(projectRoles, eq(backlogRoleActors.projectRoleId, projectRoles.id))
      .innerJoin(userGroups, eq(backlogRoleActors.groupId, userGroups.id))
      .innerJoin(groupMembers, eq(groupMembers.groupId, userGroups.id))
      .where(and(
        eq(backlogRoleActors.backlogId, ids.cassBacklogId),
        eq(backlogRoleActors.actorType, "group"),
        eq(groupMembers.userId, ids.memberId),
      ));
    expect(cassGroupRoles).toEqual([{
      group: "Équipe delivery",
      role: "Spécialiste delivery",
      roleProtected: false,
    }]);

    const labsGroupRoles = await db.select({ id: backlogRoleActors.id })
      .from(backlogRoleActors)
      .innerJoin(backlogs, eq(backlogRoleActors.backlogId, backlogs.id))
      .innerJoin(groupMembers, eq(backlogRoleActors.groupId, groupMembers.groupId))
      .where(and(
        eq(backlogs.key, "LABS"),
        eq(backlogRoleActors.actorType, "group"),
        eq(groupMembers.userId, ids.memberId),
      ));
    expect(labsGroupRoles, "Le rôle de groupe doit rester local à CASS").toEqual([]);

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
    const sourceName = "Source action administrateur";
    const forgedTargetName = "Cible action lecteur unique";
    const adminCapture = observe(page, "capture action administrateur");
    captures.push(adminCapture);
    await page.goto("/admin?tab=groups");
    let actionRequest: Request | undefined;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"] && !actionRequest) actionRequest = request;
    });
    await page.getByRole("textbox", { name: "Nom du nouveau groupe" }).fill(sourceName);
    await timed(adminCapture, "action source", () => page.getByRole("button", { name: "Créer le groupe" }).click());
    await expect(page.getByRole("region", { name: sourceName })).toBeVisible();
    expect(actionRequest).toBeDefined();

    const sourceBody = actionRequest!.postData() ?? "";
    const forgedBody = sourceBody.replaceAll(sourceName, forgedTargetName);
    expect(forgedBody, "Le payload capturé doit cibler un nom neuf").not.toBe(sourceBody);
    const groupsBefore = await db.select({ id: userGroups.id, name: userGroups.name }).from(userGroups);
    expect(groupsBefore.filter((group) => group.name === forgedTargetName)).toEqual([]);
    const auditBefore = await db.select().from(securityAuditEvents).orderBy(asc(securityAuditEvents.createdAt));

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
      body: forgedBody,
    }));
    expect(replay.status).toBe(200);
    expect(replay.text).toContain("Vous n’avez pas la permission");
    expect(replay.text).toContain("Gérer les utilisateurs et les groupes");

    const groupsAfter = await db.select({ id: userGroups.id, name: userGroups.name }).from(userGroups);
    expect(groupsAfter).toEqual(groupsBefore);
    expect(groupsAfter.filter((group) => group.name === forgedTargetName)).toEqual([]);
    const auditAfter = await db.select().from(securityAuditEvents).orderBy(asc(securityAuditEvents.createdAt));
    expect(auditAfter).toEqual(auditBefore);
    expect(auditAfter.filter((event) => JSON.stringify(event.newValue).includes(forgedTargetName))).toEqual([]);
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
    const [cassItem] = await db.select({ id: items.id, key: items.key }).from(items).where(eq(items.backlogId, ids.cassBacklogId)).orderBy(asc(items.key)).limit(1);
    if (!cassItem) throw new Error("Item CASS introuvable.");
    await db.insert(notifications).values({ userId: ids.noAccessId, type: "mention", itemId: cassItem.id });

    const adminContext = await browser.newContext({ storageState: AUTH.admin });
    const admin = await adminContext.newPage();
    const adminCapture = observe(admin, "mutation browse par matrice UI");
    captures.push(adminCapture);
    await admin.goto(`/admin?tab=schemes&scheme=${ids.schemeId}`);
    await expect(admin.getByRole("dialog", { name: "Matrice de Schéma partagé E2E" })).toBeVisible();
    await timed(adminCapture, "ajout browse via UI", () => addMatrixGrant(admin, "Consulter le backlog", "Sans accès E2E"));
    const removeBrowse = admin.getByRole("button", { name: "Retirer Sans accès E2E de Consulter le backlog" });
    await expect(removeBrowse).toBeVisible();

    const context = await browser.newContext({ storageState: AUTH.noAccess });
    const page = await context.newPage();
    const capture = observe(page, "visibilité utilisateur avant/après browse");
    captures.push(capture);
    await page.goto("/b/CASS");
    await page.evaluate((key) => localStorage.setItem("jiroo-recent-items", JSON.stringify([key])), cassItem.key);
    await page.reload();
    await expect(page.getByText("Cour de cassation", { exact: true }).first()).toBeVisible();
    const unreadNotifications = page.getByRole("button", { name: "Notifications (1 non lues)" });
    await expect(unreadNotifications).toBeVisible();
    await unreadNotifications.click();
    await expect(page.getByRole("menu")).toContainText(cassItem.key);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByRole("option", { name: new RegExp(cassItem.key) })).toBeVisible();
    await page.keyboard.press("Escape");

    await timed(adminCapture, "retrait browse via UI", () => removeBrowse.click());
    const confirmation = admin.getByRole("dialog", { name: "Modifier un schéma partagé" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Confirmer la modification" }).click();
    await expect(removeBrowse).toHaveCount(0);

    await timed(capture, "rechargement après retrait browse", () => page.goto("/"));
    await expect(page.getByText("Cour de cassation", { exact: true })).toHaveCount(0);
    const emptyNotifications = page.getByRole("button", { name: "Notifications", exact: true });
    await expect(emptyNotifications).toBeVisible();
    await emptyNotifications.click();
    const notificationMenu = page.getByRole("menu");
    await expect(notificationMenu).toContainText("Aucune notification.");
    await expect(notificationMenu).not.toContainText(cassItem.key);
    await expect(notificationMenu).not.toContainText("Cour de cassation");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByText("Aucun item récent.")).toBeVisible();
    await page.getByRole("textbox", { name: "Rechercher" }).fill(cassItem.key);
    await expect(page.getByText("Aucun résultat.")).toBeVisible();
    await page.keyboard.press("Escape");
    const response = await timed(capture, "URL CASS après retrait browse", () => page.goto("/b/CASS"));
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await context.close();
    await adminContext.close();
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
    const baseline = await db.select().from(securityAuditEvents)
      .where(eq(securityAuditEvents.action, "group_created"))
      .orderBy(asc(securityAuditEvents.createdAt));

    const firstName = "Historique navigateur A";
    await page.getByRole("textbox", { name: "Nom du nouveau groupe" }).fill(firstName);
    await timed(capture, "événement historique A", () => page.getByRole("button", { name: "Créer le groupe" }).click());
    await expect(page.getByRole("region", { name: firstName })).toBeVisible();
    const [firstGroup] = await db.select({ id: userGroups.id }).from(userGroups).where(eq(userGroups.name, firstName));
    expect(firstGroup).toBeDefined();
    const afterFirst = await db.select().from(securityAuditEvents)
      .where(eq(securityAuditEvents.action, "group_created"))
      .orderBy(asc(securityAuditEvents.createdAt));
    expect(afterFirst).toHaveLength(baseline.length + 1);
    const firstMatches = afterFirst.filter((event) => event.targetId === firstGroup!.id);
    expect(firstMatches).toHaveLength(1);
    const firstEvent = firstMatches[0]!;
    expect(firstEvent).toMatchObject({
      actorLabel: "Administrateur E2E",
      action: "group_created",
      scope: "global",
      targetType: "group",
      targetId: firstGroup!.id,
      newValue: { name: firstName },
    });
    expect(firstEvent.requestCorrelationId).not.toHaveLength(0);
    const snapshot = JSON.stringify(firstEvent);

    const secondName = "Historique navigateur B";
    await page.getByRole("textbox", { name: "Nom du nouveau groupe" }).fill(secondName);
    await timed(capture, "événement historique B", () => page.getByRole("button", { name: "Créer le groupe" }).click());
    await expect(page.getByRole("region", { name: secondName })).toBeVisible();
    const [secondGroup] = await db.select({ id: userGroups.id }).from(userGroups).where(eq(userGroups.name, secondName));
    expect(secondGroup).toBeDefined();
    const afterSecond = await db.select().from(securityAuditEvents)
      .where(eq(securityAuditEvents.action, "group_created"))
      .orderBy(asc(securityAuditEvents.createdAt));
    expect(afterSecond).toHaveLength(baseline.length + 2);
    const secondMatches = afterSecond.filter((event) => event.targetId === secondGroup!.id);
    expect(secondMatches).toHaveLength(1);
    const secondEvent = secondMatches[0]!;
    expect(secondEvent).toMatchObject({
      actorLabel: "Administrateur E2E",
      action: "group_created",
      scope: "global",
      targetType: "group",
      targetId: secondGroup!.id,
      newValue: { name: secondName },
    });
    expect(secondEvent.requestCorrelationId).not.toHaveLength(0);
    expect(secondEvent.requestCorrelationId).not.toBe(firstEvent.requestCorrelationId);

    const [sameEvent] = await db.select().from(securityAuditEvents).where(eq(securityAuditEvents.id, firstEvent!.id));
    expect(JSON.stringify(sameEvent)).toBe(snapshot);
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
