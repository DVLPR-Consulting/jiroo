import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listTrashedItems } from "@/lib/services/items";
import type { TrashedItem } from "@/lib/services/items";
import { TrashList } from "@/components/items/trash-list";

// Group trashed items by backlog, preserving first-seen order (items already
// arrive deletedAt desc, so the first occurrence of each backlogKey determines
// the group's position in the list).
function groupByBacklog(items: TrashedItem[]) {
  const order: string[] = [];
  const map = new Map<string, { backlog: { key: string; name: string; color: string }; items: TrashedItem[] }>();

  for (const item of items) {
    if (!map.has(item.backlogKey)) {
      order.push(item.backlogKey);
      map.set(item.backlogKey, {
        backlog: { key: item.backlogKey, name: item.backlogName, color: item.backlogColor },
        items: [],
      });
    }
    map.get(item.backlogKey)!.items.push(item);
  }

  return order.map((key) => map.get(key)!);
}

export default async function TrashPage() {
  const session = await getSession();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    redirect("/");
  }

  const items = await listTrashedItems();
  const groups = groupByBacklog(items);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="t-h2">Corbeille</h1>
        <p className="t-sm text-muted-foreground">
          {items.length === 0
            ? "Aucun item supprimé."
            : items.length === 1
              ? "1 item supprimé"
              : `${items.length} items supprimés`}
        </p>
      </div>

      {/* Body */}
      {items.length === 0 ? (
        <div className="grid flex-1 place-items-center p-10 text-center">
          <p className="t-sm text-muted-foreground">La corbeille est vide.</p>
        </div>
      ) : (
        <TrashList groups={groups} />
      )}
    </div>
  );
}
