import { describe, expect, it, vi } from "vitest";
import { resolvePlatformAdministratorIds } from "@/lib/auth/platform-administrator";

vi.mock("server-only", () => ({}));

describe("platform administrator definition", () => {
  it("includes an active bootstrap admin without any global grant", () => {
    expect(
      resolvePlatformAdministratorIds({
        users: [
          { id: "bootstrap", role: "admin" },
          { id: "ordinary", role: "contributor" },
        ],
        grants: [],
        memberships: [],
      }),
    ).toEqual(new Set(["bootstrap"]));
  });

  it("includes a direct administer_jiroo grantee", () => {
    expect(
      resolvePlatformAdministratorIds({
        users: [{ id: "direct", role: "contributor" }],
        grants: [
          {
            id: "grant-direct",
            principalType: "user",
            userId: "direct",
            groupId: null,
          },
        ],
        memberships: [],
      }),
    ).toEqual(new Set(["direct"]));
  });

  it("includes every member of a group administer_jiroo grantee", () => {
    expect(
      resolvePlatformAdministratorIds({
        users: [
          { id: "first", role: "contributor" },
          { id: "second", role: "viewer" },
        ],
        grants: [
          {
            id: "grant-group",
            principalType: "group",
            userId: null,
            groupId: "platform-group",
          },
        ],
        memberships: [
          { groupId: "platform-group", userId: "first" },
          { groupId: "platform-group", userId: "second" },
        ],
      }),
    ).toEqual(new Set(["first", "second"]));
  });
});
