import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  backlogs,
  items,
  notifications,
  permissionGrants,
  permissionSchemes,
  statuses,
  views,
} from "@/lib/db/schema/domain";

export type ReadVisibilityFixture = Awaited<ReturnType<typeof createReadVisibilityFixture>>;

export async function createReadVisibilityFixture(label: string) {
  const fixtureId = randomUUID();
  const letters = randomUUID()
    .replaceAll("-", "")
    .replace(/\d/gu, (digit) => String.fromCharCode("G".charCodeAt(0) + Number(digit)))
    .toUpperCase();
  const actorA = `read-a-${fixtureId}`;
  const actorB = `read-b-${fixtureId}`;
  const admin = `read-admin-${fixtureId}`;
  const platformAdmin = `read-platform-admin-${fixtureId}`;

  await db.insert(user).values([
    {
      id: actorA,
      name: `${label} A`,
      email: `${actorA}@example.test`,
      emailVerified: true,
      role: "contributor",
    },
    {
      id: actorB,
      name: `${label} B`,
      email: `${actorB}@example.test`,
      emailVerified: true,
      role: "contributor",
    },
    {
      id: admin,
      name: `${label} Admin`,
      email: `${admin}@example.test`,
      emailVerified: true,
      role: "admin",
    },
    {
      id: platformAdmin,
      name: `${label} Administratrice effective`,
      email: `${platformAdmin}@example.test`,
      emailVerified: true,
      role: "contributor",
    },
  ]);

  const [backlogA, backlogB] = await db
    .insert(backlogs)
    .values([
      { key: `A${letters.slice(0, 5)}`, name: `${label} A` },
      { key: `B${letters.slice(5, 10)}`, name: `${label} B` },
    ])
    .returning();

  const [schemeA, schemeB] = await db
    .insert(permissionSchemes)
    .values([
      { key: `read-a-${fixtureId}`, name: `${label} A` },
      { key: `read-b-${fixtureId}`, name: `${label} B` },
    ])
    .returning();

  await db.insert(backlogPermissionConfigs).values([
    { backlogId: backlogA!.id, permissionSchemeId: schemeA!.id },
    { backlogId: backlogB!.id, permissionSchemeId: schemeB!.id },
  ]);
  await db.insert(permissionGrants).values([
    {
      scope: "global",
      permissionKey: "administer_jiroo",
      principalType: "user",
      userId: platformAdmin,
    },
    {
      scope: "backlog",
      permissionSchemeId: schemeA!.id,
      permissionKey: "browse_backlog",
      principalType: "user",
      userId: actorA,
    },
    {
      scope: "backlog",
      permissionSchemeId: schemeB!.id,
      permissionKey: "browse_backlog",
      principalType: "user",
      userId: actorB,
    },
  ]);

  const [statusA, statusB] = await db
    .insert(statuses)
    .values([
      {
        backlogId: backlogA!.id,
        name: "À faire",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      },
      {
        backlogId: backlogB!.id,
        name: "À faire",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      },
    ])
    .returning();

  const itemIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const suffix = Date.now();
  const [liveA, liveB, trashA, trashB] = await db
    .insert(items)
    .values([
      {
        id: itemIds[0]!,
        key: `${backlogA!.key}-${suffix}`,
        type: "tache",
        backlogId: backlogA!.id,
        title: `${label} visible`,
        statusId: statusA!.id,
        assigneeId: actorA,
        reporterId: actorA,
        rank: "a0",
        path: `root.${itemIds[0]!.replaceAll("-", "")}`,
      },
      {
        id: itemIds[1]!,
        key: `${backlogB!.key}-${suffix}`,
        type: "tache",
        backlogId: backlogB!.id,
        title: `${label} visible`,
        statusId: statusB!.id,
        assigneeId: actorA,
        reporterId: actorB,
        rank: "a0",
        path: `root.${itemIds[1]!.replaceAll("-", "")}`,
      },
      {
        id: itemIds[2]!,
        key: `${backlogA!.key}-${suffix + 1}`,
        type: "tache",
        backlogId: backlogA!.id,
        title: `${label} supprimé A`,
        statusId: statusA!.id,
        reporterId: actorA,
        rank: "a1",
        path: `root.${itemIds[2]!.replaceAll("-", "")}`,
        deletedAt: new Date(),
      },
      {
        id: itemIds[3]!,
        key: `${backlogB!.key}-${suffix + 1}`,
        type: "tache",
        backlogId: backlogB!.id,
        title: `${label} supprimé B`,
        statusId: statusB!.id,
        reporterId: actorB,
        rank: "a1",
        path: `root.${itemIds[3]!.replaceAll("-", "")}`,
        deletedAt: new Date(),
      },
    ])
    .returning();

  const [viewA, viewB] = await db
    .insert(views)
    .values([
      { name: `${label} vue A`, ownerId: actorB, shared: true, backlogId: backlogA!.id },
      { name: `${label} vue B`, ownerId: actorA, shared: true, backlogId: backlogB!.id },
    ])
    .returning();

  await db.insert(notifications).values([
    {
      userId: actorA,
      type: "assignment",
      itemId: liveA!.id,
      createdAt: new Date("2026-08-06T10:00:00.000Z"),
    },
    {
      userId: actorA,
      type: "assignment",
      itemId: liveB!.id,
      createdAt: new Date("2026-08-06T11:00:00.000Z"),
    },
    { userId: admin, type: "assignment", itemId: liveA!.id },
    { userId: admin, type: "assignment", itemId: liveB!.id },
    { userId: platformAdmin, type: "assignment", itemId: liveA!.id },
    { userId: platformAdmin, type: "assignment", itemId: liveB!.id },
  ]);

  return {
    actorA,
    actorB,
    admin,
    platformAdmin,
    backlogA: backlogA!,
    backlogB: backlogB!,
    liveA: liveA!,
    liveB: liveB!,
    trashA: trashA!,
    trashB: trashB!,
    viewA: viewA!,
    viewB: viewB!,
    schemeIds: [schemeA!.id, schemeB!.id],
    userIds: [actorA, actorB, admin, platformAdmin],
  };
}

export async function deleteReadVisibilityFixture(fixture: ReadVisibilityFixture) {
  await db
    .delete(backlogs)
    .where(inArray(backlogs.id, [fixture.backlogA.id, fixture.backlogB.id]));
  await db
    .delete(permissionSchemes)
    .where(inArray(permissionSchemes.id, fixture.schemeIds));
  await db.delete(user).where(inArray(user.id, fixture.userIds));
}
