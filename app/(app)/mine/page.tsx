import { requireAppPageSession } from "@/lib/auth/session";
import { listItemsAssignedTo } from "@/lib/services/items";
import { ItemRow } from "@/components/items/item-row";
import {
  BacklogSectionTitle,
  CollapsibleItemSection,
  ItemSectionSummary,
  StatusPointsPills,
} from "@/components/items/item-section";
import { itemsSummaryLabel } from "@/lib/format/plural";
import { pointsByCategory } from "@/lib/items/status-points";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";

type Row = Awaited<ReturnType<typeof listItemsAssignedTo>>[number];

/** The Backlog row (JIR-93), read-only; every item here is the viewer's. */
function MineRow({ row }: { row: Row }) {
  return (
    <ItemRow
      as="li"
      href={`/b/${row.backlogKey}?item=${row.key}`}
      item={{
        id: row.id,
        key: row.key,
        title: row.title,
        type: row.type,
        kind: row.kind,
        status: { name: row.statusName, category: row.statusCategory },
        priority: row.priority,
        estimatePoints: row.type === "tache" ? row.estimatePoints : undefined,
      }}
    />
  );
}

export default async function MinePage() {
  const session = await requireAppPageSession();
  const userId = session.user.id;

  const rows = await listItemsAssignedTo(userId);

  // Group by backlog preserving the order from the query (already sorted by backlog name).
  type BacklogGroup = {
    backlog: { id: string; key: string; name: string; color: string };
    items: Row[];
  };
  const groupMap = new Map<string, BacklogGroup>();
  for (const row of rows) {
    let group = groupMap.get(row.backlogId);
    if (!group) {
      group = {
        backlog: {
          id: row.backlogId,
          key: row.backlogKey,
          name: row.backlogName,
          color: row.backlogColor,
        },
        items: [],
      };
      groupMap.set(row.backlogId, group);
    }
    group.items.push(row);
  }
  const groups = [...groupMap.values()];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 space-y-1">
        <ShellBreadcrumb />
        <div className="flex items-baseline gap-3">
          <h1 className="t-h1">Mes items</h1>
          {rows.length > 0 && (
            <span className="t-sm text-muted-foreground">{rows.length}</span>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center p-10 text-center">
          <p className="t-sm text-muted-foreground">Aucun item ne vous est assigné.</p>
        </div>
      ) : (
        // The Backlog's table (JIR-97): one card per backlog.
        <div className="flex flex-col gap-4">
          {groups.map(({ backlog, items }) => {
            // Only tasks are estimated: points apply when the backlog lists one.
            const tasks = items.filter((row) => row.type === "tache");
            return (
              <CollapsibleItemSection
                key={backlog.id}
                name={backlog.name}
                headingLevel={2}
                title={<BacklogSectionTitle backlog={backlog} />}
                summary={
                  <ItemSectionSummary>
                    {itemsSummaryLabel(
                      items.length,
                      tasks.length > 0
                        ? tasks.filter((row) => row.estimatePoints === null).length
                        : null,
                    )}
                  </ItemSectionSummary>
                }
                aside={
                  tasks.length > 0 ? (
                    <StatusPointsPills
                      value={pointsByCategory(
                        tasks.map((row) => ({
                          category: row.statusCategory,
                          estimatePoints: row.estimatePoints,
                        })),
                      )}
                    />
                  ) : undefined
                }
              >
                <ul aria-label={`Items de ${backlog.name}`}>
                  {items.map((row) => (
                    <MineRow key={row.id} row={row} />
                  ))}
                </ul>
              </CollapsibleItemSection>
            );
          })}
        </div>
      )}
    </div>
  );
}
