import { describe, expect, it } from "vitest";
import { nextStatus } from "@/lib/items/status-transition";

const todo = { id: "todo", name: "À faire", order: 0 };
const doing = { id: "doing", name: "En cours", order: 1 };
const review = { id: "review", name: "En revue", order: 2 };
const done = { id: "done", name: "Terminé", order: 3 };

describe("nextStatus", () => {
  it("returns the status that follows the current one in the workflow order", () => {
    expect(nextStatus([todo, doing, review, done], "todo")).toBe(doing);
    expect(nextStatus([todo, doing, review, done], "review")).toBe(done);
  });

  it("follows the order field, not the array order", () => {
    expect(nextStatus([done, review, todo, doing], "doing")).toBe(review);
  });

  it("returns null at the end of the workflow", () => {
    expect(nextStatus([todo, doing, review, done], "done")).toBeNull();
  });

  it("returns null for an unknown current status", () => {
    expect(nextStatus([todo, doing], "missing")).toBeNull();
  });
});
