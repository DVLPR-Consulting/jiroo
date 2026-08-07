import "dotenv/config";

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogs, items, statuses } from "@/lib/db/schema/domain";
import {
  createStatus,
  deleteStatus,
  listStatusIdsByCategory,
  reorderStatuses,
  updateStatus,
} from "@/lib/services/statuses";
import { moveItem } from "@/lib/services/items";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const actorId = `status-workflow-actor-${randomUUID()}`;

beforeAll(async () => {
  if (process.env.JIROO_RUN_DB_TESTS !== "1") return;
  await db.insert(user).values({
    id: actorId,
    name: "Acteur workflow",
    email: `${actorId}@example.test`,
    emailVerified: true,
    role: "contributor",
  });
});

afterAll(async () => {
  if (process.env.JIROO_RUN_DB_TESTS !== "1") return;
  await db.delete(user).where(eq(user.id, actorId));
});

async function fixture() {
  const actor = { id: actorId };
  const key = randomUUID().replace(/[^a-f]/gi, "").slice(0, 6).toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key, name: "Workflow test", color: "#475569" })
    .returning();
  const rows = await db
    .insert(statuses)
    .values([
      { backlogId: backlog!.id, name: "À faire", category: "todo", order: 0, color: "#9aa0a6" },
      { backlogId: backlog!.id, name: "En cours", category: "in_progress", order: 1, color: "#d99a2b" },
      { backlogId: backlog!.id, name: "Terminé", category: "done", order: 2, color: "#3aa675" },
    ])
    .returning();
  return { actor, backlog: backlog!, todo: rows[0]!, doing: rows[1]!, done: rows[2]! };
}

async function insertItem(input: {
  backlogId: string;
  statusId: string;
  reporterId: string;
  closedAt?: Date | null;
}) {
  const id = randomUUID();
  const suffix = Date.now() + Math.floor(Math.random() * 10_000);
  const [item] = await db
    .insert(items)
    .values({
      id,
      key: `WF-${suffix}`,
      type: "tache",
      backlogId: input.backlogId,
      title: "Item workflow",
      statusId: input.statusId,
      reporterId: input.reporterId,
      rank: `a${suffix}`,
      path: `root.${id.replaceAll("-", "")}`,
      closedAt: input.closedAt,
    })
    .returning();
  return item!;
}

describeDb("configurable statuses", () => {
  it("groups exact status IDs by workflow category for release progress filters", async () => {
    const f = await fixture();
    try {
      const selectSpy = vi.spyOn(db, "select");
      await expect(listStatusIdsByCategory(f.backlog.id)).resolves.toEqual({
        todo: [f.todo.id],
        inProgress: [f.doing.id],
        done: [f.done.id],
      });
      expect(selectSpy).toHaveBeenCalledTimes(1);
      selectSpy.mockRestore();
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("creates a unique appended status and rejects a duplicate name", async () => {
    const f = await fixture();
    try {
      const created = await createStatus({
        backlogId: f.backlog.id,
        name: "En revue",
        category: "in_progress",
        color: "#8b5cf6",
      });
      expect(created).toMatchObject({ name: "En revue", order: 3 });

      await expect(
        createStatus({
          backlogId: f.backlog.id,
          name: "  EN REVUE ",
          category: "in_progress",
          color: "#8b5cf6",
        }),
      ).rejects.toThrow("Un statut portant ce nom existe déjà.");
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("reorders the complete status set and rejects a partial payload atomically", async () => {
    const f = await fixture();
    try {
      await reorderStatuses({
        backlogId: f.backlog.id,
        statusIds: [f.done.id, f.todo.id, f.doing.id],
      });
      const ordered = await db
        .select({ id: statuses.id, order: statuses.order })
        .from(statuses)
        .where(eq(statuses.backlogId, f.backlog.id))
        .orderBy(asc(statuses.order));
      expect(ordered).toEqual([
        { id: f.done.id, order: 0 },
        { id: f.todo.id, order: 1 },
        { id: f.doing.id, order: 2 },
      ]);

      await expect(
        reorderStatuses({ backlogId: f.backlog.id, statusIds: [f.todo.id, f.doing.id] }),
      ).rejects.toThrow("La liste des statuts est incomplète.");
      const unchanged = await db
        .select({ id: statuses.id })
        .from(statuses)
        .where(eq(statuses.backlogId, f.backlog.id))
        .orderBy(asc(statuses.order));
      expect(unchanged.map((row) => row.id)).toEqual([f.done.id, f.todo.id, f.doing.id]);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("updates closedAt and audits populated statuses when their category changes", async () => {
    const f = await fixture();
    const item = await insertItem({
      backlogId: f.backlog.id,
      statusId: f.doing.id,
      reporterId: f.actor.id,
      closedAt: null,
    });
    await db.insert(activities).values({
      itemId: item.id,
      actorId: f.actor.id,
      action: "status_change",
      field: "status",
      oldValue: f.todo.id,
      newValue: f.doing.id,
    });
    try {
      await updateStatus(
        {
          id: f.doing.id,
          backlogId: f.backlog.id,
          name: "Livré",
          category: "done",
          color: "#3aa675",
        },
        f.actor.id,
      );
      const [stored] = await db
        .select({ statusId: items.statusId, closedAt: items.closedAt })
        .from(items)
        .where(eq(items.id, item.id));
      expect(stored?.statusId).toBe(f.doing.id);
      expect(stored?.closedAt).toBeInstanceOf(Date);
      const audit = await db
        .select({ field: activities.field, oldValue: activities.oldValue, newValue: activities.newValue })
        .from(activities)
        .where(eq(activities.itemId, item.id));
      expect(audit).toContainEqual({
        field: "status_category",
        oldValue: "in_progress",
        newValue: "done",
      });
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("prevents editing away the final todo and done categories", async () => {
    const f = await fixture();
    try {
      await expect(
        updateStatus(
          {
            id: f.todo.id,
            backlogId: f.backlog.id,
            name: "Démarré",
            category: "in_progress",
            color: "#d99a2b",
          },
          f.actor.id,
        ),
      ).rejects.toThrow("Le workflow doit conserver au moins un statut initial.");
      await expect(
        updateStatus(
          {
            id: f.done.id,
            backlogId: f.backlog.id,
            name: "Archivé",
            category: "in_progress",
            color: "#475569",
          },
          f.actor.id,
        ),
      ).rejects.toThrow("Le workflow doit conserver au moins un statut terminé.");
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("migrates occupied columns before deletion and protects final todo/done states", async () => {
    const f = await fixture();
    const item = await insertItem({
      backlogId: f.backlog.id,
      statusId: f.doing.id,
      reporterId: f.actor.id,
      closedAt: null,
    });
    await db.insert(activities).values({
      itemId: item.id,
      actorId: f.actor.id,
      action: "status_change",
      field: "status",
      oldValue: f.todo.id,
      newValue: f.doing.id,
    });
    try {
      await expect(
        deleteStatus({ backlogId: f.backlog.id, id: f.doing.id, replacementStatusId: null }, f.actor.id),
      ).rejects.toThrow("Choisissez un statut de destination pour les items existants.");

      await deleteStatus(
        { backlogId: f.backlog.id, id: f.doing.id, replacementStatusId: f.done.id },
        f.actor.id,
      );
      const [stored] = await db
        .select({ statusId: items.statusId, closedAt: items.closedAt })
        .from(items)
        .where(eq(items.id, item.id));
      expect(stored?.statusId).toBe(f.done.id);
      expect(stored?.closedAt).toBeInstanceOf(Date);
      const auditRows = await db
        .select({ oldValue: activities.oldValue, newValue: activities.newValue })
        .from(activities)
        .where(eq(activities.itemId, item.id))
        .orderBy(asc(activities.at));
      expect(auditRows).toEqual([
        { oldValue: f.todo.id, newValue: "En cours" },
        { oldValue: "En cours", newValue: "Terminé" },
      ]);

      await expect(
        deleteStatus({ backlogId: f.backlog.id, id: f.todo.id, replacementStatusId: f.done.id }, f.actor.id),
      ).rejects.toThrow("Le workflow doit conserver au moins un statut initial.");
      await expect(
        deleteStatus({ backlogId: f.backlog.id, id: f.done.id, replacementStatusId: f.todo.id }, f.actor.id),
      ).rejects.toThrow("Le workflow doit conserver au moins un statut terminé.");
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });

  it("keeps closedAt consistent when a move races with status recategorization", async () => {
    const f = await fixture();
    const item = await insertItem({
      backlogId: f.backlog.id,
      statusId: f.todo.id,
      reporterId: f.actor.id,
      closedAt: null,
    });
    try {
      await Promise.all([
        updateStatus(
          {
            id: f.doing.id,
            backlogId: f.backlog.id,
            name: "Livré",
            category: "done",
            color: "#3aa675",
          },
          f.actor.id,
        ),
        moveItem(
          {
            id: item.id,
            statusId: f.doing.id,
            beforeId: null,
            afterId: null,
          },
          f.actor.id,
        ),
      ]);

      const [stored] = await db
        .select({ statusId: items.statusId, closedAt: items.closedAt })
        .from(items)
        .where(eq(items.id, item.id));
      expect(stored?.statusId).toBe(f.doing.id);
      expect(stored?.closedAt).toBeInstanceOf(Date);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, f.backlog.id));
    }
  });
});
