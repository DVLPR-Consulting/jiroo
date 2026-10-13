import "dotenv/config";

import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs } from "../lib/db/schema/domain";
import { changeItemFixVersions } from "../lib/services/item-fix-versions";
import { createLabel } from "../lib/services/labels";
import { createRelease } from "../lib/services/releases";
import { createItem, softDeleteItem } from "../lib/services/items";
import { keyPattern } from "./key-helpers";

/**
 * JIR-93: every list display shows the Backlog row. The Liste lists its rows
 * under a « Trier la liste » strip and shows « Colonnes » fields as pills.
 */
const RUN = process.env.JIROO_E2E_RUN_ID ?? String(Date.now());

async function context() {
  const [admin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  const [backlog] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  return { actorId: admin!.id, backlogId: backlog!.id };
}

/** A Composant and its Epic of this spec, so every parent is known. */
async function fixtureEpic(title: string) {
  const { actorId, backlogId } = await context();
  const composant = await createItem(
    { backlogId, type: "composant", parentId: null, title: `${title} (composant)` },
    actorId,
  );
  return createItem({ backlogId, type: "epic", parentId: composant.id, title }, actorId);
}

let sharedEpic: Awaited<ReturnType<typeof fixtureEpic>> | null = null;

async function task(
  title: string,
  input: Record<string, unknown> = {},
  parent?: { id: string },
) {
  const { actorId, backlogId } = await context();
  sharedEpic ??= await fixtureEpic(`JIR-93 epic ${RUN}`);
  const parentId = (parent ?? sharedEpic).id;
  return createItem({ backlogId, type: "tache", parentId, title, ...input }, actorId);
}

test("trie la Liste depuis « Trier la liste » et affiche les colonnes choisies en pastilles", async ({ page }) => {
  const prefix = `JIR-93 tri ${RUN}`;
  const { backlogId } = await context();
  const epic = await fixtureEpic(`JIR-93 parent ${RUN}`);
  const label = await createLabel({ backlogId, name: `jir93-${RUN}`.slice(0, 40) });
  const high = await task(
    `${prefix} haute`,
    { priority: 4, labelIds: [label.id], dueDate: "2026-11-20" },
    epic,
  );
  const low = await task(`${prefix} basse`, { priority: 1 }, epic);

  await page.goto(`/b/CASS?view=list&q=${encodeURIComponent(prefix)}`);
  const list = page.getByRole("list", { name: "Liste des items" });
  // Rows are list items: no table, no column headers (JIR-93 review).
  await expect(page.getByRole("main").getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("columnheader")).toHaveCount(0);
  const highRow = list.getByRole("listitem", { name: `${high.key} — ${high.title}` });
  await expect(highRow).toBeVisible();
  // The parent is a pill (the Liste is flat): this spec's own Epic.
  await expect(highRow.getByTitle(`${epic.key} — ${epic.title}`)).toBeVisible();
  await expect(highRow.getByText(label.name)).toHaveCount(0);

  const sort = page.getByRole("group", { name: "Trier la liste" });
  const priority = sort.getByRole("button", { name: "Trier par Priorité" });
  await expect(priority).toHaveAttribute("aria-pressed", "false");
  await priority.click();
  await expect(page).toHaveURL(/[?&]sort=priority%3Aasc/);
  const ascending = sort.getByRole("button", { name: "Trier par Priorité, croissant" });
  await expect(ascending).toHaveAttribute("aria-pressed", "true");
  await ascending.press("Enter");
  await expect(page).toHaveURL(/[?&]sort=priority%3Adesc/);
  await expect(sort.getByRole("button", { name: "Trier par Priorité, décroissant" }))
    .toHaveAttribute("aria-pressed", "true");
  const keys = await list.locator("[role=listitem][data-shortcut-item]").evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-shortcut-item")),
  );
  expect(keys).toEqual([high.key, low.key]);

  await page.getByRole("button", { name: "Configurer les colonnes" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Labels" }).click();
  await expect(page).toHaveURL(/[?&]lblcol=1/);
  await page.keyboard.press("Escape");
  await expect(highRow.getByText(label.name)).toBeVisible();

  await page.reload();
  await expect(highRow.getByText(label.name)).toBeVisible();
  await expect(highRow.getByTitle("Échéance")).toHaveCount(0);
  await expect(sort.getByRole("button", { name: "Trier par Priorité, décroissant" }))
    .toHaveAttribute("aria-pressed", "true");

  await highRow.getByText(high.title).click();
  await expect(page).toHaveURL(new RegExp(`[?&]item=${high.key}(&|$)`));
  await expect(page.getByRole("dialog", { name: keyPattern(high.key) })).toBeVisible();
});

test("montre Mes items en lignes du Backlog qui ouvrent l’item", async ({ page }) => {
  const { actorId } = await context();
  const mine = await task(`JIR-93 mes items ${RUN}`, {
    assigneeId: actorId,
    kind: "bug",
    estimatePoints: 3,
    priority: 3,
  });

  await page.goto("/mine");
  const row = page.getByRole("listitem").filter({ hasText: mine.title });
  await expect(row.getByText("Bug")).toBeVisible();
  await expect(row.getByText("À faire")).toBeVisible();
  await expect(row.getByTitle("Points")).toHaveText(/3/);
  await row.getByRole("link", { name: keyPattern(mine.key) }).click();
  await expect(page).toHaveURL(new RegExp(`/b/CASS\\?item=${mine.key}$`));
  await expect(page.getByRole("dialog", { name: new RegExp(`^${mine.key} —`) })).toBeVisible();
});

test("restaure un item depuis sa ligne de la Corbeille", async ({ page }) => {
  const { actorId } = await context();
  const doomed = await task(`JIR-93 corbeille ${RUN}`, { kind: "bug" });
  await softDeleteItem({ id: doomed.id }, actorId);

  await page.goto("/trash");
  const row = page.getByRole("listitem").filter({ hasText: doomed.title });
  await expect(row.getByText(doomed.key, { exact: true })).toBeVisible();
  await expect(row.getByText("Bug")).toBeVisible();
  await expect(row.getByText("supprimé aujourd'hui")).toBeVisible();
  await expect(row.getByRole("link")).toHaveCount(0);
  await row.getByRole("button", { name: "Restaurer" }).click();
  await expect(page.getByText("Item restauré.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: doomed.title })).toHaveCount(0);

  await page.goto(`/b/CASS?view=list&q=${encodeURIComponent(doomed.title)}`);
  await expect(page.getByRole("listitem", { name: `${doomed.key} — ${doomed.title}` })).toBeVisible();
});

test("montre le périmètre d’une release en lignes du Backlog", async ({ page }) => {
  const { actorId, backlogId } = await context();
  const release = await createRelease({
    backlogId,
    name: `JIR-93 ${RUN}`.slice(0, 40),
    driverId: actorId,
  }, actorId, `jir93-release-${RUN}`);
  const scoped = await task(`JIR-93 périmètre ${RUN}`, { estimatePoints: 5, kind: "bug" });
  await changeItemFixVersions({
    backlogId,
    itemId: scoped.id,
    mode: "replace",
    releaseIds: [release.id],
  }, actorId, `jir93-fix-${RUN}`);

  await page.goto(`/b/CASS/releases/${release.id}`);
  const row = page.getByRole("region", { name: "Périmètre actuel" })
    .getByRole("listitem").filter({ hasText: scoped.title });
  await expect(row.getByText("Bug")).toBeVisible();
  await expect(row.getByText("À faire")).toBeVisible();
  await expect(row.getByTitle("Points")).toHaveText(/5/);
  await row.getByRole("link", { name: keyPattern(scoped.key) }).click();
  await expect(page).toHaveURL(new RegExp(`/b/CASS\\?item=${scoped.key}$`));
});
