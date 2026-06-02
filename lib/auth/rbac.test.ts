import { describe, expect, it } from "vitest";
import { canWriteItems, hasRole, requireRole, type Role } from "@/lib/auth/rbac";

describe("RBAC (hard-coded)", () => {
  it("hasRole compares roles", () => {
    expect(hasRole("admin", "admin")).toBe(true);
    expect(hasRole("viewer", "admin")).toBe(false);
  });

  it("requireRole returns the session for an allowed role", () => {
    const session = { user: { id: "u1", role: "admin" as Role } };
    expect(requireRole(session, "admin")).toBe(session);
  });

  it("requireRole throws for a missing/insufficient role", () => {
    expect(() => requireRole(null, "admin")).toThrow();
    const viewer = { user: { id: "u2", role: "viewer" as Role } };
    expect(() => requireRole(viewer, "admin")).toThrow();
  });

  it("contributors and admins can write items; viewers cannot", () => {
    expect(canWriteItems("admin")).toBe(true);
    expect(canWriteItems("contributor")).toBe(true);
    expect(canWriteItems("viewer")).toBe(false);
  });
});
