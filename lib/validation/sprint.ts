import { z } from "zod";
import { hasAtMostTwoDecimals, roundToCents } from "@/lib/validation/points";

const id = z.uuid("Identifiant invalide.");
const sprintName = z
  .string()
  .trim()
  .min(1, "Le nom du sprint est requis.")
  .max(120, "Le nom du sprint est limité à 120 caractères.");
const sprintGoal = z
  .string()
  .trim()
  .max(2_000, "L’objectif est limité à 2 000 caractères.")
  .nullable();
const dateTime = z.string().datetime({ offset: true });

export const capacityPointsSchema = z
  .number({ error: "Capacité invalide." })
  .finite("Capacité invalide.")
  .min(0, "La capacité doit être positive.")
  .max(999.99, "La capacité ne peut pas dépasser 999,99 points.")
  .refine(hasAtMostTwoDecimals, {
    message: "La capacité accepte au maximum deux décimales.",
  })
  .transform(roundToCents)
  .nullable();

const itemIds = z
  .array(z.uuid("Item invalide."))
  .min(1, "Sélectionnez au moins un item.")
  .max(500, "Une action groupée est limitée à 500 items.")
  .refine((values) => new Set(values).size === values.length, {
    message: "La sélection contient des doublons.",
  });

function validateDateOrder(
  start: string | null | undefined,
  end: string | null | undefined,
  path: "plannedEndAt" | "endAt",
  context: z.RefinementCtx,
) {
  if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
    context.addIssue({
      code: "custom",
      path: [path],
      message: "La date de fin doit être postérieure à la date de début.",
    });
  }
}

export const createSprintSchema = z.object({
  backlogId: id,
});

export const updateSprintSchema = z
  .object({
    id,
    backlogId: id,
    name: sprintName.optional(),
    goal: sprintGoal.optional(),
    plannedStartAt: dateTime.nullable().optional(),
    plannedEndAt: dateTime.nullable().optional(),
    capacityPoints: capacityPointsSchema.optional(),
  })
  .superRefine((data, context) => {
    validateDateOrder(
      data.plannedStartAt,
      data.plannedEndAt,
      "plannedEndAt",
      context,
    );
  });

export const reorderSprintSchema = z
  .object({
    id,
    backlogId: id,
    beforeId: id.nullable().default(null),
    afterId: id.nullable().default(null),
  })
  .superRefine((data, context) => {
    if (data.beforeId !== null && data.beforeId === data.afterId) {
      context.addIssue({
        code: "custom",
        path: ["afterId"],
        message: "Voisins de sprint invalides.",
      });
    }
    for (const field of ["beforeId", "afterId"] as const) {
      if (data[field] === data.id) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Un sprint ne peut pas être son propre voisin.",
        });
      }
    }
  });

export const assignSprintItemsSchema = z.object({
  backlogId: id,
  itemIds,
  sprintId: id.nullable(),
});

export const moveSprintItemSchema = z
  .object({
    backlogId: id,
    itemId: id,
    sprintId: id.nullable(),
    beforeId: id.nullable().default(null),
    afterId: id.nullable().default(null),
  })
  .superRefine((data, context) => {
    if (data.beforeId !== null && data.beforeId === data.afterId) {
      context.addIssue({
        code: "custom",
        path: ["afterId"],
        message: "Voisins de dépôt invalides.",
      });
    }
    for (const field of ["beforeId", "afterId"] as const) {
      if (data[field] === data.itemId) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Un item ne peut pas être son propre voisin.",
        });
      }
    }
  });

export const startSprintSchema = z
  .object({
    id,
    backlogId: id,
    name: sprintName,
    goal: sprintGoal,
    startAt: dateTime,
    endAt: dateTime,
    capacityPoints: capacityPointsSchema,
  })
  .superRefine((data, context) => {
    validateDateOrder(data.startAt, data.endAt, "endAt", context);
  });

export const completionDestinationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("backlog") }),
  z.object({
    type: z.literal("existing_sprint"),
    sprintId: id,
  }),
  z.object({
    type: z.literal("new_sprint"),
    name: sprintName,
  }),
]);

export const completeSprintSchema = z.object({
  id,
  backlogId: id,
  destination: completionDestinationSchema,
});

export type CreateSprintInput = z.infer<typeof createSprintSchema>;
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;
export type ReorderSprintInput = z.infer<typeof reorderSprintSchema>;
export type AssignSprintItemsInput = z.infer<typeof assignSprintItemsSchema>;
export type MoveSprintItemInput = z.infer<typeof moveSprintItemSchema>;
export type StartSprintInput = z.infer<typeof startSprintSchema>;
export type CompletionDestination = z.infer<
  typeof completionDestinationSchema
>;
export type CompleteSprintInput = z.infer<typeof completeSprintSchema>;
