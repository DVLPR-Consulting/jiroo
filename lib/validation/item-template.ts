import { z } from "zod";
import { ITEM_KINDS, ITEM_TYPES } from "@/lib/design/constants";
import { ITEM_DESCRIPTION_MAX, ITEM_TITLE_MAX } from "@/lib/validation/item";

/** A backlog keeps at most this many templates (JIR-43). */
export const ITEM_TEMPLATES_PER_BACKLOG_MAX = 50;
export const ITEM_TEMPLATE_NAME_MAX = 80;

const fields = {
  name: z
    .string()
    .trim()
    .min(1, "Le nom du modèle est requis.")
    .max(ITEM_TEMPLATE_NAME_MAX, `Nom trop long (${ITEM_TEMPLATE_NAME_MAX} max).`),
  itemType: z.enum(ITEM_TYPES, { error: "Type invalide." }).nullable().default(null),
  kind: z.enum(ITEM_KINDS, { error: "Nature invalide." }).default("feature"),
  title: z.string().trim().max(ITEM_TITLE_MAX, `Titre trop long (${ITEM_TITLE_MAX} max).`).default(""),
  description: z
    .string()
    .max(ITEM_DESCRIPTION_MAX, "Description trop longue (20 000 max).")
    .default(""),
  priority: z.number().int().min(0, "Priorité invalide.").max(4, "Priorité invalide.").default(0),
  labelIds: z
    .array(z.uuid())
    .max(20, "Trop de labels (20 max).")
    .default([])
    .transform((ids) => [...new Set(ids)]),
};

export const createItemTemplateInput = z.object({ backlogId: z.uuid(), ...fields });
export const updateItemTemplateInput = z.object({ id: z.uuid(), ...fields });
export const itemTemplateIdInput = z.object({ id: z.uuid() });

export type CreateItemTemplateInput = z.input<typeof createItemTemplateInput>;
export type UpdateItemTemplateInput = z.input<typeof updateItemTemplateInput>;
