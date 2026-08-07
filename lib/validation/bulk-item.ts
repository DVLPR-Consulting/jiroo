import { z } from "zod";
import { estimatePointsSchema } from "@/lib/validation/item";

const itemIdsSchema = z
  .array(z.uuid("Item invalide."))
  .min(1, "Sélectionnez au moins un item.")
  .max(500, "Une action groupée est limitée à 500 items.")
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "La sélection contient des doublons.",
  });

export const bulkItemPatchSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("statusId"), value: z.uuid("Statut invalide.") }),
  z.object({
    field: z.literal("priority"),
    value: z.number().int("Priorité invalide.").min(0).max(4),
  }),
  z.object({
    field: z.literal("assigneeId"),
    value: z.string().min(1, "Assigné invalide.").nullable(),
  }),
  z.object({ field: z.literal("estimatePoints"), value: estimatePointsSchema }),
  z.object({
    field: z.literal("sprintId"),
    value: z.uuid("Sprint invalide.").nullable(),
  }),
  z.object({
    field: z.literal("fixVersionIds"),
    mode: z.enum(["add", "replace", "remove"]),
    value: z.array(z.uuid()).max(100),
  }),
]);

export const bulkUpdateItemsSchema = z.object({
  backlogId: z.uuid("Backlog invalide."),
  itemIds: itemIdsSchema,
  patch: bulkItemPatchSchema,
});

export type BulkItemPatch = z.infer<typeof bulkItemPatchSchema>;
export type BulkUpdateItemsInput = z.infer<typeof bulkUpdateItemsSchema>;
