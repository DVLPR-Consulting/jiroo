import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { auth } from "@/lib/auth";
import { ROLES, type Role } from "@/lib/auth/rbac";
import { createUserInput, setRoleInput } from "@/lib/items/users";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal user record returned by admin list and create operations. */
export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Returns all users with their role, ordered alphabetically by name.
 * Admin-only — enforce at the action layer.
 *
 * NOTE: This is distinct from the items.ts listUsers() helper which omits the
 * role field and is used for assignee pickers.
 */
export async function listUsers(): Promise<AdminUserRow[]> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .orderBy(asc(user.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    // Coerce to a valid Role; fall back to "contributor" if the DB value is
    // somehow null or an unrecognized string (should never happen in practice).
    role: (ROLES as readonly string[]).includes(r.role ?? "") ? (r.role as Role) : "contributor",
  }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Updates the role of an existing user.
 * Validates that the supplied role is a member of ROLES before writing.
 * The self-demotion guard (admin cannot demote themselves) is enforced at the
 * action layer, not here, to keep this function testable in isolation.
 */
export async function setUserRole(userId: string, role: Role): Promise<void> {
  const parsed = setRoleInput.safeParse({ userId, role });
  if (!parsed.success) throw new Error("Rôle invalide.");

  await db.update(user).set({ role }).where(eq(user.id, userId));
}

/**
 * Creates a new user account via better-auth, then overrides the default role
 * to the requested one.
 *
 * Calling convention: auth.api.signUpEmail is invoked with just { body: {...} }
 * and no response object, so better-auth will NOT emit a Set-Cookie header on
 * the current request and the admin's session is never clobbered.
 * autoSignIn is also set to false in lib/auth/index.ts as a belt-and-suspenders
 * measure: even if a response were accidentally threaded through, no session
 * token would be created for the new account.
 *
 * @returns The created user row { id, name, email, role }.
 * @throws "Cet e-mail est déjà utilisé." if the email already exists.
 */
export async function createUser(input: unknown): Promise<AdminUserRow> {
  const parsed = createUserInput.safeParse(input);
  if (!parsed.success) {
    // Surface the first Zod validation message as a user-visible error.
    throw new Error(parsed.error.issues[0]?.message ?? "Données invalides.");
  }

  const { email, password, name, role } = parsed.data;

  try {
    await auth.api.signUpEmail({ body: { email, password, name } });
  } catch (e) {
    const msg = String(e);
    if (
      msg.toLowerCase().includes("already") ||
      msg.toLowerCase().includes("duplicate") ||
      msg.toLowerCase().includes("unique")
    ) {
      throw new Error("Cet e-mail est déjà utilisé.");
    }
    throw e;
  }

  // better-auth defaults the role to "contributor" via the additionalField
  // defaultValue. Override it to whatever the admin requested.
  await db.update(user).set({ role }).where(eq(user.email, email));

  const [created] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, email));

  if (!created) throw new Error("Utilisateur introuvable après création.");

  return {
    id: created.id,
    name: created.name,
    email: created.email,
    role: (ROLES as readonly string[]).includes(created.role ?? "") ? (created.role as Role) : "contributor",
  };
}
