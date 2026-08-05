import "dotenv/config";

import { mkdir } from "node:fs/promises";
import { request, type FullConfig } from "@playwright/test";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";

const EMAIL = "audit-playwright@jiroo.local";
const PASSWORD = process.env.JIROO_PLAYWRIGHT_PASSWORD ?? "Audit-Local-2026!";

export default async function globalSetup(config: FullConfig) {
  await auth.api
    .signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: "Audit Playwright" },
    })
    .catch(() => undefined);

  await db
    .update(user)
    .set({ role: "contributor", twoFactorEnabled: false })
    .where(eq(user.email, EMAIL));

  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL manquante.");
  const authRequest = await request.newContext({ baseURL });
  const response = await authRequest.post("/api/auth/sign-in/email", {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`Connexion Playwright impossible (${response.status()}).`);
  }

  await db
    .update(user)
    .set({ role: "contributor", twoFactorEnabled: true })
    .where(eq(user.email, EMAIL));
  await mkdir(".playwright/.auth", { recursive: true });
  await authRequest.storageState({ path: ".playwright/.auth/contributor.json" });
  await authRequest.dispose();
}
