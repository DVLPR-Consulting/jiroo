import Link from "next/link";
import { TypeIcon } from "@/components/icons/type-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { KindIcon } from "@/components/icons/kind-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { LabelPill } from "@/components/items/label-pill";
import type { ItemKind, ItemType, Priority } from "@/lib/design/constants";

type LabelChip = { id: string; name: string; color: string };

type Item = {
  id: string;
  key: string;
  type: ItemType;
  title: string;
  statusId: string;
  priority: number;
  depth: number;
  /** Label objects attached in T4; rendered as chips in T5. */
  labels?: LabelChip[];
  /** True when this item is the target of an unfinished `blocks` link. */
  blocked?: boolean;
  /** Bug or feature classification (orthogonal to hierarchy type). */
  kind?: ItemKind;
};

type Group = { key: string; label: string; items: Item[] };
type StatusMap = Record<string, { name: string; color: string }>;

// Clamp the DB integer priority into the 0..4 union PrioIcon expects.
function asPriority(value: number): Priority {
  return Math.min(4, Math.max(0, value)) as Priority;
}

function StatusPill({ status }: { status?: { name: string; color: string } }) {
  if (!status) return null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: status.color }}
        aria-hidden
      />
      {status.name}
    </span>
  );
}

function Row({
  item,
  statuses,
  backlogKey,
  selectedKey,
  params,
  grouped,
}: {
  item: Item;
  statuses: StatusMap;
  backlogKey: string;
  selectedKey?: string;
  params?: Record<string, string>;
  grouped?: boolean;
}) {
  const isSelected = item.key === selectedKey;
  const sp = new URLSearchParams(params ?? {});
  sp.set("item", item.key);
  const href = `/b/${backlogKey}?${sp.toString()}`;
  return (
    <li className="border-b border-border">
      <Link
        href={href}
        className={`flex items-center gap-2.5 py-2 pr-4 transition-colors hover:bg-muted/50 ${
          isSelected ? "bg-[var(--accent-subtle)]" : ""
        }`}
        style={{ paddingLeft: grouped ? 12 : 12 + item.depth * 20 }}
      >
        <TypeIcon type={item.type} />
        <ItemKey value={item.key} />
        {item.kind && <KindIcon kind={item.kind} />}
        <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
        {item.labels && item.labels.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {item.labels.map((label) => (
              <LabelPill key={label.id} name={label.name} color={label.color} />
            ))}
          </span>
        )}
        {item.blocked && (
          <span
            className="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              color: "var(--danger)",
              background: "color-mix(in oklch, var(--danger) 14%, transparent)",
            }}
          >
            bloqué
          </span>
        )}
        <StatusPill status={statuses[item.statusId]} />
        <PrioIcon priority={asPriority(item.priority)} />
      </Link>
    </li>
  );
}

export function ItemList({
  groups,
  grouped,
  statuses,
  backlogKey,
  selectedKey,
  params,
}: {
  groups: Group[];
  grouped: boolean;
  statuses: StatusMap;
  backlogKey: string;
  selectedKey?: string;
  params?: Record<string, string>;
}) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  if (total === 0) {
    return (
      <div className="grid flex-1 place-items-center p-10 text-center">
        <p className="t-sm text-muted-foreground">Aucun item.</p>
      </div>
    );
  }

  if (!grouped) {
    return (
      <ul className="flex-1 overflow-auto">
        {groups[0]!.items.map((item) => (
          <Row
            key={item.id}
            item={item}
            statuses={statuses}
            backlogKey={backlogKey}
            selectedKey={selectedKey}
            params={params}
            grouped={false}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {groups.map((g) => (
        <details key={g.key} open className="border-b border-border">
          <summary className="cursor-pointer bg-[var(--surface-2)] px-4 py-1.5 text-xs font-medium text-muted-foreground">
            {g.label} <span className="ml-1">{g.items.length}</span>
          </summary>
          <ul>
            {g.items.map((item) => (
              <Row
                key={item.id}
                item={item}
                statuses={statuses}
                backlogKey={backlogKey}
                selectedKey={selectedKey}
                params={params}
                grouped={true}
              />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
