"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Inbox, SearchX } from "lucide-react";
import { rankBacklogItemAction } from "@/app/actions/items";
import {
  moveSprintItemAction as defaultMoveSprintItemAction,
  reorderSprintAction as defaultReorderSprintAction,
} from "@/app/actions/sprints";
import { KindIcon } from "@/components/icons/kind-icon";
import { TypeIcon } from "@/components/icons/type-icon";
import { BulkItemToolbar } from "@/components/items/bulk-item-toolbar";
import {
  FixVersionChips,
  type FixVersionOption,
} from "@/components/items/fix-version-picker";
import {
  InlineAssignee,
  InlineEstimate,
  InlinePriority,
  InlineStatus,
} from "@/components/items/inline-item-field";
import { InlineCreateItem } from "@/components/items/inline-create-item";
import { type NewItemButtonProps } from "@/components/items/new-item-dialog";
import { CreateSprintButton } from "@/components/sprints/sprint-form-dialog";
import {
  CompleteSprintDialog,
  StartSprintDialog,
} from "@/components/sprints/sprint-lifecycle-dialogs";
import { SprintSectionHeader } from "@/components/sprints/sprint-section-header";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  BulkItemCapabilities,
  ItemCapabilities,
  PlanningCapabilities,
  ReleaseCapabilities,
} from "@/lib/auth/capabilities";
import {
  PRIORITIES,
  type ItemKind,
  type Priority,
} from "@/lib/design/constants";
import {
  emptySelection,
  reconcileSelection,
  selectAllVisible,
  toggleItemSelection,
} from "@/lib/items/selection";
import { sprintBacklogCollisionDetection } from "@/lib/items/sprint-dnd";
import type {
  SprintMetrics,
  SprintPlanningSection,
  SprintSummary,
} from "@/lib/items/sprint-planning";
import { countLabel } from "@/lib/format/plural";
import {
  calculateSprintMetrics,
  sprintStartCommitmentFor,
  type ActiveSprintStartCommitment,
  type RecentVelocityContext,
} from "@/lib/items/sprint-planning";
import {
  pointsByStatusCategory,
  type PointsByStatusCategory,
} from "@/lib/items/status-points";

type StatusOption = {
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
};

type UserOption = { id: string; name: string };

export type BacklogItem = {
  id: string;
  key: string;
  title: string;
  type: "tache";
  kind: ItemKind;
  statusId: string;
  priority: number;
  estimatePoints: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
  rank: string;
  blocked: boolean;
  fixVersions?: FixVersionOption[];
  /** The parent epic, shown as a pill (a tâche always has one). */
  parent?: { key: string; title: string } | null;
};

type BacklogGroup = {
  key: string;
  label: string;
  items: BacklogItem[];
};

type RankItemAction = (input: {
  backlogKey: string;
  backlogId: string;
  id: string;
  beforeId: string | null;
  afterId: string | null;
}) => Promise<
  | { ok: true; item: unknown }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
>;

const pointFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
});

function asPriority(value: number): Priority {
  return PRIORITIES.includes(value as Priority) ? (value as Priority) : 0;
}

/**
 * Editable but empty values (no priority, no estimate) stay out of sight
 * until the row is hovered or the control is focused (« ne rien afficher
 * quand une valeur est vide »), so inline editing is never lost.
 */
const REVEAL_ON_ROW_HOVER =
  "opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100";

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      ref={(node) => {
        if (node) node.indeterminate = indeterminate;
      }}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="mx-1 size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
    />
  );
}

function BacklogRow({
  item,
  statuses,
  users,
  backlogKey,
  selectedKey,
  canSelectItems,
  canEditItems,
  canTransitionItems,
  canAssignItems,
  canScheduleItems,
  manualOrder,
  mutationPending,
  bulkSelected,
  onToggleSelection,
}: {
  item: BacklogItem;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  canSelectItems: boolean;
  canEditItems: boolean;
  canTransitionItems: boolean;
  canAssignItems: boolean;
  canScheduleItems: boolean;
  manualOrder: boolean;
  mutationPending: boolean;
  bulkSelected: boolean;
  onToggleSelection: (id: string, extendRange: boolean) => void;
}) {
  const viewUrl = useViewUrlState();
  const priority = asPriority(item.priority);
  const fixVersions = item.fixVersions ?? [];
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { key: item.key, title: item.title },
    disabled: !canScheduleItems || !manualOrder || mutationPending,
  });

  function openItem() {
    viewUrl.push((params) => params.set("item", item.key));
  }

  return (
    <div
      ref={setNodeRef}
      role="row"
      tabIndex={0}
      data-shortcut-item={item.key}
      aria-label={`${item.key} — ${item.title}`}
      onClick={openItem}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openItem();
        }
      }}
      className={`group/row flex min-h-[var(--row-h)] cursor-pointer flex-wrap items-center gap-x-2.5 gap-y-0.5 border-b border-border py-0.5 pl-2 pr-3 transition-colors last:border-b-0 hover:bg-[var(--muted)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] sm:pr-3.5 ${
        selectedKey === item.key || bulkSelected ? "bg-[var(--accent-subtle)]" : ""
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
    >
      <div role="cell" className="flex shrink-0 items-center gap-0.5">
        {canSelectItems ? (
          <input
            type="checkbox"
            checked={bulkSelected}
            onChange={() => undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelection(item.id, event.shiftKey);
            }}
            aria-label={`Sélectionner ${item.key}`}
            className="mx-1 size-4 cursor-pointer accent-[var(--primary)]"
          />
        ) : null}
        {manualOrder && canScheduleItems ? (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            aria-label={`Déplacer ${item.key}`}
            data-rank-handle={item.id}
            disabled={mutationPending}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex size-6 cursor-grab items-center justify-center rounded text-[var(--subtle-foreground)] outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GripVertical aria-hidden size={15} />
          </button>
        ) : null}
      </div>
      <div role="cell" className="flex min-w-0 flex-1 basis-48 items-center gap-2">
        <TypeIcon type={item.type} />
        <span className="shrink-0 font-mono text-[11.5px] font-medium text-muted-foreground">
          {item.key}
        </span>
        <span className="min-w-0 truncate text-sm">{item.title}</span>
        {item.blocked ? (
          <span
            className="inline-flex flex-none items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              color: "color-mix(in oklch, var(--danger) 80%, var(--foreground))",
              background: "color-mix(in oklch, var(--danger) 14%, transparent)",
            }}
          >
            bloqué
          </span>
        ) : null}
      </div>
      <div
        role="cell"
        className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-0.5"
      >
        {item.kind === "bug" ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11.5px] font-medium"
            style={{
              color: "color-mix(in oklch, var(--danger) 80%, var(--foreground))",
              background: "color-mix(in oklch, var(--danger) 12%, transparent)",
            }}
          >
            <span aria-hidden className="inline-flex">
              <KindIcon kind="bug" />
            </span>
            Bug
          </span>
        ) : null}
        {item.parent ? (
          <span
            className="inline-flex max-w-40 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--accent-subtle-fg)]"
            title={`${item.parent.key} — ${item.parent.title}`}
          >
            <TypeIcon type="epic" size={11} />
            <span className="truncate">{item.parent.title}</span>
          </span>
        ) : null}
        {priority !== 0 ? (
          <InlinePriority
            itemId={item.id}
            backlogKey={backlogKey}
            priority={priority}
            readOnly={!canEditItems}
          />
        ) : canEditItems ? (
          <span className={REVEAL_ON_ROW_HOVER}>
            <InlinePriority itemId={item.id} backlogKey={backlogKey} priority={0} />
          </span>
        ) : null}
        {fixVersions.length > 0 ? <FixVersionChips versions={fixVersions} /> : null}
        <span className="inline-flex w-28 min-w-0 justify-start">
          <InlineStatus
            itemId={item.id}
            backlogKey={backlogKey}
            statusId={item.statusId}
            statuses={statuses}
            readOnly={!canEditItems || !canTransitionItems}
          />
        </span>
        <span
          className={`inline-flex w-8 justify-center ${
            item.estimatePoints === null && canEditItems ? REVEAL_ON_ROW_HOVER : ""
          }`}
        >
          <InlineEstimate
            itemId={item.id}
            backlogKey={backlogKey}
            estimatePoints={item.estimatePoints}
            readOnly={!canEditItems}
            compact
          />
        </span>
        <InlineAssignee
          itemId={item.id}
          backlogKey={backlogKey}
          assigneeId={item.assigneeId}
          assigneeName={item.assigneeName}
          users={users}
          readOnly={!canEditItems || !canAssignItems}
          compact
        />
      </div>
    </div>
  );
}

type RowListProps = {
  label: string;
  groups: BacklogGroup[];
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  canSelectItems: boolean;
  canEditItems: boolean;
  canTransitionItems: boolean;
  canAssignItems: boolean;
  canScheduleItems: boolean;
  manualOrder: boolean;
  mutationPending: boolean;
  selection: ReadonlySet<string>;
  onToggleSelection: (id: string, extendRange: boolean) => void;
};

/** Compact, column-less rows of one section (Jira backlog). */
function BacklogRowList({
  label,
  groups,
  grouped,
  selection,
  ...rowProps
}: RowListProps) {
  return (
    <div role="table" aria-label={label}>
      {groups.map((group) => (
        <div role="rowgroup" key={group.key || "rows"}>
          {grouped ? (
            <div role="row" className="border-b border-border bg-[var(--surface-2)]">
              <div role="rowheader" className="px-3 py-1.5 text-xs font-semibold">
                {group.label} · {group.items.length}
              </div>
            </div>
          ) : null}
          <SortableContext
            items={group.items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            {group.items.map((item) => (
              <BacklogRow
                key={item.id}
                item={item}
                {...rowProps}
                bulkSelected={selection.has(item.id)}
              />
            ))}
          </SortableContext>
        </div>
      ))}
    </div>
  );
}

function LegacyItemBacklog({
  groups,
  grouped,
  statuses,
  users,
  backlogKey,
  backlogId,
  selectedKey,
  filtersActive = false,
  hasItems,
  clearFiltersHref,
  canEditItems = true,
  canTransitionItems = true,
  canAssignItems = true,
  canScheduleItems = true,
  canBulkChangeItems = true,
  bulkCapabilities,
  releaseOptions = [],
  releaseCapabilities,
  manualOrder = false,
  rankItemAction = rankBacklogItemAction,
}: {
  groups: BacklogGroup[];
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  backlogId: string;
  selectedKey?: string;
  filtersActive?: boolean;
  hasItems?: boolean;
  clearFiltersHref?: string;
  canCreateItems?: boolean;
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
  canScheduleItems?: boolean;
  canManageSprints?: boolean;
  canBulkChangeItems?: boolean;
  itemCapabilities?: ItemCapabilities;
  planningCapabilities?: PlanningCapabilities;
  bulkCapabilities?: BulkItemCapabilities;
  releaseOptions?: FixVersionOption[];
  releaseCapabilities?: ReleaseCapabilities;
  manualOrder?: boolean;
  rankItemAction?: RankItemAction;
}) {
  const router = useRouter();
  const visibleItems = useMemo(
    () => groups.flatMap((group) => group.items),
    [groups],
  );
  const [orderedItems, setOrderedItems] = useState(visibleItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const [selection, setSelection] = useState(emptySelection);
  const [selectionScope, setSelectionScope] = useState<string | null>(null);
  const snapshot = useRef<BacklogItem[] | null>(null);
  const lastIncomingItems = useRef(visibleItems);
  const pendingIncomingItems = useRef<BacklogItem[] | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (lastIncomingItems.current !== visibleItems) {
      lastIncomingItems.current = visibleItems;
      pendingIncomingItems.current = visibleItems;
    }
    if (
      activeId === null &&
      !mutationPending &&
      pendingIncomingItems.current !== null
    ) {
      setOrderedItems(pendingIncomingItems.current);
      pendingIncomingItems.current = null;
    }
  }, [activeId, mutationPending, visibleItems]);

  const displayedItems = manualOrder ? orderedItems : visibleItems;
  const displayedGroups = manualOrder
    ? [{ key: "", label: "", items: orderedItems }]
    : groups;
  const totalPoints = displayedItems.reduce(
    (total, item) => total + (item.estimatePoints ?? 0),
    0,
  );
  const unestimatedCount = displayedItems.filter(
    (item) => item.estimatePoints === null,
  ).length;
  const showNoResults = filtersActive && (hasItems ?? displayedItems.length > 0);
  const visibleIds = useMemo(
    () => displayedItems.map((item) => item.id),
    [displayedItems],
  );
  const visibleSignature = visibleIds.join("\u001f");
  if (selectionScope !== visibleSignature) {
    setSelectionScope(visibleSignature);
    setSelection((current) => reconcileSelection(current, visibleIds));
  }
  const selectedItems = displayedItems.filter((item) =>
    selection.selectedIds.has(item.id),
  );
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selection.selectedIds.has(id));
  const partlySelected = selection.selectedIds.size > 0 && !allSelected;
  const canSelectItems = releaseCapabilities?.bulkAssignItems === true || (
    bulkCapabilities
      ? Object.values(bulkCapabilities).some(Boolean)
      : canBulkChangeItems && (
        canEditItems || canTransitionItems || canAssignItems || canScheduleItems
      )
  );

  function toggleSelection(id: string, extendRange: boolean) {
    setSelection((current) =>
      toggleItemSelection(current, visibleIds, id, extendRange),
    );
  }

  function handleSelectionShortcut(event: React.KeyboardEvent<HTMLElement>) {
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

  function restoreFocus(itemId: string) {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-rank-handle="${itemId}"]`)
        ?.focus();
    });
  }

  function onDragStart(event: DragStartEvent) {
    snapshot.current = orderedItems;
    setActiveId(String(event.active.id));
    setRankError(null);
  }

  function onDragCancel() {
    const draggedId = activeId;
    if (snapshot.current) setOrderedItems(snapshot.current);
    snapshot.current = null;
    setActiveId(null);
    if (draggedId) restoreFocus(draggedId);
  }

  function onDragEnd(event: DragEndEvent) {
    const movedId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const rollback = snapshot.current ?? orderedItems;
    snapshot.current = null;
    setActiveId(null);
    if (!overId || movedId === overId) return;

    const oldIndex = orderedItems.findIndex((item) => item.id === movedId);
    const newIndex = orderedItems.findIndex((item) => item.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const nextItems = arrayMove(orderedItems, oldIndex, newIndex);
    const movedIndex = nextItems.findIndex((item) => item.id === movedId);
    const beforeId = movedIndex > 0 ? nextItems[movedIndex - 1]!.id : null;
    const afterId =
      movedIndex < nextItems.length - 1 ? nextItems[movedIndex + 1]!.id : null;
    setOrderedItems(nextItems);
    setMutationPending(true);

    void rankItemAction({
      backlogKey,
      backlogId,
      id: movedId,
      beforeId,
      afterId,
    })
      .then((result) => {
        if (!result.ok) {
          setOrderedItems(rollback);
          setRankError("Classement impossible.");
          restoreFocus(movedId);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        setOrderedItems(rollback);
        setRankError("Classement impossible.");
        restoreFocus(movedId);
      })
      .finally(() => setMutationPending(false));
  }

  const announcements = {
    onDragStart({ active }: DragStartEvent) {
      const item = orderedItems.find((candidate) => candidate.id === String(active.id));
      return item ? `${item.key} saisi pour classement.` : "Item saisi pour classement.";
    },
    onDragOver({ active, over }: DragOverEvent) {
      const item = orderedItems.find((candidate) => candidate.id === String(active.id));
      const position = over
        ? orderedItems.findIndex((candidate) => candidate.id === String(over.id)) + 1
        : 0;
      return item && position > 0
        ? `${item.key}, position ${position} sur ${orderedItems.length}.`
        : undefined;
    },
    onDragEnd({ active, over }: DragEndEvent) {
      const item = orderedItems.find((candidate) => candidate.id === String(active.id));
      const position = over
        ? orderedItems.findIndex((candidate) => candidate.id === String(over.id)) + 1
        : 0;
      return item && position > 0
        ? `${item.key} déposé en position ${position} sur ${orderedItems.length}.`
        : "Classement annulé.";
    },
    onDragCancel() {
      return "Classement annulé.";
    },
  };

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby="backlog-heading"
      onKeyDown={canSelectItems ? handleSelectionShortcut : undefined}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-3 sm:px-4">
        {canSelectItems && displayedItems.length > 0 ? (
          <SelectAllCheckbox
            checked={allSelected}
            indeterminate={partlySelected}
            onChange={() =>
              setSelection(allSelected ? emptySelection() : selectAllVisible(visibleIds))
            }
            label="Sélectionner toutes les tâches visibles"
          />
        ) : null}
        <h2 id="backlog-heading" className="t-h2">
          Backlog
        </h2>
        <span className="text-xs text-muted-foreground">
          {countLabel(displayedItems.length, "item", "items")}
        </span>
        <span className="text-xs text-muted-foreground">
          {countLabel(totalPoints, "point", "points", pointFormatter.format)}
        </span>
        <span className="text-xs text-muted-foreground">
          {countLabel(unestimatedCount, "non estimé", "non estimés")}
        </span>
        {canScheduleItems && !manualOrder && displayedItems.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            Effacez le tri ou le groupement pour modifier l’ordre manuel.
          </span>
        ) : null}
      </header>

      {rankError ? (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-[var(--radius-md)] bg-[var(--danger)] px-3 py-2 text-sm text-white"
        >
          {rankError}
        </div>
      ) : null}

      {displayedItems.length === 0 ? (
        <div className="grid flex-1 place-items-center p-10">
          <EmptyState
            icon={
              showNoResults ? (
                <SearchX className="size-5" />
              ) : (
                <Inbox className="size-5" />
              )
            }
            title={showNoResults ? "Aucun résultat" : "Backlog vide"}
            description={
              showNoResults
                ? "Aucune tâche du backlog ne correspond aux filtres actifs."
                : "Créez une tâche pour commencer à planifier ce backlog."
            }
            action={
              showNoResults && clearFiltersHref ? (
                <Link
                  href={clearFiltersHref}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Effacer les filtres
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <DndContext
          id={`backlog-rank-${backlogId}`}
          sensors={sensors}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                "Appuyez sur espace pour saisir une tâche, utilisez les flèches verticales, puis espace pour déposer ou Échap pour annuler.",
            },
          }}
          onDragStart={manualOrder && canScheduleItems ? onDragStart : undefined}
          onDragEnd={manualOrder && canScheduleItems ? onDragEnd : undefined}
          onDragCancel={manualOrder && canScheduleItems ? onDragCancel : undefined}
        >
        <div className="min-h-0 flex-1 overflow-auto">
          <BacklogRowList
            label="Backlog"
            groups={displayedGroups}
            grouped={grouped}
            statuses={statuses}
            users={users}
            backlogKey={backlogKey}
            selectedKey={selectedKey}
            canSelectItems={canSelectItems}
            canEditItems={canEditItems}
            canTransitionItems={canTransitionItems}
            canAssignItems={canAssignItems}
            canScheduleItems={canScheduleItems}
            manualOrder={manualOrder}
            mutationPending={mutationPending}
            selection={selection.selectedIds}
            onToggleSelection={toggleSelection}
          />
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
              canScheduleItems={canScheduleItems}
              canBulkChangeItems={canBulkChangeItems}
              capabilities={bulkCapabilities}
              releaseOptions={releaseOptions}
              releaseCapabilities={releaseCapabilities}
              onClearSelection={() => setSelection(emptySelection())}
              onMutationSuccess={() => router.refresh()}
            />
          ) : null}
        </div>
        </DndContext>
      )}
    </section>
  );
}

type SharedBacklogProps = {
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  backlogId: string;
  selectedKey?: string;
  filtersActive?: boolean;
  hasItems?: boolean;
  clearFiltersHref?: string;
  canCreateItems?: boolean;
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
  canScheduleItems?: boolean;
  canManageSprints?: boolean;
  canBulkChangeItems?: boolean;
  itemCapabilities?: ItemCapabilities;
  planningCapabilities?: PlanningCapabilities;
  bulkCapabilities?: BulkItemCapabilities;
  releaseOptions?: FixVersionOption[];
  releaseCapabilities?: ReleaseCapabilities;
  manualOrder?: boolean;
  rankItemAction?: RankItemAction;
};

type LegacyBacklogProps = SharedBacklogProps & {
  groups: BacklogGroup[];
};

type SprintBacklogSection = SprintPlanningSection<BacklogItem> & {
  groups: BacklogGroup[];
  /** Points per status category of the whole section (server-computed). */
  statusPoints?: PointsByStatusCategory;
};

type MoveSprintItemAction = (input: {
  backlogKey: string;
  backlogId: string;
  itemId: string;
  sprintId: string | null;
  beforeId: string | null;
  afterId: string | null;
}) => Promise<
  | { ok: true; item: unknown }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
>;

type SprintBacklogProps = SharedBacklogProps & {
  sections: SprintBacklogSection[];
  sprints: SprintSummary[];
  recentVelocity?: RecentVelocityContext | null;
  activeSprintCommitment?: ActiveSprintStartCommitment | null;
  moveSprintItemAction?: MoveSprintItemAction;
  reorderSprintAction?: typeof defaultReorderSprintAction;
  createDialogProps?: Pick<NewItemButtonProps, "items" | "statuses" | "canScheduleItems" | "releaseOptions" | "fieldOptions">;
};

function SprintSectionDropZone({
  sectionId,
  label,
  children,
}: {
  sectionId: string;
  label: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${sectionId}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-sprint-section={sectionId}
      data-drop-target={isOver ? "true" : undefined}
      className={`rounded-[var(--radius-lg)] border bg-[var(--surface)] ${
        isOver ? "border-[var(--ring)] bg-[var(--accent-subtle)]" : "border-border"
      }`}
    >
      {children}
    </section>
  );
}

function SprintItemBacklog({
  sections,
  sprints,
  grouped,
  statuses,
  users,
  backlogKey,
  backlogId,
  selectedKey,
  canCreateItems: legacyCanCreateItems = true,
  canEditItems: legacyCanEditItems = true,
  canTransitionItems: legacyCanTransitionItems = true,
  canAssignItems: legacyCanAssignItems = true,
  canScheduleItems: legacyCanScheduleItems = true,
  canManageSprints: legacyCanManageSprints = true,
  canBulkChangeItems: legacyCanBulkChangeItems = true,
  itemCapabilities,
  planningCapabilities,
  bulkCapabilities,
  releaseOptions = [],
  releaseCapabilities,
  manualOrder = false,
  rankItemAction = rankBacklogItemAction,
  moveSprintItemAction = defaultMoveSprintItemAction,
  reorderSprintAction = defaultReorderSprintAction,
  createDialogProps,
  recentVelocity = null,
  activeSprintCommitment = null,
}: SprintBacklogProps) {
  const canCreateItems = itemCapabilities?.create ?? legacyCanCreateItems;
  const canEditItems = itemCapabilities?.edit ?? legacyCanEditItems;
  const canTransitionItems = itemCapabilities?.transition ?? legacyCanTransitionItems;
  const canAssignItems = itemCapabilities?.assign ?? legacyCanAssignItems;
  const canScheduleItems = planningCapabilities?.rank ?? legacyCanScheduleItems;
  const canManageSprints = planningCapabilities?.manageSprints ?? legacyCanManageSprints;
  const canBulkChangeItems = bulkCapabilities
    ? Object.values(bulkCapabilities).some(Boolean)
    : legacyCanBulkChangeItems;
  const router = useRouter();
  const [renderedSections, setRenderedSections] = useState(sections);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((section) => [section.id, true])),
  );
  const [selection, setSelection] = useState(emptySelection);
  const [selectionScope, setSelectionScope] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rankError, setRankError] = useState<string | null>(null);
  const canSelectItems = releaseCapabilities?.bulkAssignItems === true || (
    bulkCapabilities
      ? Object.values(bulkCapabilities).some(Boolean)
      : canBulkChangeItems && (
        canEditItems || canTransitionItems || canAssignItems || canScheduleItems
      )
  );
  const sectionSnapshot = useRef<SprintBacklogSection[] | null>(null);
  const epics = useMemo(
    () =>
      (createDialogProps?.items ?? [])
        .filter((item) => item.type === "epic")
        .map(({ id, key, title }) => ({ id, key, title })),
    [createDialogProps?.items],
  );
  // Inline creation remembers the last epic used, across sections.
  const [createParentId, setCreateParentId] = useState(() =>
    epics.length === 1 ? epics[0]!.id : "",
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const visibleItems = useMemo(
    () =>
      renderedSections.flatMap((section) =>
        (expanded[section.id] ?? true) ? section.items : [],
      ),
    [expanded, renderedSections],
  );
  const visibleIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const visibleSignature = visibleIds.join("\u001f");

  if (selectionScope !== visibleSignature) {
    setSelectionScope(visibleSignature);
    setSelection((current) => reconcileSelection(current, visibleIds));
  }
  useEffect(() => {
    if (activeId !== null || mutationPending) return;
    const handle = window.setTimeout(() => setRenderedSections(sections), 0);
    return () => window.clearTimeout(handle);
  }, [activeId, mutationPending, sections]);

  const selectedItems = visibleItems.filter((item) => selection.selectedIds.has(item.id));

  function toggleSelection(id: string, extendRange: boolean) {
    setSelection((current) =>
      toggleItemSelection(current, visibleIds, id, extendRange),
    );
  }

  function handleSelectionShortcut(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    // Portaled menus and dialogs bubble through React but not through this
    // DOM subtree; their keys (e.g. Escape closing a menu) are not ours.
    if (!event.currentTarget.contains(target)) return;
    if (target.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection(selectAllVisible(visibleIds));
    } else if (event.key === "Escape" && selection.selectedIds.size > 0) {
      event.preventDefault();
      setSelection(emptySelection());
    }
  }

  function restoreFocus(itemId: string) {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-rank-handle="${itemId}"]`)
        ?.focus();
    });
  }

  const announcements = {
    onDragStart({ active }: DragStartEvent) {
      const item = visibleItems.find((candidate) => candidate.id === String(active.id));
      return item ? `${item.key} saisi pour planification.` : "Tâche saisie pour planification.";
    },
    onDragOver({ active, over }: DragOverEvent) {
      const item = visibleItems.find((candidate) => candidate.id === String(active.id));
      const position = over
        ? visibleItems.findIndex((candidate) => candidate.id === String(over.id)) + 1
        : 0;
      return item && position > 0
        ? `${item.key}, position ${position} sur ${visibleItems.length}.`
        : undefined;
    },
    onDragEnd({ active, over }: DragEndEvent) {
      const item = visibleItems.find((candidate) => candidate.id === String(active.id));
      const position = over
        ? visibleItems.findIndex((candidate) => candidate.id === String(over.id)) + 1
        : 0;
      return item && position > 0
        ? `${item.key} déposé en position ${position} sur ${visibleItems.length}.`
        : "Planification annulée.";
    },
    onDragCancel() {
      return "Planification annulée.";
    },
  };

  function sectionWithItems(
    section: SprintBacklogSection,
    nextItems: BacklogItem[],
  ): SprintBacklogSection {
    const planningItems = nextItems.map((item) => ({
      ...item,
      done:
        statuses.find((status) => status.id === item.statusId)?.category === "done",
    }));
    return {
      ...section,
      items: nextItems,
      groups: [{ key: "", label: "", items: nextItems }],
      statusPoints: pointsByStatusCategory(nextItems, statuses),
      metrics: calculateSprintMetrics(
        planningItems,
        section.sprint?.capacityPoints ?? null,
        section.kind === "backlog" ? null : recentVelocity,
        // Scope moved after start never rewrites the active sprint's commitment.
        sprintStartCommitmentFor(section.sprint, activeSprintCommitment),
      ),
    };
  }

  function handleDragStart(event: DragStartEvent) {
    sectionSnapshot.current = renderedSections;
    setActiveId(String(event.active.id));
    setRankError(null);
  }

  function handleDragCancel() {
    const movedId = activeId;
    if (sectionSnapshot.current) setRenderedSections(sectionSnapshot.current);
    sectionSnapshot.current = null;
    setActiveId(null);
    if (movedId) restoreFocus(movedId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const movedId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const rollback = sectionSnapshot.current ?? renderedSections;
    sectionSnapshot.current = null;
    setActiveId(null);
    if (!overId || overId === movedId) return;

    const sourceIndex = renderedSections.findIndex((section) =>
      section.items.some((item) => item.id === movedId),
    );
    const targetIndex = overId.startsWith("section:")
      ? renderedSections.findIndex((section) => section.id === overId.slice(8))
      : renderedSections.findIndex((section) =>
          section.items.some((item) => item.id === overId),
        );
    if (sourceIndex < 0 || targetIndex < 0) return;
    const source = renderedSections[sourceIndex]!;
    const target = renderedSections[targetIndex]!;
    const moved = source.items.find((item) => item.id === movedId)!;
    const nextSections = [...renderedSections];
    let targetItems: BacklogItem[];

    if (sourceIndex === targetIndex) {
      const oldIndex = source.items.findIndex((item) => item.id === movedId);
      const newIndex = overId.startsWith("section:")
        ? source.items.length - 1
        : source.items.findIndex((item) => item.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      targetItems = arrayMove(source.items, oldIndex, newIndex);
      nextSections[sourceIndex] = sectionWithItems(source, targetItems);
    } else {
      const sourceItems = source.items.filter((item) => item.id !== movedId);
      targetItems = [...target.items];
      const insertIndex = overId.startsWith("section:")
        ? targetItems.length
        : Math.max(0, targetItems.findIndex((item) => item.id === overId));
      targetItems.splice(insertIndex, 0, moved);
      nextSections[sourceIndex] = sectionWithItems(source, sourceItems);
      nextSections[targetIndex] = sectionWithItems(target, targetItems);
    }

    const movedIndex = targetItems.findIndex((item) => item.id === movedId);
    const beforeId = movedIndex > 0 ? targetItems[movedIndex - 1]!.id : null;
    const afterId = movedIndex < targetItems.length - 1
      ? targetItems[movedIndex + 1]!.id
      : null;
    setRenderedSections(nextSections);
    setMutationPending(true);
    const sameSection = sourceIndex === targetIndex;
    const failureMessage = sameSection
      ? "Classement impossible."
      : "Planification impossible.";
    const mutation = sameSection
      ? rankItemAction({
          backlogKey,
          backlogId,
          id: movedId,
          beforeId,
          afterId,
        })
      : moveSprintItemAction({
          backlogKey,
          backlogId,
          itemId: movedId,
          sprintId: target.sprint?.id ?? null,
          beforeId,
          afterId,
        });
    void mutation
      .then((result) => {
        if (!result.ok) {
          setRenderedSections(rollback);
          setRankError(failureMessage);
          restoreFocus(movedId);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        setRenderedSections(rollback);
        setRankError(failureMessage);
        restoreFocus(movedId);
      })
      .finally(() => setMutationPending(false));
  }

  function reorderPlannedSprint(sprintId: string, direction: -1 | 1) {
    const planned = renderedSections.filter(
      (section) => section.kind === "planned" && section.sprint,
    );
    const currentIndex = planned.findIndex((section) => section.id === sprintId);
    const insertIndex = currentIndex + direction;
    if (currentIndex < 0 || insertIndex < 0 || insertIndex >= planned.length) return;
    const withoutCurrent = planned.filter((section) => section.id !== sprintId);
    const beforeId = insertIndex > 0 ? withoutCurrent[insertIndex - 1]?.id ?? null : null;
    const afterId = withoutCurrent[insertIndex]?.id ?? null;
    setRankError(null);
    void reorderSprintAction({
      backlogKey,
      backlogId,
      id: sprintId,
      beforeId,
      afterId,
    }).then((result) => {
      if (!result.ok) {
        setRankError(result.error);
        return;
      }
      router.refresh();
    }).catch(() => setRankError("Classement du sprint impossible."));
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby="sprint-backlog-heading"
      onKeyDown={canSelectItems ? handleSelectionShortcut : undefined}
    >
      {/* The page title comes from the shell; this names the planning region. */}
      <h2 id="sprint-backlog-heading" className="sr-only">Planification</h2>
      {!manualOrder && visibleItems.length > 0 && canScheduleItems ? (
        <p className="mx-3 mt-3 text-xs text-muted-foreground sm:mx-4">
          Effacez le tri ou le groupement pour modifier l’ordre manuel.
        </p>
      ) : null}
      {rankError ? (
        <p role="alert" className="mx-3 mt-3 rounded-lg bg-destructive px-3 py-2 text-sm text-destructive-foreground sm:mx-4">
          {rankError}
        </p>
      ) : null}
      <DndContext
        id={`sprint-backlog-${backlogId}`}
        sensors={sensors}
        collisionDetection={sprintBacklogCollisionDetection}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Appuyez sur espace pour saisir une tâche, utilisez les flèches verticales, puis espace pour déposer ou Échap pour annuler.",
          },
        }}
        onDragStart={manualOrder && canScheduleItems ? handleDragStart : undefined}
        onDragEnd={manualOrder && canScheduleItems ? handleDragEnd : undefined}
        onDragCancel={manualOrder && canScheduleItems ? handleDragCancel : undefined}
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-4 p-3 sm:p-4">
          {renderedSections.map((section) => {
            const sectionExpanded = expanded[section.id] ?? true;
            const sectionVisibleIds = sectionExpanded
              ? section.items.map((item) => item.id)
              : [];
            const selectedCount = sectionVisibleIds.filter((id) => selection.selectedIds.has(id)).length;
            const planned = renderedSections.filter((candidate) => candidate.kind === "planned");
            const plannedIndex = planned.findIndex((candidate) => candidate.id === section.id);
            const completedItems = section.items.filter(
              (item) => statuses.find((status) => status.id === item.statusId)?.category === "done",
            );
            const incompleteItems = section.items.filter(
              (item) => statuses.find((status) => status.id === item.statusId)?.category !== "done",
            );
            const canCreateInSection =
              canCreateItems && (section.kind === "backlog" || canScheduleItems);
            const metricsFor = (rows: BacklogItem[]) =>
              calculateSprintMetrics(
                rows.map((item) => ({ ...item, done: false })),
                null,
              );
            return (
              <SprintSectionDropZone
                key={section.id}
                sectionId={section.id}
                label={section.sprint?.name ?? "Backlog"}
              >
                <SprintSectionHeader
                  kind={section.kind}
                  sprint={section.sprint}
                  metrics={section.metrics as SprintMetrics}
                  statusPoints={
                    section.statusPoints ?? pointsByStatusCategory(section.items, statuses)
                  }
                  expanded={sectionExpanded}
                  onExpandedChange={(next) =>
                    setExpanded((current) => ({ ...current, [section.id]: next }))
                  }
                  canManage={canManageSprints}
                  capabilities={planningCapabilities}
                  canMoveUp={section.kind === "planned" && plannedIndex > 0}
                  canMoveDown={section.kind === "planned" && plannedIndex < planned.length - 1}
                  onMoveUp={() => reorderPlannedSprint(section.id, -1)}
                  onMoveDown={() => reorderPlannedSprint(section.id, 1)}
                  backlogId={backlogId}
                  backlogKey={backlogKey}
                  selectControl={
                    canSelectItems && sectionVisibleIds.length > 0 ? (
                      <SelectAllCheckbox
                        checked={selectedCount === sectionVisibleIds.length}
                        indeterminate={
                          selectedCount > 0 && selectedCount < sectionVisibleIds.length
                        }
                        onChange={() =>
                          setSelection((current) => {
                            const next = new Set(current.selectedIds);
                            if (selectedCount === sectionVisibleIds.length) {
                              sectionVisibleIds.forEach((id) => next.delete(id));
                            } else {
                              sectionVisibleIds.forEach((id) => next.add(id));
                            }
                            return { selectedIds: next, anchorId: null };
                          })
                        }
                        label={
                          section.sprint
                            ? `Sélectionner toutes les tâches de ${section.sprint.name}`
                            : "Sélectionner toutes les tâches visibles"
                        }
                      />
                    ) : null
                  }
                  primaryAction={canManageSprints ? (
                    <>
                      {canManageSprints && section.kind === "backlog" ? (
                        <CreateSprintButton
                          backlogId={backlogId}
                          backlogKey={backlogKey}
                          variant="outline"
                        />
                      ) : null}
                      {canManageSprints && section.kind === "planned" && section.sprint ? (
                        <StartSprintDialog
                          backlogId={backlogId}
                          backlogKey={backlogKey}
                          sprint={section.sprint}
                          metrics={section.metrics}
                        />
                      ) : null}
                      {canManageSprints && section.kind === "active" && section.sprint ? (
                        <CompleteSprintDialog
                          backlogId={backlogId}
                          backlogKey={backlogKey}
                          sprint={section.sprint}
                          metrics={section.metrics}
                          plannedSprints={renderedSections
                            .filter((candidate) => candidate.kind === "planned" && candidate.sprint)
                            .map((candidate) => ({ id: candidate.id, name: candidate.sprint!.name }))}
                          completedMetrics={metricsFor(completedItems)}
                          incompleteMetrics={metricsFor(incompleteItems)}
                        />
                      ) : null}
                    </>
                  ) : undefined}
                />
                {sectionExpanded ? (
                  section.items.length > 0 ? (
                    <BacklogRowList
                      label={section.sprint?.name ?? "Backlog"}
                      groups={section.groups}
                      grouped={grouped}
                      statuses={statuses}
                      users={users}
                      backlogKey={backlogKey}
                      selectedKey={selectedKey}
                      canSelectItems={canSelectItems}
                      canEditItems={canEditItems}
                      canTransitionItems={canTransitionItems}
                      canAssignItems={canAssignItems}
                      canScheduleItems={canScheduleItems}
                      manualOrder={manualOrder}
                      mutationPending={mutationPending}
                      selection={selection.selectedIds}
                      onToggleSelection={toggleSelection}
                    />
                  ) : section.sprint ? (
                    <div className="p-3 sm:p-3.5">
                      <div
                        data-empty-sprint-drop={section.id}
                        className="flex min-h-[72px] items-center justify-center rounded-[var(--radius-md)] border-[1.5px] border-dashed border-[var(--border-strong)] px-3 text-center text-[13.5px] text-muted-foreground"
                      >
                        Glissez des items du backlog ici pour planifier le sprint
                      </div>
                    </div>
                  ) : (
                    <p className="px-4 py-5 text-sm text-muted-foreground">
                      Aucune tâche dans cette section.
                    </p>
                  )
                ) : null}
                {sectionExpanded && canCreateInSection ? (
                  <div className={section.items.length > 0 ? "border-t border-border" : undefined}>
                    <InlineCreateItem
                      backlogId={backlogId}
                      backlogKey={backlogKey}
                      sprintId={section.sprint?.id ?? null}
                      contextLabel={section.sprint?.name ?? "Backlog"}
                      parents={epics}
                      parentId={createParentId}
                      onParentChange={setCreateParentId}
                      dialogProps={createDialogProps}
                    />
                  </div>
                ) : null}
              </SprintSectionDropZone>
            );
          })}
          </div>
          {canSelectItems && selectedItems.length > 0 ? (
            <BulkItemToolbar
              backlogId={backlogId}
              backlogKey={backlogKey}
              selectedItems={selectedItems.map((item) => ({ id: item.id, type: item.type }))}
              statuses={statuses}
              users={users}
              sprints={sprints
                .filter((sprint): sprint is SprintSummary & { state: "planned" | "active" } =>
                  sprint.state === "planned" || sprint.state === "active",
                )
                .map((sprint) => ({ id: sprint.id, name: sprint.name, state: sprint.state }))}
              canEditItems={canEditItems}
              canTransitionItems={canTransitionItems}
              canAssignItems={canAssignItems}
              canScheduleItems={canScheduleItems}
              canBulkChangeItems={canBulkChangeItems}
              capabilities={bulkCapabilities}
              releaseOptions={releaseOptions}
              releaseCapabilities={releaseCapabilities}
              onClearSelection={() => setSelection(emptySelection())}
              onMutationSuccess={() => router.refresh()}
            />
          ) : null}
        </div>
      </DndContext>
    </section>
  );
}

export function ItemBacklog(props: LegacyBacklogProps | SprintBacklogProps) {
  if ("sections" in props) return <SprintItemBacklog {...props} />;
  return <LegacyItemBacklog {...props} />;
}
