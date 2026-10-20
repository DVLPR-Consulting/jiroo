import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, databasePool } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogs, comments, itemFixVersions, itemLinks, items, notifications, permissionGrants, releasePublications, releases, sprintItems, sprints, statuses } from "@/lib/db/schema/domain";
import { createBacklog, getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { createItem } from "@/lib/services/items";
import { addComment } from "@/lib/services/comments";
import { platformAdministratorIds } from "@/lib/services/authorization-admin";
import { blockedItemIds, listLinksForItem } from "@/lib/services/links";
import { assertDemoSeedAllowed, seedDemoLePoint, type DemoSeedResult } from "./seed-demo-le-point";

vi.mock("server-only", () => ({}));

// This suite owns a whole disposable database, not a developer's DEMO namespace.
const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" && process.env.JIROO_ALLOW_DEMO_SEED === "1" ? describe : describe.skip;
let seeded: DemoSeedResult;
let foreign: { id: string };
let foreignItem: { id: string };
let globalBefore: typeof permissionGrants.$inferSelect[];

describeDb("Le point demo seed on a disposable database", () => {
  beforeAll(async () => {
    assertDemoSeedAllowed(process.env);
    if (new URL(process.env.DATABASE_URL!).port !== "5434") throw new Error("Use the disposable local Jiroo instance on port 5434 for this suite.");
    const name = await db.execute<{ name: string }>(sql`select current_database() as name`);
    if (!/^jir107_seed_[a-f0-9]+$/.test(name.rows[0]!.name)) throw new Error("Use a fresh disposable jir107_seed_<hex> database for this suite.");
    expect(await db.select().from(backlogs).where(inArray(backlogs.key, ["DEMO", "DEMOX"]))).toHaveLength(0);
    // Simulate a populated global sequence inside this owned disposable DB.
    await db.execute(sql`select setval('item_key_seq', 50000)`);
    const administrators = await db.transaction(platformAdministratorIds);
    const actorId = [...administrators][0];
    if (!actorId) throw new Error("Bootstrap an administrator in the disposable database first.");
    foreign = await createBacklog({ key: "KEEP", name: "Unrelated fixture", color: "#64748b" }, actorId);
    foreignItem = await createItem({ backlogId: foreign.id, type: "composant", title: "Preserve this item" }, actorId);
    globalBefore = await db.select().from(permissionGrants).where(eq(permissionGrants.scope, "global")).orderBy(permissionGrants.id);
  });
  afterAll(async () => { vi.unstubAllEnvs(); await databasePool.end(); });

  it("reproduces ownership, live and completed blockers, objectives, delivery and mentions", async () => {
    seeded = await seedDemoLePoint();
    expect(Object.keys(seeded.people).sort()).toEqual(["camille", "hugo", "ines", "lea"]);
    const people = await db.select({ id: user.id, role: user.role, email: user.email }).from(user).where(inArray(user.id, Object.values(seeded.people).map((p) => p.id)));
    expect(people.map((p) => p.role)).toEqual(["contributor", "contributor", "contributor", "contributor"]);
    expect(people.every((p) => p.email.endsWith("@demo.jiroo.local"))).toBe(true);
    expect(Object.values(seeded.people).every((p) => p.password.length >= 24)).toBe(true);
    for (const person of people) {
      expect(await getBacklogByKeyForUser("DEMO", person.id)).not.toBeNull();
      expect(await getBacklogByKeyForUser("DEMOX", person.id)).toBeNull();
    }
    const task15 = seeded.items["DEMO-15"]!;
    const blocker9 = seeded.items["DEMO-9"]!;
    const [link] = await listLinksForItem(task15.id);
    expect(link?.sourceId).toBe(blocker9.id);
    expect(link?.other.key).toBe(blocker9.key);
    const [blocker] = await db.select().from(items).where(eq(items.id, blocker9.id));
    expect(blocker?.assigneeId).toBe(seeded.people.hugo!.id);
    const blocked = await blockedItemIds(seeded.backlogId);
    expect(blocked).toContain(task15.id);
    expect(blocked).not.toContain(seeded.items["DEMO-18"]!.id);
    const tasks = await db.select({ parentId: items.parentId, category: statuses.category }).from(items).innerJoin(statuses, eq(statuses.id, items.statusId)).where(and(eq(items.backlogId, seeded.backlogId), eq(items.type, "tache")));
    expect(tasks).toHaveLength(19);
    expect(["DEMO-2", "DEMO-3", "DEMO-5"].map((key) => tasks.filter((t) => t.parentId === seeded.items[key]!.id).length)).toEqual([9, 4, 3]);
    expect(tasks.filter((t) => t.category === "done")).toHaveLength(9);
    const rows = await db.select().from(releases).where(eq(releases.backlogId, seeded.backlogId));
    expect(rows.find((r) => r.name === "1.2")?.effectiveReleaseDate).toBe("2026-10-20");
    expect(rows.find((r) => r.name === "1.3")?.releasedAt).toBeNull();
    expect(await db.select().from(releasePublications).where(eq(releasePublications.backlogId, seeded.backlogId))).toHaveLength(1);
    expect(await db.select().from(itemFixVersions).where(eq(itemFixVersions.itemId, seeded.items["DEMO-18"]!.id))).toHaveLength(1);
    const [sprint] = await db.select().from(sprints).where(eq(sprints.backlogId, seeded.backlogId));
    expect(sprint?.name).toBe("Sprint 8"); expect(sprint?.state).toBe("active");
    expect(sprint?.plannedStartAt?.toISOString().slice(0, 10)).toBe("2026-10-27");
    expect(await db.select().from(sprintItems).where(and(eq(sprintItems.sprintId, sprint!.id), isNull(sprintItems.leftAt)))).toHaveLength(19);
    const [mention] = await db.select().from(comments).where(eq(comments.itemId, seeded.items["DEMO-31"]!.id));
    expect(mention?.authorId).toBe(seeded.people.hugo!.id);
    expect(mention?.mentions).toEqual([seeded.people.ines!.id]);
    expect(mention?.body).toContain(task15.key);
    expect(await db.select().from(notifications).where(eq(notifications.commentId, mention!.id))).toHaveLength(1);
    const hiddenLinks = await db.select().from(itemLinks).where(eq(itemLinks.targetId, seeded.items["DEMO-33"]!.id));
    expect(hiddenLinks).toHaveLength(1);
    const [hidden] = await db.select().from(items).where(eq(items.id, hiddenLinks[0]!.sourceId));
    expect(hidden?.backlogId).toBe(seeded.hiddenBacklogId);
    expect(await db.select().from(activities).where(and(eq(activities.itemId, seeded.items["DEMO-33"]!.id), eq(activities.field, "links")))).toHaveLength(1);
    expect(Object.values(seeded.items).every((item) => Number(item.key.split("-")[1]) > 50000)).toBe(true);
  });

  it("refuses an existing namespace without reset and changes nothing", async () => {
    await expect(seedDemoLePoint()).rejects.toThrow(/--reset/);
    expect(await db.select().from(backlogs).where(eq(backlogs.id, seeded.backlogId))).toHaveLength(1);
  });

  it("checks opt-in before reset can delete any data", async () => {
    vi.stubEnv("JIROO_ALLOW_DEMO_SEED", "0");
    try { await expect(seedDemoLePoint({ reset: true })).rejects.toThrow(/JIROO_ALLOW_DEMO_SEED/); }
    finally { vi.unstubAllEnvs(); }
    expect(await db.select().from(backlogs).where(eq(backlogs.id, seeded.backlogId))).toHaveLength(1);
  });

  it("resets only demo data, preserves unrelated records and grants, and never rewinds keys", async () => {
    const previous = seeded;
    seeded = await seedDemoLePoint({ reset: true });
    expect(seeded.backlogId).not.toBe(previous.backlogId);
    expect(await db.select().from(user).where(inArray(user.id, Object.values(previous.people).map((p) => p.id)))).toHaveLength(0);
    expect(await db.select().from(backlogs).where(eq(backlogs.id, foreign.id))).toHaveLength(1);
    expect(await db.select().from(items).where(eq(items.id, foreignItem.id))).toHaveLength(1);
    expect(await db.select().from(permissionGrants).where(eq(permissionGrants.scope, "global")).orderBy(permissionGrants.id)).toEqual(globalBefore);
    expect(Number(seeded.items["DEMO-15"]!.key.split("-")[1])).toBeGreaterThan(Number(previous.items["DEMO-15"]!.key.split("-")[1]));
    const role = await db.execute<{ session_replication_role: string }>(sql`show session_replication_role`);
    expect(role.rows[0]?.session_replication_role).toBe("origin");
  });

  it("rolls reset back when a demo user has a restrictive reference in another backlog", async () => {
    const comment = await addComment({ itemId: foreignItem.id, body: "Preserve this outside reference" }, seeded.people.hugo!.id);
    await expect(seedDemoLePoint({ reset: true })).rejects.toMatchObject({ cause: { code: "23503" } });
    expect(await db.select().from(backlogs).where(eq(backlogs.id, seeded.backlogId))).toHaveLength(1);
    expect(await db.select().from(comments).where(eq(comments.id, comment.id))).toHaveLength(1);
    expect(await db.select().from(user).where(eq(user.id, seeded.people.hugo!.id))).toHaveLength(1);
  });
});
