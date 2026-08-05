import { z } from "zod";

const uuid = z.string().uuid();
const name = z.string().trim().min(1, "Nom requis").max(80, "80 caractères maximum");
const category = z.enum(["todo", "in_progress", "done"]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hex invalide");

export const createStatusSchema = z.object({
  backlogId: uuid,
  name,
  category,
  color,
});

export const updateStatusSchema = createStatusSchema.extend({ id: uuid });

export const reorderStatusesSchema = z
  .object({
    backlogId: uuid,
    statusIds: z.array(uuid).min(1),
  })
  .superRefine(({ statusIds }, context) => {
    if (new Set(statusIds).size !== statusIds.length) {
      context.addIssue({
        code: "custom",
        path: ["statusIds"],
        message: "Les statuts doivent être uniques.",
      });
    }
  });

export const deleteStatusSchema = z
  .object({
    backlogId: uuid,
    id: uuid,
    replacementStatusId: uuid.nullable().optional(),
  })
  .superRefine(({ id, replacementStatusId }, context) => {
    if (replacementStatusId === id) {
      context.addIssue({
        code: "custom",
        path: ["replacementStatusId"],
        message: "Le statut de destination doit être différent.",
      });
    }
  });

export type CreateStatusInput = z.infer<typeof createStatusSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ReorderStatusesInput = z.infer<typeof reorderStatusesSchema>;
export type DeleteStatusInput = z.infer<typeof deleteStatusSchema>;
