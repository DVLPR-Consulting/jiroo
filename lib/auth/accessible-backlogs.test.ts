import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { getBacklogCapabilities } from "@/lib/auth/accessible-backlogs";

describe("getBacklogCapabilities", () => {
  beforeEach(() => {
    mocks.checkPermission.mockReset();
  });

  it("returns only effective product booleans without exposing grants", async () => {
    mocks.checkPermission.mockImplementation(async ({ permission }) => ({
      allowed: [
        "browse_backlog",
        "edit_items",
        "delete_items",
        "add_comments",
        "link_items",
        "bulk_change_items",
      ].includes(permission),
    }));

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
      bulkChangeItems: true,
    });
    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "actor-1",
      permission: "bulk_change_items",
      scope: { type: "global" },
    });
  });
});
