import { describe, expect, it } from "vitest";
import { createItemSchema, idInputSchema, updateItemSchema } from "@/lib/validation/item";

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
});

describe("idInputSchema", () => {
  it("requires a uuid id", () => {
    expect(idInputSchema.safeParse({ id: BID }).success).toBe(true);
    expect(idInputSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});
