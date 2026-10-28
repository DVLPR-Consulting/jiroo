import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listAssignableUsersForBacklog, listBacklogTeam, listBacklogTeams } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogRoleActors, groupMembers, permissionGrants, projectRoles, userGroups } from "@/lib/db/schema/domain";
import { createReadVisibilityFixture, deleteReadVisibilityFixture, type ReadVisibilityFixture } from "@/lib/services/read-visibility.integration-fixture";

vi.mock("server-only", () => ({}));
const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("backlog teams by attachment (JIR-124 B4)", () => {
  let f: ReadVisibilityFixture;
  let groups: string[];
  let roles: string[];
  beforeEach(async () => {
    f = await createReadVisibilityFixture("Team");
    groups = []; roles = [];
    await db.insert(permissionGrants).values({ scope: "backlog", permissionSchemeId: f.schemeIds[0]!, permissionKey: "assignable_user", principalType: "user", userId: f.actorA });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await deleteReadVisibilityFixture(f);
    if (groups.length) {
      await db.delete(permissionGrants).where(inArray(permissionGrants.groupId, groups));
      await db.delete(userGroups).where(inArray(userGroups.id, groups));
    }
    if (roles.length) await db.delete(projectRoles).where(inArray(projectRoles.id, roles));
  });
  const grant = (permissionKey: string) => ({ scope: "backlog" as const, permissionSchemeId: f.schemeIds[0]!, permissionKey });
  async function group() {
    const [row] = await db.insert(userGroups).values({ key: `team-${randomUUID()}`, name: "Équipe nommée" }).returning();
    groups.push(row!.id); return row!.id;
  }
  async function role() {
    const [row] = await db.insert(projectRoles).values({ key: `members-${randomUUID()}`, name: "Membres" }).returning();
    roles.push(row!.id);
    await db.insert(permissionGrants).values(["browse_backlog", "assignable_user"].map((permissionKey) => ({ ...grant(permissionKey), principalType: "project_role" as const, projectRoleId: row!.id })));
    return row!.id;
  }

  it("excludes unrelated role, direct-grant and group-grant global administrators without changing assignment", async () => {
    const adminGroup = await group();
    await db.insert(groupMembers).values({ groupId: adminGroup, userId: f.actorB });
    await db.insert(permissionGrants).values({ scope: "global", permissionKey: "administer_jiroo", principalType: "group", groupId: adminGroup });
    expect(await listBacklogTeam(f.backlogA.id)).toEqual([{ id: f.actorA, name: "Team A" }]);
    expect((await listAssignableUsersForBacklog(f.backlogA.id)).map((person) => person.id)).toEqual(expect.arrayContaining([f.admin, f.platformAdmin, f.actorB]));
  });

  it("includes a global administrator attached through the backlog's Members role", async () => {
    const roleId = await role();
    await db.insert(backlogRoleActors).values({ backlogId: f.backlogA.id, projectRoleId: roleId, actorType: "user", userId: f.admin });
    expect((await listBacklogTeam(f.backlogA.id)).map((person) => person.id).sort()).toEqual([f.actorA, f.admin].sort());
  });

  it("resolves named groups and groups attached through a backlog role", async () => {
    const named = await group();
    await db.insert(groupMembers).values({ groupId: named, userId: f.actorB });
    await db.insert(permissionGrants).values(["browse_backlog", "assignable_user"].map((permissionKey) => ({ ...grant(permissionKey), principalType: "group" as const, groupId: named })));
    const roleGroup = await group();
    await db.insert(groupMembers).values({ groupId: roleGroup, userId: f.platformAdmin });
    await db.insert(backlogRoleActors).values({ backlogId: f.backlogA.id, projectRoleId: await role(), actorType: "group", groupId: roleGroup });
    expect((await listBacklogTeam(f.backlogA.id)).map((person) => person.id).sort()).toEqual([f.actorA, f.actorB, f.platformAdmin].sort());
  });

  it("requires both browse and assignable attachment instead of using administrator bypass for one half", async () => {
    await db.insert(permissionGrants).values([
      { ...grant("assignable_user"), principalType: "user", userId: f.admin },
      { ...grant("browse_backlog"), principalType: "user", userId: f.platformAdmin },
    ]);
    expect(await listBacklogTeam(f.backlogA.id)).toEqual([{ id: f.actorA, name: "Team A" }]);
  });

  it("honors a scheme attaching all authenticated users, including global administrators", async () => {
    await db.insert(permissionGrants).values(["browse_backlog", "assignable_user"].map((permissionKey) => ({ ...grant(permissionKey), principalType: "authenticated_user" as const })));
    const everyone = await db.select({ id: user.id }).from(user);
    expect((await listBacklogTeam(f.backlogA.id)).map((person) => person.id).sort()).toEqual(everyone.map((person) => person.id).sort());
  });

  it("falls back to the unchanged assignable directory only for backlogs without an attached team", async () => {
    const legacy = await listAssignableUsersForBacklog(f.backlogB.id);
    expect(legacy.map((person) => person.id)).toEqual(expect.arrayContaining([f.admin, f.platformAdmin]));
    expect(await listBacklogTeam(f.backlogB.id)).toEqual(legacy);
    expect(await listBacklogTeam(f.backlogA.id)).toEqual([{ id: f.actorA, name: "Team A" }]);
  });

  it("keeps grouped and single results in parity and bounds fallback to one extra query", async () => {
    const missing = randomUUID();
    const spy = vi.spyOn(Client.prototype, "query");
    const grouped = await listBacklogTeams([f.backlogA.id, f.backlogB.id, f.backlogA.id, missing]);
    expect(spy).toHaveBeenCalledTimes(2); spy.mockRestore();
    for (const id of [f.backlogA.id, f.backlogB.id, missing]) {
      expect(grouped.filter((person) => person.backlogId === id).map(({ id, name }) => ({ id, name }))).toEqual(await listBacklogTeam(id));
    }
    expect(grouped.filter((person) => person.backlogId === f.backlogA.id)).toEqual([{ backlogId: f.backlogA.id, id: f.actorA, name: "Team A" }]);
    const one = vi.spyOn(Client.prototype, "query");
    await listBacklogTeams([f.backlogA.id]); expect(one).toHaveBeenCalledTimes(1); one.mockRestore();
    const empty = vi.spyOn(Client.prototype, "query");
    expect(await listBacklogTeams([])).toEqual([]); expect(empty).not.toHaveBeenCalled(); empty.mockRestore();
    expect(await db.transaction((tx) => listBacklogTeams([f.backlogA.id], tx))).toEqual([{ backlogId: f.backlogA.id, id: f.actorA, name: "Team A" }]);
  });
});
