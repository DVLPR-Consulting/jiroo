import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { backlogs, statuses } from "@/lib/db/schema/domain";
import { STATUS_CATEGORY, type StatusId } from "@/lib/design/constants";
import { createBacklogSchema, updateBacklogSchema } from "@/lib/validation/backlog";

// The 4 fixed statuses every backlog gets at creation.
export const DEFAULT_STATUSES: { id: StatusId; name: string; color: string }[] = [
  { id: "todo", name: "À faire", color: "#9aa0a6" },
  { id: "doing", name: "En cours", color: "#d99a2b" },
  { id: "review", name: "En revue", color: "#8b5cf6" },
  { id: "done", name: "Terminé", color: "#3aa675" },
];

export function listBacklogs(opts?: { includeArchived?: boolean }) {
  return db
    .select()
    .from(backlogs)
    .where(opts?.includeArchived ? undefined : isNull(backlogs.archivedAt))
    .orderBy(asc(backlogs.name));
}

export async function getBacklogByKey(key: string) {
  const [b] = await db.select().from(backlogs).where(eq(backlogs.key, key.toUpperCase()));
  return b ?? null;
}

export async function createBacklog(input: unknown) {
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
    return backlog!;
  });
}

export async function updateBacklog(input: unknown) {
  const data = updateBacklogSchema.parse(input);
  const [b] = await db
    .update(backlogs)
    .set({ name: data.name, color: data.color })
    .where(eq(backlogs.id, data.id))
    .returning();
  return b ?? null;
}

export async function archiveBacklog(id: string) {
  const [b] = await db
    .update(backlogs)
    .set({ archivedAt: new Date() })
    .where(and(eq(backlogs.id, id), isNull(backlogs.archivedAt)))
    .returning();
  return b ?? null;
}
