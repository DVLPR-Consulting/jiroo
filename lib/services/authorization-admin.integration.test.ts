import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { appendPlatformAdministratorBypassEvent } from "@/lib/auth/authorization";
import { PROTECTED_ROLE_PERMISSION_KEYS } from "@/lib/auth/permissions";
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
  listGlobalPermissionGrants,
  listPermissionSchemes,
  listProjectRoles,
  moveBacklogRoleActor,
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
const protectedRoleIds = new Map<string, string>();
const createdBacklogIds: string[] = [];
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

async function createCanonicalScheme(name: string): Promise<string> {
  const schemeId = await createIsolatedScheme(name);
  await db.insert(permissionGrants).values(
    Object.entries(PROTECTED_ROLE_PERMISSION_KEYS).flatMap(([roleKey, permissions]) =>
      permissions.map((permissionKey) => ({
        scope: "backlog" as const,
        permissionSchemeId: schemeId,
        permissionKey,
        principalType: "project_role" as const,
        projectRoleId: protectedRoleIds.get(roleKey)!,
      })),
    ),
  );
  return schemeId;
}

async function createConfiguredBacklog(
  schemeId: string,
  mode: "simple" | "advanced",
  name: string,
) {
  const key = `R${randomUUID().replaceAll("-", "").slice(0, 5)}`.toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key, name })
    .returning({ id: backlogs.id, key: backlogs.key });
  createdBacklogIds.push(backlog!.id);
  await db.insert(backlogPermissionConfigs).values({
    backlogId: backlog!.id,
    permissionSchemeId: schemeId,
    accessMode: mode,
  });
  await db.insert(backlogRoleActors).values({
    backlogId: backlog!.id,
    projectRoleId: protectedRoleIds.get("administrators")!,
    actorType: "user",
    userId: actorId,
  });
  return backlog!;
}

function withTimeout<T>(promise: Promise<T>, milliseconds = 5_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Opération concurrente bloquée plus de ${milliseconds} ms.`)),
      milliseconds,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
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
    await db.insert(permissionGrants).values({
      scope: "global",
      permissionKey: "administer_jiroo",
      principalType: "user",
      userId: actorId,
    });

    const protectedRoles = await db
      .select({ id: projectRoles.id, key: projectRoles.key })
      .from(projectRoles)
      .where(inArray(projectRoles.key, ["administrators", "members", "viewers"]));
    for (const role of protectedRoles) protectedRoleIds.set(role.key, role.id);
    if (protectedRoleIds.size !== 3) throw new Error("Le seed doit contenir les trois rôles protégés.");
    administratorRoleId = protectedRoleIds.get("administrators")!;

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
    createdBacklogIds.push(backlogAId, backlogBId, backlogCId);

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
    await db
      .delete(securityAuditEvents)
      .where(like(securityAuditEvents.requestCorrelationId, correlation("%")));
    const remainingFixtureEvents = await db
      .select({ id: securityAuditEvents.id })
      .from(securityAuditEvents)
      .where(like(securityAuditEvents.requestCorrelationId, correlation("%")));
    if (remainingFixtureEvents.length > 0) throw new Error("Le teardown a conservé des audits Task 4.");
    if (createdBacklogIds.length > 0) {
      await db.delete(backlogs).where(inArray(backlogs.id, createdBacklogIds));
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

  it("blocks direct self-escalation through a group granting administer_jiroo", async () => {
    const group = await createGroup(
      { name: "Escalade interdite Task 8" },
      actorId,
      correlation("escalation-group-create"),
    );
    createdGroupIds.push(group.id);
    await db.insert(permissionGrants).values([
      {
        scope: "global",
        permissionKey: "administer_jiroo",
        principalType: "group",
        groupId: group.id,
      },
      {
        scope: "global",
        permissionKey: "manage_users_groups",
        principalType: "user",
        userId: secondMemberId,
      },
    ]);

    await expect(
      addGroupMember(
        { groupId: group.id, userId: secondMemberId },
        secondMemberId,
        correlation("escalation-group-add"),
      ),
    ).rejects.toThrow("Seul un administrateur Jiroo peut modifier les membres de ce groupe.");
    expect(
      await db.select({ id: groupMembers.id }).from(groupMembers).where(
        and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, secondMemberId)),
      ),
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
        expectedAffectedBacklogIds: [],
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
          expectedAffectedBacklogIds: [],
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
      { schemeId, grantId: grant.id, expectedVersion: 2, expectedAffectedBacklogIds: [] },
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
        members: expect.any(Array),
        blockers: expect.any(Array),
      }),
    );
    const roles = await listProjectRoles();
    expect(roles).toContainEqual(
      expect.objectContaining({ id: administratorRoleId, key: "administrators", blockers: expect.any(Array) }),
    );
    const schemes = await listPermissionSchemes();
    expect(schemes).toContainEqual(
      expect.objectContaining({ id: sharedSchemeId, version: expect.any(Number), usageCount: 2, grants: expect.any(Array), affectedBacklogs: expect.any(Array) }),
    );
    expect(await listGlobalPermissionGrants()).toEqual(expect.any(Array));
    await expect(readBacklogAccess(backlogAId)).resolves.toMatchObject({
      backlog: { id: backlogAId, name: "Backlog Task 4 A" },
      scheme: { id: sharedSchemeId },
      mode: "advanced",
      roles: expect.any(Array),
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

  it("keeps bootstrap administrators effective when their grant membership is removed", async () => {
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
    const [bootstrap] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, members[0]!.userId));
    expect(bootstrap?.role).toBe("admin");

    try {
      await expect(
        removeGroupMember(
          { groupId: platformGroup.id, userId: members[0]!.userId },
          actorId,
          correlation("bootstrap-membership-remove"),
        ),
      ).resolves.toMatchObject({ groupId: platformGroup.id, userId: members[0]!.userId });
    } finally {
      await db
        .insert(groupMembers)
        .values({ groupId: platformGroup.id, userId: members[0]!.userId })
        .onConflictDoNothing();
    }
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

  it("accepts a private scheme only when its protected-role matrix is exactly canonical", async () => {
    const schemeId = await createCanonicalScheme("Canonique Task 4");
    const backlog = await createConfiguredBacklog(schemeId, "advanced", "Canonique Task 4");

    await expect(
      setBacklogAccessMode(
        { backlogId: backlog.id, mode: "simple" },
        actorId,
        correlation("simple-canonical"),
      ),
    ).resolves.toMatchObject({ backlogId: backlog.id, mode: "simple" });
  });

  it.each(["added", "removed", "moved"] as const)(
    "rejects Simple mode when a protected-role permission is %s",
    async (mutation) => {
      const schemeId = await createCanonicalScheme(`Matrice ${mutation} Task 4`);
      const backlog = await createConfiguredBacklog(
        schemeId,
        "advanced",
        `Matrice ${mutation} Task 4`,
      );

      if (mutation === "added") {
        await db.insert(permissionGrants).values({
          scope: "backlog",
          permissionSchemeId: schemeId,
          permissionKey: "delete_items",
          principalType: "project_role",
          projectRoleId: protectedRoleIds.get("viewers")!,
        });
      } else if (mutation === "removed") {
        await db
          .delete(permissionGrants)
          .where(
            and(
              eq(permissionGrants.permissionSchemeId, schemeId),
              eq(permissionGrants.permissionKey, "browse_backlog"),
              eq(permissionGrants.projectRoleId, protectedRoleIds.get("administrators")!),
            ),
          );
      } else {
        await db
          .delete(permissionGrants)
          .where(
            and(
              eq(permissionGrants.permissionSchemeId, schemeId),
              eq(permissionGrants.permissionKey, "create_items"),
              eq(permissionGrants.projectRoleId, protectedRoleIds.get("members")!),
            ),
          );
        await db.insert(permissionGrants).values({
          scope: "backlog",
          permissionSchemeId: schemeId,
          permissionKey: "create_items",
          principalType: "project_role",
          projectRoleId: protectedRoleIds.get("viewers")!,
        });
      }

      await expect(
        setBacklogAccessMode(
          { backlogId: backlog.id, mode: "simple" },
          actorId,
          correlation(`simple-matrix-${mutation}`),
        ),
      ).rejects.toThrow(
        "Le mode Simple est indisponible : ce schéma contient des autorisations avancées.",
      );
    },
  );

  it("blocks direct grant additions and removals that would corrupt an active Simple scheme", async () => {
    const addSchemeId = await createCanonicalScheme("Simple ajout Task 4");
    const addBacklog = await createConfiguredBacklog(addSchemeId, "simple", "Simple ajout Task 4");

    await expect(
      addSchemeGrant(
        {
          schemeId: addSchemeId,
          permission: "delete_items",
          principal: { type: "user", userId: memberId },
          expectedVersion: 1,
          expectedAffectedBacklogIds: [addBacklog.id],
        },
        actorId,
        correlation("simple-direct-add"),
      ),
    ).rejects.toThrow(
      "Le mode Simple est indisponible : ce schéma contient des autorisations avancées.",
    );
    expect(await storedVersion(addSchemeId)).toBe(1);

    const removeSchemeId = await createCanonicalScheme("Simple retrait Task 4");
    const removeBacklog = await createConfiguredBacklog(removeSchemeId, "simple", "Simple retrait Task 4");
    const [grant] = await db
      .select({ id: permissionGrants.id })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.permissionSchemeId, removeSchemeId),
          eq(permissionGrants.permissionKey, "create_items"),
          eq(permissionGrants.projectRoleId, protectedRoleIds.get("members")!),
        ),
      );

    await expect(
      removeSchemeGrant(
        {
          schemeId: removeSchemeId,
          grantId: grant!.id,
          expectedVersion: 1,
          expectedAffectedBacklogIds: [removeBacklog.id],
        },
        actorId,
        correlation("simple-direct-remove"),
      ),
    ).rejects.toThrow(
      "Le mode Simple est indisponible : ce schéma contient des autorisations avancées.",
    );
    expect(await storedVersion(removeSchemeId)).toBe(1);
  });

  it("blocks associations that make a Simple configuration shared or non-canonical", async () => {
    const sourceSchemeId = await createCanonicalScheme("Simple source Task 4");
    const simpleBacklog = await createConfiguredBacklog(
      sourceSchemeId,
      "simple",
      "Simple source Task 4",
    );
    const advancedSchemeId = await createIsolatedScheme("Schéma avancé direct Task 4");
    await db.insert(permissionGrants).values([
      {
        scope: "backlog",
        permissionSchemeId: advancedSchemeId,
        permissionKey: "browse_backlog",
        principalType: "user",
        userId: actorId,
      },
      {
        scope: "backlog",
        permissionSchemeId: advancedSchemeId,
        permissionKey: "administer_backlog",
        principalType: "user",
        userId: actorId,
      },
    ]);

    await expect(
      associatePermissionScheme(
        { backlogId: simpleBacklog.id, schemeId: advancedSchemeId },
        actorId,
        correlation("simple-associate-advanced"),
      ),
    ).rejects.toThrow(
      "Le mode Simple est indisponible : ce schéma contient des autorisations avancées.",
    );

    const sharingSchemeId = await createCanonicalScheme("Simple partage Task 4");
    await createConfiguredBacklog(sharingSchemeId, "simple", "Simple propriétaire Task 4");
    const advancedBacklog = await createConfiguredBacklog(
      sourceSchemeId,
      "advanced",
      "Avancé association Task 4",
    );
    await expect(
      associatePermissionScheme(
        { backlogId: advancedBacklog.id, schemeId: sharingSchemeId },
        actorId,
        correlation("simple-made-shared"),
      ),
    ).rejects.toThrow("Le mode Simple est indisponible : ce schéma est partagé.");
  });

  it("rejects a grant edit when a concurrent association changed the sharing snapshot", async () => {
    const schemeId = await createCanonicalScheme("Partage concurrent Task 8");
    const sourceBacklog = await createConfiguredBacklog(schemeId, "advanced", "Partage source Task 8");
    const otherSchemeId = await createCanonicalScheme("Partage autre Task 8");
    const secondBacklog = await createConfiguredBacklog(
      otherSchemeId,
      "advanced",
      "Partage second Task 8",
    );

    await associatePermissionScheme(
      { backlogId: secondBacklog.id, schemeId },
      actorId,
      correlation("sharing-concurrent-association"),
    );
    await expect(addSchemeGrant({
      schemeId,
      permission: "manage_releases",
      principal: { type: "user", userId: memberId },
      expectedVersion: 1,
      expectedAffectedBacklogIds: [sourceBacklog.id],
    }, actorId, correlation("sharing-stale-edit"))).rejects.toThrow(
      "Les backlogs associés à ce schéma ont changé.",
    );
    expect(await storedVersion(schemeId)).toBe(1);
  });

  it("requires renewed confirmation when B is replaced by C at constant cardinality", async () => {
    const schemeId = await createCanonicalScheme("Partage exact Task 8");
    const backlogA = await createConfiguredBacklog(schemeId, "advanced", "Partage exact A Task 8");
    const backlogB = await createConfiguredBacklog(schemeId, "advanced", "Partage exact B Task 8");
    const otherSchemeId = await createCanonicalScheme("Partage exact autre Task 8");
    const backlogC = await createConfiguredBacklog(otherSchemeId, "advanced", "Partage exact C Task 8");
    const expectedAffectedBacklogIds = [backlogA.id, backlogB.id].sort();

    await associatePermissionScheme(
      { backlogId: backlogB.id, schemeId: otherSchemeId },
      actorId,
      correlation("sharing-exact-remove-b"),
    );
    await associatePermissionScheme(
      { backlogId: backlogC.id, schemeId },
      actorId,
      correlation("sharing-exact-add-c"),
    );
    const currentAffectedBacklogs = [backlogA, backlogC]
      .sort((left, right) => left.id.localeCompare(right.id));

    await expect(addSchemeGrant({
      schemeId,
      permission: "manage_releases",
      principal: { type: "user", userId: memberId },
      expectedVersion: 1,
      expectedAffectedBacklogIds,
    }, actorId, correlation("sharing-exact-stale-edit"))).rejects.toMatchObject({
      affectedBacklogs: currentAffectedBacklogs.map((backlog) =>
        expect.objectContaining({ id: backlog.id }),
      ),
    });
    expect(await storedVersion(schemeId)).toBe(1);
    expect(await db.select({ id: permissionGrants.id }).from(permissionGrants).where(and(
      eq(permissionGrants.permissionSchemeId, schemeId),
      eq(permissionGrants.permissionKey, "manage_releases"),
      eq(permissionGrants.userId, memberId),
    ))).toEqual([]);

    await expect(addSchemeGrant({
      schemeId,
      permission: "manage_releases",
      principal: { type: "user", userId: memberId },
      expectedVersion: 1,
      expectedAffectedBacklogIds: currentAffectedBacklogs.map((backlog) => backlog.id),
    }, actorId, correlation("sharing-exact-confirmed-edit"))).resolves.toMatchObject({
      permission: "manage_releases",
      version: 2,
    });
  });

  it("rolls back an atomic Simple role move when the target already exists", async () => {
    const schemeId = await createCanonicalScheme("Move rollback Task 8");
    const backlog = await createConfiguredBacklog(schemeId, "simple", "Move rollback Task 8");
    const memberRoleId = protectedRoleIds.get("members")!;
    const viewerRoleId = protectedRoleIds.get("viewers")!;
    await db.insert(backlogRoleActors).values([
      { backlogId: backlog.id, projectRoleId: memberRoleId, actorType: "user", userId: memberId },
      { backlogId: backlog.id, projectRoleId: viewerRoleId, actorType: "user", userId: memberId },
    ]);

    await expect(moveBacklogRoleActor({
      backlogId: backlog.id,
      sourceProjectRoleId: memberRoleId,
      targetProjectRoleId: viewerRoleId,
      principal: { type: "user", userId: memberId },
    }, actorId, correlation("move-rollback"))).rejects.toThrow(
      "Cette affectation de rôle existe déjà.",
    );
    const stored = await db.select({ projectRoleId: backlogRoleActors.projectRoleId })
      .from(backlogRoleActors)
      .where(and(eq(backlogRoleActors.backlogId, backlog.id), eq(backlogRoleActors.userId, memberId)));
    expect(stored).toEqual(expect.arrayContaining([
      { projectRoleId: memberRoleId },
      { projectRoleId: viewerRoleId },
    ]));
  });

  it("serializes concurrent Simple role moves and keeps exactly one target", async () => {
    const schemeId = await createCanonicalScheme("Move concurrence Task 8");
    const backlog = await createConfiguredBacklog(schemeId, "simple", "Move concurrence Task 8");
    const memberRoleId = protectedRoleIds.get("members")!;
    const viewerRoleId = protectedRoleIds.get("viewers")!;
    await db.insert(backlogRoleActors).values({
      backlogId: backlog.id,
      projectRoleId: memberRoleId,
      actorType: "user",
      userId: secondMemberId,
    });

    const outcomes = await withTimeout(Promise.allSettled([
      moveBacklogRoleActor({
        backlogId: backlog.id,
        sourceProjectRoleId: memberRoleId,
        targetProjectRoleId: viewerRoleId,
        principal: { type: "user", userId: secondMemberId },
      }, actorId, correlation("move-concurrent-viewer")),
      moveBacklogRoleActor({
        backlogId: backlog.id,
        sourceProjectRoleId: memberRoleId,
        targetProjectRoleId: administratorRoleId,
        principal: { type: "user", userId: secondMemberId },
      }, actorId, correlation("move-concurrent-admin")),
    ]));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const stored = await db.select({ projectRoleId: backlogRoleActors.projectRoleId })
      .from(backlogRoleActors)
      .where(and(eq(backlogRoleActors.backlogId, backlog.id), eq(backlogRoleActors.userId, secondMemberId)));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.projectRoleId).not.toBe(memberRoleId);
  });

  it(
    "serializes a mode switch with a concurrent association and preserves the Simple invariant",
    async () => {
      const schemeId = await createCanonicalScheme("Concurrence Simple Task 4");
      const modeBacklog = await createConfiguredBacklog(
        schemeId,
        "advanced",
        "Concurrence mode Task 4",
      );
      const otherSchemeId = await createCanonicalScheme("Concurrence autre Task 4");
      const associationBacklog = await createConfiguredBacklog(
        otherSchemeId,
        "advanced",
        "Concurrence association Task 4",
      );

      let releaseSchemeLock!: () => void;
      let announceSchemeLock!: () => void;
      const schemeLockAcquired = new Promise<void>((resolve) => {
        announceSchemeLock = resolve;
      });
      const holdSchemeLock = new Promise<void>((resolve) => {
        releaseSchemeLock = resolve;
      });
      const blocker = db.transaction(async (tx) => {
        await tx
          .select({ id: permissionSchemes.id })
          .from(permissionSchemes)
          .where(eq(permissionSchemes.id, schemeId))
          .for("update");
        announceSchemeLock();
        await holdSchemeLock;
      });

      await schemeLockAcquired;
      const association = associatePermissionScheme(
        { backlogId: associationBacklog.id, schemeId },
        actorId,
        correlation("concurrent-association"),
      );
      await new Promise((resolve) => setTimeout(resolve, 75));
      const modeChange = setBacklogAccessMode(
        { backlogId: modeBacklog.id, mode: "simple" },
        actorId,
        correlation("concurrent-mode"),
      );
      await new Promise((resolve) => setTimeout(resolve, 75));
      releaseSchemeLock();

      const outcomes = await withTimeout(Promise.allSettled([association, modeChange]));
      await blocker;
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);

      const configs = await db
        .select({ mode: backlogPermissionConfigs.accessMode })
        .from(backlogPermissionConfigs)
        .where(eq(backlogPermissionConfigs.permissionSchemeId, schemeId));
      expect(configs.length > 1 && configs.some((config) => config.mode === "simple")).toBe(false);
    },
    10_000,
  );

  it("returns every backlog for membership changes in an administer_jiroo group", async () => {
    const group = await createGroup(
      { name: "Administrateurs globaux Task 4" },
      actorId,
      correlation("global-group-create"),
    );
    createdGroupIds.push(group.id);
    const grant = await addGlobalPermissionGrant(
      { permission: "administer_jiroo", principal: { type: "group", groupId: group.id } },
      actorId,
      correlation("global-group-grant"),
    );

    const added = await addGroupMember(
      { groupId: group.id, userId: memberId },
      actorId,
      correlation("global-group-member-add"),
    );
    expect(added.affectedBacklogKeys).toEqual(
      expect.arrayContaining([backlogAKey, backlogBKey, backlogCKey]),
    );
    const removed = await removeGroupMember(
      { groupId: group.id, userId: memberId },
      actorId,
      correlation("global-group-member-remove"),
    );
    expect(removed.affectedBacklogKeys).toEqual(
      expect.arrayContaining([backlogAKey, backlogBKey, backlogCKey]),
    );
    await removeGlobalPermissionGrant(
      { grantId: grant.id },
      actorId,
      correlation("global-group-grant-remove"),
    );
  });

  it(
    "avoids a group-to-global deadlock during concurrent membership removal and grant creation",
    async () => {
      const group = await createGroup(
        { name: "Interleaving global Task 4" },
        actorId,
        correlation("deadlock-global-group"),
      );
      createdGroupIds.push(group.id);
      await addGroupMember(
        { groupId: group.id, userId: secondMemberId },
        actorId,
        correlation("deadlock-global-member"),
      );

      let releaseMembershipLock!: () => void;
      let announceMembershipLock!: () => void;
      const membershipLockAcquired = new Promise<void>((resolve) => {
        announceMembershipLock = resolve;
      });
      const holdMembershipLock = new Promise<void>((resolve) => {
        releaseMembershipLock = resolve;
      });
      const blocker = db.transaction(async (tx) => {
        await tx
          .select({ id: groupMembers.id })
          .from(groupMembers)
          .where(
            and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, secondMemberId)),
          )
          .for("update");
        announceMembershipLock();
        await holdMembershipLock;
      });

      await membershipLockAcquired;
      const membershipRemoval = removeGroupMember(
        { groupId: group.id, userId: secondMemberId },
        actorId,
        correlation("deadlock-global-remove"),
      );
      await new Promise((resolve) => setTimeout(resolve, 75));
      const grantCreation = addGlobalPermissionGrant(
        { permission: "browse_users", principal: { type: "group", groupId: group.id } },
        actorId,
        correlation("deadlock-global-grant"),
      );
      await new Promise((resolve) => setTimeout(resolve, 75));
      releaseMembershipLock();

      const outcomes = await withTimeout(
        Promise.allSettled([membershipRemoval, grantCreation]),
      );
      await blocker;
      expect(outcomes).toEqual([
        expect.objectContaining({ status: "fulfilled" }),
        expect.objectContaining({ status: "fulfilled" }),
      ]);
    },
    10_000,
  );

  it(
    "avoids a group-to-backlog deadlock during concurrent membership removal and role assignment",
    async () => {
      const group = await createGroup(
        { name: "Interleaving backlog Task 4" },
        actorId,
        correlation("deadlock-backlog-group"),
      );
      createdGroupIds.push(group.id);
      await addGroupMember(
        { groupId: group.id, userId: secondMemberId },
        actorId,
        correlation("deadlock-backlog-member"),
      );
      await db.insert(permissionGrants).values({
        scope: "backlog",
        permissionSchemeId: privateSchemeId,
        permissionKey: "manage_releases",
        principalType: "group",
        groupId: group.id,
      });
      const role = await createProjectRole(
        { name: "Interleaving role Task 4" },
        actorId,
        correlation("deadlock-backlog-role"),
      );
      createdRoleIds.push(role.id);

      let releaseMembershipLock!: () => void;
      let announceMembershipLock!: () => void;
      const membershipLockAcquired = new Promise<void>((resolve) => {
        announceMembershipLock = resolve;
      });
      const holdMembershipLock = new Promise<void>((resolve) => {
        releaseMembershipLock = resolve;
      });
      const blocker = db.transaction(async (tx) => {
        await tx
          .select({ id: groupMembers.id })
          .from(groupMembers)
          .where(
            and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, secondMemberId)),
          )
          .for("update");
        announceMembershipLock();
        await holdMembershipLock;
      });

      await membershipLockAcquired;
      const membershipRemoval = removeGroupMember(
        { groupId: group.id, userId: secondMemberId },
        actorId,
        correlation("deadlock-backlog-remove"),
      );
      await new Promise((resolve) => setTimeout(resolve, 75));
      const roleAssignment = assignBacklogRoleActor(
        {
          backlogId: backlogCId,
          projectRoleId: role.id,
          principal: { type: "group", groupId: group.id },
        },
        actorId,
        correlation("deadlock-backlog-assign"),
      );
      await new Promise((resolve) => setTimeout(resolve, 75));
      releaseMembershipLock();

      const outcomes = await withTimeout(
        Promise.allSettled([membershipRemoval, roleAssignment]),
      );
      await blocker;
      expect(outcomes).toEqual([
        expect.objectContaining({ status: "fulfilled" }),
        expect.objectContaining({ status: "fulfilled" }),
      ]);
    },
    10_000,
  );
});
