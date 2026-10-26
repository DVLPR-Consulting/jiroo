import "dotenv/config";

import { expect, test } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items, sprints, statuses } from "../lib/db/schema/domain";
import { createItem } from "../lib/services/items";
import { startSprint } from "../lib/services/sprint-lifecycle";
import { createStatus } from "../lib/services/statuses";
import { createSprint } from "../lib/services/sprints";

/** JIR-123: a column added from the board receives cards and is a real status everywhere. */

const COLUMN = "Validation PO";
const TITLE = "Colonne ajoutée — carte déplacée";
const SPRINT = "Sprint colonnes";

async function labsFixture() {
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "CASS"));
  const [actor] = await db.select({ id: user.id }).from(user).where(eq(user.email, "platform-admin@jiroo.local"));
  if (!backlog || !actor) throw new Error("Fixture CASS incomplète.");
  const [todo] = await db
    .select({ id: statuses.id })
    .from(statuses)
    .where(and(eq(statuses.backlogId, backlog.id), eq(statuses.category, "todo")))
    .limit(1);
  const [epic] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, "epic")))
    .limit(1);
  if (!todo || !epic) throw new Error("Statut initial ou epic CASS introuvable.");
  return { backlog, actor, todo, epic };
}

async function cleanup() {
  const { backlog } = await labsFixture();
  await db.delete(items).where(and(eq(items.backlogId, backlog.id), eq(items.title, TITLE)));
  await db.execute(sql.raw(
    "TRUNCATE TABLE sprint_report_items, sprint_report_snapshots, sprint_events RESTART IDENTITY CASCADE",
  ));
  await db.delete(sprints).where(and(eq(sprints.backlogId, backlog.id), eq(sprints.name, SPRINT)));
  await db.delete(statuses).where(and(eq(statuses.backlogId, backlog.id), eq(statuses.name, COLUMN)));
}

test.beforeEach(cleanup);
test.afterAll(cleanup);

test("une carte déposée sur une colonne ajoutée y reste et le ticket propose ce statut", async ({ page }) => {
  const { backlog, actor, todo, epic } = await labsFixture();
  const sprint = await createSprint({ backlogId: backlog.id }, actor.id);
  const task = await createItem(
    { backlogId: backlog.id, type: "tache", parentId: epic.id, title: TITLE, statusId: todo.id, sprintId: sprint.id },
    actor.id,
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
    actor.id,
  );

  await page.goto("/b/CASS?view=board");
  await page.getByRole("button", { name: "Colonnes" }).click();
  await page.getByRole("button", { name: "Ajouter une colonne" }).click();
  await page.getByLabel("Nom").fill(COLUMN);
  await page.getByRole("button", { name: "Ajouter la colonne" }).click();
  await expect(page.getByRole("dialog").getByText(COLUMN)).toBeVisible();
  await page.keyboard.press("Escape");

  const target = page.getByRole("group", { name: new RegExp(`^${COLUMN}, `) });
  await expect(target).toBeVisible();

  const handle = page.getByRole("button", { name: `Déplacer ${task.key}` });
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
  await expect(page.getByRole("group", { name: new RegExp(`^${COLUMN}, `) }).getByText(TITLE)).toBeVisible();

  await page.getByText(TITLE).click();
  const status = page.getByRole("combobox", { name: "Statut" });
  await expect(status.locator("option:checked")).toHaveText(COLUMN);
  await expect(status.locator("option", { hasText: COLUMN })).toHaveCount(1);
});

test("un ticket passé dans la colonne ajoutée depuis sa fiche apparaît dans cette colonne", async ({ page }) => {
  const { backlog, actor, todo, epic } = await labsFixture();
  const sprint = await createSprint({ backlogId: backlog.id }, actor.id);
  await createItem(
    { backlogId: backlog.id, type: "tache", parentId: epic.id, title: TITLE, statusId: todo.id, sprintId: sprint.id },
    actor.id,
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
    actor.id,
  );

  await page.goto("/b/CASS?view=board");
  await page.getByRole("button", { name: "Colonnes" }).click();
  await page.getByRole("button", { name: "Ajouter une colonne" }).click();
  await page.getByLabel("Nom").fill(COLUMN);
  await page.getByRole("button", { name: "Ajouter la colonne" }).click();
  await expect(page.getByRole("dialog").getByText(COLUMN)).toBeVisible();
  await page.keyboard.press("Escape");
  const target = page.getByRole("group", { name: new RegExp(`^${COLUMN}, `) });
  await expect(target).toBeVisible();

  await page.getByText(TITLE).click();
  const status = page.getByRole("combobox", { name: "Statut" });
  await expect(status.locator("option", { hasText: COLUMN })).toHaveCount(1);
  await status.selectOption({ label: COLUMN });
  await expect(status.locator("option:checked")).toHaveText(COLUMN);
  await page.keyboard.press("Escape");

  await expect(target.getByText(TITLE)).toBeVisible();
});

async function boardWithAddedColumn() {
  const { backlog, actor, todo, epic } = await labsFixture();
  const sprint = await createSprint({ backlogId: backlog.id }, actor.id);
  const task = await createItem(
    { backlogId: backlog.id, type: "tache", parentId: epic.id, title: TITLE, statusId: todo.id, sprintId: sprint.id },
    actor.id,
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
    actor.id,
  );
  const column = await createStatus({ backlogId: backlog.id, name: COLUMN, category: "in_progress", color: "#7c3aed" });
  return { task, column };
}

async function expectOnBoard(page: import("@playwright/test").Page) {
  await page.goto("/b/CASS?view=board");
  await expect(page.getByRole("group", { name: new RegExp(`^${COLUMN}, `) }).getByText(TITLE)).toBeVisible();
}

test("le statut en ligne de la Liste propose la colonne ajoutée et y range le ticket", async ({ page }) => {
  const { task } = await boardWithAddedColumn();
  await page.goto(`/b/CASS?view=list&q=${encodeURIComponent(TITLE)}`);
  const row = page.getByRole("listitem", { name: new RegExp(`^${task.key} —`) });
  await row.getByRole("button", { name: /^Statut : / }).click();
  await page.getByRole("menuitem", { name: COLUMN }).click();
  await expect(row.getByRole("button", { name: `Statut : ${COLUMN}` })).toBeVisible();
  await expectOnBoard(page);
});

test("le bouton « statut suivant » mène à la colonne ajoutée en fin de flux", async ({ page }) => {
  const { task } = await boardWithAddedColumn();
  const ordered = await db
    .select({ id: statuses.id, name: statuses.name })
    .from(statuses)
    .where(eq(statuses.backlogId, task.backlogId))
    .orderBy(statuses.order);
  const beforeLast = ordered.at(-2)!;
  await db.update(items).set({ statusId: beforeLast.id }).where(eq(items.id, task.id));

  await page.goto("/b/CASS?view=board");
  await page.getByText(TITLE).click();
  await page.getByRole("button", { name: `Passer au statut ${COLUMN}` }).click();
  await expect(page.getByRole("combobox", { name: "Statut" }).locator("option:checked")).toHaveText(COLUMN);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: new RegExp(`^${COLUMN}, `) }).getByText(TITLE)).toBeVisible();
});

test("la modification groupée du statut propose la colonne ajoutée", async ({ page }) => {
  const { task } = await boardWithAddedColumn();
  await page.goto(`/b/CASS?view=list&q=${encodeURIComponent(TITLE)}`);
  await page.getByRole("checkbox", { name: `Sélectionner ${task.key}`, exact: true }).click();
  await page.getByRole("button", { name: "Modifier le statut" }).click();
  await page.getByRole("menuitem", { name: COLUMN }).click();
  await expect(page.getByRole("listitem", { name: new RegExp(`^${task.key} —`) })).toContainText(COLUMN);
  await expectOnBoard(page);
});
