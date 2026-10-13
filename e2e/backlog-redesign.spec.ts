import "dotenv/config";

import { expect, test, type Page } from "@playwright/test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items, sprints, statuses } from "../lib/db/schema/domain";
import { createItem, updateItem } from "../lib/services/items";
import { createSprint, updateSprint } from "../lib/services/sprints";
import { createInlineItem, sprintMenuAction } from "./backlog-helpers";

/** JIR-75: the Jira-like Backlog (sprint headers, compact rows, inline creation). */
test.use({ viewport: { width: 1440, height: 900 } });

const EMPTY_SPRINT = "Refonte — sprint vide";
const PLANNED_SPRINT = "Refonte — sprint planifié";
const SPRINT_TASK = "Refonte — tâche planifiée";
const BARE_TASK = "Refonte — tâche sans valeurs";
const INLINE_SPRINT_TASK = "Refonte — créée dans le sprint";
const INLINE_BACKLOG_TASK = "Refonte — créée dans le backlog";
const TITLES = [SPRINT_TASK, BARE_TASK, INLINE_SPRINT_TASK, INLINE_BACKLOG_TASK];
const SPRINT_NAMES = [EMPTY_SPRINT, PLANNED_SPRINT];
const SCREENSHOTS =
  process.env.JIR75_SCREENSHOT_DIR ??
  "/private/tmp/claude-501/-Users-nkrmnr-Developer-jiroo/fb801454-d1de-4226-be36-4f9a61dd1c9f/scratchpad";

async function context() {
  const [backlog] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.key, "CASS"));
  const [actor] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "platform-admin@jiroo.local"));
  if (!backlog || !actor) throw new Error("Fixture CASS incomplète.");
  const [epic] = await db
    .select({ id: items.id, title: items.title })
    .from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, "epic")))
    .limit(1);
  const statusRows = await db
    .select({ id: statuses.id, category: statuses.category, order: statuses.order })
    .from(statuses)
    .where(eq(statuses.backlogId, backlog.id));
  const doing = statusRows
    .filter((status) => status.category === "in_progress")
    .sort((a, b) => a.order - b.order)[0];
  if (!epic || !doing) throw new Error("Fixture CASS incomplète.");
  return { backlog, actor, epic, doing };
}

async function clean() {
  const { backlog } = await context();
  await db.execute(sql.raw(
    "TRUNCATE TABLE sprint_report_items, sprint_report_snapshots, sprint_events RESTART IDENTITY CASCADE",
  ));
  await db
    .delete(items)
    .where(and(eq(items.backlogId, backlog.id), inArray(items.title, TITLES)));
  await db
    .delete(sprints)
    .where(and(eq(sprints.backlogId, backlog.id), inArray(sprints.name, SPRINT_NAMES)));
}

/** A planned sprint holding one estimated, in-progress task; an empty one; a bare backlog task. */
async function seed() {
  const { backlog, actor, epic, doing } = await context();
  const planned = await createSprint({ backlogId: backlog.id }, actor.id);
  await updateSprint(
    {
      id: planned.id,
      backlogId: backlog.id,
      name: PLANNED_SPRINT,
      goal: "Valider la refonte du Backlog",
      plannedStartAt: "2026-10-12T09:00:00.000Z",
      plannedEndAt: "2026-10-23T18:00:00.000Z",
    },
    actor.id,
  );
  const empty = await createSprint({ backlogId: backlog.id }, actor.id);
  await updateSprint({ id: empty.id, backlogId: backlog.id, name: EMPTY_SPRINT }, actor.id);
  const task = await createItem(
    {
      backlogId: backlog.id,
      type: "tache",
      parentId: epic.id,
      title: SPRINT_TASK,
      statusId: doing.id,
      priority: 3,
      sprintId: planned.id,
    },
    actor.id,
  );
  await updateItem({ id: task.id, estimatePoints: 5 }, actor.id);
  const bare = await createItem(
    {
      backlogId: backlog.id,
      type: "tache",
      parentId: epic.id,
      title: BARE_TASK,
      priority: 0,
    },
    actor.id,
  );
  return { epic, task, bare };
}

async function businessPost(page: Page, action: () => Promise<void>) {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/b/CASS",
  );
  await action();
  const settled = await response;
  await settled.finished();
  expect(settled.status()).toBeLessThan(400);
}

function section(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

function observeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test.beforeEach(clean);
test.afterEach(clean);

test("en-tête de sprint : points par statut, action principale et menu ⋯", async ({ page }) => {
  const errors = observeErrors(page);
  await seed();
  await page.goto("/b/CASS?view=backlog");

  const planned = section(page, PLANNED_SPRINT);
  await expect(planned.getByRole("heading", { name: PLANNED_SPRINT })).toBeVisible();
  await expect(planned.getByText("Planifié", { exact: true })).toBeVisible();
  await expect(planned.getByText("Valider la refonte du Backlog")).toBeVisible();
  await expect(planned.getByText("Points par statut : À faire 0, En cours 5, Terminé 0"))
    .toBeAttached();
  await expect(planned.getByText(/^1 item · 0 non estimé/)).toBeVisible();
  await expect(planned.getByRole("button", { name: `Démarrer le sprint ${PLANNED_SPRINT}` }))
    .toBeVisible();
  await expect(planned.getByRole("button", { name: /^\+ Tâche|Créer une tâche/ })).toHaveCount(0);

  // ⋯ → Modifier opens the sprint form, Escape returns focus to the menu button.
  await sprintMenuAction(page, PLANNED_SPRINT, "Modifier");
  const dialog = page.getByRole("dialog", { name: `Modifier ${PLANNED_SPRINT}` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Nom" })).toHaveValue(PLANNED_SPRINT);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Actions de ${PLANNED_SPRINT}` })).toBeFocused();

  // A sprint without dates or goal links to the same form.
  const empty = section(page, EMPTY_SPRINT);
  await empty.getByRole("button", { name: "Ajouter des dates et un objectif" }).click();
  await expect(page.getByRole("dialog", { name: `Modifier ${EMPTY_SPRINT}` })).toBeVisible();
  await page.keyboard.press("Escape");

  // ⋯ → Monter reorders planned sprints.
  const headings = page.locator("[data-sprint-section] h3");
  const before = await headings.allTextContents();
  expect(before.indexOf(EMPTY_SPRINT)).toBe(before.indexOf(PLANNED_SPRINT) + 1);
  await businessPost(page, () => sprintMenuAction(page, EMPTY_SPRINT, "Monter"));
  await expect
    .poll(async () => {
      const after = await headings.allTextContents();
      return after.indexOf(EMPTY_SPRINT) < after.indexOf(PLANNED_SPRINT);
    })
    .toBe(true);

  const backlog = section(page, "Backlog");
  await expect(backlog.getByText(/^\d+ items? · \d+ non estimés?$/)).toBeVisible();
  await expect(backlog.getByText(/^Points par statut : /)).toBeAttached();
  await expect(backlog.getByRole("button", { name: "Créer un sprint" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("glisser un item du backlog dans la zone d’un sprint vide le planifie", async ({ page }) => {
  await seed();
  await page.goto("/b/CASS?view=backlog");
  const empty = section(page, EMPTY_SPRINT);
  const zone = empty.getByText("Glissez des items du backlog ici pour planifier le sprint");
  await expect(zone).toBeVisible();

  const bareRow = page.getByRole("row", { name: new RegExp(`— ${BARE_TASK}$`) });
  const key = (await bareRow.getAttribute("aria-label"))!.split(" — ")[0]!;
  const handle = page.getByRole("button", { name: `Déplacer ${key}`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  await zone.scrollIntoViewIfNeeded();
  const origin = await handle.boundingBox();
  const target = await zone.boundingBox();
  if (!origin || !target) throw new Error("Géométrie du glisser-déposer introuvable.");

  await businessPost(page, async () => {
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
    await page.mouse.down();
    await page.mouse.move(origin.x + origin.width / 2 + 10, origin.y + origin.height / 2, {
      steps: 3,
    });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
      steps: 18,
    });
    await expect(empty).toHaveAttribute("data-drop-target", "true");
    await page.mouse.up();
  });
  await expect(empty.getByRole("row", { name: new RegExp(`^${key} —`) })).toBeVisible();
  await expect(empty.getByText(/Glissez des items du backlog/)).toHaveCount(0);
  await page.reload();
  await expect(section(page, EMPTY_SPRINT).getByRole("row", { name: new RegExp(`^${key} —`) }))
    .toBeVisible();
});

test("« + Créer un item » crée dans le sprint et dans le backlog, Échap annule", async ({ page }) => {
  const errors = observeErrors(page);
  const { epic } = await seed();
  await page.goto("/b/CASS?view=backlog");

  await businessPost(page, () => createInlineItem(page, PLANNED_SPRINT, INLINE_SPRINT_TASK));
  const planned = section(page, PLANNED_SPRINT);
  const created = planned.getByRole("row", { name: new RegExp(`— ${INLINE_SPRINT_TASK}$`) });
  await expect(created).toBeVisible();
  await expect(created.getByText(epic.title)).toBeVisible();
  const field = page.getByRole("textbox", { name: `Titre du nouvel item dans ${PLANNED_SPRINT}` });
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Créer un item dans ${PLANNED_SPRINT}` }))
    .toBeFocused();

  await businessPost(page, () => createInlineItem(page, "Backlog", INLINE_BACKLOG_TASK));
  await expect(
    section(page, "Backlog").getByRole("row", { name: new RegExp(`— ${INLINE_BACKLOG_TASK}$`) }),
  ).toBeVisible();

  const [stored] = await db
    .select({ type: items.type, parentId: items.parentId })
    .from(items)
    .where(eq(items.title, INLINE_BACKLOG_TASK));
  expect(stored).toEqual({ type: "tache", parentId: expect.any(String) });
  expect(errors).toEqual([]);
});

test("une ligne compacte masque les valeurs vides et s’édite sur place", async ({ page }) => {
  await seed();
  await page.goto("/b/CASS?view=backlog");
  await expect(page.getByRole("columnheader")).toHaveCount(0);

  const row = page.getByRole("row", { name: new RegExp(`— ${BARE_TASK}$`) });
  await expect(row).toBeVisible();
  for (const empty of ["Non estimé", "Non assigné", "Aucune", "—"]) {
    await expect(row.getByText(empty, { exact: true })).toHaveCount(0);
  }
  const priority = row.getByRole("button", { name: "Priorité : Aucune" });
  const opacity = (locator: typeof priority) =>
    locator.evaluate((element) => {
      let node: Element | null = element;
      let value = 1;
      while (node) {
        value *= Number(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      return value;
    });
  await page.mouse.move(0, 0);
  await expect.poll(() => opacity(priority)).toBe(0);
  await row.hover();
  await expect.poll(() => opacity(priority)).toBe(1);
  await expect(row.getByRole("button", { name: "Assigné : Non assigné" })).toBeVisible();

  await priority.click();
  await businessPost(page, () => page.getByRole("menuitem", { name: "Haute" }).click());
  await expect(row.getByRole("button", { name: "Priorité : Haute" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect.poll(() => opacity(row.getByRole("button", { name: "Priorité : Haute" }))).toBe(1);

  const sprintRow = page.getByRole("row", { name: new RegExp(`— ${SPRINT_TASK}$`) });
  await expect(sprintRow.getByRole("button", { name: "Estimation : 5 pts" })).toHaveText("5");
  await expect(sprintRow.getByRole("button", { name: "Statut : En cours" })).toBeVisible();
});

test("Backlog lisible sans défilement horizontal à 390 × 844, captures clair / sombre", async ({
  page,
}) => {
  await seed();
  await page.goto("/b/CASS?view=backlog");
  await expect(section(page, PLANNED_SPRINT)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/jir75-backlog-light.png` });

  await page.evaluate(() => localStorage.setItem("jiroo-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(section(page, PLANNED_SPRINT)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/jir75-backlog-dark.png` });
  await page.evaluate(() => localStorage.setItem("jiroo-density", "compact"));
  await page.reload();
  await expect(section(page, PLANNED_SPRINT)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/jir75-backlog-dark-compact.png` });
  await page.evaluate(() => {
    localStorage.removeItem("jiroo-theme");
    localStorage.removeItem("jiroo-density");
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(section(page, PLANNED_SPRINT)).toBeVisible();
  const overflow = await page.evaluate(() => {
    const offenders = [...document.querySelectorAll<HTMLElement>("[data-sprint-section], [data-sprint-section] *")]
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
      .map((element) => element.getAttribute("aria-label") ?? element.tagName);
    return offenders;
  });
  expect(overflow, "Éléments hors de l’écran").toEqual([]);
  const row = page.getByRole("row", { name: new RegExp(`— ${SPRINT_TASK}$`) });
  const title = row.locator("span.truncate").first();
  expect((await title.boundingBox())?.width ?? 0).toBeGreaterThan(120);
  await page.screenshot({ path: `${SCREENSHOTS}/jir75-backlog-mobile.png`, fullPage: true });
});
