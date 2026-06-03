import { z } from "zod";
import { ITEM_TYPES } from "@/lib/design/constants";

const itemType = z.enum(ITEM_TYPES);
const title = z.string().trim().min(1, "Le titre est requis.").max(200, "Titre trop long (200 max).");
const description = z.string().trim().max(20_000).nullable().optional();
const priority = z.number().int().min(0, "Priorité invalide.").max(4, "Priorité invalide.");
// user.id is TEXT (better-auth), NOT a uuid — keep it a plain string.
const assigneeId = z.string().nullable().optional();
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
  assigneeId,
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
export type ReparentItemInput = z.infer<typeof reparentItemSchema>;
