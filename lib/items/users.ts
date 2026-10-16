import { z } from "zod";
import { ROLES, type Role } from "@/lib/auth/rbac";

// ---------------------------------------------------------------------------
// Zod schemas — pure, no DB dependency, importable in tests and service layer.
// ---------------------------------------------------------------------------

export const createUserInput = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide."),
  name: z.string().trim().min(1, "Le nom est requis.").max(80, "Le nom ne peut pas dépasser 80 caractères."),
  role: z.enum(ROLES, { error: "Rôle invalide." }),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum."),
});

export const setRoleInput = z.object({
  userId: z.string().min(1, "L’utilisateur est requis."),
  role: z.enum(ROLES, { error: "Rôle invalide." }),
});

// Same minimum as user creation; the maximum mirrors Better Auth's default
// maxPasswordLength so validation fails with a French message before hashing.
const passwordRule = z
  .string()
  .min(8, "Mot de passe : 8 caractères minimum.")
  .max(128, "Mot de passe : 128 caractères maximum.");

const targetUserId = z.string().min(1, "L’utilisateur est requis.");

export const resetUserPasswordInput = z.object({
  userId: targetUserId,
  temporaryPassword: passwordRule,
});

export const resetUserTwoFactorInput = z.object({
  userId: targetUserId,
});

export const changeOwnPasswordInput = z
  .object({
    currentPassword: z.string().min(1, "Le mot de passe actuel est requis."),
    newPassword: passwordRule,
    confirmation: z.string(),
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmation) {
      context.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "Les mots de passe ne correspondent pas.",
      });
      return;
    }
    if (value.newPassword === value.currentPassword) {
      context.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Le nouveau mot de passe doit être différent de l’actuel.",
      });
    }
  });

export type CreateUserInput = z.infer<typeof createUserInput>;
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordInput>;
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordInput>;
export type SetRoleInput = z.infer<typeof setRoleInput>;

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur Jiroo",
  contributor: "Contributeur",
  viewer: "Lecteur",
};

/** Display the protected backlog role without renaming stored or custom roles. */
export function backlogRoleLabel(role: { key?: string; name: string }): string {
  return role.key === "administrators" ? "Administrateur du backlog" : role.name;
}
