import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  activities,
  backlogs,
  items,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import {
  assignItemsToSprint,
  createSprint,
  listSprintsForBacklog,
  moveItemToSprint,
  reorderSprint,
  updateSprint,
} from "@/lib/services/sprints";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

async function fixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: `SP${suffix}`, name: "Sprint service test", color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  const [todo] = await db
    .insert(statuses)
    .values({
      backlogId: backlog.id,
      name: "À faire",
      category: "todo",
      order: 0,
      color: "#9aa0a6",
    })
    .returning();
  if (!todo) throw new Error("Fixture statut impossible.");
  return { actor, backlog, todo };
}

async function insertTask(f: Awaited<ReturnType<typeof fixture>>, title: string) {
  const id = randomUUID();
  const [row] = await db
    .insert(items)
    .values({
      id,
      key: `${f.backlog.key}-${title.replaceAll(" ", "").slice(0, 8)}`,
      type: "tache",
      backlogId: f.backlog.id,
      title,
      statusId: f.todo.id,
      reporterId: f.actor.id,
      rank: `a${randomUUID().replaceAll("-", "")}`,
      path: `root.${id.replaceAll("-", "")}`,
    })
    .returning();
  if (!row) throw new Error("Fixture tâche impossible.");
  return row;
}

describeDb("sprint planning services", () => {
  it("creates uniquely named ranked sprints and edits planning fields", async () => {
    const f = await fixture();
    try {
      const first = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const second = await createSprint({ backlogId: f.backlog.id }, f.actor.id);

      expect([first.name, second.name]).toEqual(["Sprint 1", "Sprint 2"]);
      expect(first.rank < second.rank).toBe(true);

      const edited = await updateSprint(
        {
          id: first.id,
          backlogId: f.backlog.id,
          name: "Objectif paiement",
          goal: "Livrer le paiement invité",
          plannedStartAt: "2026-08-10T09:00:00.000Z",
          plannedEndAt: "2026-08-24T09:00:00.000Z",
          capacityPoints: 20,
        },
        f.actor.id,
      );

      expect(edited).toMatchObject({
        name: "Objectif paiement",
        goal: "Livrer le paiement invité",
        capacityPoints: 20,
        plannedStartAt: new Date("2026-08-10T09:00:00.000Z"),
        plannedEndAt: new Date("2026-08-24T09:00:00.000Z"),
      });
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("reorders a planned sprint between two server-validated neighbors", async () => {
    const f = await fixture();
    try {
      const first = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const second = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const third = await createSprint({ backlogId: f.backlog.id }, f.actor.id);

      await reorderSprint(
        {
          id: third.id,
          backlogId: f.backlog.id,
          beforeId: first.id,
          afterId: second.id,
        },
        f.actor.id,
      );

      const stored = await listSprintsForBacklog(f.backlog.id);
      expect(stored.sprints.map((row) => row.id)).toEqual([
        first.id,
        third.id,
        second.id,
      ]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("assigns, transfers, and clears task membership with readable history", async () => {
    const f = await fixture();
    try {
      const firstSprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const secondSprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const firstTask = await insertTask(f, "Première");
      const secondTask = await insertTask(f, "Deuxième");

      await expect(
        assignItemsToSprint(
          {
            backlogId: f.backlog.id,
            itemIds: [firstTask.id, secondTask.id],
            sprintId: firstSprint.id,
          },
          f.actor.id,
        ),
      ).resolves.toEqual({ changedCount: 2, unchangedCount: 0 });

      await expect(
        assignItemsToSprint(
          {
            backlogId: f.backlog.id,
            itemIds: [firstTask.id],
            sprintId: firstSprint.id,
          },
          f.actor.id,
        ),
      ).resolves.toEqual({ changedCount: 0, unchangedCount: 1 });

      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [firstTask.id],
          sprintId: secondSprint.id,
        },
        f.actor.id,
      );
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [secondTask.id],
          sprintId: null,
        },
        f.actor.id,
      );

      const history = await db
        .select({
          itemId: sprintItems.itemId,
          sprintId: sprintItems.sprintId,
          leftAt: sprintItems.leftAt,
          outcome: sprintItems.outcome,
        })
        .from(sprintItems)
        .where(and(eq(sprintItems.itemId, firstTask.id)))
        .orderBy(asc(sprintItems.joinedAt));
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        sprintId: firstSprint.id,
        outcome: "removed",
      });
      expect(history[0]?.leftAt).toBeInstanceOf(Date);
      expect(history[1]).toMatchObject({
        sprintId: secondSprint.id,
        leftAt: null,
        outcome: null,
      });
      await expect(
        db
          .select({ id: sprintItems.id })
          .from(sprintItems)
          .where(and(eq(sprintItems.itemId, secondTask.id), isNull(sprintItems.leftAt))),
      ).resolves.toEqual([]);

      const audit = await db
        .select({
          itemId: activities.itemId,
          oldValue: activities.oldValue,
          newValue: activities.newValue,
        })
        .from(activities)
        .where(
          and(
            eq(activities.field, "sprint"),
            inArray(activities.itemId, [firstTask.id, secondTask.id]),
          ),
        )
        .orderBy(asc(activities.at));
      expect(audit).toHaveLength(4);
      expect(audit).toEqual(
        expect.arrayContaining([
          { itemId: firstTask.id, oldValue: null, newValue: "Sprint 1" },
          { itemId: secondTask.id, oldValue: null, newValue: "Sprint 1" },
          { itemId: firstTask.id, oldValue: "Sprint 1", newValue: "Sprint 2" },
          { itemId: secondTask.id, oldValue: "Sprint 1", newValue: null },
        ]),
      );
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("moves a task into a sprint and persists its rank in the same transaction", async () => {
    const f = await fixture();
    try {
      const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const first = await insertTask(f, "Première cible");
      const moved = await insertTask(f, "À déplacer");
      const second = await insertTask(f, "Deuxième cible");
      await db
        .update(items)
        .set({ rank: "a0" })
        .where(eq(items.id, first.id));
      await db
        .update(items)
        .set({ rank: "a1" })
        .where(eq(items.id, moved.id));
      await db
        .update(items)
        .set({ rank: "a2" })
        .where(eq(items.id, second.id));
      await assignItemsToSprint(
        {
          backlogId: f.backlog.id,
          itemIds: [first.id, second.id],
          sprintId: sprint.id,
        },
        f.actor.id,
      );

      const updated = await moveItemToSprint(
        {
          backlogId: f.backlog.id,
          itemId: moved.id,
          sprintId: sprint.id,
          beforeId: first.id,
          afterId: second.id,
        },
        f.actor.id,
      );

      expect("a0" < updated.rank && updated.rank < "a2").toBe(true);
      await expect(
        db
          .select({ sprintId: sprintItems.sprintId })
          .from(sprintItems)
          .where(and(eq(sprintItems.itemId, moved.id), isNull(sprintItems.leftAt))),
      ).resolves.toEqual([{ sprintId: sprint.id }]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("rolls back membership and rank when a drop neighbor is outside the target section", async () => {
    const f = await fixture();
    try {
      const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const moved = await insertTask(f, "À conserver");
      const backlogNeighbor = await insertTask(f, "Voisine backlog");

      await expect(
        moveItemToSprint(
          {
            backlogId: f.backlog.id,
            itemId: moved.id,
            sprintId: sprint.id,
            beforeId: backlogNeighbor.id,
            afterId: null,
          },
          f.actor.id,
        ),
      ).rejects.toThrow("Le voisin n’appartient pas à la section cible.");

      const [stored] = await db
        .select({ rank: items.rank })
        .from(items)
        .where(eq(items.id, moved.id));
      expect(stored?.rank).toBe(moved.rank);
      await expect(
        db
          .select({ id: sprintItems.id })
          .from(sprintItems)
          .where(and(eq(sprintItems.itemId, moved.id), isNull(sprintItems.leftAt))),
      ).resolves.toEqual([]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("rejects duplicate names and planning edits on a completed sprint", async () => {
    const f = await fixture();
    try {
      const first = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const second = await createSprint({ backlogId: f.backlog.id }, f.actor.id);

      await expect(
        updateSprint(
          {
            id: second.id,
            backlogId: f.backlog.id,
            name: "  SPRINT 1  ",
          },
          f.actor.id,
        ),
      ).rejects.toThrow("Un sprint portant ce nom existe déjà.");

      const completedAt = new Date();
      await db
        .update(sprints)
        .set({
          state: "completed",
          startedAt: new Date(completedAt.getTime() - 60_000),
          completedAt,
        })
        .where(eq(sprints.id, first.id));
      await expect(
        updateSprint(
          {
            id: first.id,
            backlogId: f.backlog.id,
            capacityPoints: 30,
          },
          f.actor.id,
        ),
      ).rejects.toThrow(
        "Un sprint terminé permet uniquement de modifier son nom et son objectif.",
      );
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("rolls back a bulk assignment when one selected item is deleted or structural", async () => {
    const f = await fixture();
    try {
      const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const valid = await insertTask(f, "Valide");
      const deleted = await insertTask(f, "Supprimée");
      await db
        .update(items)
        .set({ deletedAt: new Date() })
        .where(eq(items.id, deleted.id));

      await expect(
        assignItemsToSprint(
          {
            backlogId: f.backlog.id,
            itemIds: [valid.id, deleted.id],
            sprintId: sprint.id,
          },
          f.actor.id,
        ),
      ).rejects.toThrow("Un ou plusieurs items sont introuvables.");
      await expect(
        db
          .select({ id: sprintItems.id })
          .from(sprintItems)
          .where(and(eq(sprintItems.itemId, valid.id), isNull(sprintItems.leftAt))),
      ).resolves.toEqual([]);

      const componentId = randomUUID();
      await db.insert(items).values({
        id: componentId,
        key: `${f.backlog.key}-STRUCT`,
        type: "composant",
        backlogId: f.backlog.id,
        title: "Structure",
        statusId: f.todo.id,
        reporterId: f.actor.id,
        rank: `a${randomUUID().replaceAll("-", "")}`,
        path: `root.${componentId.replaceAll("-", "")}`,
      });
      await expect(
        assignItemsToSprint(
          {
            backlogId: f.backlog.id,
            itemIds: [valid.id, componentId],
            sprintId: sprint.id,
          },
          f.actor.id,
        ),
      ).rejects.toThrow("Seules les tâches peuvent être planifiées dans un sprint.");
      await expect(
        db
          .select({ id: sprintItems.id })
          .from(sprintItems)
          .where(and(eq(sprintItems.itemId, valid.id), isNull(sprintItems.leftAt))),
      ).resolves.toEqual([]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("assigns the maximum supported batch of 500 tasks atomically", async () => {
    const f = await fixture();
    try {
      const sprint = await createSprint({ backlogId: f.backlog.id }, f.actor.id);
      const taskRows = Array.from({ length: 500 }, (_, index) => {
        const id = randomUUID();
        return {
          id,
          key: `${f.backlog.key}-${index + 1}`,
          type: "tache" as const,
          backlogId: f.backlog.id,
          title: `Tâche ${index + 1}`,
          statusId: f.todo.id,
          reporterId: f.actor.id,
          rank: `batch${String(index).padStart(3, "0")}`,
          path: `root.${id.replaceAll("-", "")}`,
        };
      });
      await db.insert(items).values(taskRows);

      await expect(
        assignItemsToSprint(
          {
            backlogId: f.backlog.id,
            itemIds: taskRows.map((item) => item.id),
            sprintId: sprint.id,
          },
          f.actor.id,
        ),
      ).resolves.toEqual({ changedCount: 500, unchangedCount: 0 });
      const stored = await db
        .select({ id: sprintItems.id })
        .from(sprintItems)
        .where(and(eq(sprintItems.sprintId, sprint.id), isNull(sprintItems.leftAt)));
      expect(stored).toHaveLength(500);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });
});
