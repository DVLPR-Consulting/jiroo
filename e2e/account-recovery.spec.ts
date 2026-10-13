import "dotenv/config";

import { readFile } from "node:fs/promises";
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { twoFactor } from "../lib/db/schema/auth";
import { createUser } from "../lib/services/users";
import { generateTotp } from "../test-utils/totp";

// JIR-61: administrator-driven account recovery and self-service password change.

const ORIGINAL_PASSWORD = "Initial-Recovery-2026!";
const EMPTY_STATE = { cookies: [], origins: [] };

test.use({ storageState: ".playwright/.auth/platform-admin.json" });

type EnrolledUser = {
  id: string;
  name: string;
  email: string;
  secret: string;
  api: APIRequestContext;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Creates a user and enrolls TOTP through Better Auth's HTTP API. */
async function provisionEnrolledUser(baseURL: string, label: string): Promise<EnrolledUser> {
  const suffix = uniqueSuffix();
  const email = `recovery-${label}-${suffix}@jiroo.local`;
  const name = `Récupération ${label} ${suffix}`;
  const created = await createUser({ email, name, password: ORIGINAL_PASSWORD });

  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const signIn = await api.post("/api/auth/sign-in/email", {
    data: { email, password: ORIGINAL_PASSWORD },
  });
  expect(signIn.ok()).toBe(true);
  const enable = await api.post("/api/auth/two-factor/enable", {
    data: { password: ORIGINAL_PASSWORD },
  });
  expect(enable.ok()).toBe(true);
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret");
  if (!secret) throw new Error("Secret TOTP manquant.");
  const verify = await api.post("/api/auth/two-factor/verify-totp", {
    data: { code: generateTotp(secret) },
  });
  expect(verify.ok()).toBe(true);
  return { id: created.id, name, email, secret, api };
}

async function sessionIsActive(api: APIRequestContext): Promise<boolean> {
  const response = await api.get("/api/auth/get-session");
  if (!response.ok()) return false;
  const body = (await response.json()) as { session?: unknown } | null;
  return Boolean(body?.session);
}

async function newAnonymousPage(
  browser: Browser,
  options: { permissions?: string[] } = {},
): Promise<Page> {
  const context = await browser.newContext({ storageState: EMPTY_STATE, ...options });
  return context.newPage();
}

async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

async function typeOtp(page: Page, secret: string): Promise<void> {
  await page.getByLabel("Chiffre 1").click();
  await page.keyboard.type(generateTotp(secret));
}

async function expectLoginRejected(page: Page, email: string, password: string): Promise<void> {
  await submitLogin(page, email, password);
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/u);
}

async function signInWithTotp(page: Page, target: EnrolledUser, password: string): Promise<void> {
  await submitLogin(page, target.email, password);
  await expect(page).toHaveURL(/\/2fa$/u);
  await typeOtp(page, target.secret);
  await expect(page).not.toHaveURL(/\/(login|2fa)/u);
  await expect(page.getByRole("button", { name: `Profil de ${target.name}` })).toBeVisible();
}

async function openAccountActions(page: Page, target: EnrolledUser): Promise<void> {
  await page.goto("/admin?tab=users");
  await page.getByRole("button", { name: `Actions de compte pour ${target.name}` }).click();
}

test.describe("account recovery", () => {
  test("an administrator resets a password and the user signs in with the temporary one", async ({
    page,
    browser,
    baseURL,
  }) => {
    const target = await provisionEnrolledUser(baseURL!, "password");
    expect(await sessionIsActive(target.api)).toBe(true);

    await page.goto("/admin?tab=users");
    // Administrators cannot recover their own account from this screen.
    await expect(
      page.getByRole("button", { name: "Actions de compte pour Administrateur E2E" }),
    ).toHaveCount(0);

    await openAccountActions(page, target);
    await page.getByRole("menuitem", { name: "Réinitialiser le mot de passe" }).click();
    const dialog = page.getByRole("dialog", {
      name: `Réinitialiser le mot de passe de ${target.name} ?`,
    });
    await dialog.getByLabel("Mot de passe temporaire").fill("Temporaire-2026!");
    await dialog.getByRole("button", { name: "Réinitialiser le mot de passe" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText(`Mot de passe de ${target.name} réinitialisé. Ses sessions ont été fermées.`),
    ).toBeVisible();

    expect(await sessionIsActive(target.api)).toBe(false);

    const userPage = await newAnonymousPage(browser);
    await expectLoginRejected(userPage, target.email, ORIGINAL_PASSWORD);
    // The second factor is untouched: the temporary password still needs TOTP.
    await signInWithTotp(userPage, target, "Temporaire-2026!");

    await userPage.context().close();
    await target.api.dispose();
  });

  test("an administrator resets 2FA and the user must enroll again", async ({
    page,
    browser,
    baseURL,
  }) => {
    const target = await provisionEnrolledUser(baseURL!, "two-factor");

    await openAccountActions(page, target);
    await page.getByRole("menuitem", { name: "Réinitialiser la double authentification" }).click();
    const dialog = page.getByRole("dialog", {
      name: `Réinitialiser la double authentification de ${target.name} ?`,
    });
    await dialog.getByRole("button", { name: "Réinitialiser la double authentification" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText(
        `Double authentification de ${target.name} réinitialisée. Ses sessions ont été fermées.`,
      ),
    ).toBeVisible();

    expect(await sessionIsActive(target.api)).toBe(false);
    expect(await db.select().from(twoFactor).where(eq(twoFactor.userId, target.id))).toHaveLength(0);

    const userPage = await newAnonymousPage(browser, {
      permissions: ["clipboard-read", "clipboard-write"],
    });
    await submitLogin(userPage, target.email, ORIGINAL_PASSWORD);
    await expect(userPage).toHaveURL(/\/2fa\/enroll$/u);
    // The application stays closed until enrollment completes.
    await userPage.goto("/");
    await expect(userPage).toHaveURL(/\/2fa\/enroll$/u);

    await userPage.getByLabel("Mot de passe").fill(ORIGINAL_PASSWORD);
    await userPage.getByRole("button", { name: "Continuer" }).click();
    const manualKey = userPage.locator(".item-key.select-all");
    await expect(manualKey).toBeVisible();
    const newSecret = (await manualKey.textContent())?.trim() ?? "";
    expect(newSecret).not.toBe("");
    expect(newSecret).not.toBe(target.secret);

    // JIR-86: the codes can be copied and downloaded, entirely client-side.
    const codesGroup = userPage.getByRole("group", { name: "Codes de récupération — conservez-les" });
    const shownCodes = (await codesGroup.locator(".item-key").allTextContents()).map((c) => c.trim());
    expect(shownCodes).toHaveLength(10);
    await userPage.getByRole("button", { name: "Copier les codes" }).click();
    await expect(userPage.getByRole("status")).toHaveText("Codes copiés.");
    expect(await userPage.evaluate(() => navigator.clipboard.readText())).toBe(shownCodes.join("\n"));

    const downloadEvent = userPage.waitForEvent("download");
    await userPage.getByRole("button", { name: "Télécharger (.txt)" }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/^jiroo-codes-recuperation-\d{4}-\d{2}-\d{2}\.txt$/u);
    const fileText = await readFile(await download.path(), "utf8");
    expect(fileText).toContain(`Compte : ${target.email}\r\n`);
    expect(fileText).toMatch(/Générés le : \d{2}\/\d{2}\/\d{4}\r\n/u);
    expect(fileText).toContain(`${shownCodes.join("\r\n")}\r\n`);
    await expect(userPage.getByRole("status")).toHaveText(
      `Fichier ${download.suggestedFilename()} téléchargé.`,
    );

    // The acknowledgement is required: activating without it explains why.
    const acknowledgement = userPage.getByLabel("J'ai enregistré mes codes de récupération");
    await typeOtp(userPage, newSecret);
    const activate = userPage.getByRole("button", { name: "Activer et continuer" });
    await activate.click();
    await expect(acknowledgement).toBeFocused();
    await expect(acknowledgement).toHaveAttribute("aria-invalid", "true");
    await expect(acknowledgement).toHaveAccessibleDescription(
      "Cochez cette case après avoir enregistré vos codes de récupération.",
    );
    await expect(userPage).toHaveURL(/\/2fa\/enroll$/u);

    await acknowledgement.check();
    await expect(acknowledgement).not.toHaveAttribute("aria-invalid");
    await activate.click();
    await expect(userPage).not.toHaveURL(/\/(login|2fa)/u);
    await expect(userPage.getByRole("button", { name: `Profil de ${target.name}` })).toBeVisible();

    await userPage.context().close();
    await target.api.dispose();
  });

  test("a user changes their own password; other sessions close and the old password fails", async ({
    browser,
    baseURL,
  }) => {
    const target = await provisionEnrolledUser(baseURL!, "self-change");
    const otherDevice = await provisionedSecondSession(baseURL!, target);
    expect(await sessionIsActive(otherDevice)).toBe(true);

    const context = await browser.newContext({ storageState: await target.api.storageState() });
    const userPage = await context.newPage();
    await userPage.goto("/");
    await userPage.getByRole("button", { name: `Profil de ${target.name}` }).click();
    await userPage.getByRole("menuitem", { name: "Changer mon mot de passe" }).click();
    const dialog = userPage.getByRole("dialog", { name: "Changer mon mot de passe" });

    await dialog.getByLabel("Mot de passe actuel").fill("Mauvais-Mot-2026!");
    await dialog.getByLabel("Nouveau mot de passe", { exact: true }).fill("Nouveau-Mot-2026!");
    await dialog.getByLabel("Confirmer le nouveau mot de passe").fill("Nouveau-Mot-2026!");
    await dialog.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Mot de passe actuel incorrect.");

    await dialog.getByLabel("Mot de passe actuel").fill(ORIGINAL_PASSWORD);
    await dialog.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      userPage.getByText("Mot de passe modifié. Vos autres sessions ont été fermées."),
    ).toBeVisible();

    // This browser received the rotated session; every other session is gone.
    await userPage.reload();
    await expect(userPage.getByRole("button", { name: `Profil de ${target.name}` })).toBeVisible();
    expect(await sessionIsActive(otherDevice)).toBe(false);
    expect(await sessionIsActive(target.api)).toBe(false);

    const freshPage = await newAnonymousPage(browser);
    await expectLoginRejected(freshPage, target.email, ORIGINAL_PASSWORD);
    await signInWithTotp(freshPage, target, "Nouveau-Mot-2026!");

    await freshPage.context().close();
    await context.close();
    await otherDevice.dispose();
    await target.api.dispose();
  });
});

/** Opens a second fully authenticated session for the same user (another device). */
async function provisionedSecondSession(
  baseURL: string,
  target: EnrolledUser,
): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const signIn = await api.post("/api/auth/sign-in/email", {
    data: { email: target.email, password: ORIGINAL_PASSWORD },
  });
  expect(signIn.ok()).toBe(true);
  const verify = await api.post("/api/auth/two-factor/verify-totp", {
    data: { code: generateTotp(target.secret) },
  });
  expect(verify.ok()).toBe(true);
  return api;
}
