import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogStars,
  backlogs,
  items,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import {
  listAdminBacklogsForUser,
  listBacklogOverviewForUser,
  listBacklogsWithStarsForUser,
  setBacklogStar,
  updateBacklog,
} from "@/lib/services/backlogs";
import {
  createReadVisibilityFixture,
  deleteReadVisibilityFixture,
  type ReadVisibilityFixture,
} from "@/lib/services/read-visibility.integration-fixture";
import { withSprintHistoryCleanup } from "@/test-utils/sprint-history-cleanup";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Sprint events are append-only and restrict backlog deletion. */
async function deleteFixtureWithSprintHistory(fixture: ReadVisibilityFixture) {
  const client = await databasePool.connect();
  try {
    await client.query("begin");
    await withSprintHistoryCleanup(client, async () => {
      await client.query("delete from sprint_events where backlog_id = any($1::uuid[])", [
        [fixture.backlogA.id, fixture.backlogB.id],
      ]);
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  await deleteReadVisibilityFixture(fixture);
}

async function insertTask(
  fixture: ReadVisibilityFixture,
  input: {
    statusId: string;
    estimatePoints: number | null;
    type?: "tache" | "composant";
    deleted?: boolean;
  },
) {
  const id = randomUUID();
  const [row] = await db
    .insert(items)
    .values({
      id,
      key: `${fixture.backlogA.key}-${Math.floor(Math.random() * 1e9)}`,
      type: input.type ?? "tache",
      backlogId: fixture.backlogA.id,
      title: "Item de synthèse",
      statusId: input.statusId,
      estimatePoints: input.estimatePoints,
      reporterId: fixture.actorA,
      rank: `z${id.slice(0, 8)}`,
      path: `root.${id.replaceAll("-", "")}`,
      deletedAt: input.deleted ? new Date() : null,
    })
    .returning();
  return row!;
}

describeDb("backlog overview (JIR-82)", () => {
  let fixture: ReadVisibilityFixture;
  let doneStatusId: string;
  let todoStatusId: string;

  beforeEach(async () => {
    fixture = await createReadVisibilityFixture(`Synthèse ${randomUUID().slice(0, 6)}`);
    const [todo] = await db
      .select({ id: statuses.id })
      .from(statuses)
      .where(eq(statuses.backlogId, fixture.backlogA.id));
    todoStatusId = todo!.id;
    const [done] = await db
      .insert(statuses)
      .values({
        backlogId: fixture.backlogA.id,
        name: "Terminé",
        category: "done",
        order: 1,
        color: "#3aa675",
      })
      .returning();
    doneStatusId = done!.id;
  });

  afterEach(async () => {
    await deleteFixtureWithSprintHistory(fixture);
  });

  async function overviewRow(userId: string, backlogId: string) {
    const rows = await listBacklogOverviewForUser(userId);
    return rows.find((row) => row.id === backlogId);
  }

  it("lists only the backlogs the user can browse, never archived ones", async () => {
    const rows = await listBacklogOverviewForUser(fixture.actorA);
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(fixture.backlogA.id);
    expect(ids).not.toContain(fixture.backlogB.id);

    await db
      .update(backlogs)
      .set({ archivedAt: new Date() })
      .where(eq(backlogs.id, fixture.backlogA.id));
    const afterArchive = await listBacklogOverviewForUser(fixture.actorA);
    expect(afterArchive.map((row) => row.id)).not.toContain(fixture.backlogA.id);
  });

  it("counts open items: not deleted, status not in the done category, every type", async () => {
    // Fixture: one live todo task (counted) and one deleted task (ignored).
    await insertTask(fixture, { statusId: doneStatusId, estimatePoints: 2 });
    await insertTask(fixture, { statusId: todoStatusId, estimatePoints: null, type: "composant" });
    await insertTask(fixture, { statusId: todoStatusId, estimatePoints: 1, deleted: true });

    const row = await overviewRow(fixture.actorA, fixture.backlogA.id);
    expect(row).toMatchObject({
      key: fixture.backlogA.key,
      name: fixture.backlogA.name,
      color: fixture.backlogA.color,
      openItemCount: 2,
      activeSprint: null,
      lead: null,
      starred: false,
    });
  });

  it("reports the active sprint's done points against its start commitment", async () => {
    const openTask = await insertTask(fixture, { statusId: todoStatusId, estimatePoints: 3 });
    const doneTask = await insertTask(fixture, { statusId: doneStatusId, estimatePoints: 5 });
    const addedLater = await insertTask(fixture, { statusId: doneStatusId, estimatePoints: 2 });
    const deletedDone = await insertTask(fixture, {
      statusId: doneStatusId,
      estimatePoints: 8,
      deleted: true,
    });
    const [sprint] = await db
      .insert(sprints)
      .values({
        backlogId: fixture.backlogA.id,
        name: "Sprint synthèse",
        state: "active",
        rank: "a0",
        startedAt: new Date(Date.now() - 86_400_000),
        createdBy: fixture.actorA,
      })
      .returning();
    const memberships = await db
      .insert(sprintItems)
      .values([
        { sprintId: sprint!.id, itemId: openTask.id, joinedBy: fixture.actorA, estimateAtStart: 3, doneAtStart: false },
        { sprintId: sprint!.id, itemId: doneTask.id, joinedBy: fixture.actorA, estimateAtStart: 5, doneAtStart: false },
        { sprintId: sprint!.id, itemId: addedLater.id, joinedBy: fixture.actorA, estimateAtJoin: 2 },
        { sprintId: sprint!.id, itemId: deletedDone.id, joinedBy: fixture.actorA, estimateAtStart: 8, doneAtStart: false },
      ])
      .returning();
    // The third membership joined after start: recorded as an item_added event.
    await databasePool.query(
      `insert into sprint_events (
        backlog_id, sprint_id, event_type, source_membership_id, item_id, item_key, item_title,
        actor_id, request_correlation_id, occurred_at, next_done, next_estimate
      ) values ($1, $2, 'item_added', $3, $4, $5, $6, $7, 'jir82-test', now(), true, 2)`,
      [
        fixture.backlogA.id,
        sprint!.id,
        memberships[2]!.id,
        addedLater.id,
        addedLater.key,
        addedLater.title,
        fixture.actorA,
      ],
    );

    const row = await overviewRow(fixture.actorA, fixture.backlogA.id);
    expect(row?.activeSprint).toEqual({
      id: sprint!.id,
      name: "Sprint synthèse",
      // Done tasks currently in the sprint, as the Backlog header counts them.
      completedPoints: 7,
      // Frozen at start (Jira's velocity commitment): 3 + 5 + 8.
      commitmentPoints: 16,
    });
  });

  it("reports an unavailable commitment for a legacy active sprint", async () => {
    const task = await insertTask(fixture, { statusId: doneStatusId, estimatePoints: 4 });
    const [sprint] = await db
      .insert(sprints)
      .values({
        backlogId: fixture.backlogA.id,
        name: "Sprint ancien",
        state: "active",
        rank: "a0",
        startedAt: new Date(Date.now() - 86_400_000),
        createdBy: fixture.actorA,
      })
      .returning();
    await db
      .insert(sprintItems)
      .values({ sprintId: sprint!.id, itemId: task.id, joinedBy: fixture.actorA, estimateAtStart: 4 });

    const row = await overviewRow(fixture.actorA, fixture.backlogA.id);
    expect(row?.activeSprint).toEqual({
      id: sprint!.id,
      name: "Sprint ancien",
      completedPoints: 4,
      commitmentPoints: null,
    });
  });

  it("shows the lead and sorts favourites first, then by name", async () => {
    await db
      .update(backlogs)
      .set({ leadUserId: fixture.actorB })
      .where(eq(backlogs.id, fixture.backlogA.id));
    const fixtureIds = [fixture.backlogA.id, fixture.backlogB.id];
    const order = async () =>
      (await listBacklogOverviewForUser(fixture.admin))
        .filter((row) => fixtureIds.includes(row.id))
        .map((row) => row.id);

    expect(await order()).toEqual([fixture.backlogA.id, fixture.backlogB.id]);
    const rowA = await overviewRow(fixture.admin, fixture.backlogA.id);
    expect(rowA?.lead).toEqual({ id: fixture.actorB, name: expect.stringContaining(" B") });

    await setBacklogStar({ backlogId: fixture.backlogB.id, starred: true }, fixture.admin);
    expect(await order()).toEqual([fixture.backlogB.id, fixture.backlogA.id]);
    const rows = await listBacklogOverviewForUser(fixture.admin);
    expect(rows.find((row) => row.id === fixture.backlogB.id)?.starred).toBe(true);
    // Favourites are personal.
    expect((await overviewRow(fixture.actorB, fixture.backlogB.id))?.starred).toBe(false);

    const selector = (await listBacklogsWithStarsForUser(fixture.admin)).filter((row) =>
      fixtureIds.includes(row.id),
    );
    expect(selector.map((row) => [row.id, row.starred])).toEqual([
      [fixture.backlogB.id, true],
      [fixture.backlogA.id, false],
    ]);
  });
});

describeDb("setBacklogStar (JIR-82)", () => {
  let fixture: ReadVisibilityFixture;

  beforeEach(async () => {
    fixture = await createReadVisibilityFixture(`Favori ${randomUUID().slice(0, 6)}`);
  });

  afterEach(async () => {
    await deleteReadVisibilityFixture(fixture);
  });

  async function starRows(userId: string, backlogId: string) {
    return db
      .select({ userId: backlogStars.userId })
      .from(backlogStars)
      .where(and(eq(backlogStars.userId, userId), eq(backlogStars.backlogId, backlogId)));
  }

  it("stars and unstars idempotently", async () => {
    const input = { backlogId: fixture.backlogA.id, starred: true };
    await expect(setBacklogStar(input, fixture.actorA)).resolves.toEqual({ starred: true });
    await expect(setBacklogStar(input, fixture.actorA)).resolves.toEqual({ starred: true });
    expect(await starRows(fixture.actorA, fixture.backlogA.id)).toHaveLength(1);

    const unstar = { backlogId: fixture.backlogA.id, starred: false };
    await expect(setBacklogStar(unstar, fixture.actorA)).resolves.toEqual({ starred: false });
    await expect(setBacklogStar(unstar, fixture.actorA)).resolves.toEqual({ starred: false });
    expect(await starRows(fixture.actorA, fixture.backlogA.id)).toHaveLength(0);
  });

  it("refuses a backlog the user cannot browse", async () => {
    await expect(
      setBacklogStar({ backlogId: fixture.backlogB.id, starred: true }, fixture.actorA),
    ).rejects.toMatchObject({ name: "ResourceNotFoundError" });
    expect(await starRows(fixture.actorA, fixture.backlogB.id)).toHaveLength(0);
  });

  it("refuses an archived backlog", async () => {
    await db
      .update(backlogs)
      .set({ archivedAt: new Date() })
      .where(eq(backlogs.id, fixture.backlogA.id));
    await expect(
      setBacklogStar({ backlogId: fixture.backlogA.id, starred: true }, fixture.actorA),
    ).rejects.toMatchObject({ name: "ResourceNotFoundError" });
  });

  it("rejects malformed input", async () => {
    await expect(
      setBacklogStar({ backlogId: "pas-un-uuid", starred: true }, fixture.actorA),
    ).rejects.toThrow();
  });
});

describeDb("updateBacklog lead (JIR-82)", () => {
  let fixture: ReadVisibilityFixture;

  beforeEach(async () => {
    fixture = await createReadVisibilityFixture(`Responsable ${randomUUID().slice(0, 6)}`);
  });

  afterEach(async () => {
    await deleteReadVisibilityFixture(fixture);
  });

  const leadOf = async (backlogId: string) =>
    (await db
      .select({ leadUserId: backlogs.leadUserId })
      .from(backlogs)
      .where(eq(backlogs.id, backlogId)))[0]?.leadUserId;

  it("sets, keeps and clears the lead", async () => {
    const base = {
      id: fixture.backlogA.id,
      key: fixture.backlogA.key,
      name: fixture.backlogA.name,
      color: fixture.backlogA.color,
    };
    await updateBacklog({ ...base, leadUserId: fixture.actorA }, fixture.admin);
    expect(await leadOf(fixture.backlogA.id)).toBe(fixture.actorA);
    const adminRows = await listAdminBacklogsForUser(fixture.actorA);
    expect(adminRows.find((row) => row.id === fixture.backlogA.id)?.leadUserId).toBe(
      fixture.actorA,
    );

    // Omitting the field leaves the lead unchanged.
    await updateBacklog(base, fixture.admin);
    expect(await leadOf(fixture.backlogA.id)).toBe(fixture.actorA);

    await updateBacklog({ ...base, leadUserId: null }, fixture.admin);
    expect(await leadOf(fixture.backlogA.id)).toBeNull();
  });

  it("rejects an unknown lead without changing the backlog", async () => {
    await expect(
      updateBacklog(
        {
          id: fixture.backlogA.id,
          key: fixture.backlogA.key,
          name: "Ne doit pas changer",
          color: fixture.backlogA.color,
          leadUserId: `inconnu-${randomUUID()}`,
        },
        fixture.admin,
      ),
    ).rejects.toThrow("Responsable introuvable.");
    const [stored] = await db
      .select({ name: backlogs.name })
      .from(backlogs)
      .where(eq(backlogs.id, fixture.backlogA.id));
    expect(stored?.name).toBe(fixture.backlogA.name);
  });

  it("clears the lead when the user is deleted", async () => {
    const leadId = `lead-${randomUUID()}`;
    await db.insert(user).values({
      id: leadId,
      name: "Responsable éphémère",
      email: `${leadId}@example.test`,
      emailVerified: true,
      role: "contributor",
    });
    await db.update(backlogs).set({ leadUserId: leadId }).where(eq(backlogs.id, fixture.backlogA.id));
    await db.delete(user).where(eq(user.id, leadId));
    expect(await leadOf(fixture.backlogA.id)).toBeNull();
  });
});
