import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { appendPlatformAdministratorBypassEvent } from "@/lib/auth/authorization";
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
import {
  addGlobalPermissionGrant,
  addGroupMember,
  addSchemeGrant,
  assignBacklogRoleActor,
  associatePermissionScheme,
  clonePermissionScheme,
  createGroup,
  createProjectRole,
  deleteGroup,
  deleteProjectRole,
  listAffectedBacklogs,
  listGroups,
  listPermissionSchemes,
  listProjectRoles,
  readBacklogAccess,
  readSecurityHistory,
  removeBacklogRoleActor,
  removeGlobalPermissionGrant,
  removeGroupMember,
  removeSchemeGrant,
  renameGroup,
  setBacklogAccessMode,
  updateProjectRole,
} from "@/lib/services/authorization-admin";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureId = randomUUID();
const compact = fixtureId.replaceAll("-", "");
const actorId = `admin-service-actor-${fixtureId}`;
const memberId = `admin-service-member-${fixtureId}`;
const secondMemberId = `admin-service-member-2-${fixtureId}`;
const correlation = (suffix: string) => `task-4-${fixtureId}-${suffix}`;

let administratorRoleId = "";
let backlogAId = "";
let backlogBId = "";
let backlogCId = "";
let backlogAKey = "";
let backlogBKey = "";
let backlogCKey = "";
let sharedSchemeId = "";
let privateSchemeId = "";
const createdGroupIds: string[] = [];
const createdRoleIds: string[] = [];
const createdSchemeIds: string[] = [];

async function storedVersion(schemeId: string): Promise<number> {
  const [row] = await db
    .select({ version: permissionSchemes.version })
    .from(permissionSchemes)
    .where(eq(permissionSchemes.id, schemeId));
  if (!row) throw new Error("Schéma de test introuvable.");
  return row.version;
}

async function createIsolatedScheme(name: string): Promise<string> {
  const [scheme] = await db
    .insert(permissionSchemes)
    .values({ key: `task-4-${randomUUID()}`, name })
    .returning({ id: permissionSchemes.id });
  createdSchemeIds.push(scheme!.id);
  return scheme!.id;
}

describeDb("transactional authorization administration", () => {
  beforeAll(async () => {
    await db.insert(user).values([
      {
        id: actorId,
        name: "Administratrice de test",
        email: `${actorId}@example.test`,
        emailVerified: true,
        role: "contributor",
      },
      {
        id: memberId,
        name: "Membre de test",
        email: `${memberId}@example.test`,
        emailVerified: true,
        role: "contributor",
      },
      {
        id: secondMemberId,
        name: "Second membre de test",
        email: `${secondMemberId}@example.test`,
        emailVerified: true,
        role: "contributor",
      },
    ]);

    const [administratorRole] = await db
      .select({ id: projectRoles.id })
      .from(projectRoles)
      .where(eq(projectRoles.key, "administrators"));
    if (!administratorRole) throw new Error("Le seed doit contenir le rôle Administrateur.");
    administratorRoleId = administratorRole.id;

    const [sharedScheme, privateScheme] = await db
      .insert(permissionSchemes)
      .values([
        { key: `task-4-shared-${fixtureId}`, name: "Schéma partagé Task 4" },
        { key: `task-4-private-${fixtureId}`, name: "Schéma privé Task 4" },
      ])
      .returning({ id: permissionSchemes.id });
    sharedSchemeId = sharedScheme!.id;
    privateSchemeId = privateScheme!.id;
    createdSchemeIds.push(sharedSchemeId, privateSchemeId);

    await db.insert(permissionGrants).values(
      [sharedSchemeId, privateSchemeId].flatMap((permissionSchemeId) =>
        ["browse_backlog", "administer_backlog"].map((permissionKey) => ({
          scope: "backlog" as const,
          permissionSchemeId,
          permissionKey,
          principalType: "project_role" as const,
          projectRoleId: administratorRoleId,
        })),
      ),
    );

    const [backlogA, backlogB, backlogC] = await db
      .insert(backlogs)
      .values([
        { key: `T4A${compact.slice(0, 3)}`.toUpperCase(), name: "Backlog Task 4 A" },
        { key: `T4B${compact.slice(3, 6)}`.toUpperCase(), name: "Backlog Task 4 B" },
        { key: `T4C${compact.slice(6, 9)}`.toUpperCase(), name: "Backlog Task 4 C" },
      ])
      .returning({ id: backlogs.id, key: backlogs.key });
    backlogAId = backlogA!.id;
    backlogBId = backlogB!.id;
    backlogCId = backlogC!.id;
    backlogAKey = backlogA!.key;
    backlogBKey = backlogB!.key;
    backlogCKey = backlogC!.key;

    await db.insert(backlogPermissionConfigs).values([
      { backlogId: backlogAId, permissionSchemeId: sharedSchemeId, accessMode: "advanced" },
      { backlogId: backlogBId, permissionSchemeId: sharedSchemeId, accessMode: "advanced" },
      { backlogId: backlogCId, permissionSchemeId: privateSchemeId, accessMode: "advanced" },
    ]);
    await db.insert(backlogRoleActors).values([
      {
        backlogId: backlogAId,
        projectRoleId: administratorRoleId,
        actorType: "user",
        userId: actorId,
      },
      {
        backlogId: backlogBId,
        projectRoleId: administratorRoleId,
        actorType: "user",
        userId: actorId,
      },
      {
        backlogId: backlogCId,
        projectRoleId: administratorRoleId,
        actorType: "user",
        userId: actorId,
      },
    ]);
  });

  afterAll(async () => {
    if (backlogAId) {
      await db.delete(backlogs).where(inArray(backlogs.id, [backlogAId, backlogBId, backlogCId]));
    }
    if (createdSchemeIds.length > 0) {
      await db.delete(permissionSchemes).where(inArray(permissionSchemes.id, createdSchemeIds));
    }
    if (createdRoleIds.length > 0) {
      await db.delete(projectRoles).where(inArray(projectRoles.id, createdRoleIds));
    }
    if (createdGroupIds.length > 0) {
      await db.delete(permissionGrants).where(inArray(permissionGrants.groupId, createdGroupIds));
      await db.delete(userGroups).where(inArray(userGroups.id, createdGroupIds));
    }
    await db.delete(user).where(inArray(user.id, [actorId, memberId, secondMemberId]));
  });

  it("creates groups, changes membership, exposes blockers, and deletes unused groups", async () => {
    const group = await createGroup(
      { name: "  Équipe produit  " },
      actorId,
      correlation("group-create"),
    );
    createdGroupIds.push(group.id);
    expect(group).toEqual({ id: group.id, name: "Équipe produit", protected: false });

    await expect(
      renameGroup(
        { groupId: group.id, name: "  Équipe produit étendue  " },
        actorId,
        correlation("group-rename"),
      ),
    ).resolves.toMatchObject({ id: group.id, name: "Équipe produit étendue" });

    await db.insert(permissionGrants).values({
      scope: "backlog",
      permissionSchemeId: privateSchemeId,
      permissionKey: "manage_releases",
      principalType: "group",
      groupId: group.id,
    });
    const membership = await addGroupMember(
      { groupId: group.id, userId: memberId },
      actorId,
      correlation("group-add"),
    );
    expect(membership.affectedBacklogKeys).toEqual([backlogCKey]);
    expect(
      await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, group.id)),
    ).toEqual([{ userId: memberId }]);

    await expect(
      deleteGroup({ groupId: group.id }, actorId, correlation("group-blocked-delete")),
    ).rejects.toThrow("Ce groupe est utilisé par une autorisation ou un rôle de backlog.");

    await db.delete(permissionGrants).where(eq(permissionGrants.groupId, group.id));
    await removeGroupMember(
      { groupId: group.id, userId: memberId },
      actorId,
      correlation("group-remove"),
    );
    await deleteGroup({ groupId: group.id }, actorId, correlation("group-delete"));
    expect(
      await db.select({ id: userGroups.id }).from(userGroups).where(eq(userGroups.id, group.id)),
    ).toEqual([]);
  });

  it("creates custom roles and assigns both user and group occupants per backlog", async () => {
    const group = await createGroup({ name: "Spécialistes" }, actorId, correlation("role-group"));
    createdGroupIds.push(group.id);
    const role = await createProjectRole(
      { name: "Responsable delivery", description: "Suit les livraisons" },
      actorId,
      correlation("role-create"),
    );
    createdRoleIds.push(role.id);
    await expect(
      updateProjectRole(
        { projectRoleId: role.id, name: "Responsable des livraisons", description: null },
        actorId,
        correlation("role-update"),
      ),
    ).resolves.toMatchObject({ name: "Responsable des livraisons", description: null });

    await assignBacklogRoleActor(
      {
        backlogId: backlogCId,
        projectRoleId: role.id,
        principal: { type: "user", userId: memberId },
      },
      actorId,
      correlation("role-user"),
    );
    await assignBacklogRoleActor(
      {
        backlogId: backlogCId,
        projectRoleId: role.id,
        principal: { type: "group", groupId: group.id },
      },
      actorId,
      correlation("role-group-actor"),
    );

    const occupants = await db
      .select({ actorType: backlogRoleActors.actorType })
      .from(backlogRoleActors)
      .where(
        and(
          eq(backlogRoleActors.backlogId, backlogCId),
          eq(backlogRoleActors.projectRoleId, role.id),
        ),
      )
      .orderBy(asc(backlogRoleActors.actorType));
    expect(occupants).toHaveLength(2);
    expect(occupants).toEqual(
      expect.arrayContaining([{ actorType: "group" }, { actorType: "user" }]),
    );

    await expect(
      deleteProjectRole(
        { projectRoleId: role.id },
        actorId,
        correlation("role-delete-blocked"),
      ),
    ).rejects.toThrow("Ce rôle de projet est encore utilisé.");

    await removeBacklogRoleActor(
      {
        backlogId: backlogCId,
        projectRoleId: role.id,
        principal: { type: "user", userId: memberId },
      },
      actorId,
      correlation("role-user-remove"),
    );
    await removeBacklogRoleActor(
      {
        backlogId: backlogCId,
        projectRoleId: role.id,
        principal: { type: "group", groupId: group.id },
      },
      actorId,
      correlation("role-group-remove"),
    );
    await deleteProjectRole(
      { projectRoleId: role.id },
      actorId,
      correlation("role-delete"),
    );
  });

  it("clones a scheme with all grants but a fresh version", async () => {
    const clone = await clonePermissionScheme(
      { sourceSchemeId: sharedSchemeId, name: "Copie privée" },
      actorId,
      correlation("scheme-clone"),
    );
    createdSchemeIds.push(clone.id);
    expect(clone).toMatchObject({ name: "Copie privée", version: 1, protected: false });

    const sourceGrants = await db
      .select({ permissionKey: permissionGrants.permissionKey, principalType: permissionGrants.principalType })
      .from(permissionGrants)
      .where(eq(permissionGrants.permissionSchemeId, sharedSchemeId))
      .orderBy(asc(permissionGrants.permissionKey));
    const clonedGrants = await db
      .select({ permissionKey: permissionGrants.permissionKey, principalType: permissionGrants.principalType })
      .from(permissionGrants)
      .where(eq(permissionGrants.permissionSchemeId, clone.id))
      .orderBy(asc(permissionGrants.permissionKey));
    expect(clonedGrants).toEqual(sourceGrants);
  });

  it("increments a scheme version, writes audit, and rejects stale grants without mutation", async () => {
    const schemeId = await createIsolatedScheme("Optimistic Task 4");
    const grant = await addSchemeGrant(
      {
        schemeId,
        permission: "manage_releases",
        principal: { type: "user", userId: memberId },
        expectedVersion: 1,
      },
      actorId,
      correlation("grant-add"),
    );
    expect(grant).toMatchObject({ permission: "manage_releases", version: 2 });

    await expect(
      addSchemeGrant(
        {
          schemeId,
          permission: "browse_backlog",
          principal: { type: "user", userId: secondMemberId },
          expectedVersion: 1,
        },
        actorId,
        correlation("grant-stale"),
      ),
    ).rejects.toThrow("Ce schéma a été modifié. Rechargez la page.");
    expect(await storedVersion(schemeId)).toBe(2);
    expect(
      await db
        .select({ id: permissionGrants.id })
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.permissionSchemeId, schemeId),
            eq(permissionGrants.userId, secondMemberId),
          ),
        ),
    ).toEqual([]);

    const history = await readSecurityHistory({ limit: 200 });
    expect(history).toContainEqual(
      expect.objectContaining({
        action: "permission_scheme_grant_added",
        requestCorrelationId: correlation("grant-add"),
      }),
    );

    await removeSchemeGrant(
      { schemeId, grantId: grant.id, expectedVersion: 2 },
      actorId,
      correlation("grant-remove"),
    );
    expect(await storedVersion(schemeId)).toBe(3);
  });

  it("lists every backlog affected by a shared scheme", async () => {
    await expect(listAffectedBacklogs(sharedSchemeId)).resolves.toEqual([
      expect.objectContaining({ id: backlogAId, name: "Backlog Task 4 A" }),
      expect.objectContaining({ id: backlogBId, name: "Backlog Task 4 B" }),
    ]);
  });

  it("returns minimal administration DTOs for groups, roles, schemes, and backlog access", async () => {
    const groups = await listGroups();
    expect(groups[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        protected: expect.any(Boolean),
        memberCount: expect.any(Number),
      }),
    );
    const roles = await listProjectRoles();
    expect(roles).toContainEqual(
      expect.objectContaining({ id: administratorRoleId, key: "administrators" }),
    );
    const schemes = await listPermissionSchemes();
    expect(schemes).toContainEqual(
      expect.objectContaining({ id: sharedSchemeId, version: expect.any(Number), usageCount: 2 }),
    );
    await expect(readBacklogAccess(backlogAId)).resolves.toMatchObject({
      backlog: { id: backlogAId, name: "Backlog Task 4 A" },
      scheme: { id: sharedSchemeId },
      mode: "advanced",
    });
  });

  it("adds and removes global grants with immutable audit events", async () => {
    const grant = await addGlobalPermissionGrant(
      {
        permission: "administer_jiroo",
        principal: { type: "user", userId: memberId },
      },
      actorId,
      correlation("global-grant-add"),
    );
    expect(grant).toMatchObject({
      permission: "administer_jiroo",
      principalType: "user",
      affectedBacklogKeys: expect.arrayContaining([backlogAKey, backlogBKey, backlogCKey]),
    });

    const removed = await removeGlobalPermissionGrant(
      { grantId: grant.id },
      actorId,
      correlation("global-grant-remove"),
    );
    expect(removed.affectedBacklogKeys).toEqual(
      expect.arrayContaining([backlogAKey, backlogBKey, backlogCKey]),
    );
    expect(
      await db
        .select({ id: permissionGrants.id })
        .from(permissionGrants)
        .where(eq(permissionGrants.id, grant.id)),
    ).toEqual([]);
    expect(
      await db
        .select({ action: securityAuditEvents.action })
        .from(securityAuditEvents)
        .where(eq(securityAuditEvents.requestCorrelationId, correlation("global-grant-remove"))),
    ).toEqual([{ action: "global_permission_grant_removed" }]);
  });

  it("persists a platform-administrator bypass before an independent domain transaction", async () => {
    await appendPlatformAdministratorBypassEvent({
      actorId,
      permission: "manage_members",
      scope: { type: "backlog", backlogId: backlogAId },
      targetType: "backlog_role_actor",
      targetId: backlogAId,
      requestCorrelationId: correlation("platform-bypass"),
    });

    expect(
      await db
        .select({
          action: securityAuditEvents.action,
          actorLabel: securityAuditEvents.actorLabel,
          backlogId: securityAuditEvents.backlogId,
        })
        .from(securityAuditEvents)
        .where(eq(securityAuditEvents.requestCorrelationId, correlation("platform-bypass"))),
    ).toEqual([
      {
        action: "platform_administrator_bypass",
        actorLabel: "Administratrice de test",
        backlogId: backlogAId,
      },
    ]);
  });

  it("associates a scheme and its immutable audit event atomically", async () => {
    const targetSchemeId = await createIsolatedScheme("Association Task 4");
    await db.insert(permissionGrants).values(
      ["browse_backlog", "administer_backlog"].map((permissionKey) => ({
        scope: "backlog" as const,
        permissionSchemeId: targetSchemeId,
        permissionKey,
        principalType: "project_role" as const,
        projectRoleId: administratorRoleId,
      })),
    );

    const result = await associatePermissionScheme(
      { backlogId: backlogCId, schemeId: targetSchemeId },
      actorId,
      correlation("scheme-associate"),
    );
    expect(result).toMatchObject({ backlogId: backlogCId, schemeId: targetSchemeId });
    expect(
      await db
        .select({ permissionSchemeId: backlogPermissionConfigs.permissionSchemeId })
        .from(backlogPermissionConfigs)
        .where(eq(backlogPermissionConfigs.backlogId, backlogCId)),
    ).toEqual([{ permissionSchemeId: targetSchemeId }]);
    expect(
      await db
        .select({ action: securityAuditEvents.action })
        .from(securityAuditEvents)
        .where(eq(securityAuditEvents.requestCorrelationId, correlation("scheme-associate"))),
    ).toEqual([{ action: "backlog_permission_scheme_associated" }]);
  });

  it("rejects removal of the last platform administrator", async () => {
    const [platformGroup] = await db
      .select({ id: userGroups.id })
      .from(userGroups)
      .where(eq(userGroups.key, "platform-administrators"));
    if (!platformGroup) throw new Error("Le seed doit contenir le groupe plateforme.");
    const members = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, platformGroup.id));
    expect(members).toHaveLength(1);

    await expect(
      removeGroupMember(
        { groupId: platformGroup.id, userId: members[0]!.userId },
        actorId,
        correlation("last-platform-admin"),
      ),
    ).rejects.toThrow("Le dernier administrateur de la plateforme ne peut pas être retiré.");
  });

  it("rejects removal of the last effective backlog administrator", async () => {
    await expect(
      removeBacklogRoleActor(
        {
          backlogId: backlogAId,
          projectRoleId: administratorRoleId,
          principal: { type: "user", userId: actorId },
        },
        actorId,
        correlation("last-backlog-admin"),
      ),
    ).rejects.toThrow("Le dernier administrateur effectif du backlog ne peut pas être retiré.");

    expect(
      await db
        .select({ id: backlogRoleActors.id })
        .from(backlogRoleActors)
        .where(
          and(
            eq(backlogRoleActors.backlogId, backlogAId),
            eq(backlogRoleActors.userId, actorId),
          ),
        ),
    ).toHaveLength(1);
  });

  it("refuses Simple mode for shared and non-representable schemes", async () => {
    await expect(
      setBacklogAccessMode(
        { backlogId: backlogAId, mode: "simple" },
        actorId,
        correlation("simple-shared"),
      ),
    ).rejects.toThrow("Le mode Simple est indisponible : ce schéma est partagé.");

    const nonRepresentableSchemeId = await createIsolatedScheme("Avancé Task 4");
    await db.insert(permissionGrants).values([
      {
        scope: "backlog",
        permissionSchemeId: nonRepresentableSchemeId,
        permissionKey: "browse_backlog",
        principalType: "user",
        userId: actorId,
      },
      {
        scope: "backlog",
        permissionSchemeId: nonRepresentableSchemeId,
        permissionKey: "administer_backlog",
        principalType: "user",
        userId: actorId,
      },
    ]);
    await associatePermissionScheme(
      { backlogId: backlogCId, schemeId: nonRepresentableSchemeId },
      actorId,
      correlation("associate-non-representable"),
    );
    await expect(
      setBacklogAccessMode(
        { backlogId: backlogCId, mode: "simple" },
        actorId,
        correlation("simple-non-representable"),
      ),
    ).rejects.toThrow(
      "Le mode Simple est indisponible : ce schéma contient des autorisations avancées.",
    );
  });
});
