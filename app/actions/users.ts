"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/authorization";
import type { Role } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import { createUser, setUserRole } from "@/lib/services/users";

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

async function requireUserAdministrator(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  await requirePermission({
    actorId: session.user.id,
    permission: "manage_users_groups",
    scope: { type: "global" },
  });
  return session.user.id;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapUserError(e: unknown): string {
  const msg = String(e);
  const safeMessages = [
    "Cet e-mail est déjà utilisé.",
    "Adresse e-mail invalide.",
    "Le nom est requis.",
    "Le nom ne peut pas dépasser 80 caractères.",
    "Rôle invalide.",
    "Mot de passe : 8 caractères minimum.",
    "L’utilisateur est requis.",
    "Utilisateur introuvable.",
  ];
  const safeMessage = safeMessages.find((message) => msg.includes(message));
  if (safeMessage) return safeMessage;
  return "Action impossible.";
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createUserAction(input: {
  email: string;
  name: string;
  role: string;
  password: string;
}) {
  await requireUserAdministrator();
  try {
    const u = await createUser(input);
    revalidatePath("/admin");
    return { ok: true as const, user: u };
  } catch (e) {
    return { ok: false as const, error: mapUserError(e) };
  }
}

export async function setUserRoleAction(input: { userId: string; role: string }) {
  const adminId = await requireUserAdministrator();

  // Prevent the admin from accidentally revoking their own admin role, which
  // would lock them out of the admin panel with no way back.
  if (input.userId === adminId && input.role !== "admin") {
    return {
      ok: false as const,
      error: "Vous ne pouvez pas retirer votre propre rôle administrateur.",
    };
  }

  try {
    await setUserRole(input.userId, input.role as Role);
    revalidatePath("/admin");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: mapUserError(e) };
  }
}
