import "dotenv/config";

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
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
  createRelease,
  getReleaseDetail,
  listPublicationSnapshotItems,
  listReleaseEvents,
  listReleaseScopeItems,
  listReleaseSummaries,
  updateRelease,
} from "@/lib/services/releases";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureBacklogIds = new Set<string>();

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
        driverId: releases.createdBy,
        startDate: releases.startDate,
        targetDate: releases.releaseDate,
      })
      .from(releases)
      .where(eq(releases.id, created.id));
    expect(stored).toEqual({
      name: "2026.09 GA",
      revision: 2,
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
        action: "created",
        releaseName: "2026.09",
        actorId: actor.id,
        correlationId: "release-create-test",
      },
      {
        action: "updated",
        releaseName: "2026.09 GA",
        actorId: actor.id,
        correlationId: "update-1",
      },
    ]);
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
      actor.id,
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
      action: "updated",
      releaseName: "Scope",
      actor,
      requestCorrelationId: "scope-update",
    });

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
