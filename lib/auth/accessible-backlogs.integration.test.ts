import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  listAccessibleBacklogIds,
  listAccessibleBacklogs,
} from "@/lib/auth/accessible-backlogs";
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

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureId = randomUUID();
const slug = fixtureId.replaceAll("-", "");
const actorIds = {
  direct: `access-direct-${fixtureId}`,
  group: `access-group-${fixtureId}`,
  role: `access-role-${fixtureId}`,
  roleGroup: `access-role-group-${fixtureId}`,
  noAccess: `access-none-${fixtureId}`,
  admin: `access-admin-${fixtureId}`,
} as const;

type BacklogFixture = { id: string; key: string; name: string };
let fixtures: Record<
  "direct" | "group" | "role" | "authenticated" | "forbidden" | "archived",
  BacklogFixture
>;
let schemeIds: string[] = [];
let groupIds: string[] = [];
let roleId = "";

function ownFixtureIds(ids: string[]): string[] {
  const fixtureIdSet = new Set(Object.values(fixtures).map((backlog) => backlog.id));
  return ids.filter((id) => fixtureIdSet.has(id));
}

describeDb("browse-filtered backlog SQL reads", () => {
  beforeAll(async () => {
    await db.insert(user).values(
      Object.entries(actorIds).map(([kind, id]) => ({
        id,
        name: `Access ${kind}`,
        email: `${id}@example.test`,
        emailVerified: true,
        role: kind === "admin" ? "admin" : "contributor",
      })),
    );

    const created = await db
      .insert(backlogs)
      .values([
        { key: `D${slug.slice(0, 5)}`.toUpperCase(), name: "01 Direct" },
        { key: `G${slug.slice(5, 10)}`.toUpperCase(), name: "02 Groupe" },
        { key: `R${slug.slice(10, 15)}`.toUpperCase(), name: "03 Rôle" },
        { key: `T${slug.slice(15, 20)}`.toUpperCase(), name: "04 Authentifiés" },
        { key: `F${slug.slice(20, 25)}`.toUpperCase(), name: "05 Interdit" },
        {
          key: `X${slug.slice(25, 30)}`.toUpperCase(),
          name: "06 Archivé",
          archivedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ])
      .returning({ id: backlogs.id, key: backlogs.key, name: backlogs.name });
    fixtures = {
      direct: created[0]!,
      group: created[1]!,
      role: created[2]!,
      authenticated: created[3]!,
      forbidden: created[4]!,
      archived: created[5]!,
    };

    const schemes = await db
      .insert(permissionSchemes)
      .values(
        Object.keys(fixtures).map((kind) => ({
          key: `access-${kind}-${fixtureId}`,
          name: `Schéma ${kind}`,
        })),
      )
      .returning({ id: permissionSchemes.id });
    schemeIds = schemes.map((scheme) => scheme.id);

    await db.insert(backlogPermissionConfigs).values(
      Object.values(fixtures).map((backlog, index) => ({
        backlogId: backlog.id,
        permissionSchemeId: schemeIds[index]!,
      })),
    );

    const groups = await db
      .insert(userGroups)
      .values([
        { key: `access-direct-group-${fixtureId}`, name: "Équipe navigation" },
        { key: `access-role-group-${fixtureId}`, name: "Équipe rôle" },
      ])
      .returning({ id: userGroups.id });
    groupIds = groups.map((group) => group.id);
    await db.insert(groupMembers).values([
      { groupId: groupIds[0]!, userId: actorIds.group },
      { groupId: groupIds[1]!, userId: actorIds.roleGroup },
    ]);

    const [role] = await db
      .insert(projectRoles)
      .values({ key: `access-role-${fixtureId}`, name: "Explorateur projet" })
      .returning({ id: projectRoles.id });
    roleId = role!.id;
    await db.insert(backlogRoleActors).values([
      {
        backlogId: fixtures.role.id,
        projectRoleId: roleId,
        actorType: "user",
        userId: actorIds.role,
      },
      {
        backlogId: fixtures.role.id,
        projectRoleId: roleId,
        actorType: "group",
        groupId: groupIds[1]!,
      },
    ]);

    await db.insert(permissionGrants).values([
      {
        scope: "backlog",
        permissionSchemeId: schemeIds[0]!,
        permissionKey: "browse_backlog",
        principalType: "user",
        userId: actorIds.direct,
      },
      {
        scope: "backlog",
        permissionSchemeId: schemeIds[1]!,
        permissionKey: "browse_backlog",
        principalType: "group",
        groupId: groupIds[0]!,
      },
      {
        scope: "backlog",
        permissionSchemeId: schemeIds[2]!,
        permissionKey: "browse_backlog",
        principalType: "project_role",
        projectRoleId: roleId,
      },
      {
        scope: "backlog",
        permissionSchemeId: schemeIds[3]!,
        permissionKey: "browse_backlog",
        principalType: "authenticated_user",
      },
      {
        scope: "backlog",
        permissionSchemeId: schemeIds[5]!,
        permissionKey: "browse_backlog",
        principalType: "user",
        userId: actorIds.direct,
      },
    ]);
  });

  afterAll(async () => {
    if (fixtures) {
      await db.delete(backlogs).where(inArray(backlogs.id, Object.values(fixtures).map((b) => b.id)));
    }
    if (schemeIds.length > 0) {
      await db.delete(permissionSchemes).where(inArray(permissionSchemes.id, schemeIds));
    }
    if (groupIds.length > 0) {
      await db.delete(userGroups).where(inArray(userGroups.id, groupIds));
    }
    if (roleId) await db.delete(projectRoles).where(eq(projectRoles.id, roleId));
    await db.delete(user).where(inArray(user.id, Object.values(actorIds)));
  });

  it("filters IDs through direct, group, role, and authenticated-user browse branches", async () => {
    expect(ownFixtureIds(await listAccessibleBacklogIds(actorIds.direct))).toEqual(
      [fixtures.direct.id, fixtures.authenticated.id, fixtures.archived.id].sort(),
    );
    expect(ownFixtureIds(await listAccessibleBacklogIds(actorIds.group))).toEqual(
      [fixtures.group.id, fixtures.authenticated.id].sort(),
    );
    expect(ownFixtureIds(await listAccessibleBacklogIds(actorIds.role))).toEqual(
      [fixtures.role.id, fixtures.authenticated.id].sort(),
    );
    expect(ownFixtureIds(await listAccessibleBacklogIds(actorIds.roleGroup))).toEqual(
      [fixtures.role.id, fixtures.authenticated.id].sort(),
    );
    expect(ownFixtureIds(await listAccessibleBacklogIds(actorIds.noAccess))).toEqual([
      fixtures.authenticated.id,
    ]);
    await expect(listAccessibleBacklogIds(`missing-${fixtureId}`)).resolves.toEqual([]);
  });

  it("applies the platform-administrator bypass inside the SQL filter", async () => {
    await expect(listAccessibleBacklogIds(actorIds.admin)).resolves.toEqual(
      expect.arrayContaining(Object.values(fixtures).map((backlog) => backlog.id)),
    );
  });

  it("returns only active, browseable, minimal backlog DTOs by default", async () => {
    const rows = await listAccessibleBacklogs(actorIds.direct);
    const fixtureIds = new Set(Object.values(fixtures).map((backlog) => backlog.id));
    const fixtureRows = rows.filter((row) => fixtureIds.has(row.id));

    expect(fixtureRows.map((row) => row.name)).toEqual(["01 Direct", "04 Authentifiés"]);
    expect(Object.keys(fixtureRows[0]!).sort()).toEqual([
      "archivedAt",
      "color",
      "id",
      "key",
      "name",
    ]);
    expect(rows.some((row) => row.id === fixtures.forbidden.id)).toBe(false);
  });

  it("includes an accessible archived backlog only when explicitly requested", async () => {
    const rows = await listAccessibleBacklogs(actorIds.direct, { includeArchived: true });
    const fixtureIds = new Set(Object.values(fixtures).map((backlog) => backlog.id));
    expect(rows.filter((row) => fixtureIds.has(row.id)).map((row) => row.name)).toEqual([
      "01 Direct",
      "04 Authentifiés",
      "06 Archivé",
    ]);
  });
});
