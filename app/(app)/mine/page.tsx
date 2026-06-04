import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listItemsAssignedTo } from "@/lib/services/items";
import { TypeIcon } from "@/components/icons/type-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import type { ItemType, Priority } from "@/lib/design/constants";

// Clamp DB integer priority into the 0..4 union PrioIcon expects.
function asPriority(value: number): Priority {
  return Math.min(4, Math.max(0, value)) as Priority;
}

type Row = Awaited<ReturnType<typeof listItemsAssignedTo>>[number];

function StatusPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      {name}
    </span>
  );
}

function ItemRow({ row }: { row: Row }) {
  const href = `/b/${row.backlogKey}?item=${row.key}`;
  return (
    <li className="border-b border-border">
      <Link
        href={href}
        className="flex items-center gap-2.5 py-2 px-4 transition-colors hover:bg-muted/50"
      >
        <TypeIcon type={row.type as ItemType} />
        <ItemKey value={row.key} />
        <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
        <StatusPill name={row.statusName} color={row.statusColor} />
        <PrioIcon priority={asPriority(row.priority)} />
      </Link>
    </li>
  );
}

export default async function MinePage() {
  const session = await getSession();
  const userId = session?.user.id;
  if (!userId) redirect("/login");

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
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="t-h2 font-semibold">Mes items</h1>
        {rows.length > 0 && (
          <span className="t-sm text-muted-foreground">{rows.length}</span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center p-10 text-center">
          <p className="t-sm text-muted-foreground">Aucun item ne vous est assigné.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(({ backlog, items }) => (
            <section key={backlog.id}>
              {/* Backlog section header */}
              <div className="mb-1 flex items-center gap-2 px-4 py-1.5">
                <span
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                  style={{ background: backlog.color }}
                >
                  {backlog.key}
                </span>
                <span className="text-sm font-medium">{backlog.name}</span>
                <span className="t-meta text-muted-foreground">{items.length}</span>
              </div>

              <ul className="rounded-md border border-border bg-background">
                {items.map((row) => (
                  <ItemRow key={row.id} row={row} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
