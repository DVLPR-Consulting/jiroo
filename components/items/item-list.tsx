"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ChevronRight,
  Columns3,
  Inbox,
  SearchX,
} from "lucide-react";
import { BulkItemToolbar } from "@/components/items/bulk-item-toolbar";
import { type FixVersionOption } from "@/components/items/fix-version-picker";
import {
  ItemRow,
  RowSelectCheckbox,
  type ItemRowEditing,
} from "@/components/items/item-row";
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
import type { HierarchyStartStep } from "@/lib/tree/hierarchy";
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
  /** The direct parent, shown as a pill: the Liste is flat (JIR-93). */
  parent?: { key: string; title: string; type: ItemType } | null;
};

type Group = { key: string; label: string; items: ListItem[] };
type CurrentSort = { field: SortField; dir: SortDir } | null;

const HEADER_CELL_CLASS =
  "flex shrink-0 items-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/** The optional pills of a Liste row, chosen with « Colonnes » (JIR-93). */
const OPTIONAL_COLUMNS = [
  { param: "lblcol", label: "Labels" },
  { param: "duecol", label: "Échéance" },
  { param: "fvcol", label: "Fix versions" },
] as const;

type OptionalColumns = { labels: boolean; dueDate: boolean; fixVersions: boolean };

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
  className = "",
}: {
  children: string;
  field: SortField;
  currentSort: CurrentSort;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const ariaSort =
    currentSort?.field === field
      ? currentSort.dir === "asc"
        ? "ascending"
        : "descending"
      : "none";

  return (
    <div role="columnheader" aria-sort={ariaSort} className={`${HEADER_CELL_CLASS} ${className}`}>
      <button
        type="button"
        className={`inline-flex min-h-7 items-center gap-1 rounded px-1 uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
          ariaSort === "none" ? "" : "text-foreground"
        }`}
        onClick={() => onSort(field)}
      >
        {children}
        <SortIcon field={field} currentSort={currentSort} />
      </button>
    </div>
  );
}

/**
 * « Colonnes » of the Liste: the optional fields its rows show as pills,
 * kept in the URL (and saved views) like the rest of the view state.
 */
export function ListColumnsMenu({
  showLabels = false,
  showDueDate = false,
  showFixVersions = false,
}: {
  showLabels?: boolean;
  showDueDate?: boolean;
  showFixVersions?: boolean;
}) {
  const viewUrl = useViewUrlState();
  const checked: Record<(typeof OPTIONAL_COLUMNS)[number]["param"], boolean> = {
    lblcol: showLabels,
    duecol: showDueDate,
    fvcol: showFixVersions,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="Configurer les colonnes">
          <Columns3 className="size-4" aria-hidden />
          Colonnes
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONAL_COLUMNS.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.param}
            checked={checked[column.param]}
            onCheckedChange={(next) => {
              viewUrl.replace((params) => {
                if (next) params.set(column.param, "1");
                else params.delete(column.param);
              }, { scroll: false });
            }}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ListRow({
  item,
  editing,
  columns,
  selectedKey,
  canSelectItems,
  bulkSelected,
  onToggleSelection,
}: {
  item: ListItem;
  editing: ItemRowEditing;
  columns: OptionalColumns;
  selectedKey?: string;
  canSelectItems: boolean;
  bulkSelected: boolean;
  onToggleSelection: (id: string, extendRange: boolean) => void;
}) {
  const viewUrl = useViewUrlState();

  return (
    <ItemRow
      item={{
        ...item,
        // Only tasks are estimated; the other levels keep an empty slot.
        estimatePoints: item.type === "tache" ? item.estimatePoints : undefined,
        labels: columns.labels ? item.labels : undefined,
        dueDate: columns.dueDate ? item.dueDate : undefined,
        fixVersions: columns.fixVersions ? item.fixVersions : undefined,
      }}
      editing={editing}
      onOpen={() => viewUrl.push((params) => params.set("item", item.key))}
      selected={item.key === selectedKey || bulkSelected}
      leading={
        canSelectItems ? (
          <RowSelectCheckbox
            itemKey={item.key}
            checked={bulkSelected}
            onToggle={(extendRange) => onToggleSelection(item.id, extendRange)}
          />
        ) : undefined
      }
    />
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
  startStep = null,
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
  showFixVersions = false,
  showLabels = false,
  showDueDate = false,
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
  /**
   * The level the live, unfiltered backlog still needs before tasks
   * (JIR-88); computed by the server, never from filtered rows.
   */
  startStep?: HierarchyStartStep | null;
  clearFiltersHref?: string;
  createDialogProps?: Pick<NewItemButtonProps, "backlogId" | "items" | "statuses" | "canScheduleItems" | "releaseOptions" | "fieldOptions" | "viewFilters">;
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
  showLabels?: boolean;
  showDueDate?: boolean;
}) {
  const canCreateItems = itemCapabilities?.create ?? legacyCanCreateItems;
  const canEditItems = itemCapabilities?.edit ?? legacyCanEditItems;
  const canTransitionItems = itemCapabilities?.transition ?? legacyCanTransitionItems;
  const canAssignItems = itemCapabilities?.assign ?? legacyCanAssignItems;
  const canBulkChangeItems = bulkCapabilities
    ? Object.values(bulkCapabilities).some(Boolean)
    : legacyCanBulkChangeItems;
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

  const editing: ItemRowEditing = {
    backlogKey,
    statuses,
    users,
    canEdit: canEditItems,
    canTransition: canTransitionItems,
    canAssign: canAssignItems,
  };
  const columns: OptionalColumns = {
    labels: showLabels,
    dueDate: showDueDate,
    fixVersions: showFixVersions,
  };

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
        <div role="table" aria-label="Liste des items">
          <div
            role="rowgroup"
            className="sticky top-0 z-20 border-b border-border bg-[var(--surface-2)]"
          >
            <div
              role="row"
              className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-0.5 py-0.5 pl-2 pr-3 sm:pr-3.5"
            >
              {canSelectItems ? (
                <div role="columnheader" className={HEADER_CELL_CLASS}>
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
                    className="mx-1 size-4 cursor-pointer accent-[var(--primary)]"
                  />
                </div>
              ) : null}
              <SortableHeader
                field="key"
                currentSort={currentSort}
                onSort={sortBy}
                className="-ml-1 min-w-[5.5rem]"
              >
                Clé
              </SortableHeader>
              <SortableHeader
                field="title"
                currentSort={currentSort}
                onSort={sortBy}
                className="min-w-0 flex-1"
              >
                Titre
              </SortableHeader>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
                <SortableHeader field="dueDate" currentSort={currentSort} onSort={sortBy}>
                  Échéance
                </SortableHeader>
                <SortableHeader field="priority" currentSort={currentSort} onSort={sortBy}>
                  Priorité
                </SortableHeader>
                <SortableHeader
                  field="status"
                  currentSort={currentSort}
                  onSort={sortBy}
                  className="w-28"
                >
                  Statut
                </SortableHeader>
                <div
                  role="columnheader"
                  className={`${HEADER_CELL_CLASS} hidden w-8 justify-center sm:flex`}
                  title="Points"
                >
                  <span aria-hidden>Pts</span>
                  <span className="sr-only">Points</span>
                </div>
                <div role="columnheader" className={`${HEADER_CELL_CLASS} hidden w-[26px] sm:flex`}>
                  <span className="sr-only">Assigné</span>
                </div>
              </div>
            </div>
          </div>
          {groups.map((group) => {
            const collapsed = grouped && collapsedGroups.has(group.key);
            return (
              <div role="rowgroup" key={group.key || "ungrouped"}>
                {grouped ? (
                  <div role="row" className="border-b border-border bg-[var(--surface-2)]">
                    <div role="rowheader" className="px-3 py-1.5">
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
                    </div>
                  </div>
                ) : null}
                {!collapsed &&
                  group.items.map((item) => (
                    <ListRow
                      key={item.id}
                      item={item}
                      editing={editing}
                      columns={columns}
                      selectedKey={selectedKey}
                      canSelectItems={canSelectItems}
                      bulkSelected={selection.selectedIds.has(item.id)}
                      onToggleSelection={toggleSelection}
                    />
                  ))}
              </div>
            );
          })}
        </div>
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
