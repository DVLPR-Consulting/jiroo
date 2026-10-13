import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { databasePool } from "../lib/db";

/**
 * JIR-84: every page loads behind a placeholder shaped like its content.
 * The navigation is held server side by locking the `backlogs` table (every
 * page below reads it; the shared shell is not re-rendered on a client
 * navigation), so the streamed skeleton stays on screen long enough to check.
 */
const DESKTOP = { width: 1440, height: 900 };
const SHAPES = ["home", "backlog", "board", "list", "tree", "admin", "mine", "trash", "releases"];

async function whileBacklogsLocked(run: () => Promise<void>) {
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE backlogs IN ACCESS EXCLUSIVE MODE");
    await run();
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function expectSkeleton(
  page: Page,
  testInfo: TestInfo,
  step: {
    shape: string;
    label: string;
    navigate: () => Promise<void>;
    heading: string;
    shot?: string;
  },
) {
  const shot = step.shot ?? step.shape;
  await whileBacklogsLocked(async () => {
    await step.navigate();
    const region = page.getByRole("status", { name: step.label });
    await expect(region).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: testInfo.outputPath(`skeleton-${shot}.png`) });
    await expect(region).toHaveAttribute("data-skeleton", step.shape);
    for (const other of SHAPES.filter((candidate) => candidate !== step.shape)) {
      await expect(page.locator(`[data-skeleton="${other}"]`).filter({ visible: true }))
        .toHaveCount(0);
    }
  });
  // Once the page is free to load, the content replaces the placeholder.
  await expect(page.getByRole("heading", { level: 1, name: step.heading })).toBeVisible();
  await expect(page.locator("[data-skeleton]").filter({ visible: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath(`content-${shot}.png`) });
}

function link(scope: Page | Locator, name: string | RegExp) {
  return () => scope.getByRole("link", { name }).click();
}

test("chaque page se charge derrière un squelette à sa forme", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize(DESKTOP);
  await page.goto("/b/CASS");
  await expect(page.getByRole("heading", { level: 1, name: "Board" })).toBeVisible();
  const views = page.getByRole("navigation", { name: "Vues du projet" });

  // Switching views (`?view=`) shows the requested view's shape.
  await expectSkeleton(page, testInfo, {
    shape: "list",
    label: "Chargement de la liste",
    navigate: link(views, "Liste"),
    heading: "Liste",
  });
  await expectSkeleton(page, testInfo, {
    shape: "backlog",
    label: "Chargement du backlog",
    navigate: link(views, "Backlog"),
    heading: "Backlog",
  });
  await expectSkeleton(page, testInfo, {
    shape: "board",
    label: "Chargement du board",
    navigate: link(views, "Board"),
    heading: "Board",
  });
  await expectSkeleton(page, testInfo, {
    shape: "tree",
    label: "Chargement de l’arbre",
    navigate: link(views, "Arbre"),
    heading: "Arbre",
  });
  await expectSkeleton(page, testInfo, {
    shape: "releases",
    label: "Chargement des releases",
    navigate: link(views, "Releases"),
    heading: "Releases",
  });
  // Entering the backlog from another page: `loading.tsx` follows `?view=`.
  await expectSkeleton(page, testInfo, {
    shape: "backlog",
    label: "Chargement du backlog",
    navigate: link(views, "Backlog"),
    heading: "Backlog",
    shot: "backlog-from-releases",
  });
  await expectSkeleton(page, testInfo, {
    shape: "home",
    label: "Chargement des backlogs",
    navigate: link(page, "Tous les backlogs"),
    heading: "Backlogs",
  });
  await expectSkeleton(page, testInfo, {
    shape: "admin",
    label: "Chargement de l’administration",
    navigate: link(page, "Administration"),
    heading: "Administration",
  });
  await expectSkeleton(page, testInfo, {
    shape: "mine",
    label: "Chargement de mes items",
    navigate: link(page, /^Mes items/),
    heading: "Mes items",
  });
  await expectSkeleton(page, testInfo, {
    shape: "trash",
    label: "Chargement de la corbeille",
    navigate: link(page, /^Corbeille/),
    heading: "Corbeille",
  });
});
