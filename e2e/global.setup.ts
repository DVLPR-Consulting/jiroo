import "dotenv/config";

import { mkdir } from "node:fs/promises";
import { request, type FullConfig } from "@playwright/test";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user } from "../lib/db/schema/auth";

const PASSWORD = process.env.JIROO_PLAYWRIGHT_PASSWORD ?? "Audit-Local-2026!";

async function createStorageState({
  baseURL,
  email,
  name,
  role,
  path,
}: {
  baseURL: string;
  email: string;
  name: string;
  role: "contributor" | "viewer";
  path: string;
}) {
  await auth.api
    .signUpEmail({
      body: { email, password: PASSWORD, name },
    })
    .catch(() => undefined);

  await db
    .update(user)
    .set({ role, twoFactorEnabled: false })
    .where(eq(user.email, email));

  const authRequest = await request.newContext({ baseURL });
  const response = await authRequest.post("/api/auth/sign-in/email", {
    data: { email, password: PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`Connexion Playwright impossible pour ${role} (${response.status()}).`);
  }

  await db
    .update(user)
    .set({ role, twoFactorEnabled: true })
    .where(eq(user.email, email));
  await authRequest.storageState({ path });
  await authRequest.dispose();
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL manquante.");
  await mkdir(".playwright/.auth", { recursive: true });
  await createStorageState({
    baseURL,
    email: "audit-playwright@jiroo.local",
    name: "Audit Playwright",
    role: "contributor",
    path: ".playwright/.auth/contributor.json",
  });
  await createStorageState({
    baseURL,
    email: "audit-playwright-viewer@jiroo.local",
    name: "Audit Playwright Lecteur",
    role: "viewer",
    path: ".playwright/.auth/viewer.json",
  });
}
