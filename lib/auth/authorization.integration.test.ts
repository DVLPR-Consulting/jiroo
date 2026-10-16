import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  checkPermission,
  checkPermissions,
  explainPermission,
  listAssignableUsersForBacklog,
  PermissionDeniedError,
  requirePermission,
  ResourceNotFoundError,
} from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  backlogRoleActors,
  backlogs,
  groupMembers,
  permissionGrants,
  permissionSchemes,
  projectRoles,
  securityAuditEvents,
  userGroups,
} from "@/lib/db/schema/domain";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

const fixtureId = randomUUID();
const slug = fixtureId.replaceAll("-", "");
const ids = {
  direct: `auth-direct-${fixtureId}`,
  group: `auth-group-${fixtureId}`,
  roleUser: `auth-role-user-${fixtureId}`,
  roleGroup: `auth-role-group-${fixtureId}`,
  authenticated: `auth-authenticated-${fixtureId}`,
  multiple: `auth-multiple-${fixtureId}`,
  noBrowse: `auth-no-browse-${fixtureId}`,
  noAccess: `auth-no-access-${fixtureId}`,
  admin: `auth-admin-${fixtureId}`,
} as const;
const largeDirectoryIds = Array.from(
  { length: 64 },
  (_, index) => `auth-directory-${index}-${fixtureId}`,
);

let backlogAId = "";
let backlogBId = "";
let backlogCId = "";
let unconfiguredBacklogId = "";
let schemeAId = "";
let schemeBId = "";
let schemeCId = "";
let deliveryRoleId = "";
let teamGroupId = "";
let roleGroupId = "";

describeDb("server-only authorization resolver", () => {
  beforeAll(async () => {
    await db.insert(user).values([
      ...Object.entries(ids).map(([kind, id]) => ({
        id,
        name: kind === "admin" ? "Administratrice plateforme" : `Utilisateur ${kind}`,
        email: `${id}@example.test`,
        emailVerified: true,
        role: kind === "admin" ? "admin" : "contributor",
      })),
      ...largeDirectoryIds.map((id, index) => ({
        id,
        name: `Utilisateur annuaire ${index}`,
        email: `${id}@example.test`,
        emailVerified: true,
        role: "contributor",
      })),
    ]);

    const [backlogA, backlogB, backlogC, unconfiguredBacklog] = await db
      .insert(backlogs)
      .values([
        { key: `A${slug.slice(0, 5)}`.toUpperCase(), name: "Autorisations A" },
        { key: `B${slug.slice(5, 10)}`.toUpperCase(), name: "Autorisations B" },
        { key: `C${slug.slice(10, 15)}`.toUpperCase(), name: "Autorisations C" },
        { key: `U${slug.slice(15, 20)}`.toUpperCase(), name: "Autorisations sans config" },
      ])
      .returning({ id: backlogs.id });
    backlogAId = backlogA!.id;
    backlogBId = backlogB!.id;
    backlogCId = backlogC!.id;
    unconfiguredBacklogId = unconfiguredBacklog!.id;

    const [schemeA, schemeB, schemeC] = await db
      .insert(permissionSchemes)
      .values([
        { key: `auth-scheme-a-${fixtureId}`, name: "Schéma A" },
        { key: `auth-scheme-b-${fixtureId}`, name: "Schéma B" },
        { key: `auth-scheme-c-${fixtureId}`, name: "Schéma C" },
      ])
      .returning({ id: permissionSchemes.id });
    schemeAId = schemeA!.id;
    schemeBId = schemeB!.id;
    schemeCId = schemeC!.id;

    const [teamGroup, roleGroup] = await db
      .insert(userGroups)
      .values([
        { key: `auth-team-${fixtureId}`, name: "Équipe produit" },
        { key: `auth-role-team-${fixtureId}`, name: "Spécialistes delivery" },
      ])
      .returning({ id: userGroups.id });
    teamGroupId = teamGroup!.id;
    roleGroupId = roleGroup!.id;

    const [deliveryRole] = await db
      .insert(projectRoles)
      .values({ key: `auth-delivery-${fixtureId}`, name: "Responsable delivery" })
      .returning({ id: projectRoles.id });
    deliveryRoleId = deliveryRole!.id;

    await db.insert(backlogPermissionConfigs).values([
      { backlogId: backlogAId, permissionSchemeId: schemeAId, accessMode: "advanced" },
      { backlogId: backlogBId, permissionSchemeId: schemeBId, accessMode: "advanced" },
      { backlogId: backlogCId, permissionSchemeId: schemeCId, accessMode: "advanced" },
    ]);

    await db.insert(groupMembers).values([
      { groupId: teamGroupId, userId: ids.group },
      { groupId: teamGroupId, userId: ids.multiple },
      { groupId: roleGroupId, userId: ids.roleGroup },
    ]);

    await db.insert(backlogRoleActors).values([
      {
        backlogId: backlogAId,
        projectRoleId: deliveryRoleId,
        actorType: "user",
        userId: ids.roleUser,
      },
      {
        backlogId: backlogAId,
        projectRoleId: deliveryRoleId,
        actorType: "user",
        userId: ids.multiple,
      },
      {
        backlogId: backlogAId,
        projectRoleId: deliveryRoleId,
        actorType: "group",
        groupId: roleGroupId,
      },
      {
        backlogId: backlogBId,
        projectRoleId: deliveryRoleId,
        actorType: "user",
        userId: ids.roleUser,
      },
    ]);

    await db.insert(permissionGrants).values([
      {
        scope: "global",
        permissionKey: "create_backlogs",
        principalType: "user",
        userId: ids.direct,
      },
      {
        scope: "global",
        permissionKey: "browse_users",
        principalType: "group",
        groupId: teamGroupId,
      },
      ...[ids.direct, ids.noBrowse, ids.multiple].map((userId) => ({
        scope: "backlog" as const,
        permissionSchemeId: schemeAId,
        permissionKey: "manage_releases",
        principalType: "user" as const,
        userId,
      })),
      ...[ids.direct, ids.multiple].map((userId) => ({
        scope: "backlog" as const,
        permissionSchemeId: schemeAId,
        permissionKey: "browse_backlog",
        principalType: "user" as const,
        userId,
      })),
      ...["browse_backlog", "manage_releases"].map((permissionKey) => ({
        scope: "backlog" as const,
        permissionSchemeId: schemeAId,
        permissionKey,
        principalType: "group" as const,
        groupId: teamGroupId,
      })),
      ...["browse_backlog", "manage_releases"].map((permissionKey) => ({
        scope: "backlog" as const,
        permissionSchemeId: schemeAId,
        permissionKey,
        principalType: "project_role" as const,
        projectRoleId: deliveryRoleId,
      })),
      {
        scope: "backlog",
        permissionSchemeId: schemeBId,
        permissionKey: "browse_backlog",
        principalType: "project_role",
        projectRoleId: deliveryRoleId,
      },
      ...["browse_backlog", "manage_releases"].map((permissionKey) => ({
        scope: "backlog" as const,
        permissionSchemeId: schemeCId,
        permissionKey,
        principalType: "authenticated_user" as const,
      })),
      {
        scope: "backlog",
        permissionSchemeId: schemeAId,
        permissionKey: "assignable_user",
        principalType: "user",
        userId: ids.direct,
      },
      {
        scope: "backlog",
        permissionSchemeId: schemeAId,
        permissionKey: "assignable_user",
        principalType: "user",
        userId: ids.noBrowse,
      },
      {
        scope: "backlog",
        permissionSchemeId: schemeAId,
        permissionKey: "assignable_user",
        principalType: "group",
        groupId: teamGroupId,
      },
      {
        scope: "backlog",
        permissionSchemeId: schemeAId,
        permissionKey: "assignable_user",
        principalType: "project_role",
        projectRoleId: deliveryRoleId,
      },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(securityAuditEvents)
      .where(eq(securityAuditEvents.actorId, ids.admin));
    if (backlogAId && backlogBId && backlogCId && unconfiguredBacklogId) {
      await db
        .delete(backlogs)
        .where(
          inArray(backlogs.id, [
            backlogAId,
            backlogBId,
            backlogCId,
            unconfiguredBacklogId,
          ]),
        );
    }
    if (schemeAId && schemeBId && schemeCId) {
      await db
        .delete(permissionSchemes)
        .where(inArray(permissionSchemes.id, [schemeAId, schemeBId, schemeCId]));
    }
    await db
      .delete(permissionGrants)
      .where(
        and(
          eq(permissionGrants.scope, "global"),
          or(eq(permissionGrants.userId, ids.direct), eq(permissionGrants.groupId, teamGroupId)),
        ),
      );
    if (teamGroupId || roleGroupId) {
      await db.delete(userGroups).where(inArray(userGroups.id, [teamGroupId, roleGroupId]));
    }
    if (deliveryRoleId) {
      await db.delete(projectRoles).where(eq(projectRoles.id, deliveryRoleId));
    }
    await db.delete(user).where(inArray(user.id, [...Object.values(ids), ...largeDirectoryIds]));
  });

  it("resolves direct user and group grants with business labels", async () => {
    await expect(
      checkPermission({ actorId: ids.direct, permission: "create_backlogs", scope: { type: "global" } }),
    ).resolves.toMatchObject({
      allowed: true,
      reasons: [{ type: "user_grant", id: ids.direct, label: "Utilisateur direct" }],
    });

    // Migration 0021 also grants browse_users to everyone: both reasons show.
    const groupDecision = await checkPermission({
      actorId: ids.group,
      permission: "browse_users",
      scope: { type: "global" },
    });
    expect(groupDecision.allowed).toBe(true);
    expect(groupDecision.reasons).toEqual(
      expect.arrayContaining([{ type: "group_grant", id: teamGroupId, label: "Équipe produit" }]),
    );
  });

  it("lets every authenticated user browse users by default, and nothing more", async () => {
    await expect(
      checkPermission({ actorId: ids.noBrowse, permission: "browse_users", scope: { type: "global" } }),
    ).resolves.toMatchObject({
      allowed: true,
      reasons: [{ type: "authenticated_user_grant", id: "authenticated_user", label: "Tous les utilisateurs authentifiés" }],
    });
    for (const permission of ["administer_jiroo", "manage_users_groups", "create_backlogs"] as const) {
      await expect(
        checkPermission({ actorId: ids.noBrowse, permission, scope: { type: "global" } }),
      ).resolves.toMatchObject({ allowed: false });
    }
    // The database refuses any other permission for everyone.
    await expect(
      db.insert(permissionGrants).values({
        scope: "global",
        permissionKey: "administer_jiroo",
        principalType: "authenticated_user",
      }),
    ).rejects.toThrow();
  });

  it("resolves user-in-role and group-in-role grants", async () => {
    for (const actorId of [ids.roleUser, ids.roleGroup]) {
      await expect(
        checkPermission({
          actorId,
          permission: "manage_releases",
          scope: { type: "backlog", backlogId: backlogAId },
        }),
      ).resolves.toMatchObject({
        allowed: true,
        reasons: [
          { type: "project_role_grant", id: deliveryRoleId, label: "Responsable delivery" },
        ],
      });
    }
  });

  it("resolves authenticated-user grants for an existing actor", async () => {
    await expect(
      checkPermission({
        actorId: ids.authenticated,
        permission: "manage_releases",
        scope: { type: "backlog", backlogId: backlogCId },
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reasons: [
        {
          type: "authenticated_user_grant",
          label: "Tous les utilisateurs authentifiés",
        },
      ],
    });
  });

  it("returns every additive reason in deterministic order", async () => {
    const decision = await explainPermission({
      actorId: ids.multiple,
      permission: "manage_releases",
      scope: { type: "backlog", backlogId: backlogAId },
    });

    expect(decision.reasons.map((reason) => reason.type)).toEqual([
      "user_grant",
      "group_grant",
      "project_role_grant",
    ]);
  });

  it("enforces browse as a prerequisite even when the target permission matches", async () => {
    await expect(
      checkPermission({
        actorId: ids.noBrowse,
        permission: "manage_releases",
        scope: { type: "backlog", backlogId: backlogAId },
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reasons: [{ type: "missing_prerequisite", permission: "browse_backlog" }],
    });
  });

  it("resolves assignable users in two queries for a significant directory", async () => {
    const executeSpy = vi.spyOn(db, "execute");
    const candidates = await listAssignableUsersForBacklog(backlogAId);
    expect(executeSpy).toHaveBeenCalledTimes(2);
    executeSpy.mockRestore();

    const fixtureCandidateIds = new Set(
      candidates
        .map((candidate) => candidate.id)
        .filter((candidateId) =>
          Object.values(ids).includes(candidateId as (typeof ids)[keyof typeof ids]) ||
          largeDirectoryIds.includes(candidateId),
        ),
    );
    expect(fixtureCandidateIds).toEqual(new Set([
      ids.admin,
      ids.direct,
      ids.group,
      ids.multiple,
      ids.roleGroup,
      ids.roleUser,
    ]));
  });

  it("fails closed for unknown permission keys and unknown actors", async () => {
    await expect(
      checkPermission({
        actorId: ids.noAccess,
        permission: "unknown_permission" as never,
        scope: { type: "backlog", backlogId: backlogAId },
      }),
    ).resolves.toMatchObject({ allowed: false, permission: "unknown_permission" });

    await expect(
      checkPermission({
        actorId: `missing-${fixtureId}`,
        permission: "browse_backlog",
        scope: { type: "backlog", backlogId: backlogAId },
      }),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("isolates grants by the backlog's stored permission scheme", async () => {
    await expect(
      checkPermission({
        actorId: ids.roleUser,
        permission: "manage_releases",
        scope: { type: "backlog", backlogId: backlogAId },
      }),
    ).resolves.toMatchObject({ allowed: true });

    await expect(
      checkPermission({
        actorId: ids.roleUser,
        permission: "manage_releases",
        scope: { type: "backlog", backlogId: backlogBId },
      }),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("explains the legacy platform-administrator recovery bypass", async () => {
    await expect(
      checkPermission({
        actorId: ids.admin,
        permission: "manage_workflows",
        scope: { type: "backlog", backlogId: backlogBId },
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reasons: [{ type: "platform_administrator" }],
    });
  });

  it("denies an administrator when the backlog scope does not exist", async () => {
    await expect(
      checkPermission({
        actorId: ids.admin,
        permission: "manage_workflows",
        scope: { type: "backlog", backlogId: randomUUID() },
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reasons: [{ type: "no_matching_grant" }],
    });
  });

  it("keeps the administrator recovery bypass for an existing backlog without config", async () => {
    await expect(
      checkPermission({
        actorId: ids.admin,
        permission: "manage_workflows",
        scope: { type: "backlog", backlogId: unconfiguredBacklogId },
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reasons: [{ type: "platform_administrator" }],
    });
  });

  it("records every mutating platform-administrator bypass at the permission boundary", async () => {
    await expect(
      requirePermission({
        actorId: ids.admin,
        permission: "manage_workflows",
        scope: { type: "backlog", backlogId: backlogBId },
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reasons: [{ type: "platform_administrator" }],
    });

    const events = await db
      .select({
        action: securityAuditEvents.action,
        targetType: securityAuditEvents.targetType,
        targetId: securityAuditEvents.targetId,
        newValue: securityAuditEvents.newValue,
        requestCorrelationId: securityAuditEvents.requestCorrelationId,
      })
      .from(securityAuditEvents)
      .where(
        and(
          eq(securityAuditEvents.actorId, ids.admin),
          eq(securityAuditEvents.action, "platform_administrator_bypass"),
          eq(securityAuditEvents.targetId, backlogBId),
        ),
      );

    expect(events).toEqual([
      {
        action: "platform_administrator_bypass",
        targetType: "backlog",
        targetId: backlogBId,
        newValue: { permission: "manage_workflows" },
        requestCorrelationId: expect.any(String),
      },
    ]);
    expect(events[0]!.requestCorrelationId).not.toHaveLength(0);
  });

  it("throws typed errors for denied permissions and missing resources", async () => {
    await expect(
      requirePermission({
        actorId: ids.noAccess,
        permission: "browse_backlog",
        scope: { type: "backlog", backlogId: backlogAId },
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    await expect(
      requirePermission({
        actorId: ids.direct,
        permission: "browse_backlog",
        scope: { type: "backlog", backlogId: randomUUID() },
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("resolves a batch of permissions exactly like one checkPermission each", async () => {
    const sortReasons = <T extends { reasons: unknown[] }>(decision: T) => ({
      ...decision,
      reasons: [...decision.reasons].sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))),
    });
    const backlogPermissions = [
      "browse_backlog",
      "manage_releases",
      "assignable_user",
      "edit_items",
      "manage_workflows",
      "create_backlogs", // a global permission: unknown in a backlog scope
      "not_a_permission",
    ];
    const globalPermissions = [
      "create_backlogs",
      "browse_users",
      "bulk_change_items",
      "browse_backlog", // a backlog permission: unknown in the global scope
    ];
    const scopes = [
      ...[backlogAId, backlogBId, backlogCId, unconfiguredBacklogId, randomUUID()].map(
        (backlogId) => ({
          scope: { type: "backlog" as const, backlogId },
          permissions: backlogPermissions,
        }),
      ),
      { scope: { type: "global" as const }, permissions: globalPermissions },
    ];

    for (const actorId of [...Object.values(ids), `auth-missing-${fixtureId}`]) {
      for (const { scope, permissions } of scopes) {
        const batch = await checkPermissions({ actorId, permissions, scope });
        expect([...batch.keys()].sort()).toEqual([...permissions].sort());
        for (const permission of permissions) {
          const single = await checkPermission({ actorId, permission, scope });
          expect(sortReasons(batch.get(permission)!), `${actorId} ${permission} ${JSON.stringify(scope)}`)
            .toEqual(sortReasons(single));
        }
      }
    }
  });
});
