"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ChevronRight,
  Inbox,
  SearchX,
} from "lucide-react";
import { KindIcon } from "@/components/icons/kind-icon";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { BulkItemToolbar } from "@/components/items/bulk-item-toolbar";
import {
  InlineAssignee,
  InlineEstimate,
  InlinePriority,
  InlineStatus,
} from "@/components/items/inline-item-field";
import { LabelPill } from "@/components/items/label-pill";
import {
  NewItemButton,
  type NewItemButtonProps,
} from "@/components/items/new-item-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useViewUrlState } from "@/components/shell/view-url-state";
import type { ItemKind, ItemType } from "@/lib/design/constants";
import type { SortDir, SortField } from "@/lib/items/filter";
import {
  emptySelection,
  reconcileSelection,
  selectAllVisible,
  toggleItemSelection,
} from "@/lib/items/selection";

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
  estimatePoints: number | null;
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
  canWrite,
  bulkSelected,
  onToggleSelection,
}: {
  item: ListItem;
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  canWrite: boolean;
  bulkSelected: boolean;
  onToggleSelection: (id: string, extendRange: boolean) => void;
}) {
  const viewUrl = useViewUrlState();
  const isSelected = item.key === selectedKey;

  function openItem() {
    viewUrl.push((params) => params.set("item", item.key));
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
        isSelected || bulkSelected ? "bg-[var(--accent-subtle)]" : ""
      }`}
      style={{ height: "var(--row-h)" }}
    >
      {canWrite ? (
        <td
          className={`${CELL_CLASS} px-2 text-center`}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={bulkSelected}
            onChange={() => undefined}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelection(item.id, event.shiftKey);
            }}
            aria-label={`Sélectionner ${item.key}`}
            className="size-4 cursor-pointer accent-[var(--primary)]"
          />
        </td>
      ) : null}
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
          readOnly={!canWrite}
        />
      </td>
      <td className={CELL_CLASS} onClick={(event) => event.stopPropagation()}>
        <InlinePriority
          itemId={item.id}
          backlogKey={backlogKey}
          priority={item.priority}
          readOnly={!canWrite}
        />
      </td>
      <td className={CELL_CLASS} onClick={(event) => event.stopPropagation()}>
        {item.type === "tache" ? (
          <InlineEstimate
            itemId={item.id}
            backlogKey={backlogKey}
            estimatePoints={item.estimatePoints}
            readOnly={!canWrite}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
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
          readOnly={!canWrite}
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
  backlogId,
  backlogKey,
  selectedKey,
  currentSort,
  filtersActive = false,
  hasItems,
  clearFiltersHref,
  createDialogProps,
  canWrite = true,
}: {
  groups: Group[];
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogId: string;
  backlogKey: string;
  selectedKey?: string;
  currentSort: CurrentSort;
  filtersActive?: boolean;
  hasItems?: boolean;
  clearFiltersHref?: string;
  createDialogProps?: Pick<NewItemButtonProps, "backlogId" | "items" | "statuses">;
  canWrite?: boolean;
}) {
  const router = useRouter();
  const viewUrl = useViewUrlState();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [selection, setSelection] = useState(emptySelection);
  const [selectionScope, setSelectionScope] = useState<string | null>(null);
  const total = groups.reduce((count, group) => count + group.items.length, 0);
  const visibleItems = useMemo(
    () =>
      groups.flatMap((group) =>
        grouped && collapsedGroups.has(group.key) ? [] : group.items,
      ),
    [collapsedGroups, grouped, groups],
  );
  const visibleIds = useMemo(
    () => visibleItems.map((item) => item.id),
    [visibleItems],
  );
  const visibleSignature = visibleIds.join("\u001f");
  if (selectionScope !== visibleSignature) {
    setSelectionScope(visibleSignature);
    setSelection((current) => reconcileSelection(current, visibleIds));
  }
  const selectedItems = visibleItems.filter((item) =>
    selection.selectedIds.has(item.id),
  );
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selection.selectedIds.has(id));
  const partlySelected = selection.selectedIds.size > 0 && !allSelected;

  function toggleSelection(id: string, extendRange: boolean) {
    setSelection((current) =>
      toggleItemSelection(current, visibleIds, id, extendRange),
    );
  }

  function handleSelectionShortcut(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [contenteditable='true']")) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection(selectAllVisible(visibleIds));
    } else if (event.key === "Escape" && selection.selectedIds.size > 0) {
      event.preventDefault();
      setSelection(emptySelection());
    }
  }

  function sortBy(field: SortField) {
    const direction: SortDir =
      currentSort?.field === field && currentSort.dir === "asc" ? "desc" : "asc";
    viewUrl.replace((params) => {
      params.set("sort", `${field}:${direction}`);
    }, { scroll: false });
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
    const showNoResults = filtersActive && (hasItems ?? total > 0);
    return (
      <div className="grid flex-1 place-items-center p-10">
        <EmptyState
          icon={showNoResults ? <SearchX className="size-5" /> : <Inbox className="size-5" />}
          title={showNoResults ? "Aucun résultat" : "Aucun item"}
          description={
            showNoResults
              ? "Aucun item ne correspond aux filtres actifs."
              : "Créez votre premier item pour commencer à organiser ce backlog."
          }
          action={
            showNoResults ? (
              clearFiltersHref ? (
                <Link
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  href={clearFiltersHref}
                >
                  Effacer les filtres
                </Link>
              ) : null
            ) : canWrite && createDialogProps ? (
              <NewItemButton backlogKey={backlogKey} {...createDialogProps} />
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      onKeyDown={canWrite ? handleSelectionShortcut : undefined}
    >
      <table className="w-full table-fixed border-separate border-spacing-0">
        <colgroup>
          {canWrite ? <col className="w-10" /> : null}
          <col className="w-32" />
          <col />
          <col className="w-40" />
          <col className="w-16" />
          <col className="w-24" />
          <col className="w-48" />
          <col className="w-32" />
          <col className="w-44" />
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            {canWrite ? (
              <th scope="col" className={`${HEADER_CLASS} px-2 text-center`}>
                <input
                  ref={(node) => {
                    if (node) node.indeterminate = partlySelected;
                  }}
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelection(
                      allSelected ? emptySelection() : selectAllVisible(visibleIds),
                    )
                  }
                  aria-label="Sélectionner tous les items visibles"
                  className="size-4 cursor-pointer accent-[var(--primary)]"
                />
              </th>
            ) : null}
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
            <th scope="col" className={HEADER_CLASS}>Points</th>
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
                    colSpan={canWrite ? 9 : 8}
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
                    canWrite={canWrite}
                    bulkSelected={selection.selectedIds.has(item.id)}
                    onToggleSelection={toggleSelection}
                  />
                ))}
            </tbody>
          );
        })}
      </table>
      {canWrite && selectedItems.length > 0 ? (
        <BulkItemToolbar
          backlogId={backlogId}
          backlogKey={backlogKey}
          selectedItems={selectedItems.map((item) => ({
            id: item.id,
            type: item.type,
          }))}
          statuses={statuses}
          users={users}
          onClearSelection={() => setSelection(emptySelection())}
          onMutationSuccess={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
