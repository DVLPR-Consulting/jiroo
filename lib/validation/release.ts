import { z } from "zod";

const uuid = z.uuid();
const revision = z.number().int().positive();
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

export const createReleaseSchema = z.object({
  backlogId: uuid,
  name: releaseName,
  description,
  startDate: optionalDate.optional(),
  releaseDate: optionalDate.optional(),
});

export const updateReleaseSchema = z.object({
  backlogId: uuid,
  releaseId: uuid,
  expectedRevision: revision,
  name: releaseName.optional(),
  description,
  startDate: optionalDate.optional(),
  releaseDate: optionalDate.optional(),
});

export const publishReleaseSchema = z.discriminatedUnion("incompleteDisposition", [
  z.object({
    backlogId: uuid,
    releaseId: uuid,
    expectedRevision: revision,
    effectiveDate: z.iso.date(),
    incompleteDisposition: z.literal("keep"),
  }),
  z.object({
    backlogId: uuid,
    releaseId: uuid,
    expectedRevision: revision,
    effectiveDate: z.iso.date(),
    incompleteDisposition: z.literal("move"),
    destinationReleaseId: uuid,
  }),
]);

export const releaseIdentitySchema = z.object({ backlogId: uuid, releaseId: uuid });

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
