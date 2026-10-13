import "dotenv/config";

import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import {
  backlogRoleActors,
  backlogs,
  permissionSchemes,
  securityAuditEvents,
} from "../lib/db/schema/domain";
import { createBacklog } from "../lib/services/backlogs";

// JIR-85: a backlog's access page follows its own backlog (sidebar, selector,
// breadcrumb) and Simple mode removes occupants. The backlog is created here,
// in Simple mode on its private scheme, and deleted afterwards so the other
// specs keep seeing CASS and LABS only.
const KEY = "ACCZ";
const NAME = "Zone accès E2E";
const LAST_ADMIN_MESSAGE = "Le dernier administrateur effectif du backlog ne peut pas être retiré.";

let backlogId = "";

async function deleteFixture() {
  const [existing] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, KEY));
  if (!existing) return;
  await db.delete(backlogs).where(eq(backlogs.id, existing.id));
  await db.delete(permissionSchemes).where(eq(permissionSchemes.key, `backlog-${existing.id}-permission-scheme`));
}

test.beforeAll(async () => {
  await deleteFixture();
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, "platform-admin@jiroo.local"));
  if (!admin) throw new Error("Administrateur E2E introuvable.");
  const backlog = await createBacklog({ key: KEY, name: NAME, color: "#0f766e" }, admin.id);
  backlogId = backlog.id;
});

test.afterAll(deleteFixture);

test("aligne la barre latérale et le fil d’Ariane sur le backlog de la page Accès", async ({ page }, testInfo) => {
  await page.goto(`/b/${KEY}/settings/access`);
  await expect(page.getByRole("heading", { level: 1, name: `Accès — ${NAME}` })).toBeVisible();

  // The sidebar follows the URL, not the first backlog (Cour de cassation).
  await expect(page.getByRole("button", { name: `Backlog ${KEY} — ${NAME}` })).toBeVisible();
  const views = page.getByRole("navigation", { name: "Vues du projet" });
  await expect(views.getByRole("link", { name: "Releases" })).toHaveAttribute("href", `/b/${KEY}/releases`);

  const trail = page.getByRole("navigation", { name: "Fil d’Ariane" });
  await expect(trail.getByRole("listitem").filter({ hasNotText: "/" })).toHaveText([
    "Administration",
    "Backlogs",
    NAME,
    "Accès",
  ]);
  await expect(trail.getByText("Cour de cassation")).toHaveCount(0);
  await expect(trail.getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/admin");
  await expect(trail.getByText("Accès", { exact: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("jir85-access-shell.png"), caret: "initial" });

  await trail.getByRole("link", { name: "Backlogs" }).click();
  await expect(page).toHaveURL(/\/admin\?tab=backlogs$/);
  await expect(page.getByRole("tab", { name: "Backlogs" })).toHaveAttribute("aria-selected", "true");

  await page.goto(`/b/${KEY}/settings/access`);
  await page.getByRole("navigation", { name: "Fil d’Ariane" }).getByRole("link", { name: NAME }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${KEY}$`));
});

test("retire un occupant en mode Simple, sauf le dernier administrateur", async ({ page }, testInfo) => {
  await page.goto(`/b/${KEY}/settings/access`);
  await expect(page.getByRole("heading", { name: "Accès simple" })).toBeVisible();

  await page.getByRole("combobox", { name: "Ajouter un utilisateur ou groupe" }).selectOption({ label: "Membre E2E" });
  await page.getByRole("button", { name: "Ajouter à l’accès simple" }).click();
  await expect(page.getByRole("combobox", { name: "Rôle de Membre E2E" })).toBeVisible();

  const lastAdmin = page.getByRole("button", { name: "Retirer Administrateur E2E" });
  await expect(lastAdmin).toBeDisabled();
  await expect(lastAdmin).toHaveAccessibleDescription(LAST_ADMIN_MESSAGE);
  await page.screenshot({ path: testInfo.outputPath("jir85-access-simple-remove.png"), caret: "initial" });

  await page.getByRole("button", { name: "Retirer Membre E2E" }).click();
  await expect(page.getByRole("combobox", { name: "Rôle de Membre E2E" })).toHaveCount(0);
  // Scoped to main: Next.js keeps its route announcer (role alert) outside.
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

  const [member] = await db.select({ id: user.id }).from(user).where(eq(user.email, "member@jiroo.local"));
  if (!member) throw new Error("Membre E2E introuvable.");
  await expect.poll(async () => (await db.select({ id: backlogRoleActors.id }).from(backlogRoleActors).where(and(
    eq(backlogRoleActors.backlogId, backlogId),
    eq(backlogRoleActors.userId, member.id),
  ))).length).toBe(0);
  const removals = await db.select({ id: securityAuditEvents.id }).from(securityAuditEvents).where(and(
    eq(securityAuditEvents.backlogId, backlogId),
    eq(securityAuditEvents.action, "backlog_role_actor_removed"),
  ));
  expect(removals).toHaveLength(1);

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Rôle de Membre E2E" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retirer Administrateur E2E" })).toBeDisabled();
});
