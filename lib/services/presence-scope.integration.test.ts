import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogPermissionConfigs, backlogs, permissionGrants } from "@/lib/db/schema/domain";
import { checkPermission, listAssignableUsersForBacklog, listAssignableUsersForBacklogs } from "@/lib/auth/authorization";
import { listAccessibleBacklogs } from "@/lib/auth/accessible-backlogs";
import { createReadVisibilityFixture, deleteReadVisibilityFixture, type ReadVisibilityFixture } from "@/lib/services/read-visibility.integration-fixture";
import { loadPresenceScope } from "@/lib/services/presence-page";

vi.mock("server-only", () => ({}));
const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("presence scope and observed profiles", () => {
  let f: ReadVisibilityFixture;
  let extraBacklogs: string[];
  beforeEach(async () => { f = await createReadVisibilityFixture("Presence scope"); extraBacklogs = []; });
  afterEach(async () => {
    vi.restoreAllMocks(); vi.useRealTimers();
    if (extraBacklogs.length) await db.delete(backlogs).where(inArray(backlogs.id, extraBacklogs));
    await deleteReadVisibilityFixture(f);
  });
  const own = (rows: Awaited<ReturnType<typeof loadPresenceScope>>) => rows.filter((row) => row.id === f.backlogA.id || row.id === f.backlogB.id);

  it("matches sidebar access and checkPermission for granted/denied cases, excluding archives", async () => {
    const scope = await loadPresenceScope(f.actorA);
    const sidebar = await listAccessibleBacklogs(f.actorA);
    expect(scope.map((row) => row.id)).toEqual(sidebar.map((row) => row.id));
    for (const backlogId of [f.backlogA.id, f.backlogB.id]) {
      const access = await checkPermission({ actorId: f.actorA, permission: "browse_backlog", scope: { type: "backlog", backlogId } });
      expect(scope.some((row) => row.id === backlogId)).toBe(access.allowed);
    }
    expect(own(scope).map(({ id, key, name, color }) => ({ id, key, name, color }))).toEqual([{ id: f.backlogA.id, key: f.backlogA.key, name: f.backlogA.name, color: f.backlogA.color }]);
    await db.update(backlogs).set({ archivedAt: new Date() }).where(eq(backlogs.id, f.backlogA.id));
    expect(own(await loadPresenceScope(f.actorA))).toEqual([]);
    expect(await loadPresenceScope("missing-reader")).toEqual([]);
  });

  it("keeps the grouped directory in parity with the single source, including administrator bypass", async () => {
    await db.insert(permissionGrants).values({ scope: "backlog", permissionSchemeId: f.schemeIds[0]!, permissionKey: "assignable_user", principalType: "user", userId: f.actorA });
    const grouped = await listAssignableUsersForBacklogs([f.backlogA.id, f.backlogB.id, f.backlogA.id, randomUUID()]);
    for (const id of [f.backlogA.id, f.backlogB.id]) {
      expect(grouped.filter((row) => row.backlogId === id).map(({ id, name }) => ({ id, name }))).toEqual(await listAssignableUsersForBacklog(id));
      expect(grouped.filter((row) => row.backlogId === id).map((row) => row.id)).toEqual(expect.arrayContaining([f.admin, f.platformAdmin]));
    }
    const a = own(await loadPresenceScope(f.actorA))[0]!;
    expect(a.members).toContainEqual({ id: f.actorA, name: "Presence scope A", profile: "developer" });
    expect(a.members.some((person) => person.id === f.actorB)).toBe(false);
  });

  it("returns only the actor without browse_users, even when not assignable", async () => {
    const grants = await db.delete(permissionGrants).where(and(eq(permissionGrants.scope, "global"), eq(permissionGrants.permissionKey, "browse_users"), eq(permissionGrants.principalType, "authenticated_user"))).returning();
    try {
      expect((await checkPermission({ actorId: f.actorA, permission: "browse_users", scope: { type: "global" } })).allowed).toBe(false);
      expect(own(await loadPresenceScope(f.actorA))[0]!.members).toEqual([{ id: f.actorA, name: "Presence scope A", profile: "developer" }]);
    } finally { if (grants.length) await db.insert(permissionGrants).values(grants); }
  });

  it("infers profiles from current or recent assignments, both ends, never from hidden, old or future history", async () => {
    const read = async () => own(await loadPresenceScope(f.actorA))[0]!.members;
    expect((await read()).find((person) => person.id === f.admin)!.profile).toBe("product");
    await db.insert(activities).values([
      { itemId: f.liveB.id, actorId: f.admin, action: "update", field: "assignee", newValue: f.admin, at: new Date() },
      { itemId: f.liveA.id, actorId: f.admin, action: "update", field: "assignee", newValue: f.admin, at: new Date(Date.now() - 400 * 86_400_000) },
      { itemId: f.liveA.id, actorId: f.admin, action: "update", field: "assignee", newValue: f.admin, at: new Date(Date.now() + 2 * 86_400_000) },
    ]);
    expect((await read()).find((person) => person.id === f.admin)!.profile).toBe("product");
    await db.insert(activities).values({ itemId: f.liveA.id, actorId: f.actorA, action: "update", field: "assignee", oldValue: f.admin, newValue: f.platformAdmin, at: new Date(Date.now() - 30 * 86_400_000) });
    const members = await read();
    expect(members.find((person) => person.id === f.admin)!.profile).toBe("developer");
    expect(members.find((person) => person.id === f.platformAdmin)!.profile).toBe("developer");
    // A profile is not the account's permission role or the activity author's identity.
    const id = `product-${randomUUID()}`;
    await db.insert(user).values({ id, name: "Produit sans ticket", email: `${id}@example.test`, role: "contributor" }); f.userIds.push(id);
    await db.insert(permissionGrants).values(["browse_backlog", "assignable_user"].map((permissionKey) => ({ scope: "backlog" as const, permissionSchemeId: f.schemeIds[0]!, permissionKey, principalType: "user" as const, userId: id })));
    expect((await read()).find((person) => person.id === id)!.profile).toBe("product");
  });

  it("uses twelve calendar months inclusively across a leap day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-02-29T12:00:00Z"));
    await db.insert(activities).values({ itemId: f.liveA.id, actorId: f.actorA, action: "update", field: "assignee", newValue: f.admin, at: new Date("2023-02-28T11:59:59.999Z") });
    expect(own(await loadPresenceScope(f.actorA))[0]!.members.find((person) => person.id === f.admin)!.profile).toBe("product");
    await db.insert(activities).values({ itemId: f.liveA.id, actorId: f.actorA, action: "update", field: "assignee", newValue: f.admin, at: new Date("2023-02-28T12:00:00Z") });
    expect(own(await loadPresenceScope(f.actorA))[0]!.members.find((person) => person.id === f.admin)!.profile).toBe("developer");
  });

  it("uses a fixed number of queries for one or many visible backlogs", async () => {
    const spy = vi.spyOn(Client.prototype, "query");
    await loadPresenceScope(f.actorA); const small = spy.mock.calls.length; expect(small).toBe(9); spy.mockRestore();
    const added = await db.insert(backlogs).values(Array.from({ length: 12 }, (_, index) => ({ key: `PS${randomUUID().replaceAll("-", "").slice(0, 12).replace(/\d/g, "A").toUpperCase()}`, name: `Scope ${index}` }))).returning();
    extraBacklogs = added.map((row) => row.id);
    await db.insert(backlogPermissionConfigs).values(extraBacklogs.map((backlogId) => ({ backlogId, permissionSchemeId: f.schemeIds[0]! })));
    const largeSpy = vi.spyOn(Client.prototype, "query");
    const result = await loadPresenceScope(f.actorA);
    expect(largeSpy.mock.calls.length).toBe(small); largeSpy.mockRestore();
    expect(result.filter((row) => extraBacklogs.includes(row.id))).toHaveLength(12);
  });
});
