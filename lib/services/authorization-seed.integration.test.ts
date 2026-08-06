import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  userGroups,
} from "@/lib/db/schema/domain";
import { seedAuthorizationDefaults } from "@/lib/services/authorization-seed";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

const fixtureId = randomUUID();
const adminId = `authorization-seed-admin-${fixtureId}`;
const unassignedId = `authorization-seed-unassigned-${fixtureId}`;
const backlogKeys = [
  `A${fixtureId.replaceAll("-", "").slice(0, 5)}`.toUpperCase(),
  `B${fixtureId.replaceAll("-", "").slice(0, 5)}`.toUpperCase(),
] as const;

let backlogIds: [string, string];
let clonedSchemeIds: string[] = [];

async function effectiveRoleKeys(userId: string, backlogId: string): Promise<string[]> {
  const rows = await db
    .select({ key: projectRoles.key })
    .from(backlogRoleActors)
    .innerJoin(projectRoles, eq(backlogRoleActors.projectRoleId, projectRoles.id))
    .where(
      and(
        eq(backlogRoleActors.backlogId, backlogId),
        eq(backlogRoleActors.actorType, "user"),
        eq(backlogRoleActors.userId, userId),
      ),
    )
    .orderBy(asc(projectRoles.key));

  return rows.map((row) => row.key);
}

async function countProtectedRoles(): Promise<number> {
  const rows = await db
    .select({ id: projectRoles.id })
    .from(projectRoles)
    .where(eq(projectRoles.protected, true));
  return rows.length;
}

async function countBacklogConfigs(): Promise<number> {
  const rows = await db
    .select({ backlogId: backlogPermissionConfigs.backlogId })
    .from(backlogPermissionConfigs)
    .where(inArray(backlogPermissionConfigs.backlogId, backlogIds));
  return rows.length;
}

describeDb("authorization schema and deterministic seed", () => {
  beforeAll(async () => {
    await db.insert(user).values([
      {
        id: adminId,
        name: "Administrateur seed",
        email: `${adminId}@example.test`,
        emailVerified: true,
        role: "admin",
      },
      {
        id: unassignedId,
        name: "Sans accès",
        email: `${unassignedId}@example.test`,
        emailVerified: true,
        role: "viewer",
      },
    ]);

    const createdBacklogs = await db
      .insert(backlogs)
      .values([
        { key: backlogKeys[0], name: "Permissions A" },
        { key: backlogKeys[1], name: "Permissions B" },
      ])
      .returning({ id: backlogs.id });
    backlogIds = [createdBacklogs[0]!.id, createdBacklogs[1]!.id];
  });

  afterAll(async () => {
    if (backlogIds) {
      const configs = await db
        .select({ permissionSchemeId: backlogPermissionConfigs.permissionSchemeId })
        .from(backlogPermissionConfigs)
        .where(inArray(backlogPermissionConfigs.backlogId, backlogIds));
      clonedSchemeIds = configs.map((config) => config.permissionSchemeId);

      await db.delete(backlogs).where(inArray(backlogs.id, backlogIds));
      if (clonedSchemeIds.length > 0) {
        await db.delete(permissionSchemes).where(inArray(permissionSchemes.id, clonedSchemeIds));
      }
    }
    await db.delete(user).where(inArray(user.id, [adminId, unassignedId]));
  });

  it("seeds protected defaults and backlog administrator occupancy idempotently", async () => {
    const input = {
      platformAdministratorIds: [adminId],
      backlogAdministrators: [
        { backlogId: backlogIds[0], userIds: [adminId] },
        { backlogId: backlogIds[1], userIds: [adminId] },
      ],
    };

    await seedAuthorizationDefaults(input);
    await seedAuthorizationDefaults(input);

    expect(await effectiveRoleKeys(adminId, backlogIds[0])).toEqual(["administrators"]);
    expect(await effectiveRoleKeys(adminId, backlogIds[1])).toEqual(["administrators"]);
    expect(await countProtectedRoles()).toBe(3);
    expect(await countBacklogConfigs()).toBe(2);
  });

  it("repairs the protected flag on reserved seed keys", async () => {
    await db
      .update(userGroups)
      .set({ protected: false })
      .where(eq(userGroups.key, "platform-administrators"));
    await db
      .update(projectRoles)
      .set({ protected: false })
      .where(inArray(projectRoles.key, ["administrators", "members", "viewers"]));
    await db
      .update(permissionSchemes)
      .set({ protected: false })
      .where(eq(permissionSchemes.key, "default-permission-scheme"));

    try {
      await seedAuthorizationDefaults({
        platformAdministratorIds: [adminId],
        backlogAdministrators: backlogIds.map((backlogId) => ({
          backlogId,
          userIds: [adminId],
        })),
      });

      const [group] = await db
        .select({ protected: userGroups.protected })
        .from(userGroups)
        .where(eq(userGroups.key, "platform-administrators"));
      const roles = await db
        .select({ protected: projectRoles.protected })
        .from(projectRoles)
        .where(inArray(projectRoles.key, ["administrators", "members", "viewers"]));
      const [scheme] = await db
        .select({ protected: permissionSchemes.protected })
        .from(permissionSchemes)
        .where(eq(permissionSchemes.key, "default-permission-scheme"));

      expect(group?.protected).toBe(true);
      expect(roles.map((role) => role.protected)).toEqual([true, true, true]);
      expect(scheme?.protected).toBe(true);
    } finally {
      await db
        .update(userGroups)
        .set({ protected: true })
        .where(eq(userGroups.key, "platform-administrators"));
      await db
        .update(projectRoles)
        .set({ protected: true })
        .where(inArray(projectRoles.key, ["administrators", "members", "viewers"]));
      await db
        .update(permissionSchemes)
        .set({ protected: true })
        .where(eq(permissionSchemes.key, "default-permission-scheme"));
    }
  });

  it("rejects duplicate group membership", async () => {
    const [group] = await db
      .select({ id: userGroups.id })
      .from(userGroups)
      .where(eq(userGroups.key, "platform-administrators"));
    if (!group) throw new Error("Le groupe protégé doit exister.");

    await db.insert(groupMembers).values({ groupId: group.id, userId: unassignedId });
    await expect(
      db.insert(groupMembers).values({ groupId: group.id, userId: unassignedId }),
    ).rejects.toBeTruthy();

    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, unassignedId)));
  });

  it("rejects a duplicate direct backlog grant", async () => {
    const [config] = await db
      .select({ schemeId: backlogPermissionConfigs.permissionSchemeId })
      .from(backlogPermissionConfigs)
      .where(eq(backlogPermissionConfigs.backlogId, backlogIds[0]));
    if (!config) throw new Error("Le schéma privé doit exister.");

    const grant = {
      scope: "backlog" as const,
      permissionSchemeId: config.schemeId,
      permissionKey: "browse_backlog",
      principalType: "user" as const,
      userId: unassignedId,
    };
    await db.insert(permissionGrants).values(grant);
    await expect(db.insert(permissionGrants).values(grant)).rejects.toBeTruthy();

    await db
      .delete(permissionGrants)
      .where(
        and(
          eq(permissionGrants.permissionSchemeId, config.schemeId),
          eq(permissionGrants.permissionKey, "browse_backlog"),
          eq(permissionGrants.userId, unassignedId),
        ),
      );
  });

  it("rejects an authenticated-user principal for a global grant", async () => {
    try {
      await expect(
        db.insert(permissionGrants).values({
          scope: "global",
          permissionKey: "administer_jiroo",
          principalType: "authenticated_user",
        }),
      ).rejects.toBeTruthy();
    } finally {
      await db
        .delete(permissionGrants)
        .where(
          and(
            eq(permissionGrants.scope, "global"),
            eq(permissionGrants.permissionKey, "administer_jiroo"),
            eq(permissionGrants.principalType, "authenticated_user"),
          ),
        );
    }
  });

  it("rejects a role actor with both a user and a group", async () => {
    const [role] = await db
      .select({ id: projectRoles.id })
      .from(projectRoles)
      .where(eq(projectRoles.key, "members"));
    const [group] = await db
      .select({ id: userGroups.id })
      .from(userGroups)
      .where(eq(userGroups.key, "platform-administrators"));
    if (!role || !group) throw new Error("Les valeurs protégées doivent exister.");

    await expect(
      db.insert(backlogRoleActors).values({
        backlogId: backlogIds[0],
        projectRoleId: role.id,
        actorType: "user",
        userId: unassignedId,
        groupId: group.id,
      }),
    ).rejects.toBeTruthy();
  });

  it("allows exactly one permission config for each backlog", async () => {
    const [defaultScheme] = await db
      .select({ id: permissionSchemes.id })
      .from(permissionSchemes)
      .where(eq(permissionSchemes.key, "default-permission-scheme"));
    if (!defaultScheme) throw new Error("Le schéma par défaut doit exister.");

    await expect(
      db.insert(backlogPermissionConfigs).values({
        backlogId: backlogIds[0],
        permissionSchemeId: defaultScheme.id,
        accessMode: "advanced",
      }),
    ).rejects.toBeTruthy();
  });

  it("does not infer backlog access for a newly created account", async () => {
    const roleActors = await db
      .select({ id: backlogRoleActors.id })
      .from(backlogRoleActors)
      .where(eq(backlogRoleActors.userId, unassignedId));
    const directBacklogGrants = await db
      .select({ id: permissionGrants.id })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.scope, "backlog"),
          eq(permissionGrants.principalType, "user"),
          eq(permissionGrants.userId, unassignedId),
        ),
      );

    expect(roleActors).toEqual([]);
    expect(directBacklogGrants).toEqual([]);
  });
});
