import { describe, expect, it } from "vitest";
import {
  accessModeInput,
  backlogRoleActorInput,
  globalGrantInput,
  grantInput,
  groupCreateInput,
  groupMembershipInput,
  permissionHelperInput,
  permissionSchemeCloneInput,
  projectRoleCreateInput,
  schemeAssociationInput,
  schemeGrantRemovalInput,
} from "@/lib/validation/authorization";

const backlogId = "00000000-0000-4000-8000-000000000001";
const schemeId = "00000000-0000-4000-8000-000000000002";
const projectRoleId = "00000000-0000-4000-8000-000000000003";
const groupId = "00000000-0000-4000-8000-000000000004";
const grantId = "00000000-0000-4000-8000-000000000005";

describe("authorization administration validation", () => {
  it("trims administration names and rejects empty or overlong names", () => {
    expect(groupCreateInput.parse({ name: "  Équipe plateforme  " })).toEqual({
      name: "Équipe plateforme",
    });
    expect(projectRoleCreateInput.parse({ name: "  Responsable delivery  " })).toEqual({
      name: "Responsable delivery",
    });
    expect(() => groupCreateInput.parse({ name: " ".repeat(4) })).toThrow();
    expect(() => groupCreateInput.parse({ name: "x".repeat(81) })).toThrow();
    expect(() => projectRoleCreateInput.parse({ name: "x".repeat(81) })).toThrow();
  });

  it("accepts only stable permission catalogue keys for each scope", () => {
    expect(
      grantInput.parse({
        schemeId,
        permission: "manage_releases",
        principal: { type: "project_role", projectRoleId },
        expectedVersion: 3,
      }),
    ).toMatchObject({ permission: "manage_releases", expectedVersion: 3 });

    expect(
      globalGrantInput.parse({
        permission: "manage_users_groups",
        principal: { type: "group", groupId },
      }),
    ).toMatchObject({ permission: "manage_users_groups" });

    expect(() =>
      grantInput.parse({
        schemeId,
        permission: "not-real",
        principal: { type: "authenticated_user" },
        expectedVersion: 3,
      }),
    ).toThrow();
    expect(() =>
      grantInput.parse({
        schemeId,
        permission: "administer_jiroo",
        principal: { type: "authenticated_user" },
        expectedVersion: 3,
      }),
    ).toThrow();
    expect(() =>
      globalGrantInput.parse({
        permission: "browse_backlog",
        principal: { type: "group", groupId },
      }),
    ).toThrow();
  });

  it("requires exactly the identifier belonging to the selected principal type", () => {
    expect(
      grantInput.parse({
        schemeId,
        permission: "browse_backlog",
        principal: { type: "authenticated_user" },
        expectedVersion: 1,
      }).principal,
    ).toEqual({ type: "authenticated_user" });

    expect(() =>
      grantInput.parse({
        schemeId,
        permission: "browse_backlog",
        principal: { type: "project_role", projectRoleId, groupId },
        expectedVersion: 1,
      }),
    ).toThrow();
    expect(() =>
      grantInput.parse({
        schemeId,
        permission: "browse_backlog",
        principal: { type: "user", groupId },
        expectedVersion: 1,
      }),
    ).toThrow();
    expect(() =>
      globalGrantInput.parse({
        permission: "administer_jiroo",
        principal: { type: "project_role", projectRoleId },
      }),
    ).toThrow();
  });

  it("validates UUID aggregate identifiers while accepting opaque user identifiers", () => {
    expect(groupMembershipInput.parse({ groupId, userId: "user-from-auth-provider" })).toEqual({
      groupId,
      userId: "user-from-auth-provider",
    });
    expect(
      backlogRoleActorInput.parse({
        backlogId,
        projectRoleId,
        principal: { type: "group", groupId },
      }),
    ).toMatchObject({ backlogId, projectRoleId });
    expect(() => groupMembershipInput.parse({ groupId: "not-a-uuid", userId: "user-1" })).toThrow();
    expect(() => schemeAssociationInput.parse({ backlogId, schemeId: "not-a-uuid" })).toThrow();
    expect(() => permissionSchemeCloneInput.parse({ sourceSchemeId: "x", name: "Copie" })).toThrow();
  });

  it("requires a positive integer for optimistic scheme versions", () => {
    expect(
      schemeGrantRemovalInput.parse({ schemeId, grantId, expectedVersion: 2 }),
    ).toEqual({ schemeId, grantId, expectedVersion: 2 });
    for (const expectedVersion of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        schemeGrantRemovalInput.parse({ schemeId, grantId, expectedVersion }),
      ).toThrow();
    }
  });

  it("validates mode changes and permission-helper queries explicitly", () => {
    expect(accessModeInput.parse({ backlogId, mode: "advanced" })).toEqual({
      backlogId,
      mode: "advanced",
    });
    expect(
      permissionHelperInput.parse({
        backlogId,
        userId: "user-1",
        permission: "manage_members",
      }),
    ).toMatchObject({ permission: "manage_members" });
    expect(() => accessModeInput.parse({ backlogId, mode: "expert" })).toThrow();
    expect(() =>
      permissionHelperInput.parse({ backlogId, userId: "user-1", permission: "create_backlogs" }),
    ).toThrow();
  });
});
