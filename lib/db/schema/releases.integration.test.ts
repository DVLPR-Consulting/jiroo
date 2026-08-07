import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DIRECT_DATABASE_URL });
let savepointSequence = 0;

async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  await client.query("begin");
  try {
    return await run(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function expectStatementRejected(
  client: PoolClient,
  statement: string,
  values: unknown[] = [],
): Promise<void> {
  const savepoint = `expected_rejection_${savepointSequence++}`;
  await client.query(`savepoint ${savepoint}`);
  let rejected = false;
  try {
    await client.query(statement, values);
  } catch {
    rejected = true;
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
  expect(rejected).toBe(true);
}

async function actorId(client: PoolClient): Promise<string> {
  const result = await client.query<{ id: string }>('select "id" from "user" limit 1');
  const actor = result.rows[0];
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  return actor.id;
}

async function createBacklog(client: PoolClient, prefix: string): Promise<string> {
  const key = `${prefix}${randomUUID().replaceAll("-", "").slice(0, 8)}`.toUpperCase();
  const result = await client.query<{ id: string }>(
    "insert into backlogs (key, name) values ($1, $2) returning id",
    [key, `Backlog ${prefix}`],
  );
  return result.rows[0]!.id;
}

async function createRelease(
  client: PoolClient,
  backlogId: string,
  createdBy: string,
  name: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    "insert into releases (backlog_id, name, created_by) values ($1, $2, $3) returning id",
    [backlogId, name, createdBy],
  );
  return result.rows[0]!.id;
}

async function createPublication(
  client: PoolClient,
  backlogId: string,
  releaseId: string,
  publishedBy: string,
  releaseName: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into release_publications
      (backlog_id, release_id, release_revision, release_name, effective_date,
       incomplete_disposition, published_by)
     values ($1, $2, 1, $3, '2026-08-07', 'keep', $4)
     returning id`,
    [backlogId, releaseId, releaseName, publishedBy],
  );
  return result.rows[0]!.id;
}

async function createTargetedSnapshots(client: PoolClient): Promise<{
  publicationId: string;
  snapshotId: string;
}> {
  const backlogId = await createBacklog(client, "DIRECTNULL");
  const actor = await actorId(client);
  const status = await client.query<{ id: string }>(
    `insert into statuses (backlog_id, name, category, "order", color)
     values ($1, 'À faire', 'todo', 0, '#123456') returning id`,
    [backlogId],
  );
  const itemId = randomUUID();
  await client.query(
    `insert into items
      (id, key, type, backlog_id, title, status_id, reporter_id, rank, path)
     values ($1, $2, 'composant', $3, 'Cible directe', $4, $5, $6, $7)`,
    [
      itemId,
      `NULL-${randomUUID().replaceAll("-", "").slice(0, 6)}`,
      backlogId,
      status.rows[0]!.id,
      actor,
      `rank-${randomUUID()}`,
      `root.${itemId.replaceAll("-", "")}`,
    ],
  );
  const sourceReleaseId = await createRelease(client, backlogId, actor, "6.0");
  const destinationReleaseId = await createRelease(client, backlogId, actor, "6.1");
  const publication = await client.query<{ id: string }>(
    `insert into release_publications
      (backlog_id, release_id, release_revision, release_name, effective_date,
       incomplete_disposition, destination_release_id, destination_release_name, published_by)
     values ($1, $2, 1, '6.0', '2026-08-07', 'move', $3, '6.1', $4)
     returning id`,
    [backlogId, sourceReleaseId, destinationReleaseId, actor],
  );
  const publicationId = publication.rows[0]!.id;
  const snapshot = await client.query<{ id: string }>(
    `insert into release_publication_items
      (publication_id, backlog_id, item_id, item_key, item_title, item_type, status_id,
       status_name, status_category, disposition, destination_release_id, destination_release_name)
     values ($1, $2, $3, 'NULL-1', 'Cible directe', 'composant', $4,
       'À faire', 'todo', 'moved', $5, '6.1')
     returning id`,
    [publicationId, backlogId, itemId, status.rows[0]!.id, destinationReleaseId],
  );
  return { publicationId, snapshotId: snapshot.rows[0]!.id };
}

afterAll(async () => {
  await pool.end();
});

describeDb("release persistence constraints", () => {
  it("uses same-backlog composite foreign keys for snapshot and event targets", async () => {
    const result = await pool.query<{ conname: string; definition: string }>(
      `select conname, pg_get_constraintdef(oid) as definition
       from pg_constraint
       where conname = any($1::text[])
       order by conname`,
      [[
        "release_events_publication_same_backlog_fk",
        "release_events_release_same_backlog_fk",
        "release_publication_items_item_same_backlog_fk",
        "release_publication_items_publication_same_backlog_fk",
        "release_publication_items_destination_same_backlog_fk",
        "release_publications_destination_same_backlog_fk",
        "release_publications_release_same_backlog_fk",
        "releases_driver_id_user_id_fk",
      ]],
    );

    expect(result.rows).toEqual([
      {
        conname: "release_events_publication_same_backlog_fk",
        definition: expect.stringMatching(
          /FOREIGN KEY \(backlog_id, publication_id\).*ON DELETE SET NULL \(publication_id\)/,
        ),
      },
      {
        conname: "release_events_release_same_backlog_fk",
        definition: expect.stringMatching(
          /FOREIGN KEY \(backlog_id, release_id\).*ON DELETE SET NULL \(release_id\)/,
        ),
      },
      {
        conname: "release_publication_items_destination_same_backlog_fk",
        definition: expect.stringMatching(
          /FOREIGN KEY \(backlog_id, destination_release_id\).*ON DELETE SET NULL \(destination_release_id\)/,
        ),
      },
      {
        conname: "release_publication_items_item_same_backlog_fk",
        definition: expect.stringMatching(
          /FOREIGN KEY \(backlog_id, item_id\).*ON DELETE SET NULL \(item_id\)/,
        ),
      },
      {
        conname: "release_publication_items_publication_same_backlog_fk",
        definition: expect.stringMatching(/FOREIGN KEY \(backlog_id, publication_id\).*ON DELETE RESTRICT/),
      },
      {
        conname: "release_publications_destination_same_backlog_fk",
        definition: expect.stringMatching(
          /FOREIGN KEY \(backlog_id, destination_release_id\).*ON DELETE SET NULL \(destination_release_id\)/,
        ),
      },
      {
        conname: "release_publications_release_same_backlog_fk",
        definition: expect.stringMatching(
          /FOREIGN KEY \(backlog_id, release_id\).*ON DELETE SET NULL \(release_id\)/,
        ),
      },
      {
        conname: "releases_driver_id_user_id_fk",
        definition: expect.stringMatching(/FOREIGN KEY \(driver_id\).*ON DELETE SET NULL/),
      },
    ]);
  });

  it("stores archive state and immutable historical labels", async () => {
    const result = await pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
       from information_schema.columns
       where table_schema = 'public'
         and (table_name, column_name) in (
           ('releases', 'archived_at'),
           ('releases', 'archived_by'),
           ('releases', 'released_at'),
           ('releases', 'released_by'),
           ('releases', 'effective_release_date'),
           ('release_publications', 'release_name'),
           ('release_publications', 'sequence'),
           ('release_publications', 'snapshot_sealed_at'),
           ('release_publications', 'unreleased_at'),
           ('release_publications', 'unreleased_by'),
           ('release_publication_items', 'completed'),
           ('release_publication_items', 'estimate_points'),
           ('release_publication_items', 'item_type'),
           ('release_publication_items', 'status_id'),
           ('release_publication_items', 'status_category'),
           ('release_publications', 'destination_release_name'),
           ('release_publication_items', 'item_key'),
           ('release_publication_items', 'item_title'),
           ('release_publication_items', 'status_name'),
           ('release_publication_items', 'destination_release_name'),
           ('release_events', 'actor_label'),
           ('release_events', 'release_name'),
           ('releases', 'driver_id')
         )
       order by table_name, column_name`,
    );

    expect(result.rows).toEqual([
      { table_name: "release_events", column_name: "actor_label" },
      { table_name: "release_events", column_name: "release_name" },
      { table_name: "release_publication_items", column_name: "completed" },
      { table_name: "release_publication_items", column_name: "destination_release_name" },
      { table_name: "release_publication_items", column_name: "estimate_points" },
      { table_name: "release_publication_items", column_name: "item_key" },
      { table_name: "release_publication_items", column_name: "item_title" },
      { table_name: "release_publication_items", column_name: "item_type" },
      { table_name: "release_publication_items", column_name: "status_category" },
      { table_name: "release_publication_items", column_name: "status_id" },
      { table_name: "release_publication_items", column_name: "status_name" },
      { table_name: "release_publications", column_name: "destination_release_name" },
      { table_name: "release_publications", column_name: "release_name" },
      { table_name: "release_publications", column_name: "sequence" },
      { table_name: "release_publications", column_name: "snapshot_sealed_at" },
      { table_name: "release_publications", column_name: "unreleased_at" },
      { table_name: "release_publications", column_name: "unreleased_by" },
      { table_name: "releases", column_name: "archived_at" },
      { table_name: "releases", column_name: "archived_by" },
      { table_name: "releases", column_name: "driver_id" },
      { table_name: "releases", column_name: "effective_release_date" },
      { table_name: "releases", column_name: "released_at" },
      { table_name: "releases", column_name: "released_by" },
    ]);
  });

  it("stores assignment provenance and enforces normalized release names", async () => {
    const provenance = await pool.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'item_fix_versions'
         and column_name in ('added_at', 'added_by')
       order by column_name`,
    );
    expect(provenance.rows).toEqual([
      { column_name: "added_at" },
      { column_name: "added_by" },
    ]);

    await transaction(async (client) => {
      const backlogId = await createBacklog(client, "TRIMNAME");
      const createdBy = await actorId(client);
      await expectStatementRejected(
        client,
        "insert into releases (backlog_id, name, created_by) values ($1, '   ', $2)",
        [backlogId, createdBy],
      );
      await createRelease(client, backlogId, createdBy, "Version 1");
      await expectStatementRejected(
        client,
        "insert into releases (backlog_id, name, created_by) values ($1, ' version 1 ', $2)",
        [backlogId, createdBy],
      );
    });
  });

  it("enforces all-or-none active publication fields", async () => {
    await transaction(async (client) => {
      const backlogId = await createBacklog(client, "CURRENTSTATE");
      const actor = await actorId(client);
      await expectStatementRejected(
        client,
        `insert into releases
          (backlog_id, name, created_by, released_at)
         values ($1, 'Partial released state', $2, current_timestamp)`,
        [backlogId, actor],
      );
      await expect(
        client.query(
          `insert into releases
            (backlog_id, name, created_by, released_at, released_by, effective_release_date)
           values ($1, 'Complete released state', $2, current_timestamp, $2, '2026-08-07')`,
          [backlogId, actor],
        ),
      ).resolves.toBeTruthy();
    });
  });

  it("seals completed publication snapshots against late inserts", async () => {
    await transaction(async (client) => {
      const backlogId = await createBacklog(client, "SEALED");
      const actor = await actorId(client);
      const releaseId = await createRelease(client, backlogId, actor, "Sealed 1.0");
      const publicationId = await createPublication(
        client,
        backlogId,
        releaseId,
        actor,
        "Sealed 1.0",
      );
      await client.query(
        `insert into release_publication_items
          (publication_id, backlog_id, item_key, item_title, item_type, status_id,
           status_name, status_category, disposition)
         values ($1, $2, 'SEALED-1', 'Initial snapshot', 'tache', $3,
           'Terminé', 'done', 'retained')`,
        [publicationId, backlogId, randomUUID()],
      );
      await client.query(
        "update release_publications set snapshot_sealed_at = current_timestamp where id = $1",
        [publicationId],
      );
      await expectStatementRejected(
        client,
        `insert into release_publication_items
          (publication_id, backlog_id, item_key, item_title, item_type, status_id,
           status_name, status_category, disposition)
         values ($1, $2, 'SEALED-2', 'Late snapshot', 'tache', $3,
           'Terminé', 'done', 'retained')`,
        [publicationId, backlogId, randomUUID()],
      );
    });
  });

  it("protects release events as append-only while allowing FK nullification", async () => {
    await transaction(async (client) => {
      const backlogId = await createBacklog(client, "EVENTLEDGER");
      const actor = await actorId(client);
      const releaseId = await createRelease(client, backlogId, actor, "Ledger 1.0");
      const event = await client.query<{ id: string }>(
        `insert into release_events
          (backlog_id, release_id, release_name, actor_id, actor_label, action)
         values ($1, $2, 'Ledger 1.0', $3, 'Historical actor', 'release_created')
         returning id`,
        [backlogId, releaseId, actor],
      );
      const eventId = event.rows[0]!.id;
      await expectStatementRejected(
        client,
        "update release_events set actor_label = 'Altered' where id = $1",
        [eventId],
      );
      await expectStatementRejected(client, "delete from release_events where id = $1", [eventId]);
      await client.query("delete from releases where id = $1", [releaseId]);
      await expect(
        client.query<{ release_id: string | null }>(
          "select release_id from release_events where id = $1",
          [eventId],
        ),
      ).resolves.toMatchObject({ rows: [{ release_id: null }] });
    });
  });

  it("preserves release events after their backlog is deleted", async () => {
    await transaction(async (client) => {
      const backlogId = await createBacklog(client, "EVENTBACKLOG");
      const actor = await actorId(client);
      const releaseId = await createRelease(client, backlogId, actor, "Deleted backlog release");
      const event = await client.query<{ id: string }>(
        `insert into release_events
          (backlog_id, release_id, release_name, actor_id, actor_label, action)
         values ($1, $2, 'Deleted backlog release', $3, 'Historical actor', 'release_created')
         returning id`,
        [backlogId, releaseId, actor],
      );
      await client.query("delete from backlogs where id = $1", [backlogId]);
      await expect(
        client.query<{ backlog_id: string | null; release_id: string | null }>(
          "select backlog_id, release_id from release_events where id = $1",
          [event.rows[0]!.id],
        ),
      ).resolves.toMatchObject({ rows: [{ backlog_id: null, release_id: null }] });
    });
  });

  it("allows a release date without a start date", async () => {
    await transaction(async (client) => {
      const backlogId = await createBacklog(client, "DATE");
      const createdBy = await actorId(client);
      await expect(
        client.query(
          `insert into releases
            (backlog_id, name, release_date, archived_at, archived_by, created_by)
           values ($1, '1.0', '2026-08-07', '2026-08-08T09:00:00Z', $2, $2)`,
          [backlogId, createdBy],
        ),
      ).resolves.toBeTruthy();
    });
  });

  it("constrains unreleasedAt to follow publishedAt", async () => {
    const result = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
       from pg_constraint
       where conname = 'release_publications_unreleased_order'`,
    );
    expect(result.rows).toEqual([
      { definition: expect.stringMatching(/unreleased_at.*published_at/) },
    ]);
  });

  it("retains snapshot labels after mutable targets are deleted", async () => {
    await transaction(async (client) => {
      const backlogId = await createBacklog(client, "HISTORY");
      const actor = await actorId(client);
      const status = await client.query<{ id: string }>(
        `insert into statuses (backlog_id, name, category, "order", color)
         values ($1, 'Terminé', 'done', 0, '#123456') returning id`,
        [backlogId],
      );
      const itemId = randomUUID();
      const itemKey = `HIST-${randomUUID().replaceAll("-", "").slice(0, 6)}`;
      await client.query(
        `insert into items
          (id, key, type, backlog_id, title, status_id, reporter_id, rank, path)
         values ($1, $2, 'composant', $3, 'Titre historique', $4, $5, $6, $7)`,
        [
          itemId,
          itemKey,
          backlogId,
          status.rows[0]!.id,
          actor,
          `rank-${randomUUID()}`,
          `root.${itemId.replaceAll("-", "")}`,
        ],
      );
      const releaseId = await createRelease(client, backlogId, actor, "3.0");
      const publicationId = await createPublication(client, backlogId, releaseId, actor, "3.0");
      await client.query(
        `insert into release_publication_items
          (publication_id, backlog_id, item_id, item_key, item_title, item_type, status_id,
           status_name, status_category, disposition)
         values ($1, $2, $3, $4, 'Titre historique', 'composant', $5,
           'Terminé', 'done', 'retained')`,
        [publicationId, backlogId, itemId, itemKey, status.rows[0]!.id],
      );
      await client.query(
        `insert into release_events
          (backlog_id, release_id, publication_id, release_name, actor_id, actor_label, action)
         values ($1, $2, $3, '3.0', $4, 'Historical actor', 'release_published')`,
        [backlogId, releaseId, publicationId, actor],
      );

      await client.query("delete from items where id = $1", [itemId]);
      await client.query("delete from releases where id = $1", [releaseId]);

      const snapshot = await client.query(
        `select publication_id, item_id, item_key, item_title, status_name
         from release_publication_items where publication_id = $1`,
        [publicationId],
      );
      expect(snapshot.rows).toEqual([
        {
          publication_id: publicationId,
          item_id: null,
          item_key: itemKey,
          item_title: "Titre historique",
          status_name: "Terminé",
        },
      ]);
      const publication = await client.query(
        "select release_id, release_name from release_publications where id = $1",
        [publicationId],
      );
      expect(publication.rows).toEqual([{ release_id: null, release_name: "3.0" }]);
      const event = await client.query(
        "select release_id, release_name from release_events where publication_id = $1",
        [publicationId],
      );
      expect(event.rows).toEqual([{ release_id: null, release_name: "3.0" }]);

      await expect(
        client.query("delete from release_publications where id = $1", [publicationId]),
      ).rejects.toBeTruthy();
    });
  });

  it("retains destination labels after the destination release is deleted", async () => {
    await transaction(async (client) => {
      const backlogId = await createBacklog(client, "DEST");
      const actor = await actorId(client);
      const sourceReleaseId = await createRelease(client, backlogId, actor, "4.0");
      const destinationReleaseId = await createRelease(client, backlogId, actor, "4.1");
      const publication = await client.query<{ id: string }>(
        `insert into release_publications
          (backlog_id, release_id, release_revision, release_name, effective_date,
           incomplete_disposition, destination_release_id, destination_release_name, published_by)
         values ($1, $2, 1, '4.0', '2026-08-07', 'move', $3, '4.1', $4)
         returning id`,
        [backlogId, sourceReleaseId, destinationReleaseId, actor],
      );
      const publicationId = publication.rows[0]!.id;
      await client.query(
        `insert into release_publication_items
          (publication_id, backlog_id, item_key, item_title, item_type, status_id,
           status_name, status_category, disposition, destination_release_id,
           destination_release_name)
         values ($1, $2, 'DEST-1', 'Item déplacé', 'tache', $3,
           'À faire', 'todo', 'moved', $4, '4.1')`,
        [publicationId, backlogId, randomUUID(), destinationReleaseId],
      );

      await expect(
        client.query("delete from releases where id = $1", [destinationReleaseId]),
      ).resolves.toBeTruthy();

      const publicationHistory = await client.query(
        `select destination_release_id, destination_release_name
         from release_publications where id = $1`,
        [publicationId],
      );
      expect(publicationHistory.rows).toEqual([
        { destination_release_id: null, destination_release_name: "4.1" },
      ]);
      const itemHistory = await client.query(
        `select destination_release_id, destination_release_name
         from release_publication_items where publication_id = $1`,
        [publicationId],
      );
      expect(itemHistory.rows).toEqual([
        { destination_release_id: null, destination_release_name: "4.1" },
      ]);
    });
  });

  it("rejects direct snapshot mutation and deletion", async () => {
    await transaction(async (client) => {
      const backlogId = await createBacklog(client, "IMMUTABLE");
      const actor = await actorId(client);
      const releaseId = await createRelease(client, backlogId, actor, "5.0");
      const publicationId = await createPublication(client, backlogId, releaseId, actor, "5.0");
      const snapshot = await client.query<{ id: string }>(
        `insert into release_publication_items
          (publication_id, backlog_id, item_key, item_title, item_type, status_id,
           status_name, status_category, disposition)
         values ($1, $2, 'IMM-1', 'Titre figé', 'tache', $3,
           'Terminé', 'done', 'retained')
         returning id`,
        [publicationId, backlogId, randomUUID()],
      );
      const snapshotId = snapshot.rows[0]!.id;

      await expectStatementRejected(
        client,
        "update release_publications set release_name = 'Altéré' where id = $1",
        [publicationId],
      );
      await expectStatementRejected(
        client,
        "update release_publication_items set item_title = 'Altéré' where id = $1",
        [snapshotId],
      );
      await expectStatementRejected(
        client,
        "delete from release_publication_items where id = $1",
        [snapshotId],
      );

      const emptyReleaseId = await createRelease(client, backlogId, actor, "5.1");
      const emptyPublicationId = await createPublication(
        client,
        backlogId,
        emptyReleaseId,
        actor,
        "5.1",
      );
      await expectStatementRejected(
        client,
        "delete from release_publications where id = $1",
        [emptyPublicationId],
      );

      await expect(
        client.query(
          `update release_publications
           set unreleased_at = published_at, unreleased_by = $2
           where id = $1`,
          [publicationId, actor],
        ),
      ).resolves.toBeTruthy();
    });
  });

  it.each([
    ["release_publications.release_id", "release_publications", "release_id", "publicationId"],
    [
      "release_publications.destination_release_id",
      "release_publications",
      "destination_release_id",
      "publicationId",
    ],
    ["release_publication_items.item_id", "release_publication_items", "item_id", "snapshotId"],
    [
      "release_publication_items.destination_release_id",
      "release_publication_items",
      "destination_release_id",
      "snapshotId",
    ],
  ] as const)("rejects direct nullification of %s", async (_label, table, column, idKey) => {
    await transaction(async (client) => {
      const fixture = await createTargetedSnapshots(client);
      await expectStatementRejected(
        client,
        `update ${table} set ${column} = null where id = $1`,
        [fixture[idKey]],
      );
    });
  });
});
