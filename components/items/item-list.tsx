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
  FixVersionChips,
  type FixVersionOption,
} from "@/components/items/fix-version-picker";
import {
  NewItemButton,
  type NewItemButtonProps,
} from "@/components/items/new-item-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  useRequestedItemKey,
  useViewUrlState,
} from "@/components/shell/view-url-state";
import type { ItemKind, ItemType } from "@/lib/design/constants";
import type { SortDir, SortField } from "@/lib/items/filter";
import type {
  BulkItemCapabilities,
  ItemCapabilities,
  ReleaseCapabilities,
} from "@/lib/auth/capabilities";
import {
  emptySelection,
  reconcileSelection,
  selectAllVisible,
  toggleItemSelection,
} from "@/lib/items/selection";
import { fixedTableMinWidth, LIST_COLUMNS, SELECTION_COLUMN } from "@/lib/items/table-layout";
import { hierarchyStartStep } from "@/lib/tree/hierarchy";
import { ViewStartGuide } from "@/components/items/backlog-start-guide";

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
  fixVersions?: FixVersionOption[];
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
  canSelectItems,
  canEditItems,
  canTransitionItems,
  canAssignItems,
  bulkSelected,
  onToggleSelection,
  showFixVersions,
}: {
  item: ListItem;
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  canSelectItems: boolean;
  canEditItems: boolean;
  canTransitionItems: boolean;
  canAssignItems: boolean;
  bulkSelected: boolean;
  onToggleSelection: (id: string, extendRange: boolean) => void;
  showFixVersions: boolean;
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
      data-shortcut-item={item.key}
      aria-label={`${item.key} — ${item.title}`}
      onClick={openItem}
      onKeyDown={handleKeyDown}
      className={`cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${
        isSelected || bulkSelected ? "bg-[var(--accent-subtle)]" : ""
      }`}
      style={{ height: "var(--row-h)" }}
    >
      {canSelectItems ? (
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
          readOnly={!canEditItems || !canTransitionItems}
        />
      </td>
      <td className={CELL_CLASS} onClick={(event) => event.stopPropagation()}>
        <InlinePriority
          itemId={item.id}
          backlogKey={backlogKey}
          priority={item.priority}
          readOnly={!canEditItems}
        />
      </td>
      <td className={CELL_CLASS} onClick={(event) => event.stopPropagation()}>
        {item.type === "tache" ? (
          <InlineEstimate
            itemId={item.id}
            backlogKey={backlogKey}
            estimatePoints={item.estimatePoints}
            readOnly={!canEditItems}
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
          assigneeName={item.assigneeName}
          users={users}
          readOnly={!canEditItems || !canAssignItems}
        />
      </td>
      {showFixVersions ? (
        <td className={CELL_CLASS}>
          <FixVersionChips versions={item.fixVersions ?? []} />
        </td>
      ) : null}
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
  currentSort,
  filtersActive = false,
  hasItems,
  clearFiltersHref,
  createDialogProps,
  canCreateItems: legacyCanCreateItems = true,
  canEditItems: legacyCanEditItems = true,
  canTransitionItems: legacyCanTransitionItems = true,
  canAssignItems: legacyCanAssignItems = true,
  canBulkChangeItems: legacyCanBulkChangeItems = true,
  itemCapabilities,
  bulkCapabilities,
  releaseOptions = [],
  releaseCapabilities,
  showFixVersions = true,
}: {
  groups: Group[];
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogId: string;
  backlogKey: string;
  currentSort: CurrentSort;
  filtersActive?: boolean;
  hasItems?: boolean;
  clearFiltersHref?: string;
  createDialogProps?: Pick<NewItemButtonProps, "backlogId" | "items" | "statuses" | "canScheduleItems" | "releaseOptions" | "fieldOptions">;
  canCreateItems?: boolean;
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
  canBulkChangeItems?: boolean;
  itemCapabilities?: ItemCapabilities;
  bulkCapabilities?: BulkItemCapabilities;
  releaseOptions?: FixVersionOption[];
  releaseCapabilities?: ReleaseCapabilities;
  showFixVersions?: boolean;
}) {
  const canCreateItems = itemCapabilities?.create ?? legacyCanCreateItems;
  const canEditItems = itemCapabilities?.edit ?? legacyCanEditItems;
  const canTransitionItems = itemCapabilities?.transition ?? legacyCanTransitionItems;
  const canAssignItems = itemCapabilities?.assign ?? legacyCanAssignItems;
  const canBulkChangeItems = bulkCapabilities
    ? Object.values(bulkCapabilities).some(Boolean)
    : legacyCanBulkChangeItems;
  // A new backlog says where to start: Composant, then Epic (JIR-88).
  const startStep = createDialogProps ? hierarchyStartStep(createDialogProps.items) : null;
  const router = useRouter();
  const viewUrl = useViewUrlState();
  // The open item follows the URL, which changes without a server render.
  const selectedKey = useRequestedItemKey() ?? undefined;
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
  const canSelectItems = releaseCapabilities?.bulkAssignItems === true || (
    bulkCapabilities
      ? Object.values(bulkCapabilities).some(Boolean)
      : canBulkChangeItems && (canEditItems || canTransitionItems || canAssignItems)
  );

  function toggleSelection(id: string, extendRange: boolean) {
    setSelection((current) =>
      toggleItemSelection(current, visibleIds, id, extendRange),
    );
  }

  function handleSelectionShortcut(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    // Portaled menus and dialogs bubble through React but not through this
    // DOM subtree; their keys (e.g. Escape closing a menu) are not ours.
    if (!event.currentTarget.contains(target)) return;
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
    if (!showNoResults && startStep && createDialogProps) {
      return (
        <div className="grid flex-1 place-items-center p-10">
          <ViewStartGuide
            step={startStep}
            backlogKey={backlogKey}
            dialogProps={createDialogProps}
            canCreateItems={canCreateItems}
            variant="empty"
          />
        </div>
      );
    }
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
            ) : canCreateItems && createDialogProps ? (
              <NewItemButton backlogKey={backlogKey} {...createDialogProps} />
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <>
      {startStep && !filtersActive && createDialogProps ? (
        <ViewStartGuide
          step={startStep}
          backlogKey={backlogKey}
          dialogProps={createDialogProps}
          canCreateItems={canCreateItems}
          variant="callout"
          className="mx-3 mt-3 flex-none sm:mx-4"
        />
      ) : null}
      <div
        className="min-h-0 flex-1 overflow-auto"
        onKeyDown={canSelectItems ? handleSelectionShortcut : undefined}
      >
        <div className="sticky left-0 flex justify-end border-b border-border bg-[var(--surface-1)] p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" aria-label="Configurer les colonnes">
                Colonnes
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                checked={showFixVersions}
                onCheckedChange={(checked) => {
                  viewUrl.replace((params) => {
                    if (checked) params.set("fvcol", "1");
                    else params.delete("fvcol");
                  }, { scroll: false });
                }}
              >
                Fix versions
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <table
          className="w-full table-fixed border-separate border-spacing-0"
          style={{
            minWidth: fixedTableMinWidth([
              ...(canSelectItems ? [SELECTION_COLUMN] : []),
              ...Object.values(LIST_COLUMNS).filter(
                (column) => showFixVersions || column !== LIST_COLUMNS.fixVersions,
              ),
            ]),
          }}
        >
          <colgroup>
            {canSelectItems ? <col className={SELECTION_COLUMN.className} /> : null}
            <col className={LIST_COLUMNS.key.className} />
            <col />
            <col className={LIST_COLUMNS.status.className} />
            <col className={LIST_COLUMNS.priority.className} />
            <col className={LIST_COLUMNS.points.className} />
            <col className={LIST_COLUMNS.labels.className} />
            <col className={LIST_COLUMNS.dueDate.className} />
            <col className={LIST_COLUMNS.assignee.className} />
            {showFixVersions ? <col className={LIST_COLUMNS.fixVersions.className} /> : null}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              {canSelectItems ? (
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
              {showFixVersions ? <th scope="col" className={HEADER_CLASS}>Fix versions</th> : null}
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
                      colSpan={8 + (canSelectItems ? 1 : 0) + (showFixVersions ? 1 : 0)}
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
                      canSelectItems={canSelectItems}
                      canEditItems={canEditItems}
                      canTransitionItems={canTransitionItems}
                      canAssignItems={canAssignItems}
                      bulkSelected={selection.selectedIds.has(item.id)}
                      onToggleSelection={toggleSelection}
                      showFixVersions={showFixVersions}
                    />
                  ))}
              </tbody>
            );
          })}
        </table>
        {canSelectItems && selectedItems.length > 0 ? (
          <BulkItemToolbar
            backlogId={backlogId}
            backlogKey={backlogKey}
            selectedItems={selectedItems.map((item) => ({
              id: item.id,
              type: item.type,
            }))}
            statuses={statuses}
            users={users}
            canEditItems={canEditItems}
            canTransitionItems={canTransitionItems}
            canAssignItems={canAssignItems}
            canScheduleItems={false}
            canBulkChangeItems={canBulkChangeItems}
            capabilities={bulkCapabilities}
            releaseOptions={releaseOptions}
            releaseCapabilities={releaseCapabilities}
            onClearSelection={() => setSelection(emptySelection())}
            onMutationSuccess={() => router.refresh()}
          />
        ) : null}
      </div>
    </>
  );
}
