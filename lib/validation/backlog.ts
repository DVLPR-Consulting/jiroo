import { z } from "zod";

export const BACKLOG_KEY_RE = /^[A-Za-z]{2,6}$/;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hex invalide");

export const createBacklogSchema = z.object({
  key: z.string().regex(BACKLOG_KEY_RE, "2 à 6 lettres").transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1, "Nom requis").max(80),
  color: hex,
});

export const updateBacklogSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  color: hex,
});

export type CreateBacklogInput = z.infer<typeof createBacklogSchema>;
export type UpdateBacklogInput = z.infer<typeof updateBacklogSchema>;
