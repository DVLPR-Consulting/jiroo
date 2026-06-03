import { describe, expect, it } from "vitest";
import { createBacklogSchema } from "@/lib/validation/backlog";

describe("createBacklogSchema", () => {
  it("accepts a valid backlog", () => {
    const r = createBacklogSchema.safeParse({ key: "CASS", name: "Cour de cassation", color: "#7c3030" });
    expect(r.success).toBe(true);
  });
  it("uppercases and validates the key (2-6 letters)", () => {
    expect(createBacklogSchema.safeParse({ key: "ab", name: "X", color: "#000000" }).success).toBe(true);
    expect(createBacklogSchema.safeParse({ key: "A", name: "X", color: "#000000" }).success).toBe(false);
    expect(createBacklogSchema.safeParse({ key: "TOOLONG7", name: "X", color: "#000000" }).success).toBe(false);
    expect(createBacklogSchema.safeParse({ key: "CA55", name: "X", color: "#000000" }).success).toBe(false);
  });
  it("requires a non-empty name and a hex color", () => {
    expect(createBacklogSchema.safeParse({ key: "CASS", name: "", color: "#000000" }).success).toBe(false);
    expect(createBacklogSchema.safeParse({ key: "CASS", name: "X", color: "red" }).success).toBe(false);
  });
  it("normalizes the key to uppercase", () => {
    const r = createBacklogSchema.parse({ key: "cass", name: "X", color: "#000000" });
    expect(r.key).toBe("CASS");
  });
});
