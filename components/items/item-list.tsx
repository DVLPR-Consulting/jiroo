"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronRight } from "lucide-react";
import { KindIcon } from "@/components/icons/kind-icon";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import {
  InlineAssignee,
  InlinePriority,
  InlineStatus,
} from "@/components/items/inline-item-field";
import { LabelPill } from "@/components/items/label-pill";
import type { ItemKind, ItemType } from "@/lib/design/constants";
import type { SortDir, SortField } from "@/lib/items/filter";

type LabelChip = { id: string; name: string; color: string };
type UserOption = { id: string; name: string };
type StatusOption = {
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
};

export type ListItem = {
  id: string;
  key: string;
  type: ItemType;
  kind: ItemKind;
  title: string;
  statusId: string;
  priority: number;
  depth: number;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  labels: LabelChip[];
  blocked: boolean;
  statusOrder: number;
  ancestorIds: string[];
  componentId: string | null;
};

type Group = { key: string; label: string; items: ListItem[] };
type CurrentSort = { field: SortField; dir: SortDir } | null;

const HEADER_CLASS =
  "border-b border-border bg-[var(--surface-2)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const CELL_CLASS = "border-b border-border px-3 py-1.5 text-sm";

const dueDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDueDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dueDateFormatter.format(date);
}

function SortIcon({ field, currentSort }: { field: SortField; currentSort: CurrentSort }) {
  if (currentSort?.field !== field) return <ChevronsUpDown aria-hidden size={12} />;
  return currentSort.dir === "asc" ? (
    <ArrowUp aria-hidden size={12} />
  ) : (
    <ArrowDown aria-hidden size={12} />
  );
}

function SortableHeader({
  children,
  field,
  currentSort,
  onSort,
}: {
  children: string;
  field: SortField;
  currentSort: CurrentSort;
  onSort: (field: SortField) => void;
}) {
  const ariaSort =
    currentSort?.field === field
      ? currentSort.dir === "asc"
        ? "ascending"
        : "descending"
      : "none";

  return (
    <th scope="col" aria-sort={ariaSort} className={HEADER_CLASS}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        onClick={() => onSort(field)}
      >
        {children}
        <SortIcon field={field} currentSort={currentSort} />
      </button>
    </th>
  );
}

function ItemRow({
  item,
  grouped,
  statuses,
  users,
  backlogKey,
  selectedKey,
  currentParams,
}: {
  item: ListItem;
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  currentParams: Record<string, string>;
}) {
  const router = useRouter();
  const isSelected = item.key === selectedKey;

  function openItem() {
    const params = new URLSearchParams(currentParams);
    params.set("item", item.key);
    router.push(`/b/${backlogKey}?${params.toString()}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openItem();
    }
  }

  return (
    <tr
      tabIndex={0}
      aria-label={`${item.key} — ${item.title}`}
      onClick={openItem}
      onKeyDown={handleKeyDown}
      className={`cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${
        isSelected ? "bg-[var(--accent-subtle)]" : ""
      }`}
      style={{ height: "var(--row-h)" }}
    >
      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        <span className="inline-flex items-center gap-1.5">
          <TypeIcon type={item.type} />
          <ItemKey value={item.key} />
        </span>
      </td>
      <td className={`${CELL_CLASS} min-w-0`}>
        <span
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: grouped ? undefined : item.depth * 16 }}
        >
          <KindIcon kind={item.kind} />
          <span className="truncate font-medium">{item.title}</span>
          {item.blocked && (
            <span
              className="inline-flex flex-none items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                color: "var(--danger)",
                background: "color-mix(in oklch, var(--danger) 14%, transparent)",
              }}
            >
              bloqué
            </span>
          )}
        </span>
      </td>
      <td className={CELL_CLASS} onClick={(event) => event.stopPropagation()}>
        <InlineStatus
          itemId={item.id}
          backlogKey={backlogKey}
          statusId={item.statusId}
          statuses={statuses}
        />
      </td>
      <td className={CELL_CLASS} onClick={(event) => event.stopPropagation()}>
        <InlinePriority itemId={item.id} backlogKey={backlogKey} priority={item.priority} />
      </td>
      <td className={CELL_CLASS}>
        {item.labels.length > 0 ? (
          <span className="flex min-w-0 flex-wrap gap-1">
            {item.labels.map((label) => (
              <LabelPill key={label.id} name={label.name} color={label.color} />
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={`${CELL_CLASS} whitespace-nowrap text-xs text-muted-foreground`}>
        {formatDueDate(item.dueDate)}
      </td>
      <td className={CELL_CLASS} onClick={(event) => event.stopPropagation()}>
        <InlineAssignee
          itemId={item.id}
          backlogKey={backlogKey}
          assigneeId={item.assigneeId}
          users={users}
        />
      </td>
    </tr>
  );
}

export function ItemList({
  groups,
  grouped,
  statuses,
  users,
  backlogKey,
  selectedKey,
  currentSort,
  currentParams,
}: {
  groups: Group[];
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  currentSort: CurrentSort;
  currentParams: Record<string, string>;
}) {
  const router = useRouter();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const total = groups.reduce((count, group) => count + group.items.length, 0);

  function sortBy(field: SortField) {
    const direction: SortDir =
      currentSort?.field === field && currentSort.dir === "asc" ? "desc" : "asc";
    const params = new URLSearchParams(currentParams);
    params.set("sort", `${field}:${direction}`);
    router.replace(`/b/${backlogKey}?${params.toString()}`, { scroll: false });
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (total === 0) {
    return (
      <div className="grid flex-1 place-items-center p-10 text-center">
        <p className="t-sm text-muted-foreground">Aucun item.</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full table-fixed border-separate border-spacing-0">
        <colgroup>
          <col className="w-32" />
          <col />
          <col className="w-40" />
          <col className="w-16" />
          <col className="w-48" />
          <col className="w-32" />
          <col className="w-44" />
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <SortableHeader field="key" currentSort={currentSort} onSort={sortBy}>
              Clé
            </SortableHeader>
            <SortableHeader field="title" currentSort={currentSort} onSort={sortBy}>
              Titre
            </SortableHeader>
            <SortableHeader field="status" currentSort={currentSort} onSort={sortBy}>
              Statut
            </SortableHeader>
            <SortableHeader field="priority" currentSort={currentSort} onSort={sortBy}>
              Prio
            </SortableHeader>
            <th scope="col" className={HEADER_CLASS}>Labels</th>
            <SortableHeader field="dueDate" currentSort={currentSort} onSort={sortBy}>
              Échéance
            </SortableHeader>
            <th scope="col" className={HEADER_CLASS}>Assigné</th>
          </tr>
        </thead>
        {groups.map((group) => {
          const collapsed = grouped && collapsedGroups.has(group.key);
          return (
            <tbody key={group.key || "ungrouped"}>
              {grouped && (
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={7}
                    className="sticky top-8 z-10 border-b border-border bg-[var(--surface-2)] px-3 py-1.5 text-left"
                  >
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      onClick={() => toggleGroup(group.key)}
                      className="flex w-full items-center gap-1.5 rounded text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <ChevronRight
                        aria-hidden
                        size={13}
                        className="transition-transform"
                        style={{ transform: collapsed ? "rotate(0deg)" : "rotate(90deg)" }}
                      />
                      <span>{group.label}</span>
                      <span className="item-key ml-1">{group.items.length}</span>
                    </button>
                  </th>
                </tr>
              )}
              {!collapsed &&
                group.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    grouped={grouped}
                    statuses={statuses}
                    users={users}
                    backlogKey={backlogKey}
                    selectedKey={selectedKey}
                    currentParams={currentParams}
                  />
                ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
