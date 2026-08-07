import { z } from "zod";

const uuid = z.uuid();
const revision = z.number().int().positive();
const publicationScopeRevision = z.string().regex(/^[0-9a-f]{32}$/);
const optionalDate = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.iso.date().nullable(),
);
const releaseName = z.string().trim().min(1).max(255);
const description = z.string().trim().max(20_000).nullable().optional();
const fixVersionIds = z
  .array(z.uuid())
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, { message: "Les versions contiennent des doublons." });

const datesAreOrdered = (data: {
  startDate?: string | null;
  targetDate?: string | null;
}) =>
  data.startDate == null || data.targetDate == null || data.targetDate >= data.startDate;
const dateOrderIssue = {
  message: "La date cible doit suivre la date de début.",
  path: ["targetDate"],
};

const createReleaseBaseSchema = z
  .object({
    backlogId: uuid,
    name: releaseName,
    description,
    driverId: z.string().trim().min(1),
    startDate: optionalDate.optional(),
    targetDate: optionalDate.optional(),
  })
  .strict();

export const createReleaseSchema = createReleaseBaseSchema.refine(
  datesAreOrdered,
  dateOrderIssue,
);
export const createReleaseWithOptionalDriverSchema = createReleaseBaseSchema
  .extend({ driverId: createReleaseBaseSchema.shape.driverId.optional() })
  .refine(datesAreOrdered, dateOrderIssue);

export const updateReleaseSchema = z
  .object({
    backlogId: uuid,
    releaseId: uuid,
    expectedRevision: revision,
    name: releaseName.optional(),
    description,
    driverId: z.string().trim().min(1).nullable().optional(),
    startDate: optionalDate.optional(),
    targetDate: optionalDate.optional(),
  })
  .strict()
  .refine(datesAreOrdered, dateOrderIssue)
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.driverId !== undefined ||
      data.startDate !== undefined ||
      data.targetDate !== undefined,
    { message: "Aucune modification fournie." },
  );

export const publishReleaseSchema = z
  .discriminatedUnion("incompleteDisposition", [
    z.object({
      backlogId: uuid,
      releaseId: uuid,
      expectedRevision: revision,
      expectedScopeRevision: publicationScopeRevision,
      effectiveDate: z.iso.date(),
      incompleteDisposition: z.literal("keep"),
    }).strict(),
    z.object({
      backlogId: uuid,
      releaseId: uuid,
      expectedRevision: revision,
      expectedScopeRevision: publicationScopeRevision,
      effectiveDate: z.iso.date(),
      incompleteDisposition: z.literal("move"),
      destinationReleaseId: uuid,
    }).strict(),
  ])
  .refine(
    (data) =>
      data.incompleteDisposition === "keep" || data.destinationReleaseId !== data.releaseId,
    { message: "La destination doit différer de la release publiée.", path: ["destinationReleaseId"] },
  );

export const releaseIdentitySchema = z.object({ backlogId: uuid, releaseId: uuid }).strict();
export const revisionedReleaseIdentitySchema = releaseIdentitySchema
  .extend({ expectedRevision: revision })
  .strict();

export const changeItemFixVersionsSchema = z.object({
  backlogId: uuid,
  itemId: uuid,
  mode: z.enum(["add", "replace", "remove"]),
  releaseIds: fixVersionIds,
});

export type CreateReleaseInput = z.infer<typeof createReleaseSchema>;
export type UpdateReleaseInput = z.infer<typeof updateReleaseSchema>;
export type PublishReleaseInput = z.infer<typeof publishReleaseSchema>;
export type ReleaseIdentityInput = z.infer<typeof releaseIdentitySchema>;
export type ChangeItemFixVersionsInput = z.infer<typeof changeItemFixVersionsSchema>;
