import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { checkPermission } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, backlogPermissionConfigs, backlogRoleActors, permissionGrants, permissionSchemes, projectRoles, userGroups } from "@/lib/db/schema/domain";
import { listGroups, listProjectRoles, listPermissionSchemeChoices } from "@/lib/services/authorization-admin";

vi.mock("server-only", () => ({}));
const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("administration metadata isolation", () => {
  it("conceals unreadable backlog references from group managers while preserving blockers and the platform bypass", async () => {
    const suffix = randomUUID();
    const manager = `disclosure-manager-${suffix}`, admin = `disclosure-admin-${suffix}`;
    await db.insert(user).values([manager, admin].map((id) => ({ id, name: id, email: `${id}@example.test`, role: "contributor" })));
    const [scheme] = await db.insert(permissionSchemes).values({ key: suffix, name: `Private scheme ${suffix}` }).returning();
    const [group] = await db.insert(userGroups).values({ key: suffix, name: `Isolation group ${suffix}` }).returning();
    const [role] = await db.insert(projectRoles).values({ key: suffix, name: `Isolation role ${suffix}` }).returning();
    const hidden = await db.insert(backlogs).values([1, 2].map((n) => ({ key: `SEC${suffix.replaceAll("-", "").slice(0, 6).toUpperCase()}${n}`, name: `Secret ${n} ${suffix}` }))).returning();
    await db.update(permissionSchemes).set({ key: `backlog-${hidden[0]!.id}-permission-scheme`, name: `Schéma privé ${hidden[0]!.id}` }).where(eq(permissionSchemes.id, scheme!.id));
    const secretSchemeName = `Schéma privé ${hidden[0]!.id}`;
    try {
      await db.insert(permissionGrants).values([
        { scope: "global", permissionKey: "manage_users_groups", principalType: "user", userId: manager },
        { scope: "global", permissionKey: "administer_jiroo", principalType: "user", userId: admin },
        { scope: "backlog", permissionSchemeId: scheme!.id, permissionKey: "browse_backlog", principalType: "project_role", projectRoleId: role!.id },
        { scope: "backlog", permissionSchemeId: scheme!.id, permissionKey: "edit_items", principalType: "group", groupId: group!.id },
      ]);
      await db.insert(backlogPermissionConfigs).values(hidden.map((b) => ({ backlogId: b.id, permissionSchemeId: scheme!.id, accessMode: "advanced" as const })));
      await db.insert(backlogRoleActors).values(hidden.map((b) => ({ backlogId: b.id, projectRoleId: role!.id, actorType: "group" as const, groupId: group!.id })));
      expect((await checkPermission({ actorId: manager, permission: "browse_backlog", scope: { type: "backlog", backlogId: hidden[0]!.id } })).allowed).toBe(false);
      const groups = await listGroups(manager);
      const roles = await listProjectRoles(manager);
      const groupDto = groups.find((g) => g.id === group!.id)!;
      const roleDto = roles.find((r) => r.id === role!.id)!;
      expect(groupDto.blockers).toHaveLength(2);
      expect(roleDto.blockers).toHaveLength(2);
      expect(roleDto.occupancyCount).toBe(0);
      for (const b of hidden) for (const value of [b.id, b.key, b.name, secretSchemeName]) {
        expect(JSON.stringify([groupDto, roleDto])).not.toContain(value);
      }
      expect(new Set(groupDto.blockers).size).toBe(groupDto.blockers.length);
      expect((await listPermissionSchemeChoices(manager)).map((s) => s.id)).not.toContain(scheme!.id);
      const adminChoices = await listPermissionSchemeChoices(admin);
      expect(adminChoices.find((s) => s.id === scheme!.id)).toMatchObject({ name: secretSchemeName, usageCount: 2 });
      await db.update(permissionSchemes).set({ key: suffix, name: "Shared catalog scheme" }).where(eq(permissionSchemes.id, scheme!.id));
      expect((await listPermissionSchemeChoices(manager)).find((s) => s.id === scheme!.id)).toMatchObject({ name: "Shared catalog scheme", usageCount: 0 });
      await db.update(permissionSchemes).set({ key: `backlog-${hidden[0]!.id}-permission-scheme`, name: secretSchemeName }).where(eq(permissionSchemes.id, scheme!.id));
      await db.insert(backlogRoleActors).values({ backlogId: hidden[0]!.id, projectRoleId: role!.id, actorType: "user", userId: manager });
      expect((await listPermissionSchemeChoices(manager)).find((s) => s.id === scheme!.id)).toMatchObject({ name: secretSchemeName, usageCount: 1 });
      const partlyVisible = (await listGroups(manager)).find((g) => g.id === group!.id)!;
      expect(JSON.stringify(partlyVisible)).toContain(hidden[0]!.name);
      expect(JSON.stringify(partlyVisible)).not.toContain(hidden[1]!.name);
      const visibleGroups = await listGroups(admin);
      const visibleRoles = await listProjectRoles(admin);
      for (const b of hidden) {
        expect(JSON.stringify(visibleGroups.find((g) => g.id === group!.id))).toContain(b.name);
        expect(JSON.stringify(visibleRoles.find((r) => r.id === role!.id))).toContain(b.name);
      }
    } finally {
      await db.delete(backlogs).where(inArray(backlogs.id, hidden.map((b) => b.id)));
      await db.delete(permissionSchemes).where(eq(permissionSchemes.id, scheme!.id));
      await db.delete(projectRoles).where(eq(projectRoles.id, role!.id));
      await db.delete(userGroups).where(eq(userGroups.id, group!.id));
      await db.delete(user).where(inArray(user.id, [manager, admin]));
    }
  });
});
