import "server-only";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { userGroups } from "@/lib/db/schema/domain";
import { createUserInput } from "@/lib/items/users";
import { platformAdministratorIds } from "@/lib/services/authorization-admin";
import {
  PLATFORM_ADMINISTRATORS_GROUP_KEY,
  seedAuthorizationDefaults,
} from "@/lib/services/authorization-seed";

export class BootstrapAdminError extends Error {}

export type BootstrapAdminOutcome = "created" | "already-administrator";

/** One bootstrap at a time across processes: the check and the creation hold it. */
const BOOTSTRAP_LOCK = "jiroo:bootstrap-admin";

/**
 * The first Jiroo administrator of a new installation (JIR-115), without the
 * demonstration backlog of `db:seed`. It refuses to add a second one (the
 * administration screen does that) and never changes an existing account,
 * its password included. The account gets the authorization defaults;
 * two-factor enrolment is still required at the first sign-in.
 *
 * Running it again for that administrator changes nothing, so a policy edited
 * since stays as it is; only an interrupted first run, whose defaults were
 * never set, gets them then.
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

  const lock = await databasePool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(hashtext($1))", [BOOTSTRAP_LOCK]);
    // Read under the lock: a concurrent run has finished or not started.
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    const administrators = await db.transaction((tx) => platformAdministratorIds(tx));

    if (existing) {
      if (!administrators.has(existing.id)) {
        throw new BootstrapAdminError(
          "Un compte existe déjà avec cet e-mail sans être administrateur Jiroo : ce script ne modifie pas un compte existant.",
        );
      }
      if (!(await authorizationDefaultsExist())) {
        await seedAuthorizationDefaults({ platformAdministratorIds: [existing.id], backlogAdministrators: [] });
      }
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
  } finally {
    await lock.query("SELECT pg_advisory_unlock(hashtext($1))", [BOOTSTRAP_LOCK]).catch(() => {});
    lock.release();
  }
}

/** The defaults' first step: absent only when the first run was interrupted. */
async function authorizationDefaultsExist(): Promise<boolean> {
  const [group] = await db
    .select({ id: userGroups.id })
    .from(userGroups)
    .where(eq(userGroups.key, PLATFORM_ADMINISTRATORS_GROUP_KEY))
    .limit(1);
  return group !== undefined;
}
