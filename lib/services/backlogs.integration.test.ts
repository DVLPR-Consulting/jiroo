import "dotenv/config";

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getBacklogCapabilities } from "@/lib/auth/accessible-backlogs";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  backlogPermissionConfigs,
  backlogRoleActors,
  backlogs,
  items,
  permissionGrants,
  permissionSchemes,
  projectRoles,
  statuses,
} from "@/lib/db/schema/domain";
import {
  createBacklog,
  getBacklogByKeyForUser,
  listBacklogsForUser,
  updateBacklog,
} from "@/lib/services/backlogs";
import { listItemsAssignedTo, listTrashedItems } from "@/lib/services/items";
import { listRecentNotifications, unreadCount } from "@/lib/services/notifications";
import {
  createReadVisibilityFixture,
  deleteReadVisibilityFixture,
} from "@/lib/services/read-visibility.integration-fixture";
import {
  getViewByIdForUser,
  listVisibleViews,
  listViews,
} from "@/lib/services/views";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(prefix: string): string {
  const letters = randomUUID().replace(/[^a-f]/gi, "").slice(0, 4).toUpperCase();
  return `${prefix}${letters}`.slice(0, 6);
}

async function createFixture(actorId: string) {
  const oldKey = randomBacklogKey("A");
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: oldKey, name: "Backlog test", color: "#7c3030" })
    .returning();
  const [status] = await db
    .insert(statuses)
    .values({
      backlogId: backlog!.id,
      name: "À faire",
      category: "todo",
      order: 0,
      color: "#9aa0a6",
    })
    .returning();

  const firstId = randomUUID();
  const secondId = randomUUID();
  const suffix = Date.now();
  await db.insert(items).values([
    {
      id: firstId,
      key: `${oldKey}-${suffix}`,
      type: "composant",
      backlogId: backlog!.id,
      title: "Actif",
      statusId: status!.id,
      reporterId: actorId,
      rank: "a0",
      path: `root.${firstId.replaceAll("-", "")}`,
      depth: 0,
    },
    {
      id: secondId,
      key: `${oldKey}-${suffix + 1}`,
      type: "composant",
      backlogId: backlog!.id,
      title: "Supprimé",
      statusId: status!.id,
      reporterId: actorId,
      rank: "a1",
      path: `root.${secondId.replaceAll("-", "")}`,
      depth: 0,
      deletedAt: new Date(),
    },
  ]);

  return { backlog: backlog!, oldKey, suffix };
}

describeDb("createBacklog authorization provisioning", () => {
  it("atomically gives a new backlog a private default clone and its creator the administrator role", async () => {
    const [creator] = await db.select({ id: user.id }).from(user).limit(1);
    if (!creator) throw new Error("Le seed doit contenir un créateur.");
    const backlog = await createBacklog(
      {
        key: randomBacklogKey("N"),
        name: "Nouveau backlog autorisé",
        color: "#475569",
      },
      creator.id,
    );
    let privateSchemeId = "";

    try {
      const [config] = await db
        .select({
          accessMode: backlogPermissionConfigs.accessMode,
          schemeId: permissionSchemes.id,
          schemeKey: permissionSchemes.key,
        })
        .from(backlogPermissionConfigs)
        .innerJoin(
          permissionSchemes,
          eq(backlogPermissionConfigs.permissionSchemeId, permissionSchemes.id),
        )
        .where(eq(backlogPermissionConfigs.backlogId, backlog.id));
      expect(config).toEqual({
        accessMode: "simple",
        schemeId: expect.any(String),
        schemeKey: `backlog-${backlog.id}-permission-scheme`,
      });
      privateSchemeId = config!.schemeId;

      const occupancy = await db
        .select({ roleKey: projectRoles.key, userId: backlogRoleActors.userId })
        .from(backlogRoleActors)
        .innerJoin(projectRoles, eq(backlogRoleActors.projectRoleId, projectRoles.id))
        .where(eq(backlogRoleActors.backlogId, backlog.id));
      expect(occupancy).toEqual([{ roleKey: "administrators", userId: creator.id }]);

      const [defaultScheme] = await db
        .select({ id: permissionSchemes.id })
        .from(permissionSchemes)
        .where(eq(permissionSchemes.key, "default-permission-scheme"));
      if (!defaultScheme) throw new Error("Le schéma par défaut doit exister.");
      const grantShape = {
        permissionKey: permissionGrants.permissionKey,
        principalType: permissionGrants.principalType,
        projectRoleId: permissionGrants.projectRoleId,
      };
      const defaultGrants = await db
        .select(grantShape)
        .from(permissionGrants)
        .where(eq(permissionGrants.permissionSchemeId, defaultScheme.id))
        .orderBy(asc(permissionGrants.permissionKey), asc(permissionGrants.projectRoleId));
      const clonedGrants = await db
        .select(grantShape)
        .from(permissionGrants)
        .where(eq(permissionGrants.permissionSchemeId, privateSchemeId))
        .orderBy(asc(permissionGrants.permissionKey), asc(permissionGrants.projectRoleId));
      expect(clonedGrants).toEqual(defaultGrants);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, backlog.id));
      if (privateSchemeId) {
        await db.delete(permissionSchemes).where(eq(permissionSchemes.id, privateSchemeId));
      }
    }
  });
});

describeDb("updateBacklog transaction", () => {
  it("renames live and deleted item keys and audits every item", async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    const fixture = await createFixture(actor.id);
    const newKey = randomBacklogKey("B");

    try {
      const result = await updateBacklog(
        {
          id: fixture.backlog.id,
          key: newKey,
          name: "Backlog renommé",
          color: "#2b6cb0",
        },
        actor.id,
      );

      expect(result).toMatchObject({
        previousKey: fixture.oldKey,
        backlog: { key: newKey, name: "Backlog renommé", color: "#2b6cb0" },
      });

      const renamed = await db
        .select({ key: items.key, deletedAt: items.deletedAt })
        .from(items)
        .where(eq(items.backlogId, fixture.backlog.id))
        .orderBy(asc(items.key));
      expect(renamed.map((row) => row.key)).toEqual([
        `${newKey}-${fixture.suffix}`,
        `${newKey}-${fixture.suffix + 1}`,
      ]);
      expect(renamed.some((row) => row.deletedAt !== null)).toBe(true);

      const audit = await db
        .select({ field: activities.field, oldValue: activities.oldValue, newValue: activities.newValue })
        .from(activities)
        .innerJoin(items, eq(activities.itemId, items.id))
        .where(eq(items.backlogId, fixture.backlog.id))
        .orderBy(asc(activities.oldValue));
      expect(audit).toEqual([
        { field: "key", oldValue: `${fixture.oldKey}-${fixture.suffix}`, newValue: `${newKey}-${fixture.suffix}` },
        { field: "key", oldValue: `${fixture.oldKey}-${fixture.suffix + 1}`, newValue: `${newKey}-${fixture.suffix + 1}` },
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlog.id));
    }
  });

  it("rolls back item keys and audit rows when the new backlog key collides", async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    const fixture = await createFixture(actor.id);
    const [conflict] = await db
      .insert(backlogs)
      .values({ key: randomBacklogKey("C"), name: "Conflit", color: "#475569" })
      .returning();

    try {
      await expect(
        updateBacklog(
          {
            id: fixture.backlog.id,
            key: conflict!.key,
            name: "Ne doit pas changer",
            color: "#2b6cb0",
          },
          actor.id,
        ),
      ).rejects.toBeTruthy();

      const [storedBacklog] = await db
        .select({ key: backlogs.key, name: backlogs.name })
        .from(backlogs)
        .where(eq(backlogs.id, fixture.backlog.id));
      expect(storedBacklog).toEqual({ key: fixture.oldKey, name: "Backlog test" });

      const storedItems = await db
        .select({ key: items.key })
        .from(items)
        .where(eq(items.backlogId, fixture.backlog.id))
        .orderBy(asc(items.key));
      expect(storedItems.map((row) => row.key)).toEqual([
        `${fixture.oldKey}-${fixture.suffix}`,
        `${fixture.oldKey}-${fixture.suffix + 1}`,
      ]);

      const audit = await db
        .select({ id: activities.id })
        .from(activities)
        .innerJoin(items, eq(activities.itemId, items.id))
        .where(eq(items.backlogId, fixture.backlog.id));
      expect(audit).toEqual([]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, fixture.backlog.id));
      await db.delete(backlogs).where(eq(backlogs.id, conflict!.id));
    }
  });
});

describeDb("browse-filtered product reads", () => {
  it("hides inaccessible backlogs, mine, trash, views, and notifications", async () => {
    const fixture = await createReadVisibilityFixture("Lectures produit");

    try {
      await expect(listBacklogsForUser(fixture.actorA)).resolves.toEqual([
        expect.objectContaining({ id: fixture.backlogA.id }),
      ]);
      await expect(listBacklogsForUser(fixture.actorB)).resolves.toEqual([
        expect.objectContaining({ id: fixture.backlogB.id }),
      ]);
      expect((await listBacklogsForUser(fixture.admin)).map((row) => row.id)).toEqual(
        expect.arrayContaining([fixture.backlogA.id, fixture.backlogB.id]),
      );
      expect(
        (await listBacklogsForUser(fixture.platformAdmin)).map((row) => row.id),
      ).toEqual(expect.arrayContaining([fixture.backlogA.id, fixture.backlogB.id]));

      await expect(
        getBacklogByKeyForUser(fixture.backlogB.key, fixture.actorA),
      ).resolves.toBeNull();
      await expect(
        getBacklogByKeyForUser(fixture.backlogB.key, fixture.admin),
      ).resolves.toMatchObject({ id: fixture.backlogB.id });

      await db.insert(permissionGrants).values(
        [
          "create_items",
          "delete_items",
          "restore_items",
          "add_comments",
          "edit_own_comments",
          "delete_own_comments",
          "delete_all_comments",
          "link_items",
        ].map((permissionKey) => ({
          scope: "backlog" as const,
          permissionSchemeId: fixture.schemeIds[0],
          permissionKey,
          principalType: "user" as const,
          userId: fixture.actorA,
        })),
      );
      await expect(
        getBacklogCapabilities(fixture.actorA, fixture.backlogA.id),
      ).resolves.toEqual({
        createItems: true,
        editItems: false,
        transitionItems: false,
        scheduleItems: false,
        assignItems: false,
        deleteItems: true,
        restoreItems: true,
        addComments: true,
        editOwnComments: true,
        deleteOwnComments: true,
        deleteAllComments: true,
        linkItems: true,
        manageSprints: false,
        manageReleases: false,
        manageWorkflow: false,
        manageMembers: false,
        bulkChangeItems: false,
      });
      await expect(
        getBacklogCapabilities(fixture.actorA, fixture.backlogB.id),
      ).resolves.toBeNull();
      await expect(
        getBacklogCapabilities(fixture.admin, fixture.backlogB.id),
      ).resolves.toEqual({
        createItems: true,
        editItems: true,
        transitionItems: true,
        scheduleItems: true,
        assignItems: true,
        deleteItems: true,
        restoreItems: true,
        addComments: true,
        editOwnComments: true,
        deleteOwnComments: true,
        deleteAllComments: true,
        linkItems: true,
        manageSprints: true,
        manageReleases: true,
        manageWorkflow: true,
        manageMembers: true,
        bulkChangeItems: true,
      });

      await expect(listItemsAssignedTo(fixture.actorA)).resolves.toEqual([
        expect.objectContaining({ id: fixture.liveA.id, backlogId: fixture.backlogA.id }),
      ]);
      await expect(listTrashedItems(fixture.actorA)).resolves.toEqual([
        expect.objectContaining({
          id: fixture.trashA.id,
          backlogId: fixture.backlogA.id,
        }),
      ]);
      expect((await listTrashedItems(fixture.admin)).map((row) => row.id)).toEqual(
        expect.arrayContaining([fixture.trashA.id, fixture.trashB.id]),
      );

      await expect(listVisibleViews(fixture.actorA)).resolves.toEqual([
        expect.objectContaining({ id: fixture.viewA.id, backlogId: fixture.backlogA.id }),
      ]);
      await expect(listViews(fixture.backlogB.id, fixture.actorA)).resolves.toEqual({
        personal: [],
        shared: [],
      });
      await expect(getViewByIdForUser(fixture.viewB.id, fixture.actorA)).resolves.toBeNull();
      expect((await listVisibleViews(fixture.admin)).map((row) => row.id)).toEqual(
        expect.arrayContaining([fixture.viewA.id, fixture.viewB.id]),
      );

      await expect(unreadCount(fixture.actorA)).resolves.toBe(1);
      await expect(listRecentNotifications(fixture.actorA, 1)).resolves.toEqual([
        expect.objectContaining({ itemKey: fixture.liveA.key, backlogKey: fixture.backlogA.key }),
      ]);
      await expect(unreadCount(fixture.admin)).resolves.toBe(2);
      await expect(unreadCount(fixture.platformAdmin)).resolves.toBe(2);
    } finally {
      await deleteReadVisibilityFixture(fixture);
    }
  });
});
