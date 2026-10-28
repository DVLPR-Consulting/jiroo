"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
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
  ItemSection,
  ItemSectionHeader,
  ItemSectionSummary,
  SectionSelectAll,
  StatusPointsPills,
} from "@/components/items/item-section";
import { itemsSummaryLabel } from "@/lib/format/plural";
import {
  NewItemButton,
  type NewItemButtonProps,
} from "@/components/items/new-item-dialog";
import {
  SectionCreateFooter,
  useInlineCreateParent,
} from "@/components/items/section-create-footer";
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
  PlanningCapabilities,
  ReleaseCapabilities,
} from "@/lib/auth/capabilities";
import { pointsByStatusCategory } from "@/lib/items/status-points";
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

/** The Liste sort fields, in display order (the same `sort=` as before). */
const SORT_OPTIONS: Array<{ field: SortField; label: string }> = [
  { field: "key", label: "Clé" },
  { field: "title", label: "Titre" },
  { field: "dueDate", label: "Échéance" },
  { field: "priority", label: "Priorité" },
  { field: "status", label: "Statut" },
];

/** The optional pills of a Liste row, chosen with « Colonnes » (JIR-93). */
const OPTIONAL_COLUMNS = [
  { param: "lblcol", label: "Labels" },
  { param: "duecol", label: "Échéance" },
  { param: "fvcol", label: "Fix versions" },
] as const;

type OptionalColumns = { labels: boolean; dueDate: boolean; fixVersions: boolean };

/** The ungrouped Liste's single card, named like the « Tous les items » filter. */
const ALL_ITEMS = { key: "\u0000all", label: "Tous les items" };

/** Only tasks are estimated: the other levels neither add points nor count as unestimated. */
function estimateOf(item: ListItem) {
  return item.type === "tache" ? item.estimatePoints : undefined;
}

/**
 * One sort field of « Trier la liste »: a toggle button, pressed for the
 * active field, whose name states the direction (JIR-93). The rows are not
 * a table, so there are no column headers to sort.
 */
function SortButton({
  field,
  label,
  currentSort,
  onSort,
}: {
  field: SortField;
  label: string;
  currentSort: CurrentSort;
  onSort: (field: SortField) => void;
}) {
  const active = currentSort?.field === field ? currentSort.dir : null;
  const name =
    active === null
      ? `Trier par ${label}`
      : `Trier par ${label}, ${active === "asc" ? "croissant" : "décroissant"}`;

  return (
    <button
      type="button"
      aria-pressed={active !== null}
      aria-label={name}
      onClick={() => onSort(field)}
      className={`inline-flex min-h-7 items-center gap-1 rounded px-1.5 text-xs outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
        active === null ? "text-muted-foreground" : "bg-[var(--muted)] font-medium text-foreground"
      }`}
    >
      {label}
      {active === null ? (
        <ChevronsUpDown aria-hidden size={12} className="opacity-60" />
      ) : active === "asc" ? (
        <ArrowUp aria-hidden size={12} />
      ) : (
        <ArrowDown aria-hidden size={12} />
      )}
    </button>
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
      as="li"
      item={{
        ...item,
        // Only tasks are estimated; the other levels keep an empty slot.
        estimatePoints: estimateOf(item),
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
  canBrowseUsers = true,
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
  canScheduleItems: legacyCanScheduleItems = true,
  itemCapabilities,
  planningCapabilities,
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
  canBrowseUsers?: boolean;
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
  createDialogProps?: Pick<NewItemButtonProps, "backlogId" | "structure" | "statuses" | "canScheduleItems" | "releaseOptions" | "fieldOptions" | "viewFilters" | "templates">;
  canCreateItems?: boolean;
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
  canBulkChangeItems?: boolean;
  /** Inline creation makes a task under an epic, which needs this right. */
  canScheduleItems?: boolean;
  itemCapabilities?: ItemCapabilities;
  planningCapabilities?: PlanningCapabilities;
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
  const canScheduleItems = planningCapabilities?.rank ?? legacyCanScheduleItems;
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
  const { epics, parentId, setParentId } = useInlineCreateParent(createDialogProps?.structure);
  const total = groups.reduce((count, group) => count + group.items.length, 0);
  // One card per group, or a single « Tous les items » card (JIR-97).
  const sections: Group[] = useMemo(
    () =>
      grouped
        ? groups
        : [{ ...ALL_ITEMS, items: groups.flatMap((group) => group.items) }],
    [grouped, groups],
  );
  const visibleItems = useMemo(
    () =>
      sections.flatMap((section) =>
        collapsedGroups.has(section.key) ? [] : section.items,
      ),
    [collapsedGroups, sections],
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
    canBrowseUsers,
  };
  const columns: OptionalColumns = {
    labels: showLabels,
    dueDate: showDueDate,
    fixVersions: showFixVersions,
  };

  function renderRow(item: ListItem) {
    return (
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
    );
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

  // Like the Backlog sections, creation sits at the bottom of the card; a
  // grouped Liste has no single card where a new item would belong.
  const canCreateInCard = !grouped && canCreateItems && canScheduleItems;
  const startStepInFooter = canCreateInCard && createDialogProps !== undefined;
  const sortGroup = (
    <div
      role="group"
      aria-label="Trier la liste"
      className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5"
    >
      <span aria-hidden className="mr-0.5">Trier :</span>
      {SORT_OPTIONS.map((option) => (
        <SortButton
          key={option.field}
          field={option.field}
          label={option.label}
          currentSort={currentSort}
          onSort={sortBy}
        />
      ))}
    </div>
  );

  function renderSection(section: Group, index: number) {
    const expanded = !collapsedGroups.has(section.key);
    const sectionIds = expanded ? section.items.map((item) => item.id) : [];
    const selectedCount = sectionIds.filter((id) => selection.selectedIds.has(id)).length;
    const unestimatedCount = section.items.filter((item) => estimateOf(item) === null).length;
    const statusPoints = pointsByStatusCategory(
      section.items.map((item) => ({
        statusId: item.statusId,
        estimatePoints: estimateOf(item) ?? null,
      })),
      statuses,
    );
    const allItems = section.key === ALL_ITEMS.key;
    return (
      <ItemSection key={section.key || "ungrouped"} aria-label={section.label}>
        <ItemSectionHeader
          name={section.label}
          headingLevel={2}
          expanded={expanded}
          onExpandedChange={() => toggleGroup(section.key)}
          selectControl={
            canSelectItems && sectionIds.length > 0 ? (
              <SectionSelectAll
                checked={selectedCount === sectionIds.length}
                indeterminate={selectedCount > 0 && selectedCount < sectionIds.length}
                onChange={() =>
                  setSelection((current) => {
                    const next = new Set(current.selectedIds);
                    if (selectedCount === sectionIds.length) {
                      sectionIds.forEach((id) => next.delete(id));
                    } else {
                      sectionIds.forEach((id) => next.add(id));
                    }
                    return { selectedIds: next, anchorId: null };
                  })
                }
                label={
                  allItems
                    ? "Sélectionner tous les items visibles"
                    : `Sélectionner tous les items de ${section.label}`
                }
              />
            ) : null
          }
          summary={
            <ItemSectionSummary>
              {itemsSummaryLabel(section.items.length, unestimatedCount)}
            </ItemSectionSummary>
          }
          aside={<StatusPointsPills value={statusPoints} />}
          // « Trier la liste » orders every card: it sits once, in the first header.
          meta={index === 0 ? sortGroup : null}
        />
        {expanded ? (
          // Rows are list items, as tickets are listed elsewhere (no fake table).
          <div role="list" aria-label={allItems ? "Liste des items" : section.label}>
            {section.items.map(renderRow)}
          </div>
        ) : null}
        {expanded && canCreateInCard ? (
          <SectionCreateFooter
            backlogId={backlogId}
            backlogKey={backlogKey}
            sprintId={null}
            contextLabel={section.label}
            startStep={startStep}
            filtersActive={filtersActive}
            clearFiltersHref={clearFiltersHref}
            dialogProps={createDialogProps}
            parents={epics}
            parentId={parentId}
            onParentChange={setParentId}
            bordered={section.items.length > 0}
          />
        ) : null}
      </ItemSection>
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      onKeyDown={canSelectItems ? handleSelectionShortcut : undefined}
    >
      <div
        className="flex flex-col gap-4 p-3 sm:p-4"
        {...(grouped ? { role: "region", "aria-label": "Liste des items" } : {})}
      >
        {startStep && !filtersActive && createDialogProps ? (
          <ViewStartGuide
            step={startStep}
            backlogKey={backlogKey}
            dialogProps={createDialogProps}
            canCreateItems={canCreateItems}
            // With the scheduling right, the button sits in place of
            // « Créer un item » at the bottom of the card, as in the Backlog.
            showAction={!startStepInFooter}
            variant="callout"
          />
        ) : null}
        {sections.map(renderSection)}
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
  );
}
