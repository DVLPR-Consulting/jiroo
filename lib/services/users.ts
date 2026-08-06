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

function toAdminUserRow(row: {
  id: string;
  name: string;
  email: string;
  role: string | null;
}): AdminUserRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: (ROLES as readonly string[]).includes(row.role ?? "")
      ? (row.role as Role)
      : "contributor",
  };
}

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
export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .orderBy(asc(user.name));

  return rows.map(toAdminUserRow);
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
export async function setUserRole(userId: string, role: Role): Promise<AdminUserRow> {
  const parsed = setRoleInput.safeParse({ userId, role });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Rôle invalide.");
  }

  const [updated] = await db
    .update(user)
    .set({ role: parsed.data.role })
    .where(eq(user.id, parsed.data.userId))
    .returning({ id: user.id, name: user.name, email: user.email, role: user.role });
  if (!updated) throw new Error("Utilisateur introuvable.");
  return toAdminUserRow(updated);
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
  const candidate = typeof input === "object" && input !== null ? input : {};
  const parsed = createUserInput.safeParse({ ...candidate, role: "contributor" });
  if (!parsed.success) {
    // Surface the first Zod validation message as a user-visible error.
    throw new Error(parsed.error.issues[0]?.message ?? "Données invalides.");
  }

  const { email, password, name } = parsed.data;

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

  // New accounts are compatibility contributors only. This legacy value does
  // not grant backlog access; groups and backlog roles do.
  await db.update(user).set({ role: "contributor" }).where(eq(user.email, email));

  const [created] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, email));

  if (!created) throw new Error("Utilisateur introuvable après création.");

  return toAdminUserRow(created);
}
