import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermissions: mocks.checkPermissions,
}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { getBacklogCapabilities } from "@/lib/auth/accessible-backlogs";

function allow(allowed: string[]) {
  return async ({ permissions }: { permissions: string[] }) =>
    new Map(permissions.map((permission) => [
      permission,
      { allowed: allowed.includes(permission) },
    ]));
}

describe("getBacklogCapabilities", () => {
  beforeEach(() => {
    mocks.checkPermissions.mockReset();
  });

  it("returns only effective product booleans without exposing grants", async () => {
    mocks.checkPermissions.mockImplementation(allow([
      "browse_backlog",
      "edit_items",
      "delete_items",
      "add_comments",
      "link_items",
      "manage_releases",
      "bulk_change_items",
    ]));

    await expect(
      getBacklogCapabilities("actor-1", "backlog-1"),
    ).resolves.toEqual({
      createItems: false,
      editItems: true,
      transitionItems: false,
      scheduleItems: false,
      assignItems: false,
      deleteItems: true,
      restoreItems: false,
      addComments: true,
      editOwnComments: false,
      deleteOwnComments: false,
      deleteAllComments: false,
      linkItems: true,
      manageSprints: false,
      manageWorkflow: false,
      manageMembers: false,
      manageReleases: true,
      bulkChangeItems: true,
    });
    // One batch per scope rather than one resolution per capability.
    expect(mocks.checkPermissions).toHaveBeenCalledTimes(2);
    expect(mocks.checkPermissions).toHaveBeenCalledWith({
      actorId: "actor-1",
      permissions: expect.arrayContaining(["browse_backlog", "manage_releases", "edit_items"]),
      scope: { type: "backlog", backlogId: "backlog-1" },
    });
    expect(mocks.checkPermissions).toHaveBeenCalledWith({
      actorId: "actor-1",
      permissions: ["bulk_change_items"],
      scope: { type: "global" },
    });
  });

  it("returns null when browse_backlog is denied, whatever the other grants", async () => {
    mocks.checkPermissions.mockImplementation(allow(["edit_items", "bulk_change_items"]));

    await expect(getBacklogCapabilities("actor-1", "backlog-1")).resolves.toBeNull();
  });
});
