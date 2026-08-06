import { requireAppPageSession } from "@/lib/auth/session";
import { checkPermission } from "@/lib/auth/authorization";
import { listTrashedItems } from "@/lib/services/items";
import type { TrashedItem } from "@/lib/services/items";
import { TrashList } from "@/components/items/trash-list";

// Group trashed items by backlog, preserving first-seen order (items already
// arrive deletedAt desc, so the first occurrence of each backlogKey determines
// the group's position in the list).
function groupByBacklog(items: TrashedItem[]) {
  const order: string[] = [];
  const map = new Map<string, { backlog: { id: string; key: string; name: string; color: string }; items: TrashedItem[] }>();

  for (const item of items) {
    if (!map.has(item.backlogKey)) {
      order.push(item.backlogKey);
      map.set(item.backlogKey, {
        backlog: {
          id: item.backlogId,
          key: item.backlogKey,
          name: item.backlogName,
          color: item.backlogColor,
        },
        items: [],
      });
    }
    map.get(item.backlogKey)!.items.push(item);
  }

  return order.map((key) => map.get(key)!);
}

export default async function TrashPage() {
  const session = await requireAppPageSession();
  const items = await listTrashedItems(session.user.id);
  const groups = groupByBacklog(items);
  const backlogIds = [...new Set(items.map((item) => item.backlogId))];
  const restoreDecisions = await Promise.all(
    backlogIds.map(async (backlogId) => ({
      backlogId,
      decision: await checkPermission({
        actorId: session.user.id,
        permission: "restore_items",
        scope: { type: "backlog", backlogId },
      }),
    })),
  );
  const restorableBacklogIds = restoreDecisions
    .filter(({ decision }) => decision.allowed)
    .map(({ backlogId }) => backlogId);

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
      <TrashList groups={groups} restorableBacklogIds={restorableBacklogIds} />
    </div>
  );
}
