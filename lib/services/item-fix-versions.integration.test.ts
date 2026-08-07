import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  backlogs,
  itemFixVersions,
  items,
  releasePublications,
  releases,
  statuses,
} from "@/lib/db/schema/domain";
import {
  changeItemFixVersions,
  listItemFixVersionPairs,
} from "@/lib/services/item-fix-versions";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(prefix: string): string {
  return `${prefix}${randomUUID().replace(/[^a-f]/gi, "").slice(0, 5).toUpperCase()}`;
}

async function createFixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");

  const [backlog, foreignBacklog] = await db
    .insert(backlogs)
    .values([
      { key: randomBacklogKey("FV"), name: "Fix versions", color: "#475569" },
      { key: randomBacklogKey("FX"), name: "Fix versions étrangères", color: "#64748b" },
    ])
    .returning();
  if (!backlog || !foreignBacklog) throw new Error("Fixture backlog impossible.");

  const [status, foreignStatus] = await db
    .insert(statuses)
    .values([
      {
        backlogId: backlog.id,
        name: "À faire",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      },
      {
        backlogId: foreignBacklog.id,
        name: "À faire",
        category: "todo",
        order: 0,
        color: "#9aa0a6",
      },
    ])
    .returning();
  if (!status || !foreignStatus) throw new Error("Fixture statut impossible.");

  const itemId = randomUUID();
  const deletedItemId = randomUUID();
  const foreignItemId = randomUUID();
  await db.insert(items).values([
    {
      id: itemId,
      key: `${backlog.key}-1`,
      type: "composant",
      backlogId: backlog.id,
      title: "Item versionné",
      statusId: status.id,
      reporterId: actor.id,
      rank: "a0",
      path: `root.${itemId.replaceAll("-", "")}`,
      depth: 0,
    },
    {
      id: deletedItemId,
      key: `${backlog.key}-2`,
      type: "composant",
      backlogId: backlog.id,
      title: "Item supprimé",
      statusId: status.id,
      reporterId: actor.id,
      rank: "a1",
      path: `root.${deletedItemId.replaceAll("-", "")}`,
      depth: 0,
      deletedAt: new Date(),
    },
    {
      id: foreignItemId,
      key: `${foreignBacklog.key}-1`,
      type: "composant",
      backlogId: foreignBacklog.id,
      title: "Item étranger",
      statusId: foreignStatus.id,
      reporterId: actor.id,
      rank: "a0",
      path: `root.${foreignItemId.replaceAll("-", "")}`,
      depth: 0,
    },
  ]);

  const [draft, published, archived, foreign] = await db
    .insert(releases)
    .values([
      { backlogId: backlog.id, name: "2026.09", createdBy: actor.id },
      {
        backlogId: backlog.id,
        name: "2026.08",
        releaseDate: "2026-08-07",
        createdBy: actor.id,
      },
      {
        backlogId: backlog.id,
        name: "2026.07",
        archivedAt: new Date(),
        createdBy: actor.id,
      },
      { backlogId: foreignBacklog.id, name: "FOREIGN", createdBy: actor.id },
    ])
    .returning();
  if (!draft || !published || !archived || !foreign) {
    throw new Error("Fixture release impossible.");
  }

  return {
    actorId: actor.id,
    backlog,
    foreignBacklog,
    itemId,
    deletedItemId,
    foreignItemId,
    draft,
    published,
    archived,
    foreign,
  };
}

async function cleanupFixture(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const backlogIds = [fixture.backlog.id, fixture.foreignBacklog.id];
  const client = await databasePool.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = 'replica'");
    await client.query("delete from release_publication_items where backlog_id = any($1)", [
      backlogIds,
    ]);
    await client.query("delete from release_publications where backlog_id = any($1)", [backlogIds]);
    await client.query("set local session_replication_role = 'origin'");
    await client.query("delete from backlogs where id = any($1)", [backlogIds]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

describeDb("item fix version transactions", () => {
  it("persists draft and published releases with sorted correlated label audit", async () => {
    const fixture = await createFixture();
    try {
      await db.insert(releasePublications).values({
        backlogId: fixture.backlog.id,
        releaseId: fixture.published.id,
        releaseRevision: fixture.published.revision,
        releaseName: fixture.published.name,
        effectiveDate: "2026-08-07",
        incompleteDisposition: "keep",
        publishedBy: fixture.actorId,
      });
      const requested = [fixture.published, fixture.draft].sort((a, b) => b.id.localeCompare(a.id));
      const expectedAfter = [fixture.draft, fixture.published]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(({ id, name }) => ({ id, name }));

      await expect(
        changeItemFixVersions(
          {
            backlogId: fixture.backlog.id,
            itemId: fixture.itemId,
            mode: "replace",
            releaseIds: requested.map((release) => release.id),
          },
          fixture.actorId,
          "replace-test",
        ),
      ).resolves.toEqual({ changed: true, before: [], after: expectedAfter });

      expect(await listItemFixVersionPairs(fixture.backlog.id)).toEqual(
        expectedAfter.map((release) => ({
          itemId: fixture.itemId,
          releaseId: release.id,
          name: release.name,
        })),
      );
      const audit = await db
        .select({
          field: activities.field,
          oldValue: activities.oldValue,
          newValue: activities.newValue,
          correlationId: activities.requestCorrelationId,
        })
        .from(activities)
        .where(eq(activities.itemId, fixture.itemId));
      expect(audit).toEqual([
        {
          field: "fix_versions",
          oldValue: "[]",
          newValue: JSON.stringify(expectedAfter),
          correlationId: "replace-test",
        },
      ]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rejects duplicate IDs before writing links or activity", async () => {
    const fixture = await createFixture();
    try {
      await expect(
        changeItemFixVersions(
          {
            backlogId: fixture.backlog.id,
            itemId: fixture.itemId,
            mode: "replace",
            releaseIds: [fixture.draft.id, fixture.draft.id],
          },
          fixture.actorId,
          "duplicate-test",
        ),
      ).rejects.toThrow("Les versions contiennent des doublons.");
      expect(
        await db
          .select({ releaseId: itemFixVersions.releaseId })
          .from(itemFixVersions)
          .where(eq(itemFixVersions.itemId, fixture.itemId)),
      ).toEqual([]);
      expect(
        await db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.itemId, fixture.itemId)),
      ).toEqual([]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rolls back a cross-backlog replacement and preserves the existing version", async () => {
    const fixture = await createFixture();
    await db.insert(itemFixVersions).values({
      backlogId: fixture.backlog.id,
      itemId: fixture.itemId,
      releaseId: fixture.draft.id,
    });
    try {
      await expect(
        changeItemFixVersions(
          {
            backlogId: fixture.backlog.id,
            itemId: fixture.itemId,
            mode: "replace",
            releaseIds: [fixture.foreign.id],
          },
          fixture.actorId,
          "foreign-test",
        ),
      ).rejects.toThrow("Une ou plusieurs releases sont invalides pour ce backlog.");
      expect(await listItemFixVersionPairs(fixture.backlog.id)).toEqual([
        {
          itemId: fixture.itemId,
          releaseId: fixture.draft.id,
          name: fixture.draft.name,
        },
      ]);
      expect(
        await db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.itemId, fixture.itemId)),
      ).toEqual([]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rejects archived additions while allowing an archived assignment to be removed", async () => {
    const fixture = await createFixture();
    try {
      await expect(
        changeItemFixVersions(
          {
            backlogId: fixture.backlog.id,
            itemId: fixture.itemId,
            mode: "add",
            releaseIds: [fixture.archived.id],
          },
          fixture.actorId,
          "archived-add-test",
        ),
      ).rejects.toThrow("Une release archivée ne peut pas être ajoutée.");

      await db.insert(itemFixVersions).values({
        backlogId: fixture.backlog.id,
        itemId: fixture.itemId,
        releaseId: fixture.archived.id,
      });
      await expect(
        changeItemFixVersions(
          {
            backlogId: fixture.backlog.id,
            itemId: fixture.itemId,
            mode: "remove",
            releaseIds: [fixture.archived.id],
          },
          fixture.actorId,
          "archived-remove-test",
        ),
      ).resolves.toEqual({
        changed: true,
        before: [{ id: fixture.archived.id, name: fixture.archived.name }],
        after: [],
      });
      expect(await listItemFixVersionPairs(fixture.backlog.id)).toEqual([]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("preserves unrelated assignments for add and remove and logs no-op changes nothing", async () => {
    const fixture = await createFixture();
    await db.insert(itemFixVersions).values({
      backlogId: fixture.backlog.id,
      itemId: fixture.itemId,
      releaseId: fixture.draft.id,
    });
    try {
      await changeItemFixVersions(
        {
          backlogId: fixture.backlog.id,
          itemId: fixture.itemId,
          mode: "add",
          releaseIds: [fixture.published.id],
        },
        fixture.actorId,
        "add-test",
      );
      await changeItemFixVersions(
        {
          backlogId: fixture.backlog.id,
          itemId: fixture.itemId,
          mode: "remove",
          releaseIds: [fixture.published.id],
        },
        fixture.actorId,
        "remove-test",
      );
      await changeItemFixVersions(
        {
          backlogId: fixture.backlog.id,
          itemId: fixture.itemId,
          mode: "add",
          releaseIds: [fixture.draft.id],
        },
        fixture.actorId,
        "noop-test",
      );

      expect(await listItemFixVersionPairs(fixture.backlog.id)).toEqual([
        {
          itemId: fixture.itemId,
          releaseId: fixture.draft.id,
          name: fixture.draft.name,
        },
      ]);
      const audit = await db
        .select({ correlationId: activities.requestCorrelationId })
        .from(activities)
        .where(and(eq(activities.itemId, fixture.itemId), eq(activities.field, "fix_versions")))
        .orderBy(asc(activities.at), asc(activities.id));
      expect(audit).toEqual([
        { correlationId: "add-test" },
        { correlationId: "remove-test" },
      ]);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rejects deleted and foreign items before changing any assignment", async () => {
    const fixture = await createFixture();
    try {
      await expect(
        changeItemFixVersions(
          {
            backlogId: fixture.backlog.id,
            itemId: fixture.deletedItemId,
            mode: "replace",
            releaseIds: [fixture.draft.id],
          },
          fixture.actorId,
          "deleted-test",
        ),
      ).rejects.toThrow("Un ou plusieurs items sont introuvables.");
      await expect(
        changeItemFixVersions(
          {
            backlogId: fixture.backlog.id,
            itemId: fixture.foreignItemId,
            mode: "replace",
            releaseIds: [fixture.draft.id],
          },
          fixture.actorId,
          "foreign-item-test",
        ),
      ).rejects.toThrow("Tous les items doivent appartenir au backlog.");
      expect(await listItemFixVersionPairs(fixture.backlog.id)).toEqual([]);
    } finally {
      await cleanupFixture(fixture);
    }
  });
});
