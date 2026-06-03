import { TypeIcon } from "@/components/icons/type-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import type { ItemType, Priority } from "@/lib/design/constants";

type Item = {
  id: string;
  key: string;
  type: ItemType;
  title: string;
  statusId: string;
  priority: number;
  depth: number;
};

type StatusMap = Record<string, { name: string; color: string }>;

// Clamp the DB integer priority into the 0..4 union PrioIcon expects.
function asPriority(value: number): Priority {
  const clamped = Math.min(4, Math.max(0, value)) as Priority;
  return clamped;
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

export function ItemList({ items, statuses }: { items: Item[]; statuses: StatusMap }) {
  if (items.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-10 text-center">
        <p className="t-sm text-muted-foreground">Aucun item — créez-en un.</p>
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-auto">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-2.5 border-b border-border py-2 pr-4 transition-colors hover:bg-muted/50"
          style={{ paddingLeft: 12 + item.depth * 20 }}
        >
          <TypeIcon type={item.type} />
          <ItemKey value={item.key} />
          <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
          <StatusPill status={statuses[item.statusId]} />
          <PrioIcon priority={asPriority(item.priority)} />
        </li>
      ))}
    </ul>
  );
}
