import { describe, expect, it } from "vitest";
import {
  createStatusSchema,
  deleteStatusSchema,
  reorderStatusesSchema,
  updateStatusSchema,
} from "@/lib/validation/status";

const backlogId = "11111111-1111-4111-8111-111111111111";
const statusId = "22222222-2222-4222-8222-222222222222";

describe("status validation", () => {
  it("normalizes a valid new column", () => {
    expect(
      createStatusSchema.parse({
        backlogId,
        name: "  Prêt pour livraison  ",
        category: "in_progress",
        color: "#8B5CF6",
      }),
    ).toEqual({
      backlogId,
      name: "Prêt pour livraison",
      category: "in_progress",
      color: "#8B5CF6",
    });
  });

  it("rejects empty names, unknown categories and invalid colors", () => {
    const valid = { backlogId, name: "Revue", category: "in_progress", color: "#8b5cf6" };
    expect(createStatusSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(createStatusSchema.safeParse({ ...valid, category: "blocked" }).success).toBe(false);
    expect(createStatusSchema.safeParse({ ...valid, color: "purple" }).success).toBe(false);
  });

  it("validates edits and requires an exact unique reorder payload", () => {
    expect(
      updateStatusSchema.safeParse({
        id: statusId,
        backlogId,
        name: "Validé",
        category: "done",
        color: "#3aa675",
      }).success,
    ).toBe(true);
    expect(
      reorderStatusesSchema.safeParse({ backlogId, statusIds: [statusId, statusId] }).success,
    ).toBe(false);
    expect(reorderStatusesSchema.safeParse({ backlogId, statusIds: [] }).success).toBe(false);
  });

  it("rejects deleting into the same status", () => {
    expect(
      deleteStatusSchema.safeParse({
        backlogId,
        id: statusId,
        replacementStatusId: statusId,
      }).success,
    ).toBe(false);
    expect(
      deleteStatusSchema.safeParse({ backlogId, id: statusId, replacementStatusId: null }).success,
    ).toBe(true);
  });
});
