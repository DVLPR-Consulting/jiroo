import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogs,
  itemFixVersions,
  items,
  releaseEvents,
  releasePublicationItems,
  releasePublications,
  releases,
  statuses,
} from "@/lib/db/schema/domain";
import {
  archiveRelease,
  createRelease,
  getReleaseDetail,
  listPublicationSnapshotItems,
  listReleaseEvents,
  listReleaseScopeItems,
  listReleaseSummaries,
  publishRelease,
  unarchiveRelease,
  unreleaseRelease,
  updateRelease,
} from "@/lib/services/releases";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureBacklogIds = new Set<string>();
const fixtureUserIds = new Set<string>();

async function actorFixture() {
  const [actor] = await db.select({ id: user.id, name: user.name }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  return actor;
}

async function backlogFixture(name = "Release service test") {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: `RL${suffix}`, name, color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  fixtureBacklogIds.add(backlog.id);
  return backlog;
}

async function userFixture(name: string) {
  const id = `release-test-${randomUUID()}`;
  const [created] = await db
    .insert(user)
    .values({ id, name, email: `${id}@example.test` })
    .returning({ id: user.id, name: user.name });
  if (!created) throw new Error("Fixture utilisateur impossible.");
  fixtureUserIds.add(created.id);
  return created;
}

async function statusFixture(
  backlogId: string,
  values: Array<{ name: string; category: "todo" | "in_progress" | "done" }>,
) {
  return db
    .insert(statuses)
    .values(
      values.map((value, order) => ({
        backlogId,
        name: value.name,
        category: value.category,
        order,
        color: "#64748b",
      })),
    )
    .returning();
}

async function itemFixture(input: {
  backlogId: string;
  backlogKey: string;
  reporterId: string;
  statusId: string;
  title: string;
  ordinal: number;
  estimatePoints?: number | null;
}) {
  const id = randomUUID();
  const [item] = await db
    .insert(items)
    .values({
      id,
      key: `${input.backlogKey}-${input.ordinal}`,
      type: "tache",
      backlogId: input.backlogId,
      title: input.title,
      statusId: input.statusId,
      estimatePoints: input.estimatePoints ?? null,
      reporterId: input.reporterId,
      rank: `a${input.ordinal.toString().padStart(6, "0")}`,
      path: `root.${id.replaceAll("-", "")}`,
    })
    .returning();
  if (!item) throw new Error("Fixture item impossible.");
  return item;
}

async function cleanupFixtures() {
  for (const backlogId of fixtureBacklogIds) {
    const client = await databasePool.connect();
    try {
      await client.query("begin");
      await client.query("set local session_replication_role = 'replica'");
      await client.query("delete from release_publication_items where backlog_id = $1", [
        backlogId,
      ]);
      await client.query("delete from release_publications where backlog_id = $1", [backlogId]);
      await client.query("set local session_replication_role = 'origin'");
      await client.query("delete from release_events where backlog_id = $1", [backlogId]);
      await client.query("delete from backlogs where id = $1", [backlogId]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  for (const userId of fixtureUserIds) {
    await db.delete(user).where(eq(user.id, userId));
  }
}

afterAll(cleanupFixtures);

describeDb("release metadata and read models", () => {
  it("creates a release, records correlated events, and rejects a stale revision", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture();

    const created = await createRelease(
      {
        backlogId: backlog.id,
        name: "2026.09",
        description: null,
        driverId: actor.id,
        startDate: "2026-08-01",
        targetDate: "2026-09-15",
      },
      actor.id,
      "release-create-test",
    );
    expect(created).toMatchObject({ revision: 1 });

    const updated = await updateRelease(
      {
        backlogId: backlog.id,
        releaseId: created.id,
        expectedRevision: 1,
        name: "2026.09 GA",
      },
      actor.id,
      "update-1",
    );
    expect(updated.revision).toBe(2);

    await expect(
      updateRelease(
        {
          backlogId: backlog.id,
          releaseId: created.id,
          expectedRevision: 1,
          description: "stale",
        },
        actor.id,
        "update-2",
      ),
    ).rejects.toThrow("a changé");

    const [stored] = await db
      .select({
        name: releases.name,
        revision: releases.revision,
        createdBy: releases.createdBy,
        driverId: releases.driverId,
        startDate: releases.startDate,
        targetDate: releases.releaseDate,
      })
      .from(releases)
      .where(eq(releases.id, created.id));
    expect(stored).toEqual({
      name: "2026.09 GA",
      revision: 2,
      createdBy: actor.id,
      driverId: actor.id,
      startDate: "2026-08-01",
      targetDate: "2026-09-15",
    });

    const events = await db
      .select({
        action: releaseEvents.action,
        releaseName: releaseEvents.releaseName,
        actorId: releaseEvents.actorId,
        correlationId: releaseEvents.requestCorrelationId,
      })
      .from(releaseEvents)
      .where(eq(releaseEvents.releaseId, created.id))
      .orderBy(asc(releaseEvents.createdAt));
    expect(events).toEqual([
      {
        action: "release_created",
        releaseName: "2026.09",
        actorId: actor.id,
        correlationId: "release-create-test",
      },
      {
        action: "release_updated",
        releaseName: "2026.09 GA",
        actorId: actor.id,
        correlationId: "update-1",
      },
    ]);
  });

  it("keeps creator provenance while the driver changes and can later disappear", async () => {
    const actor = await actorFixture();
    const firstDriver = await userFixture("Premier pilote");
    const secondDriver = await userFixture("Deuxième pilote");
    const backlog = await backlogFixture();
    const created = await createRelease(
      { backlogId: backlog.id, name: "Pilotage", driverId: firstDriver.id },
      actor.id,
      "driver-create",
    );

    await expect(getReleaseDetail(backlog.id, created.id)).resolves.toMatchObject({
      driver: firstDriver,
    });
    await updateRelease(
      {
        backlogId: backlog.id,
        releaseId: created.id,
        expectedRevision: 1,
        driverId: secondDriver.id,
      },
      actor.id,
      "driver-change",
    );
    const [stored] = await db
      .select({ createdBy: releases.createdBy, driverId: releases.driverId })
      .from(releases)
      .where(eq(releases.id, created.id));
    expect(stored).toEqual({ createdBy: actor.id, driverId: secondDriver.id });
    await expect(getReleaseDetail(backlog.id, created.id)).resolves.toMatchObject({
      driver: secondDriver,
      revision: 2,
    });

    await db.delete(user).where(eq(user.id, secondDriver.id));
    fixtureUserIds.delete(secondDriver.id);
    await expect(getReleaseDetail(backlog.id, created.id)).resolves.toMatchObject({
      driver: null,
      revision: 2,
    });
    await expect(
      db
        .select({ createdBy: releases.createdBy, driverId: releases.driverId })
        .from(releases)
        .where(eq(releases.id, created.id)),
    ).resolves.toEqual([{ createdBy: actor.id, driverId: null }]);
  });

  it("rejects normalized duplicate names, cross-backlog IDs, and missing drivers", async () => {
    const actor = await actorFixture();
    const sourceBacklog = await backlogFixture("Source releases");
    const otherBacklog = await backlogFixture("Other releases");
    const created = await createRelease(
      {
        backlogId: sourceBacklog.id,
        name: "Version Alpha",
        driverId: actor.id,
        startDate: null,
        targetDate: null,
      },
      actor.id,
      "create-alpha",
    );

    await expect(
      createRelease(
        {
          backlogId: sourceBacklog.id,
          name: "  VERSION ALPHA  ",
          driverId: actor.id,
        },
        actor.id,
        "duplicate-alpha",
      ),
    ).rejects.toThrow("existe déjà");

    await expect(
      updateRelease(
        {
          backlogId: otherBacklog.id,
          releaseId: created.id,
          expectedRevision: 1,
          description: "mauvais backlog",
        },
        actor.id,
        "cross-backlog",
      ),
    ).rejects.toThrow("Release introuvable");

    await expect(
      createRelease(
        {
          backlogId: sourceBacklog.id,
          name: "Sans pilote",
          driverId: randomUUID(),
        },
        actor.id,
        "missing-driver",
      ),
    ).rejects.toThrow("Pilote introuvable");
  });

  it("validates date order against both submitted and persisted metadata", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture();

    await expect(
      createRelease(
        {
          backlogId: backlog.id,
          name: "Dates invalides",
          driverId: actor.id,
          startDate: "2026-09-16",
          targetDate: "2026-09-15",
        },
        actor.id,
        "invalid-create-dates",
      ),
    ).rejects.toThrow("date cible");

    const created = await createRelease(
      {
        backlogId: backlog.id,
        name: "Dates valides",
        driverId: actor.id,
        startDate: "2026-09-01",
        targetDate: "2026-09-15",
      },
      actor.id,
      "valid-dates",
    );
    await expect(
      updateRelease(
        {
          backlogId: backlog.id,
          releaseId: created.id,
          expectedRevision: 1,
          startDate: "2026-09-16",
        },
        actor.id,
        "invalid-update-dates",
      ),
    ).rejects.toThrow("date cible");
  });

  it("hides archived releases by default and returns zeroed progress for an empty release", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture();
    const created = await createRelease(
      {
        backlogId: backlog.id,
        name: "Future vide",
        description: "Aucun item",
        driverId: actor.id,
        targetDate: "2099-12-31",
      },
      actor.id,
      "empty-release",
    );

    const visible = await listReleaseSummaries(backlog.id);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({
      id: created.id,
      name: "Future vide",
      description: "Aucun item",
      driver: actor,
      startDate: null,
      targetDate: "2099-12-31",
      effectiveReleaseDate: null,
      released: false,
      archived: false,
      overdue: false,
      revision: 1,
      progress: {
        total: 0,
        todo: 0,
        inProgress: 0,
        done: 0,
        totalPoints: 0,
        donePoints: 0,
        unestimated: 0,
      },
    });

    await db.update(releases).set({ archivedAt: new Date() }).where(eq(releases.id, created.id));
    await expect(listReleaseSummaries(backlog.id)).resolves.toEqual([]);
    const archived = await listReleaseSummaries(backlog.id, { includeArchived: true });
    expect(archived).toHaveLength(1);
    expect(archived[0]).toMatchObject({ id: created.id, archived: true });

    const detail = await getReleaseDetail(backlog.id, created.id);
    expect(detail).toMatchObject({ id: created.id, archived: true, progress: visible[0]!.progress });
  });

  it("returns scope items and release events with bounded pagination", async () => {
    const actor = await actorFixture();
    const updater = await userFixture("Acteur historique");
    const backlog = await backlogFixture();
    const [todo, doing, done] = await statusFixture(backlog.id, [
      { name: "À faire", category: "todo" },
      { name: "En cours", category: "in_progress" },
      { name: "Terminé", category: "done" },
    ]);
    const created = await createRelease(
      { backlogId: backlog.id, name: "Scope", driverId: actor.id },
      actor.id,
      "scope-create",
    );
    const scopeItems = await Promise.all([
      itemFixture({
        backlogId: backlog.id,
        backlogKey: backlog.key,
        reporterId: actor.id,
        statusId: todo!.id,
        title: "Premier",
        ordinal: 1,
        estimatePoints: 2,
      }),
      itemFixture({
        backlogId: backlog.id,
        backlogKey: backlog.key,
        reporterId: actor.id,
        statusId: doing!.id,
        title: "Deuxième",
        ordinal: 2,
        estimatePoints: null,
      }),
      itemFixture({
        backlogId: backlog.id,
        backlogKey: backlog.key,
        reporterId: actor.id,
        statusId: done!.id,
        title: "Troisième",
        ordinal: 3,
        estimatePoints: 5,
      }),
    ]);
    await db.insert(itemFixVersions).values(
      scopeItems.map((item) => ({
        backlogId: backlog.id,
        itemId: item.id,
        releaseId: created.id,
      })),
    );
    await updateRelease(
      {
        backlogId: backlog.id,
        releaseId: created.id,
        expectedRevision: 1,
        description: "Événement page 2",
      },
      updater.id,
      "scope-update",
    );

    const firstPage = await listReleaseScopeItems({
      backlogId: backlog.id,
      releaseId: created.id,
      page: 1,
      pageSize: 2,
    });
    expect(firstPage.total).toBe(3);
    expect(firstPage.rows.map((row) => row.key)).toEqual([
      `${backlog.key}-1`,
      `${backlog.key}-2`,
    ]);
    expect(firstPage.rows[0]).toMatchObject({
      title: "Premier",
      estimatePoints: 2,
      status: { name: "À faire", category: "todo" },
    });
    const secondPage = await listReleaseScopeItems({
      backlogId: backlog.id,
      releaseId: created.id,
      page: 2,
      pageSize: 2,
    });
    expect(secondPage.rows.map((row) => row.title)).toEqual(["Troisième"]);

    const eventPage = await listReleaseEvents({
      backlogId: backlog.id,
      releaseId: created.id,
      page: 1,
      pageSize: 1,
    });
    expect(eventPage.total).toBe(2);
    expect(eventPage.rows[0]).toMatchObject({
      action: "release_updated",
      releaseName: "Scope",
      actor: updater,
      requestCorrelationId: "scope-update",
    });

    await db.update(user).set({ name: "Acteur renommé" }).where(eq(user.id, updater.id));
    const renamedActorPage = await listReleaseEvents({
      backlogId: backlog.id,
      releaseId: created.id,
      page: 1,
      pageSize: 1,
    });
    expect(renamedActorPage.rows[0]?.actor).toEqual(updater);
    await db.delete(user).where(eq(user.id, updater.id));
    fixtureUserIds.delete(updater.id);
    const deletedActorPage = await listReleaseEvents({
      backlogId: backlog.id,
      releaseId: created.id,
      page: 1,
      pageSize: 1,
    });
    expect(deletedActorPage.rows[0]?.actor).toEqual({ id: null, name: updater.name });

    await expect(
      listReleaseScopeItems({
        backlogId: backlog.id,
        releaseId: created.id,
        page: 1,
        pageSize: 101,
      }),
    ).rejects.toThrow("100");
    await expect(
      listReleaseEvents({
        backlogId: backlog.id,
        releaseId: created.id,
        page: 0,
        pageSize: 20,
      }),
    ).rejects.toThrow();
  });

  it("returns immutable publication snapshots and active release metadata with bounded pagination", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture();
    const release = await createRelease(
      { backlogId: backlog.id, name: "Published", driverId: actor.id },
      actor.id,
      "published-create",
    );
    const destination = await createRelease(
      { backlogId: backlog.id, name: "Next", driverId: actor.id },
      actor.id,
      "destination-create",
    );
    const [publication] = await db
      .insert(releasePublications)
      .values({
        backlogId: backlog.id,
        releaseId: release.id,
        releaseRevision: release.revision,
        releaseName: "Published",
        effectiveDate: "2026-10-01",
        incompleteDisposition: "move",
        destinationReleaseId: destination.id,
        destinationReleaseName: "Next",
        publishedBy: actor.id,
      })
      .returning();
    if (!publication) throw new Error("Fixture publication impossible.");
    await db.insert(releasePublicationItems).values([
      {
        publicationId: publication.id,
        backlogId: backlog.id,
        itemKey: `${backlog.key}-1`,
        itemTitle: "Snapshot 1",
        statusName: "Terminé",
        disposition: "retained",
      },
      {
        publicationId: publication.id,
        backlogId: backlog.id,
        itemKey: `${backlog.key}-2`,
        itemTitle: "Snapshot 2",
        statusName: "À faire",
        disposition: "moved",
        destinationReleaseId: destination.id,
        destinationReleaseName: "Next",
      },
      {
        publicationId: publication.id,
        backlogId: backlog.id,
        itemKey: `${backlog.key}-3`,
        itemTitle: "Snapshot 3",
        statusName: "Terminé",
        disposition: "retained",
      },
    ]);

    const snapshots = await listPublicationSnapshotItems({
      backlogId: backlog.id,
      publicationId: publication.id,
      page: 2,
      pageSize: 2,
    });
    expect(snapshots.total).toBe(3);
    expect(snapshots.rows).toHaveLength(1);
    expect(snapshots.rows[0]).toMatchObject({
      itemKey: `${backlog.key}-3`,
      itemTitle: "Snapshot 3",
      statusName: "Terminé",
      disposition: "retained",
      destinationRelease: null,
    });

    const detail = await getReleaseDetail(backlog.id, release.id);
    expect(detail).toMatchObject({
      released: true,
      effectiveReleaseDate: "2026-10-01",
    });
    await expect(
      listPublicationSnapshotItems({
        backlogId: backlog.id,
        publicationId: publication.id,
        page: 1,
        pageSize: 101,
      }),
    ).rejects.toThrow("100");
  });

  it("keeps summary query count fixed for 100 releases and 1,000 links", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture("Query bound releases");
    const [todo, doing, done] = await statusFixture(backlog.id, [
      { name: "À faire", category: "todo" },
      { name: "En cours", category: "in_progress" },
      { name: "Terminé", category: "done" },
    ]);
    const releaseRows = await db
      .insert(releases)
      .values(
        Array.from({ length: 100 }, (_, index) => ({
          backlogId: backlog.id,
          name: `Batch ${index.toString().padStart(3, "0")}`,
          createdBy: actor.id,
        })),
      )
      .returning({ id: releases.id });

    const estimates = [1, null, 2, 3, 2, null, 4, 5, null, 8] as const;
    const itemRows = Array.from({ length: 1_000 }, (_, index) => {
      const id = randomUUID();
      const offset = index % 10;
      const statusId = offset < 4 ? todo!.id : offset < 7 ? doing!.id : done!.id;
      return {
        id,
        key: `${backlog.key}-${index + 1}`,
        type: "tache" as const,
        backlogId: backlog.id,
        title: `Batch item ${index}`,
        statusId,
        estimatePoints: estimates[offset],
        reporterId: actor.id,
        rank: `b${index.toString().padStart(6, "0")}`,
        path: `root.${id.replaceAll("-", "")}`,
      };
    });
    for (let start = 0; start < itemRows.length; start += 250) {
      await db.insert(items).values(itemRows.slice(start, start + 250));
    }
    await db.insert(itemFixVersions).values(
      itemRows.map((item, index) => ({
        backlogId: backlog.id,
        itemId: item.id,
        releaseId: releaseRows[Math.floor(index / 10)]!.id,
      })),
    );

    const querySpy = vi.spyOn(databasePool, "query");
    try {
      const summaries = await listReleaseSummaries(backlog.id);
      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(summaries).toHaveLength(100);
      expect(summaries[0]!.overdue).toBe(false);
      expect(summaries[0]!.progress).toEqual({
        total: 10,
        todo: 4,
        inProgress: 3,
        done: 3,
        totalPoints: 25,
        donePoints: 13,
        unestimated: 3,
      });
    } finally {
      querySpy.mockRestore();
    }
  });
});

describeDb("release publish, unrelease, and archive lifecycle", () => {
  it("publishes snapshots before moving incomplete items and preserves unrelated Fix versions", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture("Publish move");
    const [todo, done] = await statusFixture(backlog.id, [
      { name: "À faire", category: "todo" },
      { name: "Terminé", category: "done" },
    ]);
    const source = await createRelease(
      { backlogId: backlog.id, name: "2026.10", driverId: actor.id },
      actor.id,
      "publish-source-create",
    );
    const destination = await createRelease(
      { backlogId: backlog.id, name: "2026.11", driverId: actor.id },
      actor.id,
      "publish-destination-create",
    );
    const unrelated = await createRelease(
      { backlogId: backlog.id, name: "Maintenance", driverId: actor.id },
      actor.id,
      "publish-unrelated-create",
    );
    const doneItem = await itemFixture({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      reporterId: actor.id,
      statusId: done!.id,
      title: "Livré",
      ordinal: 1,
    });
    const todoItem = await itemFixture({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      reporterId: actor.id,
      statusId: todo!.id,
      title: "À reporter",
      ordinal: 2,
    });
    await db.insert(itemFixVersions).values([
      { backlogId: backlog.id, itemId: doneItem.id, releaseId: source.id },
      { backlogId: backlog.id, itemId: todoItem.id, releaseId: source.id },
      { backlogId: backlog.id, itemId: todoItem.id, releaseId: unrelated.id },
    ]);

    const result = await publishRelease(
      {
        backlogId: backlog.id,
        releaseId: source.id,
        expectedRevision: 1,
        effectiveDate: "2026-08-07",
        incompleteDisposition: "move",
        destinationReleaseId: destination.id,
      },
      actor.id,
      "publish-move-test",
    );

    expect(result).toMatchObject({
      release: { id: source.id, revision: 2 },
      totalCount: 2,
      completedCount: 1,
      incompleteCount: 1,
      movedCount: 1,
    });
    const snapshots = await db
      .select({
        itemKey: releasePublicationItems.itemKey,
        itemTitle: releasePublicationItems.itemTitle,
        statusName: releasePublicationItems.statusName,
        completed: releasePublicationItems.completed,
        disposition: releasePublicationItems.disposition,
        destinationReleaseId: releasePublicationItems.destinationReleaseId,
        destinationReleaseName: releasePublicationItems.destinationReleaseName,
      })
      .from(releasePublicationItems)
      .where(eq(releasePublicationItems.publicationId, result.publicationId))
      .orderBy(asc(releasePublicationItems.itemKey));
    expect(snapshots).toEqual([
      {
        itemKey: doneItem.key,
        itemTitle: "Livré",
        statusName: "Terminé",
        completed: true,
        disposition: "retained",
        destinationReleaseId: null,
        destinationReleaseName: null,
      },
      {
        itemKey: todoItem.key,
        itemTitle: "À reporter",
        statusName: "À faire",
        completed: false,
        disposition: "moved",
        destinationReleaseId: destination.id,
        destinationReleaseName: "2026.11",
      },
    ]);

    const links = await db
      .select({ itemId: itemFixVersions.itemId, releaseId: itemFixVersions.releaseId })
      .from(itemFixVersions)
      .where(inArray(itemFixVersions.itemId, [doneItem.id, todoItem.id]))
      .orderBy(asc(itemFixVersions.itemId), asc(itemFixVersions.releaseId));
    expect(links.filter((row) => row.itemId === doneItem.id)).toEqual([
      { itemId: doneItem.id, releaseId: source.id },
    ]);
    expect(links.filter((row) => row.itemId === todoItem.id)).toEqual(
      [destination.id, unrelated.id]
        .sort()
        .map((releaseId) => ({ itemId: todoItem.id, releaseId })),
    );
    await expect(
      db
        .select({ sequence: releasePublications.sequence, releaseRevision: releasePublications.releaseRevision })
        .from(releasePublications)
        .where(eq(releasePublications.id, result.publicationId)),
    ).resolves.toEqual([{ sequence: 1, releaseRevision: 2 }]);
    await expect(
      db
        .select({ action: releaseEvents.action, correlation: releaseEvents.requestCorrelationId })
        .from(releaseEvents)
        .where(
          and(
            eq(releaseEvents.publicationId, result.publicationId),
            eq(releaseEvents.action, "release_published"),
          ),
        ),
    ).resolves.toEqual([{ action: "release_published", correlation: "publish-move-test" }]);
  });

  it("publishes with keep without moving incomplete scope", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture("Publish keep");
    const [todo] = await statusFixture(backlog.id, [{ name: "À faire", category: "todo" }]);
    const release = await createRelease(
      { backlogId: backlog.id, name: "Keep", driverId: actor.id },
      actor.id,
      "keep-create",
    );
    const item = await itemFixture({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      reporterId: actor.id,
      statusId: todo!.id,
      title: "Conservé",
      ordinal: 1,
    });
    await db
      .insert(itemFixVersions)
      .values({ backlogId: backlog.id, itemId: item.id, releaseId: release.id });

    const result = await publishRelease(
      {
        backlogId: backlog.id,
        releaseId: release.id,
        expectedRevision: 1,
        effectiveDate: "2026-08-08",
        incompleteDisposition: "keep",
      },
      actor.id,
      "publish-keep-test",
    );
    expect(result).toMatchObject({
      totalCount: 1,
      completedCount: 0,
      incompleteCount: 1,
      movedCount: 0,
    });
    await expect(
      db
        .select({ releaseId: itemFixVersions.releaseId })
        .from(itemFixVersions)
        .where(eq(itemFixVersions.itemId, item.id)),
    ).resolves.toEqual([{ releaseId: release.id }]);
    await expect(
      db
        .select({ completed: releasePublicationItems.completed, disposition: releasePublicationItems.disposition })
        .from(releasePublicationItems)
        .where(eq(releasePublicationItems.publicationId, result.publicationId)),
    ).resolves.toEqual([{ completed: false, disposition: "retained" }]);
  });

  it("rejects publish destinations that are missing, invalid, cross-backlog, same, or archived", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture("Publish gates");
    const otherBacklog = await backlogFixture("Publish cross backlog");
    const sources = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createRelease(
          { backlogId: backlog.id, name: `Source ${index}`, driverId: actor.id },
          actor.id,
          `gate-source-${index}`,
        ),
      ),
    );
    const crossBacklogDestination = await createRelease(
      { backlogId: otherBacklog.id, name: "Cross", driverId: actor.id },
      actor.id,
      "cross-destination",
    );
    const archivedDestination = await createRelease(
      { backlogId: backlog.id, name: "Archived destination", driverId: actor.id },
      actor.id,
      "archived-destination",
    );
    await db
      .update(releases)
      .set({ archivedAt: new Date() })
      .where(eq(releases.id, archivedDestination.id));

    await expect(
      publishRelease(
        {
          backlogId: backlog.id,
          releaseId: sources[0]!.id,
          expectedRevision: 1,
          effectiveDate: "2026-08-09",
          incompleteDisposition: "move",
        },
        actor.id,
        "missing-destination",
      ),
    ).rejects.toThrow();
    await expect(
      publishRelease(
        {
          backlogId: backlog.id,
          releaseId: sources[1]!.id,
          expectedRevision: 1,
          effectiveDate: "2026-08-09",
          incompleteDisposition: "move",
          destinationReleaseId: randomUUID(),
        },
        actor.id,
        "invalid-destination",
      ),
    ).rejects.toThrow("destination");
    await expect(
      publishRelease(
        {
          backlogId: backlog.id,
          releaseId: sources[2]!.id,
          expectedRevision: 1,
          effectiveDate: "2026-08-09",
          incompleteDisposition: "move",
          destinationReleaseId: crossBacklogDestination.id,
        },
        actor.id,
        "cross-destination",
      ),
    ).rejects.toThrow("destination");
    await expect(
      publishRelease(
        {
          backlogId: backlog.id,
          releaseId: sources[3]!.id,
          expectedRevision: 1,
          effectiveDate: "2026-08-09",
          incompleteDisposition: "move",
          destinationReleaseId: sources[3]!.id,
        },
        actor.id,
        "same-destination",
      ),
    ).rejects.toThrow("différer");
    await expect(
      publishRelease(
        {
          backlogId: backlog.id,
          releaseId: sources[4]!.id,
          expectedRevision: 1,
          effectiveDate: "2026-08-09",
          incompleteDisposition: "move",
          destinationReleaseId: archivedDestination.id,
        },
        actor.id,
        "archived-destination",
      ),
    ).rejects.toThrow("archivée");

    await expect(
      db
        .select({ id: releasePublications.id })
        .from(releasePublications)
        .where(eq(releasePublications.backlogId, backlog.id)),
    ).resolves.toEqual([]);
  });

  it("rolls back publish when snapshot insertion fails", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture("Publish rollback");
    const [todo] = await statusFixture(backlog.id, [{ name: "À faire", category: "todo" }]);
    const release = await createRelease(
      { backlogId: backlog.id, name: "Rollback", driverId: actor.id },
      actor.id,
      "rollback-create",
    );
    const item = await itemFixture({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      reporterId: actor.id,
      statusId: todo!.id,
      title: "Doit rester",
      ordinal: 1,
    });
    await db
      .insert(itemFixVersions)
      .values({ backlogId: backlog.id, itemId: item.id, releaseId: release.id });
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `fail_release_snapshot_${suffix}`;
    const triggerName = `fail_release_snapshot_${suffix}`;
    await databasePool.query(
      `create function "${functionName}"() returns trigger language plpgsql as $fn$
       begin
         if new.backlog_id = '${backlog.id}'::uuid then
           raise exception 'forced snapshot failure';
         end if;
         return new;
       end;
       $fn$`,
    );
    await databasePool.query(
      `create trigger "${triggerName}" before insert on release_publication_items
       for each row execute function "${functionName}"()`,
    );
    try {
      await expect(
        publishRelease(
          {
            backlogId: backlog.id,
            releaseId: release.id,
            expectedRevision: 1,
            effectiveDate: "2026-08-10",
            incompleteDisposition: "keep",
          },
          actor.id,
          "publish-rollback-test",
        ),
      ).rejects.toThrow();
    } finally {
      await databasePool.query(
        `drop trigger if exists "${triggerName}" on release_publication_items`,
      );
      await databasePool.query(`drop function if exists "${functionName}"()`);
    }

    await expect(
      db
        .select({ revision: releases.revision })
        .from(releases)
        .where(eq(releases.id, release.id)),
    ).resolves.toEqual([{ revision: 1 }]);
    await expect(
      db
        .select({ id: releasePublications.id })
        .from(releasePublications)
        .where(eq(releasePublications.releaseId, release.id)),
    ).resolves.toEqual([]);
    await expect(
      db
        .select({ releaseId: itemFixVersions.releaseId })
        .from(itemFixVersions)
        .where(eq(itemFixVersions.itemId, item.id)),
    ).resolves.toEqual([{ releaseId: release.id }]);
  });

  it("unreleases and re-publishes with an appended sequence and untouched history", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture("Unrelease sequence");
    const release = await createRelease(
      { backlogId: backlog.id, name: "Sequence", driverId: actor.id },
      actor.id,
      "sequence-create",
    );
    const first = await publishRelease(
      {
        backlogId: backlog.id,
        releaseId: release.id,
        expectedRevision: 1,
        effectiveDate: "2026-08-11",
        incompleteDisposition: "keep",
      },
      actor.id,
      "publish-sequence-1",
    );
    const unreleased = await unreleaseRelease(
      { backlogId: backlog.id, releaseId: release.id, expectedRevision: 2 },
      actor.id,
      "unrelease-sequence",
    );
    expect(unreleased).toMatchObject({
      release: { id: release.id, revision: 3 },
      publicationId: first.publicationId,
    });
    await expect(getReleaseDetail(backlog.id, release.id)).resolves.toMatchObject({
      released: false,
      effectiveReleaseDate: null,
      revision: 3,
    });

    const second = await publishRelease(
      {
        backlogId: backlog.id,
        releaseId: release.id,
        expectedRevision: 3,
        effectiveDate: "2026-08-12",
        incompleteDisposition: "keep",
      },
      actor.id,
      "publish-sequence-2",
    );
    expect(second.release.revision).toBe(4);
    expect(second.publicationId).not.toBe(first.publicationId);
    const history = await db
      .select({
        id: releasePublications.id,
        sequence: releasePublications.sequence,
        effectiveDate: releasePublications.effectiveDate,
        supersededAt: releasePublications.supersededAt,
      })
      .from(releasePublications)
      .where(eq(releasePublications.releaseId, release.id))
      .orderBy(asc(releasePublications.sequence));
    expect(history).toEqual([
      {
        id: first.publicationId,
        sequence: 1,
        effectiveDate: "2026-08-11",
        supersededAt: expect.any(Date),
      },
      {
        id: second.publicationId,
        sequence: 2,
        effectiveDate: "2026-08-12",
        supersededAt: null,
      },
    ]);
    const events = await db
      .select({ action: releaseEvents.action, correlation: releaseEvents.requestCorrelationId })
      .from(releaseEvents)
      .where(
        and(
          eq(releaseEvents.releaseId, release.id),
          inArray(releaseEvents.action, ["release_published", "release_unreleased"]),
        ),
      )
      .orderBy(asc(releaseEvents.createdAt));
    expect(events).toEqual([
      { action: "release_published", correlation: "publish-sequence-1" },
      { action: "release_unreleased", correlation: "unrelease-sequence" },
      { action: "release_published", correlation: "publish-sequence-2" },
    ]);
  });

  it("archives and unarchives without changing active published state", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture("Archive lifecycle");
    const published = await createRelease(
      { backlogId: backlog.id, name: "Published archive", driverId: actor.id },
      actor.id,
      "archive-published-create",
    );
    const publication = await publishRelease(
      {
        backlogId: backlog.id,
        releaseId: published.id,
        expectedRevision: 1,
        effectiveDate: "2026-08-13",
        incompleteDisposition: "keep",
      },
      actor.id,
      "archive-publish",
    );
    const archived = await archiveRelease(
      { backlogId: backlog.id, releaseId: published.id, expectedRevision: 2 },
      actor.id,
      "archive-test",
    );
    expect(archived.revision).toBe(3);
    await expect(getReleaseDetail(backlog.id, published.id)).resolves.toMatchObject({
      archived: true,
      released: true,
      effectiveReleaseDate: "2026-08-13",
      revision: 3,
    });
    const unarchived = await unarchiveRelease(
      { backlogId: backlog.id, releaseId: published.id, expectedRevision: 3 },
      actor.id,
      "unarchive-test",
    );
    expect(unarchived.revision).toBe(4);
    await expect(
      db
        .select({ id: releasePublications.id, supersededAt: releasePublications.supersededAt })
        .from(releasePublications)
        .where(eq(releasePublications.id, publication.publicationId)),
    ).resolves.toEqual([{ id: publication.publicationId, supersededAt: null }]);

    const unpublished = await createRelease(
      { backlogId: backlog.id, name: "Archived unpublished", driverId: actor.id },
      actor.id,
      "archive-unpublished-create",
    );
    await archiveRelease(
      { backlogId: backlog.id, releaseId: unpublished.id, expectedRevision: 1 },
      actor.id,
      "archive-unpublished",
    );
    await expect(
      publishRelease(
        {
          backlogId: backlog.id,
          releaseId: unpublished.id,
          expectedRevision: 2,
          effectiveDate: "2026-08-13",
          incompleteDisposition: "keep",
        },
        actor.id,
        "publish-archived",
      ),
    ).rejects.toThrow("archivée");
    await expect(
      archiveRelease(
        { backlogId: backlog.id, releaseId: unpublished.id, expectedRevision: 1 },
        actor.id,
        "archive-stale",
      ),
    ).rejects.toThrow("a changé");
  });

  it("keeps a published snapshot immutable after source edits and purge", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture("Published snapshot immutability");
    const [todo, done] = await statusFixture(backlog.id, [
      { name: "À faire", category: "todo" },
      { name: "Terminé", category: "done" },
    ]);
    const release = await createRelease(
      { backlogId: backlog.id, name: "Immutable", driverId: actor.id },
      actor.id,
      "immutable-create",
    );
    const item = await itemFixture({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      reporterId: actor.id,
      statusId: done!.id,
      title: "Titre original",
      ordinal: 1,
      estimatePoints: 3.5,
    });
    await db
      .insert(itemFixVersions)
      .values({ backlogId: backlog.id, itemId: item.id, releaseId: release.id });
    const result = await publishRelease(
      {
        backlogId: backlog.id,
        releaseId: release.id,
        expectedRevision: 1,
        effectiveDate: "2026-08-14",
        incompleteDisposition: "keep",
      },
      actor.id,
      "publish-immutable",
    );
    const original = {
      itemId: item.id,
      itemKey: item.key,
      itemTitle: "Titre original",
      statusName: "Terminé",
      completed: true,
      estimatePoints: 3.5,
    };
    await expect(
      listPublicationSnapshotItems({
        backlogId: backlog.id,
        publicationId: result.publicationId,
        page: 1,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({ rows: [original] });

    await db
      .update(items)
      .set({
        key: `${backlog.key}-999`,
        title: "Titre modifié",
        statusId: todo!.id,
        estimatePoints: 8,
      })
      .where(eq(items.id, item.id));
    await db.update(statuses).set({ name: "Done renommé" }).where(eq(statuses.id, done!.id));
    await db.delete(items).where(eq(items.id, item.id));

    await expect(
      listPublicationSnapshotItems({
        backlogId: backlog.id,
        publicationId: result.publicationId,
        page: 1,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({ rows: [{ ...original, itemId: null }] });
  });

  it("publishes an oversized move scope in bounded batches after every snapshot exists", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture("Oversized publish scope");
    const [todo] = await statusFixture(backlog.id, [{ name: "À faire", category: "todo" }]);
    const source = await createRelease(
      { backlogId: backlog.id, name: "Oversized source", driverId: actor.id },
      actor.id,
      "oversized-source-create",
    );
    const destination = await createRelease(
      { backlogId: backlog.id, name: "Oversized destination", driverId: actor.id },
      actor.id,
      "oversized-destination-create",
    );
    const scopeSize = 7_000;
    const itemRows = Array.from({ length: scopeSize }, (_, index) => {
      const id = randomUUID();
      return {
        id,
        key: `${backlog.key}-${index + 1}`,
        type: "tache" as const,
        backlogId: backlog.id,
        title: `Élément ${index + 1}`,
        statusId: todo!.id,
        reporterId: actor.id,
        rank: `oversized${index.toString().padStart(8, "0")}`,
        path: `root.${id.replaceAll("-", "")}`,
      };
    });
    for (let offset = 0; offset < itemRows.length; offset += 500) {
      await db.insert(items).values(itemRows.slice(offset, offset + 500));
    }
    const fixVersionRows = itemRows.map((item) => ({
      backlogId: backlog.id,
      itemId: item.id,
      releaseId: source.id,
    }));
    for (let offset = 0; offset < fixVersionRows.length; offset += 1_000) {
      await db.insert(itemFixVersions).values(fixVersionRows.slice(offset, offset + 1_000));
    }

    await databasePool.query(`
      create function test_release_snapshots_complete_before_move() returns trigger
      language plpgsql as $$
      declare snapshot_count integer;
      begin
        select count(*)::int into snapshot_count
        from release_publication_items snapshot
        inner join release_publications publication on publication.id = snapshot.publication_id
        where publication.release_id = old.release_id
          and publication.superseded_at is null;
        if snapshot_count <> 7000 then
          raise exception 'move started before every snapshot existed';
        end if;
        return old;
      end;
      $$;
    `);
    await databasePool.query(`
      create trigger test_release_snapshots_complete_before_move
      before delete on item_fix_versions
      for each row execute function test_release_snapshots_complete_before_move();
    `);

    const result = await (async () => {
      try {
        return await publishRelease(
          {
            backlogId: backlog.id,
            releaseId: source.id,
            expectedRevision: 1,
            effectiveDate: "2026-08-16",
            incompleteDisposition: "move",
            destinationReleaseId: destination.id,
          },
          actor.id,
          "publish-oversized",
        );
      } finally {
        await databasePool.query(
          "drop trigger if exists test_release_snapshots_complete_before_move on item_fix_versions",
        );
        await databasePool.query(
          "drop function if exists test_release_snapshots_complete_before_move()",
        );
      }
    })();

    expect(result).toMatchObject({
      totalCount: scopeSize,
      completedCount: 0,
      incompleteCount: scopeSize,
      movedCount: scopeSize,
    });
    await expect(
      db
        .select({ value: count() })
        .from(releasePublicationItems)
        .where(eq(releasePublicationItems.publicationId, result.publicationId)),
    ).resolves.toEqual([{ value: scopeSize }]);
    await expect(
      db
        .select({ value: count() })
        .from(itemFixVersions)
        .where(
          and(
            eq(itemFixVersions.backlogId, backlog.id),
            eq(itemFixVersions.releaseId, source.id),
          ),
        ),
    ).resolves.toEqual([{ value: 0 }]);
    await expect(
      db
        .select({ value: count() })
        .from(itemFixVersions)
        .where(
          and(
            eq(itemFixVersions.backlogId, backlog.id),
            eq(itemFixVersions.releaseId, destination.id),
          ),
        ),
    ).resolves.toEqual([{ value: scopeSize }]);
  }, 60_000);

  it("serializes simultaneous publish attempts and rejects the stale writer", async () => {
    const actor = await actorFixture();
    const backlog = await backlogFixture("Simultaneous publish");
    const release = await createRelease(
      { backlogId: backlog.id, name: "Concurrent", driverId: actor.id },
      actor.id,
      "concurrent-create",
    );
    const command = {
      backlogId: backlog.id,
      releaseId: release.id,
      expectedRevision: 1,
      effectiveDate: "2026-08-15",
      incompleteDisposition: "keep" as const,
    };
    const results = await Promise.allSettled([
      publishRelease(command, actor.id, "publish-concurrent-a"),
      publishRelease(command, actor.id, "publish-concurrent-b"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: expect.any(Error) });
    if (rejected?.status === "rejected") {
      expect(rejected.reason.message).toContain("a changé");
    }
    await expect(
      db
        .select({ id: releasePublications.id })
        .from(releasePublications)
        .where(and(eq(releasePublications.releaseId, release.id), isNull(releasePublications.supersededAt))),
    ).resolves.toHaveLength(1);
    await expect(
      db.select({ revision: releases.revision }).from(releases).where(eq(releases.id, release.id)),
    ).resolves.toEqual([{ revision: 2 }]);
    await expect(
      db
        .select({ id: releaseEvents.id })
        .from(releaseEvents)
        .where(
          and(
            eq(releaseEvents.releaseId, release.id),
            eq(releaseEvents.action, "release_published"),
          ),
        ),
    ).resolves.toHaveLength(1);
  });
});
