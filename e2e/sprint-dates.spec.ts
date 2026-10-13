import "dotenv/config";

import { expect, test, type Page } from "@playwright/test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, sprints } from "../lib/db/schema/domain";
import { createSprint, updateSprint } from "../lib/services/sprints";
import { sprintMenuAction } from "./backlog-helpers";

/**
 * JIR-87: a sprint date entered without its time no longer blocks the form;
 * the time defaults to 09:00 (start) / 18:00 (end), Paris time, and starting
 * a sprint without dates prefills now and two weeks later, like Jira.
 */
test.use({ timezoneId: "Europe/Paris" });

const EDITED_SPRINT = "JIR-87 Dates seules";
const STARTED_SPRINT = "JIR-87 Démarrage";

async function seedSprint(name: string) {
  const [actor] = await db.select({ id: user.id }).from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  if (!actor || !backlog) throw new Error("Fixture CASS incomplète.");
  const sprint = await createSprint({ backlogId: backlog.id }, actor.id);
  await updateSprint({ id: sprint.id, backlogId: backlog.id, name }, actor.id);
  return sprint;
}

async function storedSprint(id: string) {
  const [row] = await db
    .select({
      state: sprints.state,
      plannedStartAt: sprints.plannedStartAt,
      plannedEndAt: sprints.plannedEndAt,
      startedAt: sprints.startedAt,
    })
    .from(sprints)
    .where(eq(sprints.id, id));
  if (!row) throw new Error("Sprint introuvable.");
  return row;
}

async function cleanFixture() {
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  if (!backlog) return;
  await db.execute(sql.raw(
    "TRUNCATE TABLE sprint_report_items, sprint_report_snapshots, sprint_events RESTART IDENTITY CASCADE",
  ));
  await db.delete(sprints).where(and(
    eq(sprints.backlogId, backlog.id),
    inArray(sprints.name, [EDITED_SPRINT, STARTED_SPRINT]),
  ));
}

/** `YYYY-MM-DD` of an instant in Paris, `days` calendar days later. */
function parisDate(instant: Date, days = 0) {
  const shifted = new Date(instant);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(shifted);
}

function sprintPosts(page: Page) {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/b/CASS") {
      posts.push(request.url());
    }
  });
  return posts;
}

test.beforeEach(cleanFixture);
test.afterEach(cleanFixture);

test("enregistre des dates de sprint saisies sans heure et explique une fin avant le début", async ({
  page,
}, testInfo) => {
  const sprint = await seedSprint(EDITED_SPRINT);
  const posts = sprintPosts(page);
  await page.goto("/b/CASS?view=backlog");

  await sprintMenuAction(page, EDITED_SPRINT, "Modifier");
  const dialog = page.getByRole("dialog", { name: `Modifier ${EDITED_SPRINT}` });
  // Across the end of summer time (25 October 2026, 03:00).
  await dialog.getByLabel("Début prévu").fill("2026-10-24");
  await dialog.getByLabel("Fin prévue").fill("2026-10-25");
  await expect(dialog.getByLabel("Heure de début")).toHaveValue("");
  await dialog.screenshot({ path: testInfo.outputPath("jir87-edit-date-only.png") });
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(async () => {
    const row = await storedSprint(sprint.id);
    return [row.plannedStartAt?.toISOString(), row.plannedEndAt?.toISOString()];
  }).toEqual(["2026-10-24T07:00:00.000Z", "2026-10-25T17:00:00.000Z"]);

  await sprintMenuAction(page, EDITED_SPRINT, "Modifier");
  await expect(dialog.getByLabel("Début prévu")).toHaveValue("2026-10-24");
  await expect(dialog.getByLabel("Heure de début")).toHaveValue("09:00");
  await expect(dialog.getByLabel("Fin prévue")).toHaveValue("2026-10-25");
  await expect(dialog.getByLabel("Heure de fin")).toHaveValue("18:00");

  const postsBefore = posts.length;
  await dialog.getByLabel("Fin prévue").fill("2026-10-20");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  const end = dialog.getByLabel("Fin prévue");
  await expect(end).toHaveAttribute("aria-invalid", "true");
  await expect(end).toHaveAccessibleDescription(
    /La date de fin doit être postérieure à la date de début\./,
  );
  await dialog.screenshot({ path: testInfo.outputPath("jir87-edit-end-before-start.png") });
  expect(posts.length).toBe(postsBefore);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("démarre un sprint sans dates prévues avec des dates saisies sans heure", async ({
  page,
}, testInfo) => {
  const sprint = await seedSprint(STARTED_SPRINT);
  await page.goto("/b/CASS?view=backlog");

  const openedAt = new Date();
  await page.getByRole("button", { name: `Démarrer le sprint ${STARTED_SPRINT}` }).click();
  const dialog = page.getByRole("dialog", { name: `Démarrer ${STARTED_SPRINT}` });
  // Prefilled like Jira: now, and two weeks later.
  await expect(dialog.getByLabel("Début", { exact: true })).toHaveValue(parisDate(openedAt));
  await expect(dialog.getByLabel("Heure de début")).toHaveValue(/^\d{2}:\d{2}$/);
  await expect(dialog.getByLabel("Fin", { exact: true })).toHaveValue(parisDate(openedAt, 14));
  await dialog.screenshot({ path: testInfo.outputPath("jir87-start-prefilled.png") });

  await dialog.getByLabel("Début", { exact: true }).fill("2026-10-25");
  await dialog.getByLabel("Heure de début").fill("");
  await dialog.getByLabel("Fin", { exact: true }).fill("2026-11-06");
  await dialog.getByLabel("Heure de fin").fill("");
  await dialog.getByRole("button", { name: "Confirmer le démarrage" }).click();

  await expect(page).toHaveURL(/view=board/);
  await expect(page.getByRole("heading", { name: STARTED_SPRINT })).toBeVisible();
  const row = await storedSprint(sprint.id);
  expect(row.state).toBe("active");
  expect(row.startedAt?.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  expect(row.plannedStartAt?.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  expect(row.plannedEndAt?.toISOString()).toBe("2026-11-06T17:00:00.000Z");
});
