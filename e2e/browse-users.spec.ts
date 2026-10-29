import { observePage } from "./support/capture";
import { expect, test as base, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogRoleActors, backlogs, items, permissionGrants, projectRoles } from "../lib/db/schema/domain";
import { checkPermissions } from "../lib/auth/authorization";
import { GLOBAL_PERMISSION_KEYS } from "../lib/auth/permissions";
import { createItem } from "../lib/services/items";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";
import { keyPattern } from "./key-helpers";

const RUN = process.env.JIROO_E2E_RUN_ID;
if (!RUN) throw new Error("Browsing users E2E requires an isolated run id.");
const HINT = "Il vous manque la permission globale « Parcourir les utilisateurs ». Demandez-la à un administrateur Jiroo.";
const REMOVE = "Retirer Parcourir les utilisateurs pour Tous les utilisateurs authentifiés";
const EVERYONE = and(eq(permissionGrants.scope, "global"), eq(permissionGrants.permissionKey, "browse_users"), eq(permissionGrants.principalType, "authenticated_user"));
type Grant = typeof permissionGrants.$inferSelect;
type Account = { id: string; name: string };
type Capture = { console: string[]; network: string[]; errors: string[]; navigating: boolean };
const captures = new Map<Page, Capture>();
let admin: Account;
let member: Account;
let backlogId: string;
let roleActorId: string | undefined;
let originalDirectGrants: Grant[] = [];
let originalEveryone: Grant[] = [];

function observe(page: Page, name: string) {
  const capture: Capture = { console: [name], network: [name], errors: [], navigating: false };
  captures.set(page, capture);
  observePage(page, { console: capture.console, network: capture.network, onFault: ({ line }) => capture.errors.push(line) }, name);
  return capture;
}

const test = base.extend<{ pair: { adminPage: Page; memberPage: Page } }>({
  pair: async ({ browser, baseURL }, runTest, info) => {
    const adminContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, storageState: ".playwright/.auth/platform-admin.json" });
    const memberContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, storageState: ".playwright/.auth/member.json" });
    const adminPage = await adminContext.newPage();
    const memberPage = await memberContext.newPage();
    const observed = [observe(adminPage, "administrator"), observe(memberPage, "ordinary member")];
    const slug = `browse-users-${info.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    try { await runTest({ adminPage, memberPage }); }
    finally {
      try {
        if (info.status !== info.expectedStatus || observed.some((capture) => capture.errors.length > 0)) {
          await writeAuditScreenshot(`audit/screenshots/${slug}-failure.png`, (path) => (memberPage.url() === "about:blank" ? adminPage : memberPage).screenshot({ path, caret: "initial" }));
        }
        await writeAuditText(`audit/console/${slug}.log`, observed.map((capture) => capture.console.join("\n")).join("\n"));
        await writeAuditText(`audit/network/${slug}.log`, observed.map((capture) => capture.network.join("\n")).join("\n"));
        expect(observed.flatMap((capture) => capture.errors), "Browser and network errors").toEqual([]);
      } finally {
        captures.delete(adminPage); captures.delete(memberPage);
        await Promise.all([adminContext.close(), memberContext.close()]);
      }
    }
  },
});

async function navigate(page: Page, url: string) {
  const capture = captures.get(page)!;
  capture.navigating = true;
  try { await page.goto(url); }
  finally { capture.navigating = false; }
}

async function fixture(scenario: string, assignedToMember = false) {
  const create = (type: "composant" | "epic" | "tache", parentId: string | null, title: string, assigneeId?: string) =>
    createItem({ backlogId, type, parentId, title, ...(assigneeId ? { assigneeId } : {}) }, admin.id, `browse-users-${scenario}-${RUN}`);
  const component = await create("composant", null, `Browsing ${scenario} ${RUN}`);
  const epic = await create("epic", component.id, "Assignment test epic");
  return create("tache", epic.id, `Assignment ${scenario} ${RUN}`, assignedToMember ? member.id : undefined);
}

async function editAssignee(page: Page, key: string) {
  const drawer = page.getByRole("dialog", { name: keyPattern(key) });
  await expect(drawer).toBeVisible();
  const modify = drawer.getByRole("button", { name: "Modifier : Assigné" });
  await (await modify.isVisible() ? modify : drawer.getByRole("button", { name: /^Assigné / })).click();
  return drawer.getByRole("combobox", { name: "Assigné", exact: true });
}

async function openAssignee(page: Page, key: string) {
  await navigate(page, `/b/CASS?view=list&item=${key}`);
  return editAssignee(page, key);
}

async function restoreEveryone() {
  await db.transaction(async (tx) => {
    await tx.delete(permissionGrants).where(EVERYONE);
    if (originalEveryone.length > 0) await tx.insert(permissionGrants).values(originalEveryone);
  });
  expect(await db.select().from(permissionGrants).where(EVERYONE)).toEqual(originalEveryone);
}

test.describe("browsing users by default and its removal", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60_000);

  test.beforeAll(async ({}, info) => {
    expect(info.config.workers, "This global-setting spec must run with one worker").toBe(1);
    const accounts = await db.select({ id: user.id, name: user.name, email: user.email }).from(user)
      .where(inArray(user.email, ["platform-admin@jiroo.local", "member@jiroo.local"]));
    admin = accounts.find((account) => account.email === "platform-admin@jiroo.local")!;
    member = accounts.find((account) => account.email === "member@jiroo.local")!;
    const [backlog] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "CASS"));
    const [role] = await db.select({ id: projectRoles.id }).from(projectRoles).where(eq(projectRoles.key, "members"));
    if (!admin || !member || !backlog || !role) throw new Error("Missing isolated assignment fixtures.");
    backlogId = backlog.id;
    originalEveryone = await db.select().from(permissionGrants).where(EVERYONE);
    expect(originalEveryone, "Migration 0021 must provide the default grant after the E2E reset").toHaveLength(1);
    originalDirectGrants = await db.select().from(permissionGrants)
      .where(and(eq(permissionGrants.scope, "global"), eq(permissionGrants.principalType, "user"), eq(permissionGrants.userId, member.id)));
    // The shared seed makes this account a limited group manager; this scenario
    // needs an ordinary member, so restore its direct grants in afterAll.
    await db.delete(permissionGrants).where(and(eq(permissionGrants.scope, "global"), eq(permissionGrants.principalType, "user"), eq(permissionGrants.userId, member.id)));
    const [added] = await db.insert(backlogRoleActors).values({ backlogId, projectRoleId: role.id, actorType: "user", userId: member.id }).onConflictDoNothing().returning({ id: backlogRoleActors.id });
    roleActorId = added?.id;
    const decisions = await checkPermissions({ actorId: member.id, permissions: GLOBAL_PERMISSION_KEYS, scope: { type: "global" } });
    for (const permission of GLOBAL_PERMISSION_KEYS) expect(decisions.get(permission)?.allowed).toBe(permission === "browse_users");
  });

  test.afterAll(async () => {
    if (roleActorId) await db.delete(backlogRoleActors).where(eq(backlogRoleActors.id, roleActorId));
    if (originalDirectGrants.length > 0) await db.insert(permissionGrants).values(originalDirectGrants).onConflictDoNothing();
    if (originalEveryone.length > 0) await restoreEveryone();
  });

  test("assigns another user with only the default global permission and persists it", async ({ pair: { memberPage } }) => {
    const item = await fixture("default");
    const select = await openAssignee(memberPage, item.key);
    await expect(select.getByRole("option", { name: admin.name, exact: true })).toBeEnabled();
    await expect(memberPage.getByText(HINT, { exact: true })).toHaveCount(0);
    await select.selectOption(admin.id);
    await expect.poll(async () => (await db.select({ id: items.assigneeId }).from(items).where(eq(items.id, item.id)))[0]?.id).toBe(admin.id);
    await expect(select).toBeEnabled();
    const capture = captures.get(memberPage)!;
    capture.navigating = true;
    try { await memberPage.reload(); } finally { capture.navigating = false; }
    const selected = await editAssignee(memberPage, item.key);
    await expect(selected).toHaveValue(admin.id);
  });

  test("explains the removed permission and restores the directory when granted again", async ({ pair: { adminPage, memberPage } }) => {
    const item = await fixture("revoked", true);
    try {
      await navigate(adminPage, "/admin?tab=groups");
      await adminPage.getByRole("button", { name: REMOVE, exact: true }).click();
      await adminPage.getByRole("dialog", { name: "Retirer la permission globale", exact: true }).getByRole("button", { name: "Confirmer le retrait", exact: true }).click();
      await expect.poll(async () => (await db.select().from(permissionGrants).where(EVERYONE)).length).toBe(0);
      const select = await openAssignee(memberPage, item.key);
      await expect(memberPage.getByText(HINT, { exact: true })).toBeVisible();
      expect(await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(["", member.id]);
      // An existing assignee is retained as a disabled non-candidate identity.
      await expect(select.getByRole("option", { name: member.name, exact: true })).toBeDisabled();
      for (const [width, height] of [[1440, 900], [390, 844]]) {
        await memberPage.setViewportSize({ width: width!, height: height! });
        await memberPage.getByText(HINT, { exact: true }).scrollIntoViewIfNeeded();
        await writeAuditScreenshot(`audit/screenshots/browse-users-denied-${width}.png`, (path) => memberPage.screenshot({ path, caret: "initial" }));
      }
      const globals = adminPage.getByRole("region", { name: "Permissions globales" });
      await globals.getByRole("combobox", { name: "Permission globale" }).selectOption("browse_users");
      await globals.getByRole("combobox", { name: "Type de principal" }).selectOption("authenticated_user");
      await expect(globals.getByRole("combobox", { name: "Principal", exact: true })).toBeDisabled();
      await globals.getByRole("button", { name: "Ajouter la permission", exact: true }).click();
      await expect.poll(async () => (await db.select().from(permissionGrants).where(EVERYONE)).length).toBe(1);
      const restored = await openAssignee(memberPage, item.key);
      await expect(restored.getByRole("option", { name: admin.name, exact: true })).toBeEnabled();
      await expect(memberPage.getByText(HINT, { exact: true })).toHaveCount(0);
    } finally { await restoreEveryone(); }
  });

  test("distinguishes backlog administrators from Jiroo administrators", async ({ pair: { adminPage } }) => {
    await navigate(adminPage, "/b/CASS/settings/access");
    await expect(adminPage.getByRole("region", { name: "Administrateur du backlog", exact: true })).toBeVisible();
    await adminPage.getByRole("button", { name: `Profil de ${admin.name}`, exact: true }).click();
    await adminPage.getByRole("menuitem", { name: "Profil", exact: true }).click();
    await expect(adminPage.getByRole("dialog", { name: "Profil", exact: true }).getByText("Administrateur Jiroo", { exact: true })).toBeVisible();
  });

  test("explains inherited global rights on user creation and links to groups", async ({ pair: { adminPage } }) => {
    await navigate(adminPage, "/admin?tab=users");
    await adminPage.getByRole("button", { name: "Nouvel utilisateur", exact: true }).click();
    const dialog = adminPage.getByRole("dialog", { name: "Nouvel utilisateur", exact: true });
    await expect(dialog.getByText(/Aucun droit global ne sera attribué directement à ce compte/)).toBeVisible();
    await expect(dialog.getByText(/il bénéficiera des droits accordés à tous les utilisateurs authentifiés/)).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Ouvrir les groupes", exact: true })).toHaveAttribute("href", "/admin?tab=groups");
  });
});
