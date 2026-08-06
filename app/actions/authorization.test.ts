import { beforeEach, describe, expect, it, vi } from "vitest";

const classes = vi.hoisted(() => {
  class PermissionDeniedError extends Error {
    readonly decision: {
      allowed: false;
      permission: string;
      scope: { type: "global" } | { type: "backlog"; backlogId: string };
      reasons: Array<{ type: string }>;
    };

    constructor(decision: PermissionDeniedError["decision"]) {
      super("permission denied");
      this.name = "PermissionDeniedError";
      this.decision = decision;
    }
  }
  class SchemeTopologyConfirmationRequiredError extends Error {
    constructor(readonly affectedBacklogs: Array<{ id: string; key: string; name: string }>) {
      super("Les backlogs associés à ce schéma ont changé.");
    }
  }
  return { PermissionDeniedError, SchemeTopologyConfirmationRequiredError };
});

const mocks = vi.hoisted(() => ({
  addGlobalPermissionGrant: vi.fn(),
  addGroupMember: vi.fn(),
  addSchemeGrant: vi.fn(),
  appendPlatformAdministratorBypassEvent: vi.fn(),
  assignBacklogRoleActor: vi.fn(),
  associatePermissionScheme: vi.fn(),
  clonePermissionScheme: vi.fn(),
  createGroup: vi.fn(),
  createProjectRole: vi.fn(),
  deleteGroup: vi.fn(),
  deleteProjectRole: vi.fn(),
  getPermissionHelperResult: vi.fn(),
  getSession: vi.fn(),
  groupMembershipRequiredPermission: vi.fn(),
  moveBacklogRoleActor: vi.fn(),
  removeBacklogRoleActor: vi.fn(),
  removeGlobalPermissionGrant: vi.fn(),
  removeGroupMember: vi.fn(),
  removeSchemeGrant: vi.fn(),
  renameGroup: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  setBacklogAccessMode: vi.fn(),
  updateProjectRole: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/auth/authorization", () => ({
  appendPlatformAdministratorBypassEvent: mocks.appendPlatformAdministratorBypassEvent,
  PermissionDeniedError: classes.PermissionDeniedError,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/services/authorization-admin", () => ({
  addGlobalPermissionGrant: mocks.addGlobalPermissionGrant,
  addGroupMember: mocks.addGroupMember,
  addSchemeGrant: mocks.addSchemeGrant,
  assignBacklogRoleActor: mocks.assignBacklogRoleActor,
  associatePermissionScheme: mocks.associatePermissionScheme,
  clonePermissionScheme: mocks.clonePermissionScheme,
  createGroup: mocks.createGroup,
  createProjectRole: mocks.createProjectRole,
  deleteGroup: mocks.deleteGroup,
  deleteProjectRole: mocks.deleteProjectRole,
  getPermissionHelperResult: mocks.getPermissionHelperResult,
  groupMembershipRequiredPermission: mocks.groupMembershipRequiredPermission,
  moveBacklogRoleActor: mocks.moveBacklogRoleActor,
  removeBacklogRoleActor: mocks.removeBacklogRoleActor,
  removeGlobalPermissionGrant: mocks.removeGlobalPermissionGrant,
  removeGroupMember: mocks.removeGroupMember,
  removeSchemeGrant: mocks.removeSchemeGrant,
  renameGroup: mocks.renameGroup,
  setBacklogAccessMode: mocks.setBacklogAccessMode,
  updateProjectRole: mocks.updateProjectRole,
  ProtectedInvariantError: class ProtectedInvariantError extends Error {},
  SchemeTopologyConfirmationRequiredError: classes.SchemeTopologyConfirmationRequiredError,
  StaleSchemeVersionError: class StaleSchemeVersionError extends Error {},
}));

import {
  addSchemeGrantAction,
  addGlobalPermissionGrantAction,
  addGroupMemberAction,
  assignBacklogRoleActorAction,
  associatePermissionSchemeAction,
  createGroupAction,
  moveBacklogRoleActorAction,
  permissionHelperAction,
  removeBacklogRoleActorAction,
  removeGroupMemberAction,
  setBacklogAccessModeAction,
} from "@/app/actions/authorization";

const backlogId = "00000000-0000-4000-8000-000000000001";
const schemeId = "00000000-0000-4000-8000-000000000002";
const projectRoleId = "00000000-0000-4000-8000-000000000003";
const groupId = "00000000-0000-4000-8000-000000000004";

const allowed = (scope: { type: "global" } | { type: "backlog"; backlogId: string }) => ({
  allowed: true,
  permission: scope.type === "global" ? "manage_users_groups" : "manage_members",
  scope,
  reasons: [{ type: "user_grant", id: "actor-session", label: "Actrice" }],
});

describe("authorization administration Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "actor-session", role: "contributor", twoFactorEnabled: true },
    });
    mocks.requirePermission.mockImplementation(async (input) => allowed(input.scope));
    mocks.appendPlatformAdministratorBypassEvent.mockResolvedValue(undefined);
    mocks.groupMembershipRequiredPermission.mockResolvedValue("manage_users_groups");
  });

  it("derives the actor from the session and requires manage_users_groups to create groups", async () => {
    mocks.createGroup.mockResolvedValue({ id: groupId, name: "Équipe", protected: false });

    await expect(createGroupAction({ name: "  Équipe  " })).resolves.toEqual({
      ok: true,
      group: { id: groupId, name: "Équipe", protected: false },
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId: "actor-session",
      permission: "manage_users_groups",
      scope: { type: "global" },
    });
    expect(mocks.createGroup).toHaveBeenCalledWith(
      { name: "Équipe" },
      "actor-session",
      expect.any(String),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("requires manage_members for backlog role occupancy and returns the exact French denial", async () => {
    mocks.requirePermission.mockRejectedValue(
      new classes.PermissionDeniedError({
        allowed: false,
        permission: "manage_members",
        scope: { type: "backlog", backlogId },
        reasons: [{ type: "no_matching_grant" }],
      }),
    );

    await expect(
      assignBacklogRoleActorAction({
        backlogId,
        projectRoleId,
        principal: { type: "user", userId: "member-1" },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Gérer les membres » pour ce backlog.",
    });
    expect(mocks.assignBacklogRoleActor).not.toHaveBeenCalled();
  });

  it("requires administer_backlog for scheme association", async () => {
    mocks.associatePermissionScheme.mockResolvedValue({
      backlogId,
      backlogKey: "DEMO",
      schemeId,
    });

    await associatePermissionSchemeAction({ backlogId, schemeId });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId: "actor-session",
      permission: "administer_backlog",
      scope: { type: "backlog", backlogId },
    });
  });

  it("allows the permission helper through administer_backlog or administer_jiroo", async () => {
    mocks.requirePermission
      .mockRejectedValueOnce(
        new classes.PermissionDeniedError({
          allowed: false,
          permission: "administer_backlog",
          scope: { type: "backlog", backlogId },
          reasons: [{ type: "no_matching_grant" }],
        }),
      )
      .mockResolvedValueOnce(allowed({ type: "global" }));
    mocks.getPermissionHelperResult.mockResolvedValue({
      allowed: true,
      permission: "manage_members",
      reasons: [{ type: "group_grant", label: "Équipe" }],
    });

    await expect(
      permissionHelperAction({ backlogId, userId: "member-1", permission: "manage_members" }),
    ).resolves.toEqual({
      ok: true,
      result: {
        allowed: true,
        permission: "manage_members",
        reasons: [{ type: "group_grant", label: "Équipe" }],
      },
    });
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(1, {
      actorId: "actor-session",
      permission: "administer_backlog",
      scope: { type: "backlog", backlogId },
    });
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(2, {
      actorId: "actor-session",
      permission: "administer_jiroo",
      scope: { type: "global" },
    });
  });

  it("requires administer_jiroo for global grants so group managers cannot escalate", async () => {
    mocks.requirePermission.mockRejectedValue(
      new classes.PermissionDeniedError({
        allowed: false,
        permission: "administer_jiroo",
        scope: { type: "global" },
        reasons: [{ type: "no_matching_grant" }],
      }),
    );

    await expect(
      addGlobalPermissionGrantAction({
        permission: "administer_jiroo",
        principal: { type: "group", groupId },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Administrer Jiroo ».",
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId: "actor-session",
      permission: "administer_jiroo",
      scope: { type: "global" },
    });
    expect(mocks.addGlobalPermissionGrant).not.toHaveBeenCalled();
  });

  it("returns the current affected backlogs when a scheme edit needs renewed confirmation", async () => {
    const currentAffectedBacklogs = [
      { id: backlogId, key: "DEMO", name: "Démonstration" },
      { id: "00000000-0000-4000-8000-000000000009", key: "OPS", name: "Opérations" },
    ];
    mocks.addSchemeGrant.mockRejectedValue(
      new classes.SchemeTopologyConfirmationRequiredError(currentAffectedBacklogs),
    );

    await expect(addSchemeGrantAction({
      schemeId,
      permission: "manage_releases",
      principal: { type: "user", userId: "member-1" },
      expectedVersion: 4,
      expectedAffectedBacklogIds: [backlogId],
    })).resolves.toEqual({
      ok: false,
      confirmationRequired: true,
      affectedBacklogs: currentAffectedBacklogs,
    });
    expect(mocks.addSchemeGrant).toHaveBeenCalledWith(
      expect.objectContaining({ expectedAffectedBacklogIds: [backlogId] }),
      "actor-session",
      expect.any(String),
    );
  });

  it("revalidates backlogs made accessible by a platform-administrator grant", async () => {
    mocks.addGlobalPermissionGrant.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000099",
      permission: "administer_jiroo",
      principalType: "user",
      affectedBacklogKeys: ["DEMO"],
    });

    await addGlobalPermissionGrantAction({
      permission: "administer_jiroo",
      principal: { type: "user", userId: "member-1" },
    });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/DEMO");
  });

  it("revalidates every backlog returned by global-admin group membership changes", async () => {
    mocks.addGroupMember.mockResolvedValue({
      groupId,
      userId: "member-1",
      affectedBacklogKeys: ["DEMO", "OPS"],
    });
    mocks.removeGroupMember.mockResolvedValue({
      groupId,
      userId: "member-1",
      affectedBacklogKeys: ["DEMO", "OPS"],
    });

    await addGroupMemberAction({ groupId, userId: "member-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/DEMO");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/OPS");

    mocks.revalidatePath.mockClear();
    await removeGroupMemberAction({ groupId, userId: "member-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/DEMO");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/b/OPS");
  });

  it.each([
    ["add", () => addGroupMemberAction({ groupId, userId: "member-1" }), mocks.addGroupMember],
    ["remove", () => removeGroupMemberAction({ groupId, userId: "member-1" }), mocks.removeGroupMember],
  ])("requires administer_jiroo before %s on a privileged group", async (_name, run, service) => {
    mocks.groupMembershipRequiredPermission.mockResolvedValue("administer_jiroo");
    mocks.requirePermission.mockImplementation(async (input) => {
      if (input.permission !== "administer_jiroo") return allowed(input.scope);
      throw new classes.PermissionDeniedError({
          allowed: false,
          permission: "administer_jiroo",
          scope: { type: "global" },
          reasons: [{ type: "no_matching_grant" }],
        });
    });

    await expect(run()).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Administrer Jiroo ».",
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId: "actor-session",
      permission: "administer_jiroo",
      scope: { type: "global" },
    });
    expect(service).not.toHaveBeenCalled();
  });

  it("moves a Simple role occupant through one authorized domain mutation", async () => {
    mocks.moveBacklogRoleActor.mockResolvedValue({ backlogKey: "DEMO" });

    await expect(moveBacklogRoleActorAction({
      backlogId,
      sourceProjectRoleId: projectRoleId,
      targetProjectRoleId: "00000000-0000-4000-8000-000000000009",
      principal: { type: "user", userId: "member-1" },
    })).resolves.toEqual({ ok: true, occupancy: { backlogKey: "DEMO" } });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      actorId: "actor-session",
      permission: "manage_members",
      scope: { type: "backlog", backlogId },
    });
    expect(mocks.moveBacklogRoleActor).toHaveBeenCalledOnce();
  });

  it("records a bypass before the domain service with the same correlation ID", async () => {
    mocks.requirePermission.mockResolvedValue({
      allowed: true,
      permission: "manage_members",
      scope: { type: "backlog", backlogId },
      reasons: [{ type: "platform_administrator" }],
    });
    mocks.addGroupMember.mockResolvedValue({
      groupId,
      userId: "member-1",
      affectedBacklogKeys: ["DEMO"],
    });

    await addGroupMemberAction({ groupId, userId: "member-1" });

    expect(mocks.appendPlatformAdministratorBypassEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "actor-session",
        permission: "manage_users_groups",
        requestCorrelationId: expect.any(String),
      }),
    );
    const bypassInput = mocks.appendPlatformAdministratorBypassEvent.mock.calls[0]![0];
    expect(mocks.addGroupMember).toHaveBeenCalledWith(
      { groupId, userId: "member-1" },
      "actor-session",
      bypassInput.requestCorrelationId,
    );
    expect(
      mocks.appendPlatformAdministratorBypassEvent.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.addGroupMember.mock.invocationCallOrder[0]!);
  });

  it("keeps the bypass audit when the domain mutation fails", async () => {
    mocks.requirePermission.mockResolvedValue({
      allowed: true,
      permission: "manage_members",
      scope: { type: "backlog", backlogId },
      reasons: [{ type: "platform_administrator" }],
    });
    mocks.removeBacklogRoleActor.mockRejectedValue(
      new Error("Le dernier administrateur effectif du backlog ne peut pas être retiré."),
    );

    await expect(
      removeBacklogRoleActorAction({
        backlogId,
        projectRoleId,
        principal: { type: "user", userId: "member-1" },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Le dernier administrateur effectif du backlog ne peut pas être retiré.",
    });
    expect(mocks.appendPlatformAdministratorBypassEvent).toHaveBeenCalledTimes(1);
    expect(mocks.removeBacklogRoleActor).toHaveBeenCalledTimes(1);
  });

  it("revalidates admin, backlog, home, mine, and trash after access changes", async () => {
    mocks.setBacklogAccessMode.mockResolvedValue({
      backlogId,
      backlogKey: "DEMO",
      mode: "advanced",
    });

    await expect(setBacklogAccessModeAction({ backlogId, mode: "advanced" })).resolves.toEqual({
      ok: true,
      access: { backlogId, backlogKey: "DEMO", mode: "advanced" },
    });
    expect(new Set(mocks.revalidatePath.mock.calls.map(([path]) => path))).toEqual(
      new Set(["/admin", "/b/DEMO", "/", "/mine", "/trash"]),
    );
  });
});
