import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";
import { backlogs, items } from "../lib/db/schema";
import { signGithubPayload } from "../lib/repo-webhooks/signature";
import { createItem } from "../lib/services/items";

// JIR-95: connect a GitHub and a GitLab repository in the backlog's
// Développement settings, deliver signed webhooks, and read the references
// in the item drawer's Développement panel.

const ADMIN_EMAIL = "platform-admin@jiroo.local";
const RUN_ID = process.env.JIROO_E2E_RUN_ID ?? String(Date.now());
/** Optional directory for the review screenshots (outside the repository). */
const SCREENSHOT_DIR = process.env.JIROO_E2E_SCREENSHOT_DIR;

async function screenshot(target: Page | Locator, name: string) {
  if (!SCREENSHOT_DIR) return;
  await target.screenshot({ path: `${SCREENSHOT_DIR}/jir95-${name}.png` });
}

async function fixtureTask(title: string) {
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, ADMIN_EMAIL));
  const [backlog] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "CASS"));
  if (!admin || !backlog) throw new Error("Fixtures E2E introuvables.");
  const [epic] = await db.select({ id: items.id }).from(items)
    .where(and(eq(items.backlogId, backlog.id), eq(items.type, "epic"), isNull(items.deletedAt)))
    .orderBy(asc(items.key));
  if (!epic) throw new Error("Epic fixture introuvable.");
  return createItem({
    backlogId: backlog.id,
    type: "tache",
    parentId: epic.id,
    title: `${title} ${RUN_ID}`,
  }, admin.id, `e2e-repo-connections-${title}-${RUN_ID}`);
}

/** Connects a repository and returns the webhook URL and the one-time secret. */
async function connectRepository(
  page: Page,
  input: { provider: "GitHub" | "GitLab"; path: string; instanceUrl?: string },
  shot?: string,
) {
  await page.getByRole("button", { name: "Connecter un dépôt" }).click();
  const form = page.getByRole("form", { name: "Connecter un dépôt" });
  await form.getByRole("radio", { name: input.provider }).check();
  await form.getByLabel(input.provider === "GitHub" ? "Dépôt" : "Chemin du projet").fill(input.path);
  if (input.instanceUrl) await form.getByLabel("URL de l’instance GitLab").fill(input.instanceUrl);
  await form.getByRole("button", { name: "Connecter le dépôt" }).click();
  return readRevealedSecret(page, "Configurer le webhook", shot);
}

async function readRevealedSecret(page: Page, title: string, shot?: string) {
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  const url = await dialog.getByRole("textbox", { name: "URL du webhook" }).inputValue();
  const secret = await dialog.getByRole("textbox", { name: "Secret du webhook" }).inputValue();
  expect(url).toMatch(/\/api\/webhooks\/(github|gitlab)\/[0-9a-f-]{36}$/);
  expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  if (shot) await screenshot(page, shot);
  await dialog.getByRole("button", { name: "J’ai copié le secret" }).click();
  await expect(dialog).toBeHidden();
  // Never shown again.
  await expect(page.locator(`input[value="${secret}"]`)).toHaveCount(0);
  await expect(page.getByText(secret)).toHaveCount(0);
  return { url, secret };
}

let delivery = 0;

async function postGithub(
  request: APIRequestContext,
  url: string,
  secret: string,
  event: string,
  payload: unknown,
  deliveryId = `e2e-${RUN_ID}-${++delivery}`,
) {
  const raw = JSON.stringify(payload);
  return request.post(url, {
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": event,
      "X-GitHub-Delivery": deliveryId,
      "X-Hub-Signature-256": signGithubPayload(new TextEncoder().encode(raw), secret),
    },
    data: raw,
  });
}

async function openDevelopmentPanel(page: Page, key: string): Promise<Locator> {
  await page.goto(`/b/CASS?view=list&item=${key}`);
  const dialog = page.getByRole("dialog", { name: new RegExp(`^${key} —`) });
  await expect(dialog).toBeVisible();
  const properties = dialog.getByTestId("item-detail-properties");
  const toggle = properties.getByRole("button", { name: "Développement" });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  return properties;
}

test.describe("connexion de dépôts GitHub / GitLab (JIR-95)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("relie push, PR et MR signés aux tickets et refuse l’ancien secret", async ({ page, request }) => {
    const githubTask = await fixtureTask("JIR-95 GitHub");
    const gitlabTask = await fixtureTask("JIR-95 GitLab");
    const key = githubTask.key;
    const branch = `feature/${key.toLowerCase()}-webhooks`;
    const repository = { full_name: "e2e-org/jiroo-webhooks", html_url: "https://github.com/e2e-org/jiroo-webhooks" };

    await page.goto("/b/CASS/settings/development");
    await expect(page.getByRole("heading", { level: 1, name: "Développement — Cour de cassation" })).toBeVisible();
    await expect(page.locator('[data-slot="shell-breadcrumb-current"]')).toHaveText("Développement");
    await expect(page.getByText(/Aucun dépôt connecté/)).toBeVisible();
    await screenshot(page, "settings-empty");

    const github = await connectRepository(page, { provider: "GitHub", path: "https://github.com/E2E-Org/Jiroo-Webhooks.git" }, "secret-once");
    const githubRow = page.getByRole("listitem", { name: "GitHub e2e-org/jiroo-webhooks" });
    await expect(githubRow).toContainText("En attente d’un premier événement");
    // The row keeps the full webhook URL to copy again; never the secret.
    await expect(githubRow).toContainText(github.url);

    // Wrong signature and unknown connection: the same refusal.
    const forged = await postGithub(request, github.url, "not-the-secret", "ping", { zen: "x" });
    const unknown = await postGithub(request, github.url.replace(/[0-9a-f-]{36}$/, "11111111-2222-4333-8444-555555555555"), github.secret, "ping", { zen: "x" });
    expect([forged.status(), await forged.text()]).toEqual([401, '{"error":"unauthorized"}']);
    expect([unknown.status(), await unknown.text()]).toEqual([401, '{"error":"unauthorized"}']);

    const ping = await postGithub(request, github.url, github.secret, "ping", { zen: "Keep it logically awesome.", repository });
    expect(ping.status()).toBe(200);

    const push = await postGithub(request, github.url, github.secret, "push", {
      ref: `refs/heads/${branch}`,
      deleted: false,
      commits: [{
        id: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
        message: `${key} add webhook support\n\nDetails that are not kept.`,
        timestamp: "2026-10-13T09:15:00+02:00",
        author: { name: "Alex Martin", email: "alex@example.invalid" },
      }],
      head_commit: { timestamp: "2026-10-13T09:15:00+02:00" },
      repository,
      pusher: { name: "alex-m" },
    });
    expect(push.status()).toBe(200);
    expect(await push.json()).toEqual({ ok: true, linked: 2 });

    const pullRequest = (action: string, merged: boolean, updatedAt: string) => ({
      action,
      pull_request: {
        number: 5,
        state: merged ? "closed" : "open",
        title: `${key} Webhooks`,
        merged,
        merged_at: merged ? updatedAt : null,
        updated_at: updatedAt,
        user: { login: "alex-m" },
        head: { ref: branch },
      },
      repository,
    });
    const openedDelivery = `e2e-${RUN_ID}-pr-opened`;
    const opened = await postGithub(request, github.url, github.secret, "pull_request", pullRequest("opened", false, "2026-10-13T08:00:00Z"), openedDelivery);
    expect(opened.status()).toBe(200);

    let panel = await openDevelopmentPanel(page, key);
    const pullRequests = panel.getByRole("group", { name: "Pull requests" });
    await expect(pullRequests.getByRole("link", { name: `#5 ${key} Webhooks` })).toBeVisible();
    await expect(pullRequests.getByText("Ouverte")).toBeVisible();

    const mergedPr = await postGithub(request, github.url, github.secret, "pull_request", pullRequest("closed", true, "2026-10-13T10:00:00Z"));
    expect(mergedPr.status()).toBe(200);
    const replay = await postGithub(request, github.url, github.secret, "pull_request", pullRequest("opened", false, "2026-10-13T08:00:00Z"), openedDelivery);
    expect(await replay.json()).toEqual({ ok: true, duplicate: true });

    panel = await openDevelopmentPanel(page, key);
    await expect(panel.getByRole("group", { name: "Pull requests" }).getByText("Fusionnée")).toBeVisible();
    await expect(panel.getByRole("group", { name: "Branches" }).getByRole("link", { name: branch })).toHaveAttribute(
      "href",
      `https://github.com/e2e-org/jiroo-webhooks/tree/${branch}`,
    );
    const commits = panel.getByRole("group", { name: "Commits (1)" });
    await expect(commits.getByRole("link", { name: `1a2b3c4 ${key} add webhook support` })).toBeVisible();
    await expect(commits).toContainText("Alex Martin");
    await expect(panel).not.toContainText("Details that are not kept");
    await expect(panel.getByRole("img", { name: "GitHub" }).first()).toBeVisible();
    await screenshot(page, "drawer-development-panel");
    const developmentPanel = panel.locator("section").filter({ has: page.getByRole("button", { name: "Développement" }) });
    await commits.scrollIntoViewIfNeeded();
    await screenshot(developmentPanel, "development-panel-detail");

    // Regenerating the secret refuses the old one at once.
    await page.goto("/b/CASS/settings/development");
    await expect(githubRow).toContainText("Active");
    await expect(githubRow).toContainText("Dernier événement");
    await githubRow.getByRole("button", { name: "Régénérer le secret" }).click();
    await page.getByRole("dialog", { name: "Régénérer le secret ?" }).getByRole("button", { name: "Régénérer" }).click();
    const regenerated = await readRevealedSecret(page, "Nouveau secret du webhook");
    expect(regenerated.secret).not.toBe(github.secret);
    expect(regenerated.url).toBe(github.url);
    const stale = await postGithub(request, github.url, github.secret, "ping", { zen: "x", repository });
    expect(stale.status()).toBe(401);
    const fresh = await postGithub(request, github.url, regenerated.secret, "ping", { zen: "x", repository });
    expect(fresh.status()).toBe(200);
    await page.reload();
    await expect(githubRow).toContainText("Active");

    // A self-hosted GitLab project and a merge request.
    const gitlab = await connectRepository(page, {
      provider: "GitLab",
      path: "e2e/greffe/api",
      instanceUrl: "https://gitlab.e2e.invalid",
    });
    const mergeRequest = await request.post(gitlab.url, {
      headers: {
        "Content-Type": "application/json",
        "X-Gitlab-Event": "Merge Request Hook",
        "X-Gitlab-Event-UUID": `e2e-${RUN_ID}-mr`,
        "X-Gitlab-Token": gitlab.secret,
      },
      data: JSON.stringify({
        object_kind: "merge_request",
        user: { name: "Camille Durand", email: "[REDACTED]" },
        project: { path_with_namespace: "e2e/greffe/api" },
        object_attributes: {
          iid: 7,
          title: "Archiver les décisions",
          source_branch: `${gitlabTask.key.toLowerCase()}-archive`,
          state: "opened",
          updated_at: "2026-10-12 12:20:00 UTC",
        },
      }),
    });
    expect(mergeRequest.status()).toBe(200);
    expect(await mergeRequest.json()).toEqual({ ok: true, linked: 1 });
    const wrongToken = await request.post(gitlab.url, {
      headers: { "X-Gitlab-Event": "Merge Request Hook", "X-Gitlab-Token": github.secret },
      data: "{}",
    });
    expect(wrongToken.status()).toBe(401);

    panel = await openDevelopmentPanel(page, gitlabTask.key);
    const mergeRequests = panel.getByRole("group", { name: "Merge requests" });
    await expect(mergeRequests.getByRole("link", { name: "!7 Archiver les décisions" })).toHaveAttribute(
      "href",
      "https://gitlab.e2e.invalid/e2e/greffe/api/-/merge_requests/7",
    );
    await expect(mergeRequests.getByText("Ouverte")).toBeVisible();
    await expect(mergeRequests.getByRole("img", { name: "GitLab" })).toBeVisible();

    await page.goto("/b/CASS/settings/development");
    await screenshot(page, "settings-connections");

    // Clean up: deleting a connection keeps the references.
    for (const name of ["GitHub e2e-org/jiroo-webhooks", "GitLab e2e/greffe/api"]) {
      await page.getByRole("listitem", { name }).getByRole("button", { name: "Supprimer" }).click();
      await page.getByRole("dialog", { name: "Supprimer la connexion ?" }).getByRole("button", { name: "Supprimer" }).click();
      await expect(page.getByRole("listitem", { name })).toHaveCount(0);
    }
    await expect(page.getByText(/Aucun dépôt connecté/)).toBeVisible();
    const afterDelete = await postGithub(request, github.url, regenerated.secret, "ping", { zen: "x" });
    expect(afterDelete.status()).toBe(401);
    panel = await openDevelopmentPanel(page, key);
    await expect(panel.getByRole("group", { name: "Pull requests" }).getByText("Fusionnée")).toBeVisible();
    // Orphaned by the deletion, the reference can now be removed by hand.
    // Revealed on hover or focus, like the manual links' button.
    await panel.getByRole("button", { name: `Supprimer le lien ${key} Webhooks` }).focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("group", { name: "Pull requests" })).toHaveCount(0);
  });
});
