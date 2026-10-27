import "dotenv/config";

import { expect, test, type Page } from "@playwright/test";
import { asc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { items, statuses } from "../lib/db/schema/domain";
import { archiveBacklog, createBacklog } from "../lib/services/backlogs";
import { createItem } from "../lib/services/items";
import { startSprint } from "../lib/services/sprint-lifecycle";
import { createSprint } from "../lib/services/sprints";
import { createStatus, reorderStatuses } from "../lib/services/statuses";

/**
 * JIR-123: a column added to the board is a real status everywhere — every way
 * of moving a ticket offers it, and the card then shows in that column.
 *
 * Each test gets its own backlog, archived afterwards (archived backlogs are
 * hidden everywhere). Starting a sprint writes append-only events, so the
 * backlog is archived rather than deleted and no other fixture is touched.
 */

const COLUMN = "Validation PO";
const TITLE = "Colonne ajoutée — carte déplacée";
const SPRINT = "Sprint colonnes";

let backlogId: string | null = null;

function uniqueKey() {
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join("");
  return `COL${letters}`;
}

async function adminId() {
  const [admin] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  if (!admin) throw new Error("Compte administrateur Playwright introuvable.");
  return admin.id;
}

/** A fresh backlog with a task in « À faire » inside a started sprint. */
async function boardFixture() {
  const actorId = await adminId();
  const backlog = await createBacklog({ key: uniqueKey(), name: "Flux PO E2E", color: "#7c3aed" }, actorId);
  backlogId = backlog.id;
  const ordered = await db.select({ id: statuses.id, category: statuses.category }).from(statuses)
    .where(eq(statuses.backlogId, backlog.id)).orderBy(asc(statuses.order));
  const todo = ordered.find((status) => status.category === "todo");
  if (!todo) throw new Error("Statut « À faire » introuvable.");
  const composant = await createItem({ backlogId: backlog.id, type: "composant", title: "Portail" }, actorId);
  const epic = await createItem(
    { backlogId: backlog.id, type: "epic", parentId: composant.id, title: "Dépôt" },
    actorId,
  );
  const sprint = await createSprint({ backlogId: backlog.id }, actorId);
  const task = await createItem(
    { backlogId: backlog.id, type: "tache", parentId: epic.id, title: TITLE, statusId: todo.id, sprintId: sprint.id },
    actorId,
  );
  await startSprint(
    {
      id: sprint.id,
      backlogId: backlog.id,
      name: SPRINT,
      goal: "Prouver JIR-123",
      startAt: "2026-10-20T09:00:00.000Z",
      endAt: "2026-11-03T18:00:00.000Z",
      capacityPoints: 13,
    },
    actorId,
  );
  return { backlog, task, todo, ordered };
}

/** Same fixture, with the column added through the status service. */
async function boardWithAddedColumn() {
  const fixture = await boardFixture();
  const column = await createStatus({
    backlogId: fixture.backlog.id,
    name: COLUMN,
    category: "in_progress",
    color: "#7c3aed",
  });
  return { ...fixture, column };
}

function columnGroup(page: Page) {
  return page.getByRole("group", { name: new RegExp(`^${COLUMN}, `) });
}

async function expectOnBoard(page: Page, key: string) {
  await page.goto(`/b/${key}?view=board`);
  await expect(columnGroup(page).getByText(TITLE)).toBeVisible();
}

async function addColumnFromDialog(page: Page) {
  await page.getByRole("button", { name: "Colonnes" }).click();
  await page.getByRole("button", { name: "Ajouter une colonne" }).click();
  await page.getByLabel("Nom").fill(COLUMN);
  await page.getByRole("button", { name: "Ajouter la colonne" }).click();
  await expect(page.getByRole("dialog").getByText(COLUMN)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(columnGroup(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // Wide enough for five columns side by side, so the drag needs no autoscroll.
  await page.setViewportSize({ width: 1920, height: 1000 });
});

test.afterEach(async () => {
  if (backlogId) await archiveBacklog(backlogId);
  backlogId = null;
});

test("une carte déposée sur une colonne ajoutée y reste et le ticket propose ce statut", async ({ page }) => {
  const { backlog, task } = await boardFixture();

  await page.goto(`/b/${backlog.key}?view=board`);
  await addColumnFromDialog(page);

  const target = columnGroup(page);
  const handle = page.getByRole("button", { name: `Déplacer ${task.key}` });
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Carte ou colonne hors écran.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 15 });
  await page.mouse.up();

  await expect(target.getByText(TITLE)).toBeVisible();
  await expect
    .poll(async () => {
      const [row] = await db
        .select({ name: statuses.name })
        .from(items)
        .innerJoin(statuses, eq(statuses.id, items.statusId))
        .where(eq(items.id, task.id));
      return row?.name;
    })
    .toBe(COLUMN);

  await page.reload();
  await expect(columnGroup(page).getByText(TITLE)).toBeVisible();

  await page.getByText(TITLE).click();
  const status = page.getByRole("combobox", { name: "Statut" });
  await expect(status.locator("option:checked")).toHaveText(COLUMN);
  await expect(status.locator("option", { hasText: COLUMN })).toHaveCount(1);
});

test("un ticket passé dans la colonne ajoutée depuis sa fiche apparaît dans cette colonne", async ({ page }) => {
  const { backlog } = await boardFixture();

  await page.goto(`/b/${backlog.key}?view=board`);
  await addColumnFromDialog(page);

  await page.getByText(TITLE).click();
  const status = page.getByRole("combobox", { name: "Statut" });
  await expect(status.locator("option", { hasText: COLUMN })).toHaveCount(1);
  await status.selectOption({ label: COLUMN });
  await expect(status.locator("option:checked")).toHaveText(COLUMN);
  await page.keyboard.press("Escape");

  await expect(columnGroup(page).getByText(TITLE)).toBeVisible();
});

test("le statut en ligne de la Liste propose la colonne ajoutée et y range le ticket", async ({ page }) => {
  const { backlog, task } = await boardWithAddedColumn();
  await page.goto(`/b/${backlog.key}?view=list`);
  const row = page.getByRole("listitem", { name: new RegExp(`^${task.key} —`) });
  await row.getByRole("button", { name: /^Statut : / }).click();
  await page.getByRole("menuitem", { name: COLUMN }).click();
  await expect(row.getByRole("button", { name: `Statut : ${COLUMN}` })).toBeVisible();
  await expectOnBoard(page, backlog.key);
});

test("le bouton « statut suivant » mène à la colonne ajoutée", async ({ page }) => {
  const { backlog, todo, ordered, column } = await boardWithAddedColumn();
  // Place the added column right after « À faire », as a PO would in the dialog.
  await reorderStatuses({
    backlogId: backlog.id,
    statusIds: [todo.id, column.id, ...ordered.filter((status) => status.id !== todo.id).map((status) => status.id)],
  });

  await page.goto(`/b/${backlog.key}?view=board`);
  await page.getByText(TITLE).click();
  await page.getByRole("button", { name: `Passer au statut ${COLUMN}` }).click();
  await expect(page.getByRole("combobox", { name: "Statut" }).locator("option:checked")).toHaveText(COLUMN);
  await page.keyboard.press("Escape");
  await expect(columnGroup(page).getByText(TITLE)).toBeVisible();
});

test("la modification groupée du statut propose la colonne ajoutée", async ({ page }) => {
  const { backlog, task } = await boardWithAddedColumn();
  await page.goto(`/b/${backlog.key}?view=list`);
  await page.getByRole("checkbox", { name: `Sélectionner ${task.key}`, exact: true }).click();
  await page.getByRole("button", { name: "Modifier le statut" }).click();
  await page.getByRole("menuitem", { name: COLUMN }).click();
  await expect(page.getByRole("listitem", { name: new RegExp(`^${task.key} —`) })).toContainText(COLUMN);
  await expectOnBoard(page, backlog.key);
});
