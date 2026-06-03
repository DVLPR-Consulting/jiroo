import { notFound } from "next/navigation";
import { and, eq, isNull, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema/domain";
import { getBacklogByKey } from "@/lib/services/backlogs";
import { ViewBar } from "@/components/shell/view-bar";

export default async function BacklogPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const backlog = await getBacklogByKey(key);
  if (!backlog || backlog.archivedAt) notFound();
  const [row] = await db
    .select({ value: count() })
    .from(items)
    .where(and(eq(items.backlogId, backlog.id), isNull(items.deletedAt)));
  const itemCount = row?.value ?? 0;
  return (
    <div className="flex h-full flex-col">
      <ViewBar />
      <div className="grid flex-1 place-items-center p-10 text-center">
        <div className="space-y-2">
          <p className="t-h2">{backlog.name}</p>
          <p className="t-sm text-muted-foreground">
            {itemCount} item(s) · le board arrive au Lot 4.
          </p>
        </div>
      </div>
    </div>
  );
}
