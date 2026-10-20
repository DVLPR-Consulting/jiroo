import "server-only";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { createUserInput } from "@/lib/items/users";
import { platformAdministratorIds } from "@/lib/services/authorization-admin";
import { seedAuthorizationDefaults } from "@/lib/services/authorization-seed";

export class BootstrapAdminError extends Error {}

export type BootstrapAdminOutcome = "created" | "already-administrator";

/**
 * The first Jiroo administrator of a new installation (JIR-115), without the
 * demonstration backlog of `db:seed`. Idempotent for that administrator; it
 * refuses to add a second one (the administration screen does that) and never
 * changes an existing account, its password included. The account gets the
 * authorization defaults; two-factor enrolment is still required at the first
 * sign-in.
 */
export async function bootstrapAdministrator(input: {
  email: string;
  name: string;
  password: string;
}): Promise<{ outcome: BootstrapAdminOutcome; userId: string }> {
  const parsed = createUserInput.safeParse({ ...input, role: "admin" });
  if (!parsed.success) {
    throw new BootstrapAdminError(parsed.error.issues[0]?.message ?? "Données invalides.");
  }
  const { email, name, password } = parsed.data;

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  const administrators = await db.transaction((tx) => platformAdministratorIds(tx));

  if (existing) {
    if (!administrators.has(existing.id)) {
      throw new BootstrapAdminError(
        "Un compte existe déjà avec cet e-mail sans être administrateur Jiroo : ce script ne modifie pas un compte existant.",
      );
    }
    await seedAuthorizationDefaults({ platformAdministratorIds: [existing.id], backlogAdministrators: [] });
    return { outcome: "already-administrator", userId: existing.id };
  }
  if (administrators.size > 0) {
    throw new BootstrapAdminError(
      "Un administrateur Jiroo existe déjà : créez les autres comptes depuis l’administration.",
    );
  }

  await auth.api.signUpEmail({ body: { email, password, name } });
  const [created] = await db
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.email, email))
    .returning({ id: user.id });
  if (!created) throw new BootstrapAdminError("Compte introuvable après sa création.");
  await seedAuthorizationDefaults({ platformAdministratorIds: [created.id], backlogAdministrators: [] });
  return { outcome: "created", userId: created.id };
}
