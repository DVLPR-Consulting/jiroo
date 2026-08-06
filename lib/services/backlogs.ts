import { and, eq, isNull } from "drizzle-orm";
import {
  browseAccessPredicate,
  listAccessibleBacklogs,
} from "@/lib/auth/accessible-backlogs";
import { db } from "@/lib/db";
import { activities, backlogs, items, statuses } from "@/lib/db/schema/domain";
import { STATUS_CATEGORY, type StatusId } from "@/lib/design/constants";
import { planItemKeyRewrite } from "@/lib/items/backlog-key";
import { provisionBacklogAuthorization } from "@/lib/services/authorization-seed";
import { createBacklogSchema, updateBacklogSchema } from "@/lib/validation/backlog";

// The 4 fixed statuses every backlog gets at creation.
export const DEFAULT_STATUSES: { id: StatusId; name: string; color: string }[] = [
  { id: "todo", name: "À faire", color: "#9aa0a6" },
  { id: "doing", name: "En cours", color: "#d99a2b" },
  { id: "review", name: "En revue", color: "#8b5cf6" },
  { id: "done", name: "Terminé", color: "#3aa675" },
];

export function listBacklogsForUser(
  userId: string,
  opts?: { includeArchived?: boolean },
) {
  return listAccessibleBacklogs(userId, opts);
}

export async function getBacklogByKeyForUser(key: string, userId: string) {
  const [b] = await db
    .select({
      id: backlogs.id,
      key: backlogs.key,
      name: backlogs.name,
      color: backlogs.color,
      archivedAt: backlogs.archivedAt,
    })
    .from(backlogs)
    .where(
      and(
        eq(backlogs.key, key.toUpperCase()),
        browseAccessPredicate(userId),
      ),
    )
    .limit(1);
  return b ?? null;
}

export async function createBacklog(input: unknown, creatorId: string) {
  const data = createBacklogSchema.parse(input);
  return db.transaction(async (tx) => {
    const [backlog] = await tx.insert(backlogs).values(data).returning();
    await tx.insert(statuses).values(
      DEFAULT_STATUSES.map((s, i) => ({
        backlogId: backlog!.id,
        name: s.name,
        category: STATUS_CATEGORY[s.id],
        order: i,
        color: s.color,
      })),
    );
    await provisionBacklogAuthorization(tx, {
      backlogId: backlog!.id,
      administratorIds: [creatorId],
    });
    return backlog!;
  });
}

export async function updateBacklog(input: unknown, actorId: string) {
  const data = updateBacklogSchema.parse(input);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(backlogs)
      .where(eq(backlogs.id, data.id))
      .for("update");
    if (!current) return null;

    const backlogItems = await tx
      .select({ id: items.id, key: items.key })
      .from(items)
      .where(eq(items.backlogId, data.id))
      .for("update");
    const rewrites = planItemKeyRewrite(backlogItems, current.key, data.key);

    const [backlog] = await tx
      .update(backlogs)
      .set({ key: data.key, name: data.name, color: data.color })
      .where(eq(backlogs.id, data.id))
      .returning();

    for (const rewrite of rewrites) {
      await tx.update(items).set({ key: rewrite.newKey }).where(eq(items.id, rewrite.id));
    }

    if (rewrites.length > 0) {
      await tx.insert(activities).values(
        rewrites.map((rewrite) => ({
          itemId: rewrite.id,
          actorId,
          action: "update" as const,
          field: "key",
          oldValue: rewrite.oldKey,
          newValue: rewrite.newKey,
        })),
      );
    }

    return { backlog: backlog!, previousKey: current.key };
  });
}

export async function archiveBacklog(id: string) {
  const [b] = await db
    .update(backlogs)
    .set({ archivedAt: new Date() })
    .where(and(eq(backlogs.id, id), isNull(backlogs.archivedAt)))
    .returning();
  return b ?? null;
}
