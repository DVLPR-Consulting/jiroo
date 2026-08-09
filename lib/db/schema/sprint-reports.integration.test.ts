import "dotenv/config";

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { withSprintHistoryCleanup } from "@/test-utils/sprint-history-cleanup";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DIRECT_DATABASE_URL });
let savepointSequence = 0;

type Fixture = {
  actorId: string;
  backlogId: string;
  foreignBacklogId: string;
  sprintId: string;
  relatedSprintId: string;
  foreignSprintId: string;
  itemId: string;
  foreignItemId: string;
  membershipId: string;
  foreignMembershipId: string;
};

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

async function expectActionRejected(
  client: PoolClient,
  action: () => Promise<unknown>,
): Promise<void> {
  const savepoint = `expected_rejection_${savepointSequence++}`;
  await client.query(`savepoint ${savepoint}`);
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
  expect(rejected).toBe(true);
}

async function expectStatementRejected(
  client: PoolClient,
  statement: string,
  values: unknown[] = [],
): Promise<void> {
  await expectActionRejected(client, () => client.query(statement, values));
}

async function actorId(client: PoolClient): Promise<string> {
  const result = await client.query<{ id: string }>('select "id" from "user" limit 1');
  const actor = result.rows[0];
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  return actor.id;
}

async function createBacklog(client: PoolClient, prefix: string): Promise<string> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const result = await client.query<{ id: string }>(
    "insert into backlogs (key, name) values ($1, $2) returning id",
    [`${prefix}${suffix}`, `Backlog ${prefix}`],
  );
  return result.rows[0]!.id;
}

async function createSprint(
  client: PoolClient,
  backlogId: string,
  createdBy: string,
  name: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into sprints (backlog_id, name, rank, created_by)
     values ($1, $2, $3, $4) returning id`,
    [backlogId, name, `rank-${randomUUID()}`, createdBy],
  );
  return result.rows[0]!.id;
}

async function createItem(
  client: PoolClient,
  backlogId: string,
  reporterId: string,
  prefix: string,
): Promise<string> {
  const status = await client.query<{ id: string }>(
    `insert into statuses (backlog_id, name, category, "order", color)
     values ($1, $2, 'todo', 0, '#64748b') returning id`,
    [backlogId, `À faire ${prefix}`],
  );
  const id = randomUUID();
  await client.query(
    `insert into items
      (id, key, type, kind, backlog_id, title, status_id, reporter_id, rank, path)
     values ($1, $2, 'tache', 'feature', $3, $4, $5, $6, $7, $8)`,
    [
      id,
      `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 8)}`.toUpperCase(),
      backlogId,
      `Item ${prefix}`,
      status.rows[0]!.id,
      reporterId,
      `rank-${randomUUID()}`,
      `root.${id.replaceAll("-", "")}`,
    ],
  );
  return id;
}

async function createMembership(
  client: PoolClient,
  sprintId: string,
  itemId: string,
  joinedBy: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into sprint_items (sprint_id, item_id, joined_by, estimate_at_join)
     values ($1, $2, $3, 3) returning id`,
    [sprintId, itemId, joinedBy],
  );
  return result.rows[0]!.id;
}

async function createFixture(client: PoolClient): Promise<Fixture> {
  const actor = await actorId(client);
  const backlogId = await createBacklog(client, "SPRPT");
  const foreignBacklogId = await createBacklog(client, "FOREIGN");
  const sprintId = await createSprint(client, backlogId, actor, "Sprint source");
  const relatedSprintId = await createSprint(client, backlogId, actor, "Sprint destination");
  const foreignSprintId = await createSprint(client, foreignBacklogId, actor, "Sprint étranger");
  const itemId = await createItem(client, backlogId, actor, "LOCAL");
  const foreignItemId = await createItem(client, foreignBacklogId, actor, "FOREIGN");
  const membershipId = await createMembership(client, sprintId, itemId, actor);
  const foreignMembershipId = await createMembership(
    client,
    foreignSprintId,
    foreignItemId,
    actor,
  );
  return {
    actorId: actor,
    backlogId,
    foreignBacklogId,
    sprintId,
    relatedSprintId,
    foreignSprintId,
    itemId,
    foreignItemId,
    membershipId,
    foreignMembershipId,
  };
}

async function insertEvent(
  client: PoolClient,
  fixture: Fixture,
  correlationId = "schema-contract",
  sprintId = fixture.sprintId,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into sprint_events
      (backlog_id, sprint_id, event_type, actor_id, request_correlation_id,
       occurred_at, item_id, item_key, item_title, previous_estimate, next_estimate)
     values ($1, $2, 'estimate_changed', $3, $4, '2026-08-07T12:00:00Z',
       $5, 'SPRPT-1', 'Stable title', 3, 5)
     returning id`,
    [
      fixture.backlogId,
      sprintId,
      fixture.actorId,
      correlationId,
      fixture.itemId,
    ],
  );
  return result.rows[0]!.id;
}

async function insertSnapshot(
  client: PoolClient,
  fixture: Fixture,
  snapshotId = randomUUID(),
  correlationId = "snapshot-contract",
): Promise<string> {
  await client.query(
    `insert into sprint_report_snapshots
      (id, backlog_id, sprint_id, sprint_name, sprint_goal,
       planned_start_at, planned_end_at, started_at, completed_at, created_by,
       initial_item_count, committed_points, initial_unestimated_count,
       final_item_count, completed_item_count, completed_points, final_unestimated_count,
       gross_points_added, gross_points_removed, net_estimate_delta, scope_event_count,
       final_destination_summary, request_correlation_id)
     values ($1, $2, $3, 'Sprint source', 'Livrer le rapport',
       '2026-08-01T09:00:00Z', '2026-08-14T17:00:00Z',
       '2026-08-01T09:00:00Z', '2026-08-14T16:00:00Z', $4,
       1, 3, 0, 1, 1, 5, 0, 2, 0, 2, 1,
       '{"backlog":0,"sprints":[]}'::jsonb, $5)`,
    [snapshotId, fixture.backlogId, fixture.sprintId, fixture.actorId, correlationId],
  );
  return snapshotId;
}

async function insertSnapshotItem(
  client: PoolClient,
  fixture: Fixture,
  snapshotId: string,
  itemKey = "SPRPT-1",
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into sprint_report_items
      (snapshot_id, backlog_id, sprint_id, source_item_id, item_key, item_title,
       item_type, item_kind, first_joined_at, final_left_at, initial_commitment,
       added_after_start, removed_after_start, estimate_at_start,
       estimate_at_final_participation, estimate_at_completion,
       final_status_category, final_outcome)
     values ($1, $2, $3, $4, $5, 'Stable title', 'tache', 'feature',
       '2026-08-01T09:00:00Z', '2026-08-14T16:00:00Z', true,
       false, false, 3, 5, 5, 'done', 'completed')
     returning id`,
    [snapshotId, fixture.backlogId, fixture.sprintId, fixture.itemId, itemKey],
  );
  return result.rows[0]!.id;
}

async function restorePreBurndownSchema(client: PoolClient): Promise<void> {
  const result = await client.query<{ definition: string }>(
    `select pg_get_constraintdef(oid) as definition
     from pg_constraint
     where conrelid = 'sprint_events'::regclass and conname = 'sprint_events_shape'`,
  );
  const definition = result.rows[0]?.definition;
  if (!definition) throw new Error("La contrainte sprint_events_shape doit exister.");

  await client.query('alter table sprint_events drop constraint "sprint_events_shape"');
  await client.query(
    `alter table sprint_events add constraint "sprint_events_shape" ${definition
      .replace("next_done IS NOT NULL", "next_done IS NULL")
      .replace(" NOT VALID", "")}`,
  );
  await client.query(
    'alter table sprint_report_items drop constraint "sprint_report_items_done_at_start_consistent"',
  );
  await client.query("alter table sprint_items drop column done_at_start");
  await client.query("alter table sprint_report_items drop column done_at_start");
}

async function applySprintBurndownMigration(client: PoolClient): Promise<void> {
  const migration = await readFile(
    resolve(process.cwd(), "drizzle/0013_jira_sprint_burndown.sql"),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.query(statement);
  }
}

afterAll(async () => {
  await pool.end();
});

describeDb("sprint reporting schema", () => {
  it("rejects an estimate event without stable item identity", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      await expectStatementRejected(
        client,
        `insert into sprint_events
          (backlog_id, sprint_id, event_type, actor_id, request_correlation_id,
           occurred_at, previous_estimate, next_estimate)
         values ($1, $2, 'estimate_changed', $3, 'schema-red', now(), 3, 5)`,
        [fixture.backlogId, fixture.sprintId, fixture.actorId],
      );
    });
  });

  it("requires done state on every new active-sprint addition", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      await client.query(
        "update sprints set state = 'active', started_at = now() where id = $1",
        [fixture.sprintId],
      );
      const statement = `insert into sprint_events
        (backlog_id, sprint_id, event_type, source_membership_id, item_id,
         item_key, item_title, actor_id, request_correlation_id, occurred_at,
         next_estimate, next_done)
       values ($1, $2, 'item_added', $3, $4, 'CASS-1', 'Task', $5, $6, now(), 5, $7)`;

      await expectStatementRejected(
        client,
        `insert into sprint_events
          (backlog_id, sprint_id, event_type, source_membership_id, item_id,
           item_key, item_title, actor_id, request_correlation_id, occurred_at,
           next_estimate)
         values ($1, $2, 'item_added', $3, $4, 'CASS-1', 'Task', $5, $6, now(), 5)`,
        [
          fixture.backlogId,
          fixture.sprintId,
          fixture.membershipId,
          fixture.itemId,
          fixture.actorId,
          "burndown-red-null",
        ],
      );
      await expect(
        client.query(statement, [
          fixture.backlogId,
          fixture.sprintId,
          fixture.membershipId,
          fixture.itemId,
          fixture.actorId,
          "burndown-red-false",
          false,
        ]),
      ).resolves.toBeDefined();
      await expect(
        client.query(statement, [
          fixture.backlogId,
          fixture.sprintId,
          fixture.membershipId,
          fixture.itemId,
          fixture.actorId,
          "burndown-red-true",
          true,
        ]),
      ).resolves.toBeDefined();
    });
  });

  it("keeps done state nullable for planned memberships", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      await expect(
        client.query<{ doneAtStart: boolean | null }>(
          "select done_at_start as \"doneAtStart\" from sprint_items where id = $1",
          [fixture.membershipId],
        ),
      ).resolves.toMatchObject({ rows: [{ doneAtStart: null }] });
    });
  });

  it("stores both boolean done states for active memberships", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      await client.query(
        "update sprints set state = 'active', started_at = now() where id = $1",
        [fixture.sprintId],
      );
      const secondItemId = await createItem(client, fixture.backlogId, fixture.actorId, "SECOND");
      const secondMembershipId = await createMembership(
        client,
        fixture.sprintId,
        secondItemId,
        fixture.actorId,
      );
      await client.query("update sprint_items set done_at_start = false where id = $1", [
        fixture.membershipId,
      ]);
      await client.query("update sprint_items set done_at_start = true where id = $1", [
        secondMembershipId,
      ]);

      await expect(
        client.query<{ doneAtStart: boolean }>(
          `select done_at_start as "doneAtStart" from sprint_items
           where id in ($1, $2) order by done_at_start`,
          [fixture.membershipId, secondMembershipId],
        ),
      ).resolves.toMatchObject({ rows: [{ doneAtStart: false }, { doneAtStart: true }] });
    });
  });

  it("preserves null done facts when migrating a legacy sprint history", async () => {
    await transaction(async (client) => {
      await restorePreBurndownSchema(client);
      const fixture = await createFixture(client);
      const snapshotId = randomUUID();
      const reportItemId = await insertSnapshotItem(client, fixture, snapshotId, "LEGACY-DONE");
      await insertSnapshot(client, fixture, snapshotId, "legacy-null");
      await client.query("set constraints all immediate");
      const legacyEvent = await client.query<{ id: string }>(
        `insert into sprint_events
          (backlog_id, sprint_id, event_type, source_membership_id, item_id,
           item_key, item_title, actor_id, request_correlation_id, occurred_at,
           next_estimate)
         values ($1, $2, 'item_added', $3, $4, 'CASS-1', 'Task', $5, 'legacy-null', now(), 5)
         returning id`,
        [
          fixture.backlogId,
          fixture.sprintId,
          fixture.membershipId,
          fixture.itemId,
          fixture.actorId,
        ],
      );

      await applySprintBurndownMigration(client);

      await expect(
        client.query<{ doneAtStart: boolean | null }>(
          "select done_at_start as \"doneAtStart\" from sprint_report_items where id = $1",
          [reportItemId],
        ),
      ).resolves.toMatchObject({ rows: [{ doneAtStart: null }] });
      await expect(
        client.query<{ doneAtStart: boolean | null }>(
          "select done_at_start as \"doneAtStart\" from sprint_items where id = $1",
          [fixture.membershipId],
        ),
      ).resolves.toMatchObject({ rows: [{ doneAtStart: null }] });
      await expect(
        client.query<{ nextDone: boolean | null }>(
          "select next_done as \"nextDone\" from sprint_events where id = $1",
          [legacyEvent.rows[0]!.id],
        ),
      ).resolves.toMatchObject({ rows: [{ nextDone: null }] });
    });
  });

  it("allows report done state only for an initial commitment", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      const snapshotId = randomUUID();
      const initialStatement = `insert into sprint_report_items
        (snapshot_id, backlog_id, sprint_id, source_item_id, item_key, item_title,
         item_type, item_kind, first_joined_at, final_left_at, initial_commitment,
         added_after_start, removed_after_start, done_at_start, final_status_category,
         final_outcome)
       values ($1, $2, $3, $4, $5, 'Initial item', 'tache', 'feature',
         now(), now(), true, false, false, $6, 'todo', 'carried_to_backlog')`;
      await client.query(initialStatement, [
        snapshotId,
        fixture.backlogId,
        fixture.sprintId,
        fixture.itemId,
        "INITIAL-FALSE",
        false,
      ]);
      await client.query(initialStatement, [
        snapshotId,
        fixture.backlogId,
        fixture.sprintId,
        fixture.itemId,
        "INITIAL-TRUE",
        true,
      ]);
      await expectStatementRejected(
        client,
        `insert into sprint_report_items
          (snapshot_id, backlog_id, sprint_id, source_item_id, item_key, item_title,
           item_type, item_kind, first_joined_at, final_left_at, initial_commitment,
           added_after_start, removed_after_start, done_at_start, final_status_category,
           final_outcome)
         values ($1, $2, $3, $4, 'ADDED-DONE', 'Added item', 'tache', 'feature',
           now(), now(), false, true, false, false, 'todo', 'carried_to_backlog')`,
        [snapshotId, fixture.backlogId, fixture.sprintId, fixture.itemId],
      );
      await insertSnapshot(client, fixture, snapshotId, "initial-done-states");
      await client.query("set constraints all immediate");
    });
  });

  it("orders equal timestamps by a global increasing sequence", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      await insertEvent(client, fixture, "sequence-first");
      await insertEvent(client, fixture, "sequence-second", fixture.relatedSprintId);
      const rows = await client.query<{ sequence: string }>(
        `select sequence from sprint_events
         where request_correlation_id in ('sequence-first', 'sequence-second')
         order by occurred_at, sequence`,
      );
      const sequences = rows.rows.map((row) => BigInt(row.sequence));
      expect(sequences).toHaveLength(2);
      expect(sequences).toEqual([...sequences].sort((a, b) => (a < b ? -1 : 1)));
      expect(sequences[1]! > sequences[0]!).toBe(true);
    });
  });

  it("rejects every cross-backlog sprint, membership, item, and related sprint event link", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      const base = `insert into sprint_events
        (backlog_id, sprint_id, event_type, actor_id, request_correlation_id,
         occurred_at, item_id, source_membership_id, item_key, item_title,
         previous_estimate, next_estimate, related_sprint_id, related_sprint_name)`;

      await expectStatementRejected(
        client,
        `${base} values ($1, $2, 'estimate_changed', $3, 'foreign-sprint', now(),
          $4, null, 'FOREIGN-1', 'Foreign', 1, 2, null, null)`,
        [fixture.backlogId, fixture.foreignSprintId, fixture.actorId, fixture.itemId],
      );
      await expectStatementRejected(
        client,
        `${base} values ($1, $2, 'estimate_changed', $3, 'foreign-membership', now(),
          $4, $5, 'LOCAL-1', 'Local', 1, 2, null, null)`,
        [
          fixture.backlogId,
          fixture.sprintId,
          fixture.actorId,
          fixture.itemId,
          fixture.foreignMembershipId,
        ],
      );
      await expectStatementRejected(
        client,
        `${base} values ($1, $2, 'estimate_changed', $3, 'foreign-item', now(),
          $4, null, 'FOREIGN-1', 'Foreign', 1, 2, null, null)`,
        [fixture.backlogId, fixture.sprintId, fixture.actorId, fixture.foreignItemId],
      );
      await expectStatementRejected(
        client,
        `${base} values ($1, $2, 'estimate_changed', $3, 'foreign-related', now(),
          $4, null, 'LOCAL-1', 'Local', 1, 2, $5, 'Foreign sprint')`,
        [
          fixture.backlogId,
          fixture.sprintId,
          fixture.actorId,
          fixture.itemId,
          fixture.foreignSprintId,
        ],
      );
    });
  });

  it("rejects cross-backlog report header, source item, destination sprint, and snapshot links", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      await expectActionRejected(client, () =>
        insertSnapshot(
          client,
          { ...fixture, backlogId: fixture.foreignBacklogId },
          randomUUID(),
          "foreign-header",
        ),
      );

      const sourceItemSnapshotId = randomUUID();
      await expectStatementRejected(
        client,
        `insert into sprint_report_items
          (snapshot_id, backlog_id, sprint_id, source_item_id, item_key, item_title,
           item_type, item_kind, first_joined_at, final_left_at, initial_commitment,
           added_after_start, removed_after_start, final_status_category, final_outcome)
         values ($1, $2, $3, $4, 'FOREIGN-ITEM', 'Foreign item', 'tache', 'feature',
           now(), now(), false, true, false, 'todo', 'carried_to_backlog')`,
        [
          sourceItemSnapshotId,
          fixture.backlogId,
          fixture.sprintId,
          fixture.foreignItemId,
        ],
      );

      const destinationSnapshotId = randomUUID();
      await expectStatementRejected(
        client,
        `insert into sprint_report_items
          (snapshot_id, backlog_id, sprint_id, source_item_id, item_key, item_title,
           item_type, item_kind, first_joined_at, final_left_at, initial_commitment,
           added_after_start, removed_after_start, final_status_category, final_outcome,
           destination_sprint_id, destination_sprint_name)
         values ($1, $2, $3, $4, 'FOREIGN-DEST', 'Foreign destination', 'tache', 'feature',
           now(), now(), false, true, false, 'todo', 'carried_to_sprint', $5, 'Foreign sprint')`,
        [
          destinationSnapshotId,
          fixture.backlogId,
          fixture.sprintId,
          fixture.itemId,
          fixture.foreignSprintId,
        ],
      );

      const foreignSnapshotId = randomUUID();
      await insertSnapshotItem(client, fixture, foreignSnapshotId, "CROSS-SNAPSHOT");
      await insertSnapshot(
        client,
        {
          ...fixture,
          backlogId: fixture.foreignBacklogId,
          sprintId: fixture.foreignSprintId,
        },
        foreignSnapshotId,
        "foreign-snapshot",
      );
      await expectStatementRejected(
        client,
        "set constraints sprint_report_items_snapshot_same_sprint_fk immediate",
      );
    });
  });

  it("rejects empty and overlong event and report correlation identifiers", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      await expectActionRejected(client, () => insertEvent(client, fixture, ""));
      await expectActionRejected(client, () => insertEvent(client, fixture, "x".repeat(129)));
      await expectActionRejected(client, () => insertSnapshot(client, fixture, randomUUID(), ""));
      await expectActionRejected(client, () =>
        insertSnapshot(client, fixture, randomUUID(), "x".repeat(129)),
      );
    });
  });

  it("keeps report item keys unique within a snapshot", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      const snapshotId = randomUUID();
      await insertSnapshotItem(client, fixture, snapshotId, "SPRPT-UNIQUE");
      await expectActionRejected(client, () =>
        insertSnapshotItem(client, fixture, snapshotId, "SPRPT-UNIQUE"),
      );
    });
  });

  it("rejects ordinary updates and deletes on every history table", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      const eventId = await insertEvent(client, fixture);
      const snapshotId = randomUUID();
      const reportItemId = await insertSnapshotItem(client, fixture, snapshotId);
      await insertSnapshot(client, fixture, snapshotId);

      await expectStatementRejected(
        client,
        "update sprint_events set item_title = 'Altered' where id = $1",
        [eventId],
      );
      await expectStatementRejected(client, "delete from sprint_events where id = $1", [eventId]);
      await expectStatementRejected(
        client,
        "update sprint_report_snapshots set sprint_name = 'Altered' where id = $1",
        [snapshotId],
      );
      await expectStatementRejected(
        client,
        "delete from sprint_report_snapshots where id = $1",
        [snapshotId],
      );
      await expectStatementRejected(
        client,
        "update sprint_report_items set item_title = 'Altered' where id = $1",
        [reportItemId],
      );
      await expectStatementRejected(
        client,
        "delete from sprint_report_items where id = $1",
        [reportItemId],
      );
    });
  });

  it("rejects ordinary no-op updates on event and report item history", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      const eventId = await insertEvent(client, fixture, "no-op-event");
      const snapshotId = randomUUID();
      const reportItemId = await insertSnapshotItem(client, fixture, snapshotId, "NO-OP-ITEM");
      await insertSnapshot(client, fixture, snapshotId, "no-op-snapshot");

      await expectStatementRejected(
        client,
        "update sprint_events set item_title = item_title where id = $1",
        [eventId],
      );
      await expectStatementRejected(
        client,
        "update sprint_report_items set item_title = item_title where id = $1",
        [reportItemId],
      );
    });
  });

  it("rejects report items appended after their header is sealed", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      const snapshotId = await insertSnapshot(client, fixture);
      await expectActionRejected(client, () => insertSnapshotItem(client, fixture, snapshotId));
    });
  });

  it("serializes item insertion against concurrent snapshot sealing", async () => {
    const setupClient = await pool.connect();
    const itemClient = await pool.connect();
    const headerClient = await pool.connect();
    let fixture: Fixture | undefined;
    try {
      await setupClient.query("begin");
      fixture = await createFixture(setupClient);
      await setupClient.query("commit");

      const snapshotId = randomUUID();
      const backend = await headerClient.query<{ pid: number }>("select pg_backend_pid() as pid");
      const headerPid = backend.rows[0]!.pid;
      await itemClient.query("begin");
      await headerClient.query("begin");
      await insertSnapshotItem(itemClient, fixture, snapshotId, "CONCURRENT-ITEM");

      const headerInsert = insertSnapshot(
        headerClient,
        fixture,
        snapshotId,
        "concurrent-seal",
      );
      await expect
        .poll(async () => {
          const activity = await pool.query<{ wait_event: string | null }>(
            "select wait_event from pg_stat_activity where pid = $1",
            [headerPid],
          );
          return activity.rows[0]?.wait_event;
        })
        .toBe("advisory");

      await itemClient.query("rollback");
      await headerInsert;
      await headerClient.query("commit");

      await expect(
        setupClient.query<{ count: string }>(
          "select count(*) from sprint_report_items where snapshot_id = $1",
          [snapshotId],
        ),
      ).resolves.toMatchObject({ rows: [{ count: "0" }] });
    } finally {
      await itemClient.query("rollback").catch(() => undefined);
      await headerClient.query("rollback").catch(() => undefined);
      if (fixture) {
        await setupClient.query("begin");
        try {
          await withSprintHistoryCleanup(setupClient, async () => {
            await setupClient.query(
              "delete from sprint_report_items where backlog_id = any($1::uuid[])",
              [[fixture!.backlogId, fixture!.foreignBacklogId]],
            );
            await setupClient.query(
              "delete from sprint_report_snapshots where backlog_id = any($1::uuid[])",
              [[fixture!.backlogId, fixture!.foreignBacklogId]],
            );
          });
          await setupClient.query("delete from backlogs where id = any($1::uuid[])", [
            [fixture.backlogId, fixture.foreignBacklogId],
          ]);
          await setupClient.query("commit");
        } catch (error) {
          await setupClient.query("rollback");
          throw error;
        }
      }
      setupClient.release();
      itemClient.release();
      headerClient.release();
    }
  });

  it("allows only nested foreign-key nullification on historical item links", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      const event = await client.query<{ id: string }>(
        `insert into sprint_events
          (backlog_id, sprint_id, event_type, actor_id, request_correlation_id,
           occurred_at, source_membership_id, item_id, item_key, item_title,
           previous_estimate, next_estimate, related_sprint_id, related_sprint_name)
         values ($1, $2, 'estimate_changed', $3, 'fk-nullification', now(),
           $4, $5, 'LOCAL-1', 'Local', 3, 5, $6, 'Destination') returning id`,
        [
          fixture.backlogId,
          fixture.sprintId,
          fixture.actorId,
          fixture.membershipId,
          fixture.itemId,
          fixture.relatedSprintId,
        ],
      );
      const snapshotId = randomUUID();
      const reportItem = await client.query<{ id: string }>(
        `insert into sprint_report_items
          (snapshot_id, backlog_id, sprint_id, source_item_id, item_key, item_title,
           item_type, item_kind, first_joined_at, final_left_at, initial_commitment,
           added_after_start, removed_after_start, final_status_category, final_outcome,
           destination_sprint_id, destination_sprint_name)
         values ($1, $2, $3, $4, 'LOCAL-1', 'Local', 'tache', 'feature', now(), now(),
           true, false, false, 'todo', 'carried_to_sprint', $5, 'Destination') returning id`,
        [
          snapshotId,
          fixture.backlogId,
          fixture.sprintId,
          fixture.itemId,
          fixture.relatedSprintId,
        ],
      );
      await insertSnapshot(client, fixture, snapshotId);

      await client.query("delete from items where id = $1", [fixture.itemId]);
      await client.query("delete from sprints where id = $1", [fixture.relatedSprintId]);

      await expect(
        client.query(
          `select item_id, source_membership_id, related_sprint_id
           from sprint_events where id = $1`,
          [event.rows[0]!.id],
        ),
      ).resolves.toMatchObject({
        rows: [{ item_id: null, source_membership_id: null, related_sprint_id: null }],
      });
      await expect(
        client.query(
          `select source_item_id, destination_sprint_id
           from sprint_report_items where id = $1`,
          [reportItem.rows[0]!.id],
        ),
      ).resolves.toMatchObject({
        rows: [{ source_item_id: null, destination_sprint_id: null }],
      });
    });
  });

  it("lets the isolated privileged helper remove its own fixture", async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client);
      const eventId = await insertEvent(client, fixture, "cleanup-helper");
      await withSprintHistoryCleanup(client, async () => {
        await client.query("delete from sprint_events where id = $1", [eventId]);
      });
      await expect(
        client.query<{ count: string }>(
          "select count(*) from sprint_events where id = $1",
          [eventId],
        ),
      ).resolves.toMatchObject({ rows: [{ count: "0" }] });
    });
  });
});
