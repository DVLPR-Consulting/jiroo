import { describe, expect, it } from "vitest";
import * as permissionCatalogue from "@/lib/auth/permissions";

const {
  BACKLOG_PERMISSION_KEYS,
  GLOBAL_PERMISSION_KEYS,
  permissionDefinition,
} = permissionCatalogue;

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

  it("owns the protected project-role grant defaults", () => {
    expect(permissionCatalogue.PROTECTED_ROLE_PERMISSION_KEYS).toEqual({
      administrators: [
        "browse_backlog",
        "administer_backlog",
        "manage_members",
        "manage_workflows",
        "manage_sprints",
        "manage_releases",
        "create_items",
        "edit_items",
        "delete_items",
        "restore_items",
        "transition_items",
        "schedule_items",
        "assign_items",
        "assignable_user",
        "add_comments",
        "edit_own_comments",
        "delete_own_comments",
        "delete_all_comments",
        "link_items",
        "manage_shared_views",
      ],
      members: [
        "browse_backlog",
        "create_items",
        "edit_items",
        "transition_items",
        "schedule_items",
        "assign_items",
        "assignable_user",
        "add_comments",
        "edit_own_comments",
        "delete_own_comments",
        "link_items",
      ],
      viewers: ["browse_backlog"],
    });
  });
});
