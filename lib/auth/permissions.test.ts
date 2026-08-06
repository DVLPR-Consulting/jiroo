import { describe, expect, it } from "vitest";
import {
  BACKLOG_PERMISSION_KEYS,
  GLOBAL_PERMISSION_KEYS,
  permissionDefinition,
} from "@/lib/auth/permissions";

describe("permission catalogue", () => {
  it("keeps release management backlog-scoped and browse-gated", () => {
    expect(BACKLOG_PERMISSION_KEYS).toContain("manage_releases");
    expect(permissionDefinition("manage_releases")).toEqual({
      key: "manage_releases",
      label: "Gérer les releases",
      scope: "backlog",
      prerequisite: "browse_backlog",
    });
  });

  it("keeps bulk change global", () => {
    expect(GLOBAL_PERMISSION_KEYS).toContain("bulk_change_items");
    expect(permissionDefinition("bulk_change_items").scope).toBe("global");
  });

  it("rejects an unknown stored key", () => {
    expect(() => permissionDefinition("unknown_permission")).toThrow(
      "Permission inconnue.",
    );
  });
});
