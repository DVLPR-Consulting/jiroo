import { z } from "zod";
import { ITEM_KINDS, ITEM_TYPES } from "@/lib/design/constants";

export const ITEM_TITLE_MAX = 200;
export const ITEM_DESCRIPTION_MAX = 20_000;

const itemType = z.enum(ITEM_TYPES);
const title = z
  .string()
  .trim()
  .min(1, "Le titre est requis.")
  .max(ITEM_TITLE_MAX, "Titre trop long (200 max).");
const description = z
  .string()
  .trim()
  .max(ITEM_DESCRIPTION_MAX, "Description trop longue (20 000 max).")
  .nullable()
  .optional();
const priority = z.number().int().min(0, "Priorité invalide.").max(4, "Priorité invalide.");
// user.id is TEXT (better-auth), NOT a uuid — keep it a plain string.
const assigneeId = z.string().nullable().optional();
const reporterId = z.string().min(1, "Rapporteur requis.").optional();
export const estimatePointsSchema = z
  .number({ error: "Estimation invalide." })
  .finite("Estimation invalide.")
  .min(0, "L’estimation doit être positive.")
  .max(999.99, "L’estimation ne peut pas dépasser 999,99 points.")
  .refine((value) => Number.isInteger(value * 100), {
    message: "L’estimation accepte au maximum deux décimales.",
  })
  .nullable();
// Map ''/null → null so an empty "no due date" field doesn't coerce to Invalid Date.
const dueDate = z
  .preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable())
  .optional();
const labelIds = z.array(z.uuid()).default([]);

export const createItemSchema = z
  .object({
    backlogId: z.uuid("Backlog invalide."),
    type: itemType,
    parentId: z.uuid("Parent invalide.").nullable().default(null),
    title,
    description,
    statusId: z.uuid("Statut invalide.").optional(),
    priority: priority.default(0),
    kind: z.enum(ITEM_KINDS).default("feature"),
    assigneeId,
    dueDate,
    labelIds,
  })
  .refine((d) => (d.type === "composant") === (d.parentId === null), {
    message: "Un composant est une racine ; les autres types exigent un parent.",
    path: ["parentId"],
  });

export const updateItemSchema = z.object({
  id: z.uuid(),
  title: title.optional(),
  description,
  statusId: z.uuid().optional(),
  priority: priority.optional(),
  kind: z.enum(ITEM_KINDS).optional(),
  assigneeId,
  reporterId,
  estimatePoints: estimatePointsSchema.optional(),
  dueDate,
  labelIds: z.array(z.uuid()).optional(),
});

export const idInputSchema = z.object({ id: z.uuid() });

export const moveItemSchema = z
  .object({
    id: z.uuid(),
    statusId: z.uuid().optional(),
    beforeId: z.uuid().nullable().default(null),
    afterId: z.uuid().nullable().default(null),
  })
  .refine((d) => d.beforeId === null || d.beforeId !== d.afterId, {
    message: "Voisins de dépôt invalides.",
    path: ["afterId"],
  });

export const rankBacklogItemSchema = z
  .object({
    backlogId: z.uuid("Backlog invalide."),
    id: z.uuid("Item invalide."),
    beforeId: z.uuid("Voisin précédent invalide.").nullable().default(null),
    afterId: z.uuid("Voisin suivant invalide.").nullable().default(null),
  })
  .superRefine((data, context) => {
    if (data.beforeId !== null && data.beforeId === data.afterId) {
      context.addIssue({
        code: "custom",
        message: "Voisins de dépôt invalides.",
        path: ["afterId"],
      });
    }
    for (const field of ["beforeId", "afterId"] as const) {
      if (data[field] === data.id) {
        context.addIssue({
          code: "custom",
          message: "Un item ne peut pas être son propre voisin.",
          path: [field],
        });
      }
    }
  });

export const reparentItemSchema = z
  .object({
    id: z.uuid(),
    newParentId: z.uuid().nullable().default(null),
    beforeId: z.uuid().nullable().default(null),
    afterId: z.uuid().nullable().default(null),
  })
  .refine((d) => d.beforeId === null || d.beforeId !== d.afterId, {
    message: "Voisins de dépôt invalides.",
    path: ["afterId"],
  });

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type MoveItemInput = z.infer<typeof moveItemSchema>;
export type RankBacklogItemInput = z.infer<typeof rankBacklogItemSchema>;
export type ReparentItemInput = z.infer<typeof reparentItemSchema>;
