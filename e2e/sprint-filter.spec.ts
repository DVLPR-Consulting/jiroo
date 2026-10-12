import "dotenv/config";

import { expect, test } from "@playwright/test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items, sprints, statuses } from "../lib/db/schema/domain";
import { createItem, updateItem } from "../lib/services/items";
import { completeSprint, startSprint } from "../lib/services/sprint-lifecycle";
import { createSprint, updateSprint } from "../lib/services/sprints";

/**
 * JIR-81: the « Sprint » filter finds the items of a completed sprint in the
 * Liste, the carried-over ones included (Jira's `Sprint = "<name>"`).
 * Runs on LABS so the CASS sprint scenarios keep their own active sprint,
 * and leaves LABS without sprints for the report scenarios.
 */
const CLOSED_SPRINT = "Filtre Sprint terminé";
const NEXT_SPRINT = "Filtre Sprint suivant";
const TASK_DONE = "Filtre sprint — terminé";
const TASK_CARRIED = "Filtre sprint — reporté";
const TASK_LOOSE = "Filtre sprint — hors sprint";
const COMPONENT = "Filtre sprint — composant";
const EPIC = "Filtre sprint — epic";

async function seed() {
  const [actor] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs)
    .where(eq(backlogs.key, "LABS"));
  if (!actor || !backlog) throw new Error("Fixture LABS incomplète.");
  const statusRows = await db.select({ id: statuses.id, category: statuses.category })
    .from(statuses).where(eq(statuses.backlogId, backlog.id));
  const todo = statusRows.find((status) => status.category === "todo");
  const done = statusRows.find((status) => status.category === "done");
  if (!todo || !done) throw new Error("Statuts LABS incomplets.");

  const named = async (name: string) => {
    const sprint = await createSprint({ backlogId: backlog.id }, actor.id);
    await updateSprint({ id: sprint.id, backlogId: backlog.id, name }, actor.id);
    return sprint;
  };
  // A tâche needs an Epic parent; LABS only has a seeded orphan tâche.
  const component = await createItem({
    backlogId: backlog.id,
    type: "composant",
    title: COMPONENT,
    statusId: todo.id,
  }, actor.id, "sprint-filter-e2e-component");
  const epic = await createItem({
    backlogId: backlog.id,
    type: "epic",
    parentId: component.id,
    title: EPIC,
    statusId: todo.id,
  }, actor.id, "sprint-filter-e2e-epic");
  const task = (title: string, sprintId?: string) =>
    createItem({
      backlogId: backlog.id,
      type: "tache",
      parentId: epic.id,
      title,
      statusId: todo.id,
      ...(sprintId ? { sprintId } : {}),
    }, actor.id, `sprint-filter-e2e-${title}`);

  const closed = await named(CLOSED_SPRINT);
  const finished = await task(TASK_DONE, closed.id);
  await task(TASK_CARRIED, closed.id);
  await task(TASK_LOOSE);
  await startSprint({
    id: closed.id,
    backlogId: backlog.id,
    name: CLOSED_SPRINT,
    goal: null,
    startAt: "2026-09-01T09:00:00.000Z",
    endAt: "2026-09-15T18:00:00.000Z",
    capacityPoints: 10,
  }, actor.id, "sprint-filter-e2e-start");
  await updateItem({ id: finished.id, statusId: done.id }, actor.id, "sprint-filter-e2e-done");
  const next = await named(NEXT_SPRINT);
  await completeSprint({
    id: closed.id,
    backlogId: backlog.id,
    destination: { type: "existing_sprint", sprintId: next.id },
  }, actor.id, "sprint-filter-e2e-complete");
  return { backlogId: backlog.id, closedId: closed.id };
}

let fixture: Awaited<ReturnType<typeof seed>>;

test.beforeAll(async () => {
  fixture = await seed();
});

test.afterAll(async () => {
  if (!fixture) return;
  // Later specs expect LABS without active or completed sprints. Sprint
  // history is append-only: like the sprint lifecycle spec, truncate it, then
  // remove the scenario's tickets (children first, which drops their sprint
  // memberships) and its sprints.
  await db.execute(sql.raw(
    "TRUNCATE TABLE sprint_report_items, sprint_report_snapshots, sprint_events RESTART IDENTITY CASCADE",
  ));
  for (const titles of [[TASK_DONE, TASK_CARRIED, TASK_LOOSE], [EPIC], [COMPONENT]]) {
    await db.delete(items).where(and(
      eq(items.backlogId, fixture.backlogId),
      inArray(items.title, titles),
    ));
  }
  await db.delete(sprints).where(and(
    eq(sprints.backlogId, fixture.backlogId),
    inArray(sprints.name, [CLOSED_SPRINT, NEXT_SPRINT]),
  ));
});

test("filtre la Liste par un sprint terminé, ticket reporté compris, et le garde au rechargement", async ({ page }, testInfo) => {
  await page.goto("/b/LABS?view=list");
  const list = page.getByRole("main");
  await expect(list.getByText(TASK_LOOSE)).toBeVisible();

  await page.getByRole("button", { name: "Filtre", exact: true }).click();
  await page.getByRole("button", { name: "Sprint", exact: true }).click();
  const facet = page.getByRole("group", { name: "Filtre Sprint" });
  await expect(facet.getByRole("group", { name: "Terminés" }).getByLabel(CLOSED_SPRINT)).toBeVisible();
  await expect(facet.getByRole("group", { name: "Planifiés" }).getByLabel(NEXT_SPRINT)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("jir81-menu-sprint.png"),
    caret: "initial",
  });
  await facet.getByLabel(CLOSED_SPRINT).check();
  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(new RegExp(`[?&]sprint=${fixture.closedId}(&|$)`));
  const expectFiltered = async () => {
    await expect(page.getByRole("button", { name: `Sprint : ${CLOSED_SPRINT}` })).toBeVisible();
    await expect(list.getByText(TASK_DONE)).toBeVisible();
    await expect(list.getByText(TASK_CARRIED)).toBeVisible();
    await expect(list.getByText(TASK_LOOSE)).toHaveCount(0);
    await expect(list.getByText("Prototype isolé")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "résultat" })).toHaveText("2 résultats");
  };
  await expectFiltered();

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`[?&]sprint=${fixture.closedId}(&|$)`));
  await expectFiltered();
  await page.screenshot({
    path: testInfo.outputPath("jir81-liste-filtre-sprint-termine.png"),
    fullPage: true,
    caret: "initial",
  });

  await page.getByRole("button", { name: "Réinitialiser" }).click();
  await expect(page).not.toHaveURL(/[?&]sprint=/);
  await expect(list.getByText(TASK_LOOSE)).toBeVisible();
});
