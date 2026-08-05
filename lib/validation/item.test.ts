import { describe, expect, it } from "vitest";
import { createItemSchema, idInputSchema, moveItemSchema, rankBacklogItemSchema, reparentItemSchema, updateItemSchema } from "@/lib/validation/item";

const BID = "11111111-1111-4111-8111-111111111111";
const PID = "22222222-2222-4222-9222-222222222222";

describe("createItemSchema", () => {
  const base = { backlogId: BID, title: "Tâche" };
  it("accepts a composant at the root (no parent)", () => {
    expect(createItemSchema.safeParse({ ...base, type: "composant", parentId: null }).success).toBe(true);
  });
  it("rejects a composant WITH a parent", () => {
    expect(createItemSchema.safeParse({ ...base, type: "composant", parentId: PID }).success).toBe(false);
  });
  it("rejects a non-composant WITHOUT a parent", () => {
    expect(createItemSchema.safeParse({ ...base, type: "epic", parentId: null }).success).toBe(false);
  });
  it("accepts a non-composant WITH a parent", () => {
    expect(createItemSchema.safeParse({ ...base, type: "epic", parentId: PID }).success).toBe(true);
  });
  it("maps an empty-string dueDate to null", () => {
    const r = createItemSchema.parse({ ...base, type: "composant", parentId: null, dueDate: "" });
    expect(r.dueDate).toBeNull();
  });
  it("accepts a non-uuid text assigneeId (user.id is TEXT)", () => {
    expect(createItemSchema.safeParse({ ...base, type: "composant", parentId: null, assigneeId: "abc123xyz" }).success).toBe(true);
  });
  it("defaults labelIds to [] and priority to 0; statusId is optional", () => {
    const r = createItemSchema.parse({ ...base, type: "composant", parentId: null });
    expect(r.labelIds).toEqual([]);
    expect(r.priority).toBe(0);
    expect(r.statusId).toBeUndefined();
  });
  it("rejects an empty or too-long title", () => {
    expect(createItemSchema.safeParse({ ...base, title: "", type: "composant", parentId: null }).success).toBe(false);
    expect(createItemSchema.safeParse({ ...base, title: "x".repeat(201), type: "composant", parentId: null }).success).toBe(false);
  });
});

describe("updateItemSchema", () => {
  it("requires an id; type/parent are absent (immutable)", () => {
    expect(updateItemSchema.safeParse({ id: BID, title: "X" }).success).toBe(true);
  });
  it("allows labelIds undefined (untouched)", () => {
    expect(updateItemSchema.safeParse({ id: BID }).success).toBe(true);
  });
  it("accepts a non-empty better-auth text reporterId", () => {
    expect(updateItemSchema.safeParse({ id: BID, reporterId: "better-auth-user" }).success).toBe(true);
  });
  it("rejects an empty reporterId", () => {
    expect(updateItemSchema.safeParse({ id: BID, reporterId: "" }).success).toBe(false);
  });
  it("leaves reporterId untouched when omitted", () => {
    const parsed = updateItemSchema.parse({ id: BID });
    expect(parsed).not.toHaveProperty("reporterId");
  });
  it("accepts null, zero, integer and decimal story points", () => {
    for (const estimatePoints of [null, 0, 1, 5, 13, 2.5, 999.99]) {
      expect(updateItemSchema.parse({ id: BID, estimatePoints }).estimatePoints).toBe(
        estimatePoints,
      );
    }
  });
  it("rejects negative, over-precision and oversized story points", () => {
    for (const estimatePoints of [-1, 1.001, 1000, Number.NaN]) {
      expect(updateItemSchema.safeParse({ id: BID, estimatePoints }).success).toBe(false);
    }
  });
  it("leaves story points untouched when omitted", () => {
    expect(updateItemSchema.parse({ id: BID })).not.toHaveProperty("estimatePoints");
  });
});

describe("idInputSchema", () => {
  it("requires a uuid id", () => {
    expect(idInputSchema.safeParse({ id: BID }).success).toBe(true);
    expect(idInputSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});

const UA = "11111111-1111-4111-8111-111111111111";
const UB = "22222222-2222-4222-9222-222222222222";
const UC = "33333333-3333-4333-8333-333333333333";

describe("moveItemSchema", () => {
  it("accepts a reorder with before/after neighbors", () => {
    expect(moveItemSchema.safeParse({ id: UA, beforeId: UB, afterId: UC }).success).toBe(true);
  });
  it("accepts a status change + reorder", () => {
    expect(moveItemSchema.safeParse({ id: UA, statusId: UB, beforeId: null, afterId: UC }).success).toBe(true);
  });
  it("defaults before/after to null (append / empty column)", () => {
    const r = moveItemSchema.parse({ id: UA });
    expect(r.beforeId).toBeNull();
    expect(r.afterId).toBeNull();
  });
  it("rejects equal non-null before/after", () => {
    expect(moveItemSchema.safeParse({ id: UA, beforeId: UB, afterId: UB }).success).toBe(false);
  });
});

describe("rankBacklogItemSchema", () => {
  it("accepts explicit null bounds", () => {
    expect(
      rankBacklogItemSchema.safeParse({
        backlogId: UA,
        id: UB,
        beforeId: null,
        afterId: null,
      }).success,
    ).toBe(true);
  });

  it("rejects equal non-null neighbors", () => {
    expect(
      rankBacklogItemSchema.safeParse({
        backlogId: UA,
        id: UB,
        beforeId: UC,
        afterId: UC,
      }).success,
    ).toBe(false);
  });

  it.each(["beforeId", "afterId"])("rejects the moved item as %s", (bound) => {
    expect(
      rankBacklogItemSchema.safeParse({
        backlogId: UA,
        id: UB,
        beforeId: bound === "beforeId" ? UB : null,
        afterId: bound === "afterId" ? UB : null,
      }).success,
    ).toBe(false);
  });
});

describe("reparentItemSchema", () => {
  it("accepts a reparent under a new parent", () => {
    expect(reparentItemSchema.safeParse({ id: UA, newParentId: UB, beforeId: null, afterId: UC }).success).toBe(true);
  });
  it("accepts a root-promote (newParentId null)", () => {
    expect(reparentItemSchema.safeParse({ id: UA, newParentId: null }).success).toBe(true);
  });
  it("rejects equal non-null before/after", () => {
    expect(reparentItemSchema.safeParse({ id: UA, newParentId: UB, beforeId: UC, afterId: UC }).success).toBe(false);
  });
});
