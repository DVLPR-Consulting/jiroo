import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DIRECT_DATABASE_URL });

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
        "release_publications_release_same_backlog_fk",
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
        conname: "release_publications_release_same_backlog_fk",
        definition: expect.stringMatching(
          /FOREIGN KEY \(backlog_id, release_id\).*ON DELETE SET NULL \(release_id\)/,
        ),
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
           ('release_publications', 'release_name'),
           ('release_publication_items', 'item_key'),
           ('release_publication_items', 'item_title'),
           ('release_publication_items', 'status_name'),
           ('release_events', 'release_name')
         )
       order by table_name, column_name`,
    );

    expect(result.rows).toEqual([
      { table_name: "release_events", column_name: "release_name" },
      { table_name: "release_publication_items", column_name: "item_key" },
      { table_name: "release_publication_items", column_name: "item_title" },
      { table_name: "release_publication_items", column_name: "status_name" },
      { table_name: "release_publications", column_name: "release_name" },
      { table_name: "releases", column_name: "archived_at" },
    ]);
  });

  it("allows a release date without a start date", async () => {
    await transaction(async (client) => {
      const backlogId = await createBacklog(client, "DATE");
      const createdBy = await actorId(client);
      await expect(
        client.query(
          `insert into releases (backlog_id, name, release_date, archived_at, created_by)
           values ($1, '1.0', '2026-08-07', '2026-08-08T09:00:00Z', $2)`,
          [backlogId, createdBy],
        ),
      ).resolves.toBeTruthy();
    });
  });

  it("constrains supersededAt to follow publishedAt", async () => {
    const result = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
       from pg_constraint
       where conname = 'release_publications_superseded_order'`,
    );
    expect(result.rows).toEqual([
      { definition: expect.stringMatching(/superseded_at.*published_at/) },
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
          (publication_id, backlog_id, item_id, item_key, item_title, status_name, disposition)
         values ($1, $2, $3, $4, 'Titre historique', 'Terminé', 'retained')`,
        [publicationId, backlogId, itemId, itemKey],
      );
      await client.query(
        `insert into release_events
          (backlog_id, release_id, publication_id, release_name, actor_id, action)
         values ($1, $2, $3, '3.0', $4, 'published')`,
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
});
