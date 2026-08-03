import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { backlogs, items } from "@/lib/db/schema/domain";

export function toCountMap(
  rows: Array<{ backlogKey: string; count: number | string }>,
): Record<string, number> {
  return rows.reduce<Record<string, number>>((result, row) => {
    const key = row.backlogKey.toUpperCase();
    result[key] = (result[key] ?? 0) + Number(row.count);
    return result;
  }, {});
}

export type ShellCounts = {
  allByBacklog: Record<string, number>;
  mine: number;
  trash: number;
};

export async function getShellCounts(userId: string): Promise<ShellCounts> {
  const [allRows, mineRows, trashRows] = await Promise.all([
    db
      .select({ backlogKey: backlogs.key, count: count() })
      .from(items)
      .innerJoin(backlogs, eq(items.backlogId, backlogs.id))
      .where(isNull(items.deletedAt))
      .groupBy(backlogs.key),
    db
      .select({ count: count() })
      .from(items)
      .where(and(eq(items.assigneeId, userId), isNull(items.deletedAt))),
    db.select({ count: count() }).from(items).where(isNotNull(items.deletedAt)),
  ]);

  return {
    allByBacklog: toCountMap(allRows),
    mine: Number(mineRows[0]?.count ?? 0),
    trash: Number(trashRows[0]?.count ?? 0),
  };
}
