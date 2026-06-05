import { z } from "zod";
import { ROLES, type Role } from "@/lib/auth/rbac";

// ---------------------------------------------------------------------------
// Zod schemas — pure, no DB dependency, importable in tests and service layer.
// ---------------------------------------------------------------------------

export const createUserInput = z.object({
  email: z.string().trim().email("Adresse e-mail invalide."),
  name: z.string().trim().min(1, "Le nom est requis.").max(80, "Le nom ne peut pas dépasser 80 caractères."),
  role: z.enum(ROLES),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum."),
});

export const setRoleInput = z.object({
  userId: z.string(),
  role: z.enum(ROLES),
});

export type CreateUserInput = z.infer<typeof createUserInput>;
export type SetRoleInput = z.infer<typeof setRoleInput>;

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  contributor: "Contributeur",
  viewer: "Lecteur",
};
